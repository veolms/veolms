import type { RouteConfigEntry } from "@react-router/dev/routes";

import { getAcademyRoutes } from "./academy.routes.ts";
import { getAuthRoutes } from "./auth.routes.ts";
import { getPublicRoutes } from "./public.routes.ts";

export * from "./academy.routes.ts";
export * from "./auth.routes.ts";
export * from "./public.routes.ts";

export function getCoreRoutes(): RouteConfigEntry[] {
  return [getAcademyRoutes(), getAuthRoutes(), ...getPublicRoutes()];
}
