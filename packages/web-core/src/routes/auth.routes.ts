import type { RouteConfigEntry } from "@react-router/dev/routes";
import { layout, route } from "@react-router/dev/routes";

export function getAuthRoutes(): RouteConfigEntry {
  return layout("routes/auth-layout.tsx", { id: "auth-layout" }, [
    route("login", "routes/login.tsx", { id: "login", caseSensitive: true }),
    route("mfa-setup", "routes/mfa-setup.tsx", {
      id: "mfa-setup",
      caseSensitive: true,
    }),
    route("register", "routes/register.tsx", {
      id: "register",
      caseSensitive: true,
    }),
    route("auth/callback", "routes/auth-callback.tsx", {
      id: "auth-callback",
      caseSensitive: true,
    }),
  ]);
}
