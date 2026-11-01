import type { Route } from "./+types/auth-layout";
import "../auth/auth.css";
import "../styles/components/toast-notification.css";
import { redirect } from "react-router";
import { AuthPageFrame } from "../auth/AuthPageFrame";
import { useAuthAppearance } from "../auth/useAuthAppearance";
import { queryClient } from "../lib/query-client";
import { loginDialogBody } from "../routing/prerenderedBodies";
import { AuthRouteGuard } from "../routing/RouteGuards";
import {
  buildLoginDialogPath,
  LOGIN_PATH,
  readLoginPurpose,
  normalizeAppPath,
  resolveAuthenticatedDestination,
  resolveSessionAccess,
} from "../routing/routeAccess";
import { authKeys, currentUserQueryOptions } from "../services/auth";
import { authStore } from "../store/auth.store";

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
    queryClient.removeQueries({ queryKey: authKeys.avatars() });
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

  // Logging in happens in a pop-up over a page. A visitor who opens /login
  // is sent to the page they were heading for (or the home page) with the
  // pop-up open. A session still waiting on two-factor is left to the route
  // guard, which either keeps it on this screen or calls the sign-in off.
  if (!user && path === LOGIN_PATH) {
    // The pop-up's code is asked for now instead of once that page has
    // rendered and found it is wanted.
    void loginDialogBody.preload();
    return redirect(
      buildLoginDialogPath(
        url.searchParams.get("returnTo"),
        null,
        readLoginPurpose(url.search),
      ),
    );
  }

  return null;
}

// While this loader waits on the session check the root HydrateFallback
// draws the auth frame: React Router allows that export only on the root
// route while the dev server runs without prerendering.
clientLoader.hydrate = true as const;

export default function AuthLayout() {
  useAuthAppearance();

  return (
    <AuthPageFrame>
      <AuthRouteGuard />
    </AuthPageFrame>
  );
}
