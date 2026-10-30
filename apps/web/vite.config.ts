import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";

import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { loadWebConfig } from "@veolms/config";
import {
  defineConfig,
  loadEnv,
  type Plugin,
  type Rolldown,
  type UserConfig,
} from "vite";

import { parseSiteOrigin } from "./src/routing/siteOrigin.ts";
import { colorMixFallbackPlugin } from "./scripts/colorMixFallbackPlugin.ts";
import { containerUnitFallbackPlugin } from "./scripts/containerUnitFallbackPlugin.ts";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const webSourceRoot = fileURLToPath(new URL("./src", import.meta.url));

const shellPhosphorIcons = new Set([
  "Bell",
  "BookOpen",
  "CaretDown",
  "CaretRight",
  "ChartBar",
  "ChartLineUp",
  "ChatCircleDots",
  "ChatTeardropDots",
  "Check",
  "CornersIn",
  "CornersOut",
  "DotsThreeCircle",
  "EnvelopeSimple",
  "Eye",
  "GearSix",
  "GraduationCap",
  "Heart",
  "House",
  "Moon",
  "Palette",
  "Play",
  "Question",
  "SidebarSimple",
  "SignOut",
  "SquaresFour",
  "Star",
  "Student",
  "Sun",
  "Tote",
  "Tag",
  "User",
  "Users",
]);
const homePhosphorIcons = new Set([
  "ArrowRight",
  "CheckCircle",
  "Clock",
  "Fire",
  "Target",
]);
const settingsPhosphorIcons = new Set(["ShieldCheck", "UserCircle"]);

const getPhosphorIconName = (id: string) =>
  id
    .replaceAll("\\", "/")
    .match(/@phosphor-icons\/react\/dist\/csr\/([^/]+)\.es\.js$/)?.[1];

const EARLY_HLS_PRELOAD_PLACEHOLDER = "__VEO_EARLY_HLS_PRELOAD_URL__";
const EARLY_HLS_PRELOAD_DEV_URL = "/src/learning/earlyHlsPreload.ts";
const earlyHlsPreloadEntry = fileURLToPath(
  new URL("./src/learning/earlyHlsPreload.ts", import.meta.url),
);

