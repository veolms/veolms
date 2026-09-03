import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webSourceRoot = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": webSourceRoot,
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
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
