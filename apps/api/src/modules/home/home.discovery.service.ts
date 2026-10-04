import type { HomeDiscoveryResponse } from "@veolms/contracts";
import type { CourseService } from "../courses/course/course.service.ts";

export interface HomeDiscoveryService {
  getDiscovery(): Promise<HomeDiscoveryResponse>;
}

export function createHomeDiscoveryService({
  courseService,
}: {
  courseService: Pick<CourseService, "getHomeDiscovery">;
}): HomeDiscoveryService {
  return {
    async getDiscovery() {
      return await courseService.getHomeDiscovery();
    },
  };
}