function joinPublicPath(base: string, fileName: string) {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${fileName}`.replace(/\/{2,}/g, "/");
}

function earlyHlsPreloadPlugin(): Plugin {
  let publicBase = "/";
  let command: "build" | "serve" = "build";

  const replacePlaceholder = (source: string, url: string) =>
    source.replaceAll(EARLY_HLS_PRELOAD_PLACEHOLDER, url);

  return {
    name: "early-hls-preload",
    configResolved(config) {
      command = config.command;
      publicBase = config.base || "/";
    },
    buildStart() {
      const ssr = Boolean(this.environment?.config.build.ssr);
      if (ssr || command === "serve") return;
      this.emitFile({
        type: "chunk",
        id: earlyHlsPreloadEntry,
        name: "early-hls-preload",
      });
    },
    transform(code) {
      if (command === "serve" && code.includes(EARLY_HLS_PRELOAD_PLACEHOLDER)) {
        return {
          code: replacePlaceholder(code, EARLY_HLS_PRELOAD_DEV_URL),
          map: null,
        };
      }
      return undefined;
    },
    generateBundle(_outputOptions, bundle) {
      let url: string | undefined;
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue;
        const facade = item.facadeModuleId?.replaceAll("\\", "/");
        if (
          item.name === "early-hls-preload" ||
          facade?.endsWith("/src/learning/earlyHlsPreload.ts")
        ) {
          url = joinPublicPath(publicBase, item.fileName);
          break;
        }
      }

      if (!url && Boolean(this.environment?.config.build.ssr)) {
        const manifestPath = path.resolve(
          this.environment?.config.build.outDir ?? "",
          "../client/.vite/manifest.json",
        );
        try {
          const manifest = JSON.parse(
            fs.readFileSync(manifestPath, "utf8"),
          ) as Record<string, { file?: string; name?: string; src?: string }>;
          const entry = Object.values(manifest).find(
            (item) =>
              item.name === "early-hls-preload" ||
              item.src?.replaceAll("\\", "").endsWith("earlyHlsPreload.ts") ||
              item.file?.includes("early-hls-preload"),
          );
          if (entry?.file) {
            url = joinPublicPath(publicBase, entry.file);
          }
        } catch {
          url = undefined;
        }
      }

      if (!url) return;

      for (const item of Object.values(bundle)) {
        if (
          item.type === "chunk" &&
          item.code.includes(EARLY_HLS_PRELOAD_PLACEHOLDER)
        ) {
          item.code = replacePlaceholder(item.code, url);
        }
        if (
          item.type === "asset" &&
          typeof item.source === "string" &&
          item.source.includes(EARLY_HLS_PRELOAD_PLACEHOLDER)
        ) {
          item.source = replacePlaceholder(item.source, url);
        }
      }
    },
  };
}

// Lazy route-body chunks whose final URLs are baked into the shell so the
// prerendered document can modulepreload them (see
// src/routing/routeChunkPreloads.ts for why). Follows the same
// placeholder-replacement mechanics as earlyHlsPreloadPlugin above.
const ROUTE_CHUNK_PRELOADS = [
  {
    placeholder: "__VEO_CATALOGUE_CHUNK_URL__",
    cssPlaceholder: "__VEO_CATALOGUE_CSS_URLS__",
    jsPlaceholder: "__VEO_CATALOGUE_JS_URLS__",
    moduleSuffix: "/src/courses/CourseCatalogue.tsx",
    manifestSrcSuffix: "courses/CourseCatalogue.tsx",
    devUrl: "/src/courses/CourseCatalogue.tsx",
  },
  {
    placeholder: "__VEO_GUEST_HOME_CHUNK_URL__",
    cssPlaceholder: "__VEO_GUEST_HOME_CSS_URLS__",
    jsPlaceholder: "__VEO_GUEST_HOME_JS_URLS__",
    moduleSuffix: "/src/GuestHome.tsx",
    manifestSrcSuffix: "src/GuestHome.tsx",
    devUrl: "/src/GuestHome.tsx",
  },
  {
    placeholder: "__VEO_COURSE_OVERVIEW_CHUNK_URL__",
    cssPlaceholder: "__VEO_COURSE_OVERVIEW_CSS_URLS__",
    jsPlaceholder: "__VEO_COURSE_OVERVIEW_JS_URLS__",
    moduleSuffix: "/src/courses/CourseOverviewPage.tsx",
    manifestSrcSuffix: "courses/CourseOverviewPage.tsx",
    devUrl: "/src/courses/CourseOverviewPage.tsx",
  },
  {
    placeholder: "__VEO_LEARNING_PLAYER_HOST_CHUNK_URL__",
    cssPlaceholder: "__VEO_LEARNING_PLAYER_HOST_CSS_URLS__",
    jsPlaceholder: "__VEO_LEARNING_PLAYER_HOST_JS_URLS__",
    moduleSuffix: "/src/learning/player/PersistentLearningPlayerHost.tsx",
    manifestSrcSuffix: "learning/player/PersistentLearningPlayerHost.tsx",
    devUrl: "/src/learning/player/PersistentLearningPlayerHost.tsx",
  },
];

// The chunk a lazy route body's dynamic import loads. Usually the module is
// that chunk's facade. A module that another chunk also imports statically
// (the course page, through the course editor's preview) is placed by
// Rolldown in a shared chunk with no facade, and the dynamic import loads
// that chunk instead, so look for the chunk that contains the module.
function findRouteBodyChunk(
  bundle: Rolldown.OutputBundle,
  moduleSuffix: string,
) {
  const chunks = Object.values(bundle).filter(
    (item): item is Rolldown.OutputChunk => item.type === "chunk",
  );
  return (
    chunks.find((chunk) =>
      chunk.facadeModuleId?.replaceAll("\\", "/").endsWith(moduleSuffix),
    ) ??
    chunks.find((chunk) =>
      Object.keys(chunk.modules).some((id) =>
        id.replaceAll("\\", "/").endsWith(moduleSuffix),
      ),
    )
  );
}

/**
 * A digest of the code of every module in the route bodies' static graphs:
 * what their chunks' hashed file names, and so the replaced URLs, are made
 * of. Computed once per output pass.
 */
function routeBodyGraphDigest(
  context: Pick<Rolldown.PluginContext, "getModuleInfo">,
): string {
  const hash = createHash("sha1");
  const seen = new Set<string>();
  const appRoot = path.dirname(fileURLToPath(import.meta.url));
  const moduleInfo = (id: string) =>
    context.getModuleInfo(id) ??
    context.getModuleInfo(id.replaceAll("/", "\\")) ??
    context.getModuleInfo(id.replaceAll("\\", "/"));
  for (const entry of ROUTE_CHUNK_PRELOADS) {
    const pending = [path.join(appRoot, entry.devUrl)];
    while (pending.length) {
      const id = pending.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const info = moduleInfo(id);
      if (!info) continue;
      hash.update(id.replaceAll("\\", "/")).update(" ");
      hash.update(info.code ?? "").update(" ");
      pending.push(...info.importedIds);
    }
  }
  return hash.digest("hex");
}

function routeChunkPreloadPlugin(): Plugin {
  let publicBase = "/";
  let command: "build" | "serve" = "build";
  let graphDigest: string | null = null;
  // What the client pass resolved. React Router builds the client first and
  // shares plugin instances across its environments, so the server pass,
  // which renders the prerendered documents, reuses these.
  let clientUrls = new Map<string, string>();

  return {
    name: "veo-route-chunk-preload",
    configResolved(config) {
      command = config.command;
      publicBase = config.base || "/";
    },
    renderStart() {
      graphDigest = null;
    },
    // The URLs are written into the chunks below (generateBundle), after
    // their hashed file names were settled with the placeholders still in.
    // A chunk such as routeChunkPreloads' own would keep its file name from
    // build to build while the URLs inside it changed, and a browser holding
    // it (assets are immutable for a year) would preload, wait for and link
    // the previous build's chunks. So the hash of every chunk that carries
    // a placeholder also takes in what the replaced URLs are made of: the
    // code of the route bodies' whole static graphs.
    augmentChunkHash(chunk) {
      if (command !== "build") return undefined;
      const placeholders = ROUTE_CHUNK_PRELOADS.flatMap((entry) => [
        entry.placeholder,
        entry.cssPlaceholder,
        entry.jsPlaceholder,
      ]);
      const carries = Object.keys(chunk.modules).some((id) => {
        const code = this.getModuleInfo(id)?.code;
        return Boolean(
          code &&
          placeholders.some((placeholder) => code.includes(placeholder)),
        );
      });
      if (!carries) return undefined;
      graphDigest ??= routeBodyGraphDigest(this);
      return graphDigest;
    },
    transform(code) {
      if (command !== "serve") return undefined;
      let next = code;
      let changed = false;
      for (const entry of ROUTE_CHUNK_PRELOADS) {
        if (next.includes(entry.placeholder)) {
          next = next.replaceAll(entry.placeholder, entry.devUrl);
          changed = true;
        }
        // The dev server injects styles with the modules, so the CSS link
        // list stays empty there.
        if (next.includes(entry.cssPlaceholder)) {
          next = next.replaceAll(entry.cssPlaceholder, "");
          changed = true;
        }
        // Likewise the dev server resolves imports itself.
        if (next.includes(entry.jsPlaceholder)) {
          next = next.replaceAll(entry.jsPlaceholder, "");
          changed = true;
        }
      }
      return changed ? { code: next, map: null } : undefined;
    },
    generateBundle(_outputOptions, bundle) {
      const isSsrPass = Boolean(this.environment?.config.build.ssr);
      const urls = new Map<string, string>(isSsrPass ? clientUrls : []);
      // Chunk matching is only valid in the client pass: the SSR bundle
      // emits its own chunk for these modules under a different hash, and
      // baking that name into the prerendered HTML points the preload at a
      // file that does not exist under client/assets.
      if (!isSsrPass) {
        for (const entry of ROUTE_CHUNK_PRELOADS) {
          const item = findRouteBodyChunk(bundle, entry.moduleSuffix);
          if (!item) continue;
          urls.set(
            entry.placeholder,
            joinPublicPath(publicBase, item.fileName),
          );
          // The feature CSS usually belongs to chunks this one imports
          // statically, so collect it across that whole graph.
          const cssFiles = new Set<string>();
          const jsFiles = new Set<string>();
          const seen = new Set<string>();
          const pending = [item.fileName];
          while (pending.length) {
            const fileName = pending.pop() as string;
            if (seen.has(fileName)) continue;
            seen.add(fileName);
            const chunk = bundle[fileName];
            if (!chunk || chunk.type !== "chunk") continue;
            // A chunk made only of stylesheets is deleted after this hook;
            // it never becomes a file that could be preloaded.
            const moduleIds = Object.keys(chunk.modules);
            const isStyleOnlyChunk =
              moduleIds.length > 0 &&
              moduleIds.every((id) => /\.css(?:$|\?)/u.test(id));
            if (fileName !== item.fileName && !isStyleOnlyChunk) {
              jsFiles.add(fileName);
            }
            for (const file of chunk.viteMetadata?.importedCss ?? []) {
              cssFiles.add(file);
            }
            pending.push(...chunk.imports);
          }
          urls.set(
            entry.cssPlaceholder,
            [...cssFiles]
              .map((file) => joinPublicPath(publicBase, file))
              .join(","),
          );
          // The chunks it imports statically: the document preloads them
          // too, so the lazy body is ready when hydration starts.
          urls.set(
            entry.jsPlaceholder,
            [...jsFiles]
              .map((file) => joinPublicPath(publicBase, file))
              .join(","),
          );
        }
        clientUrls = new Map(urls);
      }

      if (isSsrPass && urls.size < ROUTE_CHUNK_PRELOADS.length * 3) {
        // Only when the client pass ran with other plugin instances: read
        // the client chunks' URLs from its manifest the way
        // earlyHlsPreloadPlugin does. The manifest names a chunk only by the
        // module that is its facade.
        const manifestPath = path.resolve(
          this.environment?.config.build.outDir ?? "",
          "../client/.vite/manifest.json",
        );
        try {
          const manifest = JSON.parse(
            fs.readFileSync(manifestPath, "utf8"),
          ) as Record<
            string,
            { file?: string; src?: string; css?: string[]; imports?: string[] }
          >;
          for (const entry of ROUTE_CHUNK_PRELOADS) {
            if (urls.has(entry.placeholder)) continue;
            const manifestEntry = Object.entries(manifest).find(
              ([key, value]) =>
                key.replaceAll("\\", "/").endsWith(entry.manifestSrcSuffix) ||
                value.src
                  ?.replaceAll("\\", "/")
                  .endsWith(entry.manifestSrcSuffix),
            );
            if (manifestEntry?.[1]?.file) {
              urls.set(
                entry.placeholder,
                joinPublicPath(publicBase, manifestEntry[1].file),
              );
              const cssFiles = new Set<string>();
              const jsFiles = new Set<string>();
              const seen = new Set<string>();
              const pending = [manifestEntry[0]];
              while (pending.length) {
                const key = pending.pop() as string;
                if (seen.has(key)) continue;
                seen.add(key);
                const file = manifest[key]?.file;
                if (file && key !== manifestEntry[0]) jsFiles.add(file);
                for (const css of manifest[key]?.css ?? []) cssFiles.add(css);
                pending.push(...(manifest[key]?.imports ?? []));
              }
              urls.set(
                entry.cssPlaceholder,
                [...cssFiles]
                  .map((file) => joinPublicPath(publicBase, file))
                  .join(","),
              );
              urls.set(
                entry.jsPlaceholder,
                [...jsFiles]
                  .map((file) => joinPublicPath(publicBase, file))
                  .join(","),
              );
            }
          }
        } catch {
          // No client manifest; what is left unresolved fails below.
        }
      }

      const unresolved = new Set<string>();
      for (const item of Object.values(bundle)) {
        if (item.type === "chunk") {
          for (const [placeholder, url] of urls) {
            if (item.code.includes(placeholder)) {
              item.code = item.code.replaceAll(placeholder, url);
            }
          }
        } else if (typeof item.source === "string") {
          for (const [placeholder, url] of urls) {
            if (item.source.includes(placeholder)) {
              item.source = item.source.replaceAll(placeholder, url);
            }
          }
        }
        const text = item.type === "chunk" ? item.code : item.source;
        if (typeof text !== "string") continue;
        for (const entry of ROUTE_CHUNK_PRELOADS) {
          for (const placeholder of [
            entry.placeholder,
            entry.cssPlaceholder,
            entry.jsPlaceholder,
          ]) {
            if (text.includes(placeholder)) unresolved.add(placeholder);
          }
        }
      }
      // A placeholder left in place ships as a relative link: the browser
      // requests it under the page's own address, gets the page back and
      // logs a MIME-type error, and the body it stands for is not preloaded.
      if (unresolved.size) {
        this.error(
          `Route chunk preload placeholders were not resolved: ${[
            ...unresolved,
          ].join(", ")}. See routeChunkPreloadPlugin in vite.config.ts.`,
        );
      }
    },
  };
}

// Dev server only. Vite's page script reloads the whole page whenever its
// live-update socket closes and the server answers again. Tunnels such as
// BrowserStack Local close a socket that carries nothing for a while, so a
// page opened through one reloaded by itself every few minutes (mid-video
// too). A small message every 20 s keeps the socket in use; pages ignore it.
const DEV_SOCKET_KEEPALIVE_MS = 20_000;

function devSocketKeepalivePlugin(): Plugin {
  return {
    name: "veo-dev-socket-keepalive",
    apply: "serve",
    configureServer(server) {
      const timer = setInterval(() => {
        server.ws.send({ type: "custom", event: "veo:keepalive" });
      }, DEV_SOCKET_KEEPALIVE_MS);
      timer.unref();
      server.httpServer?.once("close", () => clearInterval(timer));
    },
  };
}

// Dev server only. Each `import picture from "./a.webp"` is a module of its
// own in dev (`export default "/src/assets/a.webp"`), fetched and checked
// for changes on every page load: about 120 requests before the app can
// render, each a full round trip for a phone on the network. This writes
// the URL Vite would have returned straight into the importing module, so
// the browser fetches the picture itself only when it is shown. The value
// is taken from Vite's own answer for that module, so it is the same URL
// (or inlined data) as before. Stylesheets imported by URL (`?url`, the
// palette and route stylesheets) are handled the same way; a stylesheet
// imported for its styles is left alone. Production builds are not affected.
const ASSET_IMPORT_INLINE_RE =
  /\bimport\s+(?:([A-Za-z_$][\w$]*)|\{\s*default\s+as\s+([A-Za-z_$][\w$]*)\s*\})\s+from\s+(["'])([^"'\n]+\.(?:webp|png|jpe?g|avif|gif|svg|woff2?)(?:\?(?:url|no-inline|url&no-inline))?|[^"'\n]+\.css\?url(?:&no-inline)?)\3;?/g;
const ASSET_DEFAULT_EXPORT_RE = /^export default ("(?:[^"\\\n]|\\.)*")/;

function devAssetImportInlinePlugin(): Plugin {
  let root = "";
  return {
    name: "veo-dev-asset-import-inline",
    apply: "serve",
    enforce: "post",
    configResolved(config) {
      root = config.root;
    },
    async transform(code, id, options) {
      if (options?.ssr || this.environment?.name !== "client") return undefined;
      if (id.includes("/node_modules/") || !/\.[cm]?[jt]sx?(?:$|\?)/.test(id)) {
        return undefined;
      }
      if (!ASSET_IMPORT_INLINE_RE.test(code)) return undefined;
      ASSET_IMPORT_INLINE_RE.lastIndex = 0;
      const environment = this.environment as unknown as {
        transformRequest?: (url: string) => Promise<{ code: string } | null>;
      };
      if (typeof environment.transformRequest !== "function") return undefined;

      const replacements: Array<{ start: number; end: number; text: string }> =
        [];
      for (const match of code.matchAll(ASSET_IMPORT_INLINE_RE)) {
        const binding = match[1] ?? match[2];
        const specifier = match[4];
        if (!binding || !specifier) continue;
        const resolved = await this.resolve(specifier, id);
        if (!resolved || resolved.external) continue;
        const [file = "", query] = resolved.id.split("?");
        const relative = path.relative(root, file).replaceAll("\\", "/");
        if (
          !relative ||
          relative.startsWith("..") ||
          path.isAbsolute(relative)
        ) {
          continue;
        }
        let value: string | undefined;
        try {
          const result = await environment.transformRequest(
            `/${relative}${query ? `?${query}` : ""}`,
          );
          value = result?.code.match(ASSET_DEFAULT_EXPORT_RE)?.[1];
        } catch {
          value = undefined;
        }
        if (!value) continue;
        // A change to the picture still refreshes the module that uses it.
        this.addWatchFile(file);
        replacements.push({
          start: match.index,
          end: match.index + match[0].length,
          // Keep the line count, so line mappings still hold.
          text: `const ${binding} = ${value};${"\n".repeat(
            match[0].split("\n").length - 1,
          )}`,
        });
      }
      if (!replacements.length) return undefined;

      let next = "";
      let cursor = 0;
      for (const { start, end, text } of replacements) {
        next += code.slice(cursor, start) + text;
        cursor = end;
      }
      next += code.slice(cursor);
      return { code: next, map: null };
    },
  };
}

// Extension packages that live outside this app (a deployment's own
// plugins, whose routes come in through VEO_ROUTES_FILE) use Tailwind classes
// too. VEO_STYLE_SOURCES lists their source folders, separated like PATH;
// each becomes an `@source` of the app's one utilities build in styles.css,
// so their classes are generated in the same order as everything else.
// No effect when it is not set.
function extraStyleSourcesPlugin(): Plugin {
  const sources = (process.env.VEO_STYLE_SOURCES ?? "")
    .split(path.delimiter)
    .map((source) => source.trim())
    .filter(Boolean);
  const stylesEntry = path.join(webSourceRoot, "styles.css");
  return {
    name: "veo-extra-style-sources",
    enforce: "pre",
    transform(code, id) {
      if (sources.length === 0) return null;
      const [file = "", query = ""] = id.split("?");
      if (path.normalize(file) !== stylesEntry) return null;
      // Only the stylesheet itself: `?url` and the like are JS modules. A
      // build compiles a stylesheet imported with `?url` (appStylesheet.ts)
      // as `?transform-only`; without it here the plugins' classes were
      // never generated in production (the download button had no tile).
      if (query && !/^(?:direct|inline|transform-only)(?:&|$)/u.test(query)) {
        return null;
      }
      const lines = sources.map(
        (source) => `@source ${JSON.stringify(source.replaceAll("\\", "/"))};`,
      );
      return { code: `${code}\n${lines.join("\n")}\n`, map: null };
    },
  };
}

// Writes a module-to-chunk report for the client build when
// VEO_BUNDLE_REPORT is set, so bundle composition can be audited offline.
// No effect on normal builds.
/**
 * Loads the server bundle as soon as it is written, during a prerendering
 * build. React Router's preview server otherwise imports it on the first
 * prerender request (`/`), and that request has a fixed 10 second limit:
 * the 11 MB bundle takes about 4 s to import even when the disk is warm,
 * and right after it was written (cold cache, antivirus scanning the new
 * file) the import alone could push `/` past the limit, failing the first
 * build after a change while the next one passed. The preview server
 * imports the same file URL, so Node's module cache answers it at once.
 */
function warmServerBuildPlugin(): Plugin {
  return {
    name: "veo-warm-server-build",
    apply: "build",
    async writeBundle(outputOptions, bundle) {
      if (process.env.VEO_REACT_ROUTER_BUILD !== "true") return;
      if (!this.environment?.config.build.ssr) return;
      if (!outputOptions.dir || !("index.js" in bundle)) return;
      const entry = path.resolve(outputOptions.dir, "index.js");
      const started = Date.now();
      try {
        await import(pathToFileURL(entry).href);
        this.environment.logger.info(
          `Server bundle loaded for prerendering in ${Date.now() - started} ms`,
        );
      } catch (error) {
        // Only a head start: the preview server imports it again and
        // reports a real problem itself.
        this.environment.logger.warn(
          `Server bundle could not be preloaded: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

function bundleReportPlugin(): Plugin {
  return {
    name: "veo-bundle-report",
    apply: "build",
    generateBundle(_outputOptions, bundle) {
      if (!process.env.VEO_BUNDLE_REPORT) return;
      if (this.environment?.config.build.ssr) return;
      const report: Record<string, unknown> = {};
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== "chunk") continue;
        report[fileName] = {
          size: item.code.length,
          isEntry: item.isEntry,
          isDynamicEntry: item.isDynamicEntry,
          name: item.name,
          facade: item.facadeModuleId?.replaceAll("\\", "/"),
          imports: item.imports,
          dynamicImports: item.dynamicImports,
          modules: Object.fromEntries(
            Object.entries(item.modules ?? {}).map(([id, moduleInfo]) => [
              id.replaceAll("\\", "/"),
              (moduleInfo as { renderedLength?: number }).renderedLength ?? 0,
            ]),
          ),
        };
      }
      fs.writeFileSync(
        path.resolve(
          fileURLToPath(new URL(".", import.meta.url)),
          "build/bundle-report.json",
        ),
        JSON.stringify(report),
      );
    },
  };
}

