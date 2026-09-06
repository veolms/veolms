import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webSourceRoot = fileURLToPath(new URL("./src", import.meta.url));
const axiosBrowserEntry = fileURLToPath(
  new URL("./node_modules/axios/dist/esm/axios.js", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: {
      "@": webSourceRoot,
      axios: axiosBrowserEntry,
    },
  },
  ssr: {
    noExternal: ["@atomic-editor/editor"],
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/unit/setup.ts"],
    restoreMocks: true,
    maxWorkers: "100%",
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
