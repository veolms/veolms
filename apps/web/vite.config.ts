import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { loadWebConfig } from "@veolms/config";
import { visualizer } from "rollup-plugin-visualizer";
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
  "CheckCircle",
  "CircleNotch",
  "CornersIn",
  "CornersOut",
  "DotsThreeCircle",
  "EnvelopeSimple",
  "Eye",
  "GearSix",
  "GraduationCap",
  "Heart",
  "House",
  "Info",
  "Link",
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
  "User",
  "UserCircle",
  "Users",
  "WarningCircle",
  "X",
  "XCircle",
]);
const loginLucideIcons = [
  "arrow-left",
  "arrow-right",
  "check",
  "circle-alert",
  "circle-user-round",
  "clock",
  "copy",
  "download",
  "lock",
  "mail",
  "user-round-key",
  "shield-check",
  "smartphone",
  "star",
] as const;
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

function createCdnDevProxy(configuredUrl: string) {
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const targetPath = url.pathname.replace(/\/+$/u, "");
    return {
      target: url.origin,
      changeOrigin: true,
      secure: url.protocol === "https:",
      rewrite: (requestPath: string) =>
        `${targetPath}${requestPath.slice("/cdn".length)}` || "/",
    };
  } catch {
    return null;
  }
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
      const ssr = Boolean(this.environment?.config.build.ssr);

      if (ssr) {
        // The SSR bundle also contains an earlyHlsPreload chunk, but that
        // server-only asset is not served to browsers. Resolve the emitted
        // client chunk from the manifest instead.
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
              item.src?.replaceAll("\\", "/").endsWith("/earlyHlsPreload.ts") ||
              item.file?.includes("early-hls-preload"),
          );
          if (entry?.file) {
            url = joinPublicPath(publicBase, entry.file);
          }
        } catch {
          url = undefined;
        }
        // Don't leave a resolvable-looking placeholder URL in HTML if the
        // manifest entry is missing; the inline bootstrap treats an empty URL
        // as disabled and exits without issuing a broken request.
        if (!url) url = "";
      } else {
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
      }

      if (url === undefined) return;

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
  const cdnDevProxy = createCdnDevProxy(config.VITE_CDN_URL);
  const bundleAnalysisEnabled = mode === "analyze";

  return {
    envDir: workspaceRoot,
    optimizeDeps: {
      // Avoid blocking the first request on a crawl of the full app graph.
      holdUntilCrawlEnd: false,
      include: [
        "react",
        "react-dom/client",
        "@base-ui/react/context-menu",
        "@base-ui/react/drawer",
        "react-markdown",
        "remark-gfm",
        "react-markdown > hast-util-to-jsx-runtime > style-to-js",
        "@veolms/contracts/auth",
        "@veolms/contracts > zod",
        "@tanstack/react-query",
        "@tanstack/react-query-persist-client",
        "@tanstack/query-async-storage-persister",
        "@tanstack/react-query > @tanstack/query-core",
        "@tanstack/react-query-persist-client > @tanstack/query-persist-client-core",
        "@tanstack/query-async-storage-persister > @tanstack/query-persist-client-core",
        "@tanstack/query-async-storage-persister > @tanstack/query-core",
        "axios",
        "swiper",
        "swiper/react",
        "tailwind-merge",
        "@phosphor-icons/react",
        ...loginLucideIcons.map(
          (iconName) => `lucide-react/dist/esm/icons/${iconName}.mjs`,
        ),
      ],
      // The generated React Router entry references every academy surface.
      // Avoid a full cold-start crawl; add CJS-only packages to `include` if
      // they are reached by a page at runtime.
      noDiscovery: true,
    },
    define: {
      "import.meta.env.STATIC_BUILD_API_URL": JSON.stringify(
        config.STATIC_BUILD_API_URL,
      ),
      "import.meta.env.VITE_CDN_URL": JSON.stringify(config.VITE_CDN_URL),
      // Baked by the preview build from the public course list. Kept off the
      // VITE_ env allowlist so a missing value at serve time does not make a
      // finished build look stale.
      "import.meta.env.VITE_COURSE_LCP_PRELOAD": JSON.stringify(
        process.env.VEO_COURSE_LCP_PRELOAD || "",
      ),
    },
    plugins: [
      earlyHlsPreloadPlugin(),
      tailwindcss(),
      reactRouter(),
      ...(bundleAnalysisEnabled
        ? [
            visualizer({
              filename: path.resolve(
                workspaceRoot,
                "apps/web/bundle-stats.html",
              ),
              template: "treemap",
              gzipSize: true,
              brotliSize: true,
              open: false,
              projectRoot: workspaceRoot,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": webSourceRoot,
        // Axios' package ESM entry currently resolves its Node platform in
        // Vite, which exposes the Node-only `process` global to the browser.
        axios: axiosBrowserEntry,
        "@veolms/video-player/shaka-preload": fileURLToPath(
          new URL(
            "../../packages/video-player/src/engines/shaka/shaka-early-preload.ts",
            import.meta.url,
          ),
        ),
      },
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
          "./src/root.tsx",
          "./src/routes/academy-layout.tsx",
          "./src/CoursesPage.tsx",
          "./src/StudentPages.tsx",
        ],
      },
      proxy: {
        "/v1": {
          target: config.STATIC_BUILD_API_URL
            ? new URL(config.STATIC_BUILD_API_URL).origin.replace(
                "localhost",
                "127.0.0.1",
              )
            : "http://127.0.0.1:4000",
          changeOrigin: true,
          secure: false,
        },
        ...(cdnDevProxy ? { "/cdn": cdnDevProxy } : {}),
      },
    },
  };
});
