import { fileURLToPath } from "node:url";

import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { loadWebConfig } from "@veolms/config";
import { defineConfig, loadEnv } from "vite";

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