/**
 * The academy's default look (Platform > Appearance) as the build API has
 * it, written into every page's head so that a first visit opens in it.
 * Later changes reach visitors through the API; when the API cannot answer
 * in time the build keeps the built-in default rather than failing.
 */
async function fetchPlatformAppearance(apiUrl: string): Promise<unknown> {
  const base = apiUrl.replace(/\/+$/u, "").replace(/\/api\/v1$/u, "/v1");
  const url = `${base.endsWith("/v1") ? base : `${base}/v1`}/platform/public-settings`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(4_000),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const payload =
      body && typeof body === "object" && "data" in body ? body.data : body;
    return payload && typeof payload === "object" && "appearance" in payload
      ? payload.appearance
      : null;
  } catch {
    return null;
  }
}

export default defineConfig(async ({ command, mode }): Promise<UserConfig> => {
  const environment = {
    ...process.env,
    ...loadEnv(mode, workspaceRoot, ""),
  };
  const config = loadWebConfig(environment);
  // Optional: the site's public address, for the share tags of pages built
  // ahead of time. Unset leaves those tags out, as before.
  const siteOrigin = parseSiteOrigin(environment.VITE_SITE_URL);
  if (environment.VITE_SITE_URL?.trim() && !siteOrigin) {
    throw new Error(
      "VITE_SITE_URL must be the site's public origin, such as https://academy.example.com (http or https, no path or query).",
    );
  }

  const platformAppearance =
    command === "build"
      ? await fetchPlatformAppearance(config.STATIC_BUILD_API_URL)
      : null;

  return {
    envDir: workspaceRoot,
    optimizeDeps: {
      // Do not crawl the academy route graph here: CoursesPage owns many
      // deferred screens, and Vite follows their dynamic imports during its
      // scan (including Atomic Editor/CodeMirror). Prebundle only the shared
      // runtime used at startup; Vite serves deferred route modules on demand.
      noDiscovery: true,
      include: [
        "react",
        "react-dom/client",
        "react-router",
        "react-easy-crop",
        "react-easy-crop > normalize-wheel",
        "@base-ui/react/drawer",
        "@tanstack/react-query",
        "@tanstack/query-async-storage-persister",
        "@tanstack/react-query-persist-client",
        "@veolms/contracts > zod",
        "clsx",
        "tailwind-merge",
        // The login card's icon registry imports from the package's index,
        // which re-exports every icon. Served as source that is about 1,900
        // requests before the card can show; prebundled it is one.
        "lucide-react",
        // The markdown pipeline (unified/micromark) reaches CommonJS packages
        // such as `debug` and `extend`. With discovery disabled they would be
        // served as raw ESM and fail with a missing `default` export.
        "react-markdown",
        "remark-gfm",
        // The workspace video player is served from source, so its own
        // markdown dependencies must be listed explicitly as well.
        "@veolms/video-player > unified",
        "@veolms/video-player > remark-parse",
        "@veolms/video-player > remark-gfm",
        "@veolms/video-player > mdast-util-to-string",
        // Other CommonJS/UMD packages used by the app. Without prebundling
        // their default export is missing when served as native ESM.
        "iso-639-1",
        "qrcode.react",
        // The analytics charts. Recharts imports CommonJS lodash modules
        // (`lodash/get` and others) by their default export.
        "recharts",
        "@veolms/analytics-ui > recharts",
        "@veolms/video-player > shaka-player",
      ],
      holdUntilCrawlEnd: false,
    },
    define: {
      "process.env.VEO_REACT_ROUTER_BUILD": JSON.stringify(
        process.env.VEO_REACT_ROUTER_BUILD ?? "false",
      ),
      "import.meta.env.STATIC_BUILD_API_URL": JSON.stringify(
        config.STATIC_BUILD_API_URL,
      ),
      "import.meta.env.VITE_CDN_URL": JSON.stringify(config.VITE_CDN_URL),
      "import.meta.env.VITE_SITE_URL": JSON.stringify(siteOrigin ?? ""),
      // Checked where it is read (store/appearanceDefaults.ts).
      "import.meta.env.VEO_PLATFORM_APPEARANCE":
        JSON.stringify(platformAppearance),
      // The API's own setting, handed to the login form so its countdown
      // ends when the API starts accepting another send.
      "import.meta.env.OTP_RESEND_COOLDOWN_SECONDS": JSON.stringify(
        config.OTP_RESEND_COOLDOWN_SECONDS,
      ),
    },
    plugins: [
      earlyHlsPreloadPlugin(),
      routeChunkPreloadPlugin(),
      devAssetImportInlinePlugin(),
      devSocketKeepalivePlugin(),
      bundleReportPlugin(),
      warmServerBuildPlugin(),
      extraStyleSourcesPlugin(),
      tailwindcss(),
      // Older Safari (iOS 15): see each plugin.
      colorMixFallbackPlugin(),
      containerUnitFallbackPlugin(),
      reactRouter(),
    ],
    // React Router's prerender pass fetches route data from Vite's temporary
    // preview server. Pin that internal server to IPv4 loopback so Windows
    // localhost address selection cannot point the request at another family.
    preview: {
      host: "127.0.0.1",
    },
    resolve: {
      // Extension packages outside this app (VEO_ROUTES_FILE) import these
      // too. Each must be the app's own single copy: a second React Router
      // or TanStack Query has its own context, so a plugin component would
      // not see the app's router or QueryClient.
      dedupe: ["react", "react-dom", "react-router", "@tanstack/react-query"],
      alias: [
        { find: "@", replacement: webSourceRoot },
        // React 19 provides the hook directly; Base UI's CommonJS shim cannot
        // be imported as native ESM when dependency optimization is disabled.
        {
          find: /^use-sync-external-store\/shim(?:\/with-selector)?$/,
          replacement: fileURLToPath(
            new URL(
              "./src/compat/useSyncExternalStoreShim.ts",
              import.meta.url,
            ),
          ),
        },
        {
          find: "@veolms/video-player/shaka-preload",
          replacement: fileURLToPath(
            new URL(
              "../../packages/video-player/src/engines/shaka/shaka-early-preload.ts",
              import.meta.url,
            ),
          ),
        },
      ],
    },
    ssr: {
      // The package publishes extensionless internal ESM imports. Bundling it
      // lets Vite resolve those imports for the build-time SSG renderer.
      noExternal: [
        "@atomic-editor/editor",
        ...(command === "build"
          ? ["@phosphor-icons/react", /^@phosphor-icons\/react\//]
          : []),
      ],
    },
    build: {
      // The default targets, with Safari and iPhones from 15 instead of
      // 16.4. With the default the minifier writes every breakpoint in
      // range syntax (`@media (width>=40rem)`), which Safari reads only
      // from 16.4: on iOS 15 no breakpoint applied at all (a phone got the
      // desktop rail and its sheets). These targets keep `min-width` and
      // `max-width`. See also the two fallback plugins above.
      cssTarget: ["chrome111", "edge111", "firefox114", "safari15", "ios15"],
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.replaceAll("\\", "/").includes("/shaka-player/")) {
              return "shaka-player";
            }
            const iconName = getPhosphorIconName(id);
            if (iconName && shellPhosphorIcons.has(iconName))
              return "shell-icons";
            if (iconName && homePhosphorIcons.has(iconName))
              return "home-icons";
            if (iconName && settingsPhosphorIcons.has(iconName))
              return "settings-icons";
            return undefined;
          },
        },
      },
    },
    server: {
      port: config.WEB_PORT,
      strictPort: true,
      fs: {
        allow: [workspaceRoot, path.resolve(workspaceRoot, "..")],
      },
      warmup: {
        clientFiles: [
          "./src/entry.client.tsx",
          "./src/styles.css",
          "./src/routes/academy-layout.tsx",
        ],
      },
      // A production build can run beside `dev` (the preview is served on
      // 4173). Its generated HTML lives under this Vite root; watching those
      // files makes Vite send a full-page reload for every prerendered route
      // and can keep a cold browser session reloading for minutes.
      watch: {
        ignored: [path.resolve(workspaceRoot, "apps/web/build/**")],
      },
      proxy: {
        "/v1": {
          target: "http://127.0.0.1:4000",
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
