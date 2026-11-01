import { parentPort } from "node:worker_threads";
import { transformLegacyCss } from "./legacy-css.mjs";

/**
 * Runs `transformLegacyCss` for the dev server (legacyStylesheetsDevPlugin.ts)
 * off its main thread: the app stylesheet takes 20 s or more, and on the main
 * thread every other request to the dev server waited for it.
 */
parentPort?.on("message", async ({ id, source, options }) => {
  try {
    parentPort?.postMessage({
      id,
      result: await transformLegacyCss(source, options),
    });
  } catch (error) {
    parentPort?.postMessage({
      id,
      error:
        error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
  }
});
