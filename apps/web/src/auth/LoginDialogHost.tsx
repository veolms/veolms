import { Suspense, useCallback, useEffect, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  LOGIN_DIALOG_PARAM,
  sanitizeReturnTo,
  stripLoginDialogParams,
} from "../routing/routeAccess";
import { loginDialogBody } from "../routing/prerenderedBodies";
import { removeLoginDialogSnapshot } from "./loginDialogSnapshot";
import { useSessionAccess } from "../routing/RouteGuards";
import {
  clearLoginDialogIntent,
  useLoginDialogIntent,
} from "../store/loginDialogIntent";

// The login card and its styles load only when someone asks to log in. Once
// they have loaded the pop-up renders at once, where a bare `lazy()` would
// still show its (empty) fallback first and hold the pop-up back behind it.
const LoginDialog = loginDialogBody.Body;

const subscribeToNothing = () => () => {};

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
  // A page built ahead of time has no pop-up in it, whatever its address
  // says. The first render in the browser has to match that page, so the
  // pop-up is added straight after it instead of during it.
  const pageIsHydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  // A tap on Login shows the pop-up a moment before the address carries it
  // (see loginDialogIntent); meanwhile the address it is heading for counts.
  const intent = useLoginDialogIntent();
  const addressAsks = new URLSearchParams(location.search).has(
    LOGIN_DIALOG_PARAM,
  );
  const search =
    intent && !addressAsks
      ? (intent.split("#", 1)[0]?.split("?")[1] ?? "")
      : location.search;
  const params = new URLSearchParams(search);
  const requested = params.has(LOGIN_DIALOG_PARAM);
  const pagePath = `${location.pathname}${stripLoginDialogParams(location.search)}${location.hash}`;

  // Once the address carries the pop-up, or the page changes, it rules.
  useEffect(() => {
    if (addressAsks) clearLoginDialogIntent();
  }, [addressAsks]);
  useEffect(() => clearLoginDialogIntent, [location.pathname]);
  const destination = sanitizeReturnTo(params.get("returnTo")) ?? pagePath;

  const close = useCallback(() => {
    clearLoginDialogIntent();
    // Closed before the address caught up: there is nothing to take back.
    if (addressAsks) void navigate(pagePath, { replace: true });
  }, [addressAsks, navigate, pagePath]);
  const finish = useCallback(() => {
    clearLoginDialogIntent();
    void navigate(destination, { replace: true });
  }, [destination, navigate]);

  // Also covers arriving on a login link while already signed in.
  useEffect(() => {
    if (requested && isSessionReady) finish();
  }, [finish, isSessionReady, requested]);

  // A copy of the pop-up put up early (after a full-tab sign-in) is taken
  // down by the pop-up itself; when there will be no pop-up, here.
  useEffect(() => {
    if (!requested || isSessionReady) removeLoginDialogSnapshot();
  }, [isSessionReady, requested]);

  if (!pageIsHydrated || !requested || isSessionReady) return null;

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
