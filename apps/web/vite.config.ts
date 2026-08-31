import { fileURLToPath } from "node:url";

import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { loadWebConfig } from "@veolms/config";
import { defineConfig, loadEnv } from "vite";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const webSourceRoot = fileURLToPath(new URL("./src", import.meta.url));

const shellPhosphorIcons = new Set([
  "ArrowCounterClockwise",
  "ArrowLeft",
  "ArrowSquareOut",
  "Bell",
  "BookOpen",
  "CaretDown",
  "CaretRight",
  "ChartBar",
  "ChatCircleDots",
  "ChatTeardropDots",
  "Check",
  "CheckCircle",
  "Circle",
  "CircleNotch",
  "CornersIn",
  "CornersOut",
  "DotsThreeVertical",
  "DotsThreeCircle",
  "EnvelopeSimple",
  "Eye",
  "FileText",
  "GearSix",
  "GraduationCap",
  "Heart",
  "House",
  "Info",
  "Lock",
  "MagnifyingGlass",
  "Moon",
  "Palette",
  "PencilSimple",
  "Play",
  "Question",
  "ShareNetwork",
  "SidebarSimple",
  "SignOut",
  "SquaresFour",
  "Star",
  "Student",
  "Sun",
  "ThumbsUp",
  "Tote",
  "Trash",
  "User",
  "Users",
  "WarningCircle",
  "X",
  "XCircle",
]);
const settingsPhosphorIcons = new Set(["ShieldCheck", "UserCircle"]);

const rootCoreModules = new Set([
  "appStylesheet.ts",
  "bootstrap/AppLoadingScreen.tsx",
  "courses/catalogue.ts",
  "learning/courseMetadata.ts",
  "reading-mode/readingModePreferences.ts",
  "routing/routeAccess.ts",
  "routing/routeDescriptors.ts",
  "routing/tabSessionState.ts",
  "settings/settingsPreferences.ts",
  "themes.ts",
]);

const academyCoreModules = new Set([
  "keyboardShortcuts.ts",
  "learning/courseContent.ts",
  "learning/curriculumSize.ts",
  "learning/useSessionStorageState.ts",
  "searchShortcut.tsx",
  "shell/navigation.ts",
  "useShortcutPlatform.ts",
]);

const learnCoreModules = new Set([
  "learning/player/lessonPlayerPersistence.ts",
  "learning/useCurriculumTestPreferences.ts",
]);

const normalizedWebSourceRoot = `${webSourceRoot.replaceAll("\\", "/")}/`;
const getWebSourceModuleId = (id: string) => {
  const normalizedId = id.replaceAll("\\", "/").split("?", 1)[0] ?? "";
  return normalizedId.startsWith(normalizedWebSourceRoot)
    ? normalizedId.slice(normalizedWebSourceRoot.length)
    : null;
};

const getPhosphorIconName = (id: string) =>
  id
    .replaceAll("\\", "/")
    .match(/@phosphor-icons\/react\/dist\/csr\/([^/]+)\.es\.js$/)?.[1];

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
        "@tanstack/react-query",
        "axios",
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
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
      alias: {
        "@": webSourceRoot,
      },
      dedupe: ["@tiptap/core", "@tiptap/pm"],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const iconName = getPhosphorIconName(id);
            if (iconName && shellPhosphorIcons.has(iconName))
              return "shell-icons";
            if (iconName && settingsPhosphorIcons.has(iconName))
              return "settings-icons";
            const normalizedId = id.replaceAll("\\", "/").split("?", 1)[0];
            if (
              normalizedId?.includes("/node_modules/react-router/") ||
              normalizedId?.includes("/node_modules/@react-router/")
            ) {
              return "react-router-runtime";
            }
            const webModuleId = getWebSourceModuleId(id);
            if (webModuleId && rootCoreModules.has(webModuleId))
              return "root-core";
            if (webModuleId && academyCoreModules.has(webModuleId))
              return "academy-core";
            if (webModuleId && learnCoreModules.has(webModuleId))
              return "learn-core";
            return undefined;
          },
        },
      },
    },
    // The icon packages expose very large barrel modules. Bundling them in the
    // server build lets Vite tree-shake to the glyphs each route actually uses
    // instead of making the prerender worker evaluate both complete barrels.
    ssr: {
      noExternal: ["@phosphor-icons/react", "lucide-react"],
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
