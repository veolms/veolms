import { useEffect } from "react";

const loadWorkspace = () => import("../learner/CodingWorkspace");

/**
 * Downloads the editor and runner while the page is idle once questions
 * are listed, so opening one does not wait for them.
 */
export function preloadPracticeWorkspace(): void {
  void loadWorkspace().catch(() => undefined);
}

export function usePreloadPracticeWorkspace(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(preloadPracticeWorkspace, {
        timeout: 3_000,
      });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(preloadPracticeWorkspace, 1_500);
    return () => window.clearTimeout(timer);
  }, [enabled]);
}
