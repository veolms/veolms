import { defineConfig } from "vitest/config";

export default defineConfig({
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
