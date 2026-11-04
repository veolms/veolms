import { registerStorageReclaimer } from "@veolms/web-core";

/**
 * Lets a download make room by shrinking the lesson video cache first
 * (downloads come before the cache). Registered on every page, since a
 * download can start where no lesson was opened; the cache's code loads
 * only when room is asked for.
 */
let registered = false;

export function registerSegmentCacheReclaimer(): void {
  if (registered || typeof window === "undefined") return;
  registered = true;
  registerStorageReclaimer({
    id: "core.video-segment-cache",
    reclaim: (bytesNeeded) =>
      import("./segmentCache").then((module) =>
        module.reclaimSegmentCache(bytesNeeded),
      ),
  });
}
