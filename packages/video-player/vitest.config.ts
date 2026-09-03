import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/testing/setup.ts"],
    restoreMocks: true,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
