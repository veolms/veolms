import { homeDiscoveryResponseSchema } from "@veolms/contracts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createCourseService } from "../courses/course/course.service.ts";
import { createHomeController } from "./home.controller.ts";
import { createHomeDiscoveryService } from "./home.discovery.service.ts";

const homeRoutes: RoutePlugin = async (app, options) => {
  const courseService = createCourseService({
    database: options.database,
    services: options.services,
  });
  const service = createHomeDiscoveryService({ courseService });
  const controller = createHomeController({ service });

  app.get(
    "/home/discovery",
    {
      schema: {
        operationId: "getHomeDiscovery",
        tags: ["Home"],
        summary: "Get public Home discovery content",
        response: {
          200: jsonResponse(
            "Public Home course discovery collections.",
            homeDiscoveryResponseSchema,
          ),
        },
      },
    },
    controller.getDiscovery,
  );
};

export default homeRoutes;
