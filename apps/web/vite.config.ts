import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { loadWebConfig } from "@veolms/config";
import { defineConfig, loadEnv, type Plugin } from "vite";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const webSourceRoot = fileURLToPath(new URL("./src", import.meta.url));

const shellPhosphorIcons = new Set([
  "Bell",
  "BookOpen",
  "CaretDown",
  "CaretRight",
  "ChartBar",
  "ChatCircleDots",
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
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<
            string,
            { file?: string; name?: string; src?: string }
          >;
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
        if (item.type === "chunk" && item.code.includes(EARLY_HLS_PRELOAD_PLACEHOLDER)) {
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

export default defineConfig(({ mode }) => {
  const environment = {
    ...process.env,
    ...loadEnv(mode, workspaceRoot, ""),
  };
  const config = loadWebConfig(environment);

  return {
    envDir: workspaceRoot,
    optimizeDeps: {
      include: [
        "react",
        "react-dom/client",
        "emoji-picker-react",
        "@tiptap/core",
        "@tiptap/extension-link",
        "@tiptap/markdown",
        "@tiptap/starter-kit",
      ],
    },
    define: {
      "import.meta.env.STATIC_BUILD_API_URL": JSON.stringify(
        config.STATIC_BUILD_API_URL,
      ),
      "import.meta.env.VITE_COURSE_MEDIA_BASE_URL": JSON.stringify(
        config.VITE_COURSE_MEDIA_BASE_URL ?? "",
      ),
    },
    plugins: [earlyHlsPreloadPlugin(), tailwindcss(), reactRouter()],
    resolve: {
      alias: {
        "@": webSourceRoot,
        "@veolms/video-player/shaka-preload": fileURLToPath(
          new URL(
            "../../packages/video-player/src/engines/shaka/shaka-early-preload.ts",
            import.meta.url,
          ),
        ),
      },
      dedupe: ["@tiptap/core", "@tiptap/pm"],
    },
    ssr: {
      // The package publishes extensionless internal ESM imports. Bundling it
      // lets Vite resolve those imports for the build-time SSG renderer.
      noExternal: [
        "@atomic-editor/editor",
        "@phosphor-icons/react",
        /^@phosphor-icons\/react\//,
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
          "./src/root.tsx",
          "./src/routes/academy-layout.tsx",
          "./src/CoursesPage.tsx",
          "./src/StudentPages.tsx",
        ],
      },
      proxy: {
        "/api": {
          target: config.STATIC_BUILD_API_URL
            ? new URL(config.STATIC_BUILD_API_URL).origin.replace(
                "localhost",
                "127.0.0.1",
              )
            : "http://127.0.0.1:4000",
          changeOrigin: true,
          secure: false,
        },
        "/course-hls": {
          target: config.VITE_COURSE_MEDIA_BASE_URL
            ? new URL(config.VITE_COURSE_MEDIA_BASE_URL).origin
            : "https://dev.veolms.org",
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
