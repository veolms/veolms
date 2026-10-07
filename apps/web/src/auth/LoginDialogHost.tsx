import { lazy, Suspense, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  LOGIN_DIALOG_PARAM,
  sanitizeReturnTo,
  stripLoginDialogParams,
} from "../routing/routeAccess";
import { useSessionAccess } from "../routing/RouteGuards";

// The login card and its styles load only when someone asks to log in.
const LoginDialog = lazy(() => import("./LoginDialog"));

/**
 * Opens the login pop-up over the current page whenever the address carries
 * `?login=1`, so it can be linked to, reloaded and closed with Back like any
 * other place in the app. `returnTo` in the address names a page to open
 * after signing in, for pages a signed-out visitor cannot stay on.
 *
 * Once the visitor is signed in the parameters are dropped: the pop-up
 * closes and the page behind it shows their signed-in state.
 */
export function LoginDialogHost() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSessionReady = useSessionAccess().access.isSessionReady;

  const params = new URLSearchParams(location.search);
  const requested = params.has(LOGIN_DIALOG_PARAM);
  const pagePath = `${location.pathname}${stripLoginDialogParams(location.search)}${location.hash}`;
  const destination = sanitizeReturnTo(params.get("returnTo")) ?? pagePath;

  const close = useCallback(
    () => void navigate(pagePath, { replace: true }),
    [navigate, pagePath],
  );
  const finish = useCallback(
    () => void navigate(destination, { replace: true }),
    [destination, navigate],
  );

  // Also covers arriving on a login link while already signed in.
  useEffect(() => {
    if (requested && isSessionReady) finish();
  }, [finish, isSessionReady, requested]);

  if (!requested || isSessionReady) return null;

  return (
    <Suspense fallback={null}>
      <LoginDialog
        returnTo={destination}
        onClose={close}
        onAuthenticated={finish}
      />
    </Suspense>
  );
}
