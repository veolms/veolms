import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import {
  Outlet,
  useLocation,
  useMatches,
  useNavigate,
  useSearchParams,
} from "react-router";
import type { MfaGateUser } from "../auth/mfaGate";
import { AppLoadingScreen } from "../bootstrap/AppLoadingScreen";
import { useCapabilities } from "../services/authorization";
import {
  cancelPendingLogin,
  useCurrentUser,
  wasSignedOutHere,
} from "../services/auth";
import { useAuthStore } from "../store/auth.store";
import { isPendingMfaLoginAbandoned } from "../store/pendingMfaLogin";
import { canOpenNavigationPath } from "../shell/navigationPermissions";
import {
  hasAdminRole,
  hasTeamRole,
  readSavedWorkspaceView,
  resolveWorkspaceRole,
} from "../shell/workspaceRole";
import {
  APP_HOME_PATH,
  buildMfaChallengePath,
  buildLoginDialogPath,
  resolveCourseAuthorRouteFallback,
  shouldRedirectFromCourseAuthorPath,
  guestMayView,
  isGuestLandingPath,
  isUnknownAddress,
  normalizeAppPath,
  resolveAuthenticatedDestination,
  resolveSessionAccess,
  hasCourseAuthorRole,
  hasDashboardAnalyticsPermission,
  shouldBlockAcademyRender,
  shouldPromptLoginFor,
} from "./routeAccess";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function hasMfaSessionState(user: unknown): user is MfaGateUser {
  if (!user || typeof user !== "object") return false;
  const candidate = user as Partial<MfaGateUser>;
  return (
    typeof candidate.mfaVerified === "boolean" &&
    typeof candidate.totpEnabled === "boolean" &&
    typeof candidate.passkeyEnabled === "boolean"
  );
}

export function useSessionAccess() {
  const { data: user, isPending, isFetched } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const resolvedUser = isFetched
    ? user
    : hasMfaSessionState(storeUser)
      ? storeUser
      : undefined;
  const access = resolveSessionAccess({
    user: resolvedUser,
    isAuthenticated,
  });

  return {
    access,
    user: resolvedUser,
    pending: !isFetched && !resolvedUser,
  };
}

interface AcademyRouteGuardState {
  canAccessDashboard: boolean;
  dashboardCapabilitiesResolved: boolean;
  /**
   * The home page is held back only until it is known whether this account
   * may see the dashboard. The shell shows the dashboard's placeholder
   * meanwhile, or the learner's home when that is the view the account is
   * in, rather than a spinner in place of either.
   */
  dashboardPermissionPending: boolean;
  routeContentBlocked: boolean;
  /** The account's permissions; null until they have loaded. */
  permissions: readonly string[] | null;
}

const defaultAcademyRouteGuardState: AcademyRouteGuardState = {
  canAccessDashboard: false,
  dashboardCapabilitiesResolved: false,
  dashboardPermissionPending: false,
  routeContentBlocked: false,
  permissions: null,
};

const AcademyRouteGuardContext = createContext<AcademyRouteGuardState>(
  defaultAcademyRouteGuardState,
);

export function useAcademyRouteGuardState(): AcademyRouteGuardState {
  return useContext(AcademyRouteGuardContext);
}

