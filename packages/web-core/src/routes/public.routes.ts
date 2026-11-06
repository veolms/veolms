import { route, type RouteConfigEntry } from "@veolms/plugin-sdk";

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
    // The legal and company pages, a route module each (prerendered).
    ...[
      "terms",
      "privacy",
      "policies",
      "contact",
      "about",
      "community-guidelines",
      "delete-account",
    ].map((path) =>
      route(path, `routes/legal/${path}.tsx`, {
        id: `legal-${path}`,
        caseSensitive: true,
      }),
    ),
  ];
}
