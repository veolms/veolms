import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { Plugin, ViteDevServer } from "vite";
import type { transformLegacyCss } from "./legacy-css.mjs";
import { LEGACY_SCRIPT_NAMES, readLegacyScript } from "./legacy-scripts.mjs";

const LEGACY_SCRIPT_PREFIX = "/legacy/";
const LEGACY_PARAM = "legacy-css";
const LAYERED_STYLESHEET = "/src/styles.css?direct";

type Rewritten = Awaited<ReturnType<typeof transformLegacyCss>>;
type Entry = { source: string; css: string; layeredBump: number };

/**
 * The dev server's side of the legacy stylesheets (scripts/legacy-css.mjs),
 * so pages can be checked in an old browser without a production build.
 * The head script asks for each stylesheet with `?legacy-css` (and for each
 * stylesheet Vite injects as a `<style>`, through `/@fs/…`); this answers
 * with Vite's own CSS for that file, rewritten.
 *
 * Rewriting the app stylesheet takes 20 s or more, so it runs in a worker
 * thread (legacy-css-worker.mjs): on the server's own thread every other
 * request, from every browser, waited for it (a page took 56 s). Results are
 * kept until the file changes, on disk too (Vite's cache folder), since the
 * dev server restarts often and an old browser waited minutes for every
 * stylesheet again; requests for a file already being rewritten wait for
 * that rewrite instead of starting another.
 */
export function legacyStylesheetsDevPlugin(): Plugin {
  const cache = new Map<string, Promise<Entry>>();
  const transformFile = fileURLToPath(
    new URL("./legacy-css.mjs", import.meta.url),
  );
  // A change to the rewrite itself makes every kept result stale.
  const versionOf = () =>
    createHash("sha1").update(readFileSync(transformFile)).digest("hex");
  let transformVersion = versionOf();
  let layeredBump: Promise<number> | null = null;
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (result: Rewritten) => void; reject: (error: Error) => void }
  >();

  function transformInWorker(
    source: string,
    options: Parameters<typeof transformLegacyCss>[1],
  ): Promise<Rewritten> {
    if (!worker) {
      worker = new Worker(new URL("./legacy-css-worker.mjs", import.meta.url));
      worker.unref();
      worker.on(
        "message",
        (message: { id: number; result?: Rewritten; error?: string }) => {
          const call = pending.get(message.id);
          pending.delete(message.id);
          if (message.result) call?.resolve(message.result);
          else call?.reject(new Error(message.error));
        },
      );
      worker.on("error", (error) => {
        for (const call of pending.values()) call.reject(error);
        pending.clear();
        worker = null;
      });
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker?.postMessage({ id, source, options });
    });
  }

  async function rewrite(server: ViteDevServer, url: string): Promise<Entry> {
    const result = await server.transformRequest(url);
    const source = result?.code ?? "";
    const cached = cache.get(url);
    if (cached) {
      const entry = await cached.catch(() => null);
      if (entry?.source === source) return entry;
    }
    const entry = (async () => {
      const hasLayers = source.includes("@layer");
      const outsideLayersBump = hasLayers ? 0 : await bumpFor(server);
      const file = path.join(
        server.config.cacheDir,
        "legacy-css",
        `${createHash("sha1")
          .update(
            `${transformVersion}\n${url}\n${outsideLayersBump}\n${source}`,
          )
          .digest("hex")}.json`,
      );
      const stored = await readFile(file, "utf8")
        .then((text) => JSON.parse(text) as Omit<Entry, "source">)
        .catch(() => null);
      if (stored) return { source, ...stored };
      const rewritten = await transformInWorker(source, {
        from: url.split("?")[0],
        outsideLayersBump,
      });
      const kept = { css: rewritten.css, layeredBump: rewritten.layeredBump };
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(kept)).catch(() => {});
      return { source, ...kept };
    })();
    cache.set(url, entry);
    entry.catch(() => {
      if (cache.get(url) === entry) cache.delete(url);
    });
    return entry;
  }

  function bumpFor(server: ViteDevServer): Promise<number> {
    layeredBump ??= rewrite(server, LAYERED_STYLESHEET).then(
      (result) => result.layeredBump + 1,
    );
    return layeredBump;
  }

  return {
    name: "veo-legacy-stylesheets-dev",
    apply: "serve",
    configureServer(server) {
      server.httpServer?.on("close", () => {
        void worker?.terminate();
      });
      // The worker, not the config, loads the rewrite, so Vite does not
      // restart when it changes: a new worker and new results instead.
      server.watcher.add(transformFile);
      server.watcher.on("change", (file) => {
        if (path.resolve(file) !== path.resolve(transformFile)) return;
        void worker?.terminate();
        worker = null;
        for (const call of pending.values()) {
          call.reject(new Error("the rewrite changed"));
        }
        pending.clear();
        cache.clear();
        layeredBump = null;
        transformVersion = versionOf();
      });
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? "";
        const path = url.split("?")[0] ?? "";
        const script = path.slice(LEGACY_SCRIPT_PREFIX.length);
        if (
          path.startsWith(LEGACY_SCRIPT_PREFIX) &&
          LEGACY_SCRIPT_NAMES.includes(script)
        ) {
          readLegacyScript(script).then(
            (source) => {
              response.setHeader("Content-Type", "text/javascript");
              response.end(source);
            },
            (error: unknown) => next(error),
          );
          return;
        }
        const parsed = new URL(url, "http://dev");
        if (!parsed.searchParams.has(LEGACY_PARAM)) {
          next();
          return;
        }
        parsed.searchParams.delete(LEGACY_PARAM);
        parsed.searchParams.set("direct", "");
        const original = `${parsed.pathname}?${parsed.searchParams
          .toString()
          .replace(/=(?=&|$)/gu, "")}`;
        rewrite(server, original).then(
          ({ css }) => {
            response.setHeader("Content-Type", "text/css");
            response.setHeader("Cache-Control", "no-cache");
            response.end(css);
          },
          (error: unknown) => {
            // Better the stylesheet as it is than an error page.
            server.config.logger.warn(
              `legacy CSS: ${original} could not be rewritten: ${String(error)}`,
            );
            request.url = original;
            next();
          },
        );
      });
    },
  };
}
