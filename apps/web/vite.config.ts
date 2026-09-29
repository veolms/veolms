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
        "@base-ui/react/drawer",
        "@tanstack/react-query",
        "@tanstack/query-async-storage-persister",
        "@tanstack/react-query-persist-client",
        "@veolms/contracts > zod",
        "axios",
        "clsx",
        "tailwind-merge",
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
    plugins: [earlyHlsPreloadPlugin(), tailwindcss(), reactRouter()],
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
            new URL("./src/compat/useSyncExternalStoreShim.ts", import.meta.url),
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
