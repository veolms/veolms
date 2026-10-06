import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { loadWebConfig } from "@veolms/config";
import { defineConfig, loadEnv, type Plugin } from "vite";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const webSourceRoot = fileURLToPath(new URL("./src", import.meta.url));
const axiosBrowserEntry = fileURLToPath(
  new URL("./node_modules/axios/dist/esm/axios.js", import.meta.url),
);

const shellPhosphorIcons = new Set([
  "Bell",
  "BookOpen",
  "CaretDown",
  "CaretRight",
  "ChartBar",
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
  "ChartLineUp",
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
    facadeSuffix: "/src/courses/CourseCatalogue.tsx",
    manifestSrcSuffix: "courses/CourseCatalogue.tsx",
    devUrl: "/src/courses/CourseCatalogue.tsx",
  },
  {
    placeholder: "__VEO_GUEST_HOME_CHUNK_URL__",
    cssPlaceholder: "__VEO_GUEST_HOME_CSS_URLS__",
    jsPlaceholder: "__VEO_GUEST_HOME_JS_URLS__",
    facadeSuffix: "/src/GuestHome.tsx",
    manifestSrcSuffix: "src/GuestHome.tsx",
    devUrl: "/src/GuestHome.tsx",
  },
];

function routeChunkPreloadPlugin(): Plugin {
  let publicBase = "/";
  let command: "build" | "serve" = "build";

  return {
    name: "veo-route-chunk-preload",
    configResolved(config) {
      command = config.command;
      publicBase = config.base || "/";
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
      const urls = new Map<string, string>();
      // Facade matching is only valid in the client pass: the SSR bundle
      // emits its own chunk for these modules under a different hash, and
      // baking that name into the prerendered HTML points the preload at a
      // file that does not exist under client/assets.
      if (!isSsrPass) {
        for (const item of Object.values(bundle)) {
          if (item.type !== "chunk" || !item.facadeModuleId) continue;
          const facade = item.facadeModuleId.replaceAll("\\", "/");
          for (const entry of ROUTE_CHUNK_PRELOADS) {
            if (facade.endsWith(entry.facadeSuffix)) {
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
                // A chunk made only of stylesheets is deleted after this
                // hook; it never becomes a file that could be preloaded.
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
              // The chunks it imports statically: the document preloads
              // them too, so the lazy body is ready when hydration starts.
              urls.set(
                entry.jsPlaceholder,
                [...jsFiles]
                  .map((file) => joinPublicPath(publicBase, file))
                  .join(","),
              );
            }
          }
        }
      }

      if (urls.size < ROUTE_CHUNK_PRELOADS.length * 3) {
        // The SSR pass does not emit the client chunks; read their URLs from
        // the client manifest the way earlyHlsPreloadPlugin does.
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
          // Leave unresolved placeholders untouched; the links then point at
          // a non-module URL and the preload is simply wasted, never fatal.
        }
      }

      if (!urls.size) return;
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
      }
    },
  };
}

// Writes a module-to-chunk report for the client build when
// VEO_BUNDLE_REPORT is set, so bundle composition can be audited offline.
// No effect on normal builds.
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

export default defineConfig(({ command, mode }) => {
  const environment = {
    ...process.env,
    ...loadEnv(mode, workspaceRoot, ""),
  };
  const config = loadWebConfig(environment);

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
        "axios",
        "clsx",
        "tailwind-merge",
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
    },
    plugins: [
      earlyHlsPreloadPlugin(),
      routeChunkPreloadPlugin(),
      bundleReportPlugin(),
      tailwindcss(),
      reactRouter(),
    ],
    // React Router's prerender pass fetches route data from Vite's temporary
    // preview server. Pin that internal server to IPv4 loopback so Windows
    // localhost address selection cannot point the request at another family.
    preview: {
      host: "127.0.0.1",
    },
    resolve: {
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
        // Axios' package ESM entry currently resolves its Node platform in
        // Vite, which exposes the Node-only `process` global to the browser.
        { find: "axios", replacement: axiosBrowserEntry },
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
