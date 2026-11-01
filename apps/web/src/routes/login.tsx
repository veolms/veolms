import { LoginView } from "../auth/LoginView";
import { AppLoadingScreen } from "../bootstrap/AppLoadingScreen";
import { useAuthStore } from "../store/auth.store";
import { getAuthRouteMeta, productName } from "../routing/routeDescriptors";

export function meta() {
  return Object.entries(
    getAuthRouteMeta(
      "Log in",
      `Log in to ${productName} with a secure one-time code.`,
    ),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

/**
 * Logging in happens in a pop-up, so this route only redirects to it (see
 * the auth layout's loader). The card is still shown here to an account
 * that has to set two-factor up before it can go on; a sign-in that stopped
 * at its two-factor code and was left is called off by the route guard, and
 * everyone else sees the loading screen for the instant before the redirect.
 */
export default function LoginRoute() {
  const hasSession = useAuthStore((state) => state.isAuthenticated);
  return hasSession ? <LoginView /> : <AppLoadingScreen variant="embedded" />;
}
