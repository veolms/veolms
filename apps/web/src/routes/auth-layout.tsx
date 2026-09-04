import type { Route } from "./+types/auth-layout";
import { Outlet, redirect } from "react-router";
import { AuthBrandPanel } from "../auth/AuthBrandPanel";
import { useAuthAppearance } from "../auth/useAuthAppearance";
import { queryClient } from "../lib/query-client";
import { AuthRouteGuard } from "../routing/RouteGuards";
import {
  normalizeAppPath,
  resolveAuthenticatedDestination,
  resolveSessionAccess,
} from "../routing/routeAccess";
import {
  authKeys,
  currentUserQueryOptions,
} from "../services/auth";
import { productName } from "../routing/routeDescriptors";
import { authStore } from "../store/auth.store";
import "../auth/auth.css";
import "../auth/mfa-setup.css";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  const path = normalizeAppPath(url.pathname);

  // OAuth must be allowed to establish a new session before we inspect the
  // current session. The callback route owns that exchange.
  if (path === "/auth/callback") {
    return null;
  }

  let user = null;
  try {
    user = await queryClient.fetchQuery(currentUserQueryOptions(queryClient));
  } catch {
    // A failed or unauthenticated session check should leave the normal login
    // screen available. Protected API calls remain server-authorized.
    queryClient.setQueryData(authKeys.me(), null);
    authStore.clearAuth();
  }

  if (user) {
    authStore.setUser(user);
    const access = resolveSessionAccess({
      user,
      isAuthenticated: true,
    });

    if (access.isSessionReady) {
      return redirect(
        resolveAuthenticatedDestination(url.searchParams.get("returnTo")),
      );
    }
  }

  return null;
}

clientLoader.hydrate = true as const;

export default function AuthLayout() {
  useAuthAppearance();

  return (
    <div className="auth-page">
      <div className="auth-page__container">
        <div className="auth-page__form-column">
          <AuthRouteGuard />
        </div>

        <div className="auth-page__brand-column">
          <AuthBrandPanel />
        </div>
      </div>

      <p className="auth-page__footer">
        <span>&copy; 2026 {productName}. All rights reserved.</span>
        <span aria-hidden="true" className="auth-page__footer-divider">
          |
        </span>
        <span className="auth-page__footer-tagline">Learn. Build. Grow.</span>
      </p>
    </div>
  );
}
