import { cacheTags, createCache } from "@veolms/api-core";
import type { HomeDiscoveryResponse } from "@veolms/contracts";
import type { CourseService } from "../courses/course/course.service.ts";

export interface HomeDiscoveryService {
  getDiscovery(): Promise<HomeDiscoveryResponse>;
}

/**
 * The public Home discovery: the same for every visitor and asked for on
 * every visit, so one build is shared (a burst of visitors waits on one
 * query set). A course or site change clears it in every process; the TTL
 * covers what is not tracked, such as enrolments reordering "popular".
 */
const discoveries = createCache<HomeDiscoveryResponse>({
  name: "home.discovery",
  ttlMs: 30_000,
  maxBytes: 4 * 1024 * 1024,
});

export function createHomeDiscoveryService({
  courseService,
}: {
  courseService: Pick<CourseService, "getHomeDiscovery">;
}): HomeDiscoveryService {
  return {
    async getDiscovery() {
      return await discoveries.fetch(
        "discovery",
        () => courseService.getHomeDiscovery(),
        { tags: [cacheTags.catalog, cacheTags.site] },
      );
    },
  };
}