export function AcademyRouteGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const matches = useMatches();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { access, user, pending } = useSessionAccess();
  const path = normalizeAppPath(location.pathname);
  // An address no page answers to shows the not-found screen to everyone.
  const addressUnknown = isUnknownAddress(matches, location.pathname);
  const authenticationRequired = !guestMayView(path, addressUnknown);
  // The home is the dashboard only in the creator view. A team member in
  // the student view (their own choice, or by default for every team role
  // but admin) is shown the learner home, and was sent to the courses a
  // moment later when they lacked the dashboard's permission.
  const isDashboardPath =
    path === "/" &&
    access.isAuthenticated &&
    hasCourseAuthorRole(user?.roles) &&
    resolveWorkspaceRole(
      user?.roles,
      readSavedWorkspaceView(user?.id, user?.roles),
    ) === "creator";
  const dashboardCapabilities = useCapabilities({
    enabled: access.isSessionReady,
  });
  const dashboardCapabilityPending =
    access.isSessionReady && !dashboardCapabilities.isFetched;
  const dashboardCapabilitiesResolved = access.isSessionReady
    ? dashboardCapabilities.isFetched
    : !access.isAuthenticated && !pending;
  const canAccessDashboard =
    dashboardCapabilitiesResolved &&
    hasDashboardAnalyticsPermission(dashboardCapabilities.permissions);
  // Denied only on an answer that says so: a request that failed (offline,
  // a deploy restarting the API) is not "no permission", and used to send
  // the account away from its home.
  const dashboardRouteDenied =
    isDashboardPath &&
    access.isSessionReady &&
    dashboardCapabilities.isSuccess &&
    !canAccessDashboard;
  // A team member on a staff page their permissions do not open (typed
  // in, or an old link) goes home instead, as the sidebar never offers it.
  // The home is left to the check above: it is a staff page only as the
  // dashboard. In the student view it is the learner home the menu offers,
  // and judging it here sent a team member without the revenue permission
  // back to the courses each time they opened Home.
  const staffPageDenied =
    path !== APP_HOME_PATH &&
    access.isSessionReady &&
    dashboardCapabilities.isSuccess &&
    hasTeamRole(user?.roles) &&
    !hasAdminRole(user?.roles) &&
    !canOpenNavigationPath(
      `${path}${location.search}`,
      new Set(dashboardCapabilities.permissions),
    );
  const courseAuthorRouteDenied =
    access.isSessionReady &&
    (dashboardRouteDenied ||
      staffPageDenied ||
      shouldRedirectFromCourseAuthorPath(path, user?.roles));

  useEffect(() => {
    if (pending) {
      return;
    }

    if (!access.isAuthenticated) {
      if (authenticationRequired && !isGuestLandingPath(path)) {
        const returnPath = `${location.pathname}${location.search}`;
        // Someone who has just signed out here is not asked to sign in
        // again; their page needed the session, so they go home.
        const destination =
          shouldPromptLoginFor(path) && !wasSignedOutHere()
            ? buildLoginDialogPath(returnPath)
            : APP_HOME_PATH;
        navigate(destination, { replace: true });
      }
      return;
    }

    if (access.needsMfaChallenge && path !== "/logout") {
      // A visitor who turned away from the two-factor step is not sent back
      // to it: the sign-in is called off, and this page is then a signed-out
      // visitor's (the branch above takes over once the session is gone).
      if (isPendingMfaLoginAbandoned(user)) {
        void cancelPendingLogin(queryClient);
        return;
      }
      navigate(
        buildMfaChallengePath(`${location.pathname}${location.search}`),
        { replace: true },
      );
      return;
    }

    if (courseAuthorRouteDenied) {
      navigate(resolveCourseAuthorRouteFallback(path), { replace: true });
    }
  }, [
    access.isAuthenticated,
    access.isSessionReady,
    access.needsMfaChallenge,
    authenticationRequired,
    courseAuthorRouteDenied,
    location.pathname,
    location.search,
    navigate,
    path,
    pending,
    queryClient,
    user,
  ]);

  const dashboardPermissionPending =
    isDashboardPath && dashboardCapabilityPending;
  const routeContentBlocked =
    dashboardPermissionPending ||
    (!isGuestLandingPath(path) &&
      ((pending && authenticationRequired) ||
        shouldBlockAcademyRender(path, access, addressUnknown) ||
        courseAuthorRouteDenied));

  const permissions = dashboardCapabilities.isFetched
    ? dashboardCapabilities.permissions
    : null;
  const academyRouteGuardState = useMemo(
    () => ({
      canAccessDashboard,
      dashboardCapabilitiesResolved,
      dashboardPermissionPending,
      routeContentBlocked,
      permissions,
    }),
    [
      canAccessDashboard,
      dashboardCapabilitiesResolved,
      dashboardPermissionPending,
      routeContentBlocked,
      permissions,
    ],
  );

  return (
    <AcademyRouteGuardContext.Provider value={academyRouteGuardState}>
      {children}
    </AcademyRouteGuardContext.Provider>
  );
}

export function AuthRouteGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { access, user, pending } = useSessionAccess();
  const path = normalizeAppPath(location.pathname);

  useIsomorphicLayoutEffect(() => {
    if (pending || path === "/auth/callback") {
      return;
    }

    if (path === "/mfa-setup") {
      if (!access.isAuthenticated) {
        // Signed out on the two-factor step: the session ran out, or the
        // sign-in was just called off with Back.
        navigate(buildLoginDialogPath(searchParams.get("returnTo")), {
          replace: true,
        });
        return;
      }

      if (access.isSessionReady) {
        navigate(APP_HOME_PATH, { replace: true });
      }
      return;
    }

    if (access.needsMfaChallenge) {
      // Here by turning away from the two-factor step: the sign-in is
      // called off, and the visitor gets the login pop-up to start again.
      if (isPendingMfaLoginAbandoned(user)) {
        void cancelPendingLogin(queryClient);
        navigate(buildLoginDialogPath(searchParams.get("returnTo")), {
          replace: true,
        });
        return;
      }
      if (path !== "/login") {
        navigate(
          buildMfaChallengePath(`${location.pathname}${location.search}`),
          { replace: true },
        );
      }
      return;
    }

    if (!access.isSessionReady) {
      return;
    }

    navigate(resolveAuthenticatedDestination(searchParams.get("returnTo")), {
      replace: true,
    });
  }, [
    access.isAuthenticated,
    access.isSessionReady,
    access.needsMfaChallenge,
    location.pathname,
    navigate,
    path,
    pending,
    queryClient,
    searchParams,
    user,
  ]);

  if (pending) {
    return <AppLoadingScreen variant="embedded" />;
  }

  if (path === "/auth/callback") {
    return <Outlet />;
  }

  if (path === "/mfa-setup") {
    if (!access.isAuthenticated || access.isSessionReady) {
      return <AppLoadingScreen variant="embedded" />;
    }
    return <Outlet />;
  }

  if (access.isSessionReady) {
    return <AppLoadingScreen variant="embedded" />;
  }

  if (access.needsMfaChallenge && path !== "/login") {
    return <AppLoadingScreen variant="embedded" />;
  }

  return <Outlet />;
}
