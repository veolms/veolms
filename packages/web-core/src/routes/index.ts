import type { RouteConfigEntry } from "@veolms/plugin-sdk";

import { getAcademyRoutes } from "./academy.routes.ts";
import { getAuthRoutes } from "./auth.routes.ts";
import { getPublicRoutes } from "./public.routes.ts";

export * from "./academy.routes.ts";
export * from "./auth.routes.ts";
export * from "./public.routes.ts";

export function getCoreRoutes(): RouteConfigEntry[] {
  return [getAcademyRoutes(), getAuthRoutes(), ...getPublicRoutes()];
}
