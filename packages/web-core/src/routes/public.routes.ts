import type { RouteConfigEntry } from "@react-router/dev/routes";
import { route } from "@react-router/dev/routes";

export function getPublicRoutes(): RouteConfigEntry[] {
  const publicCoursesRoute =
    process.env["VEO_REACT_ROUTER_BUILD"] === "true"
      ? "routes/public-courses.tsx"
      : "routes/public-courses.dev.tsx";
  const publicCourseOverviewRoute =
    process.env["VEO_REACT_ROUTER_BUILD"] === "true"
      ? "routes/public-course-overview.tsx"
      : "routes/public-course-overview.dev.tsx";

  return [
    route("explore-courses", publicCoursesRoute, {
      id: "public-courses",
      caseSensitive: true,
    }),
    route("explore-courses/:courseSlug", publicCourseOverviewRoute, {
      id: "public-course-overview",
      caseSensitive: true,
    }),
  ];
}
