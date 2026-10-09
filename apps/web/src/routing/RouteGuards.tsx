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
  useNavigate,
  useSearchParams,
} from "react-router";
import type { MfaGateUser } from "../auth/mfaGate";
import { AppLoadingScreen } from "../bootstrap/AppLoadingScreen";
import { useCapabilities } from "../services/authorization";
import { cancelPendingLogin, useCurrentUser } from "../services/auth";
import { useAuthStore } from "../store/auth.store";
import { isPendingMfaLoginAbandoned } from "../store/pendingMfaLogin";
import {
  APP_HOME_PATH,
  buildMfaChallengePath,
  buildLoginDialogPath,
  resolveCourseAuthorRouteFallback,
  shouldRedirectFromCourseAuthorPath,
  isGuestLandingPath,
  normalizeAppPath,
  requiresAcademyAuth,
  resolveAuthenticatedDestination,
  resolveSessionAccess,
  hasCourseAuthorRole,
  hasDashboardAnalyticsPermission,
  shouldBlockAcademyRender,
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
  routeContentBlocked: boolean;
}

const defaultAcademyRouteGuardState: AcademyRouteGuardState = {
  canAccessDashboard: false,
  dashboardCapabilitiesResolved: false,
  routeContentBlocked: false,
};

const AcademyRouteGuardContext = createContext<AcademyRouteGuardState>(
  defaultAcademyRouteGuardState,
);

export function useAcademyRouteGuardState(): AcademyRouteGuardState {
  return useContext(AcademyRouteGuardContext);
}

export function AcademyRouteGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { access, user, pending } = useSessionAccess();
  const path = normalizeAppPath(location.pathname);
  const authenticationRequired = requiresAcademyAuth(path);
  const isDashboardPath =
    path === "/" && access.isAuthenticated && hasCourseAuthorRole(user?.roles);
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
  const dashboardRouteDenied =
    isDashboardPath &&
    access.isSessionReady &&
    dashboardCapabilities.isFetched &&
    !canAccessDashboard;
  const courseAuthorRouteDenied =
    access.isSessionReady &&
    (dashboardRouteDenied ||
      shouldRedirectFromCourseAuthorPath(path, user?.roles));

  useEffect(() => {
    if (pending) {
      return;
    }

    if (!access.isAuthenticated) {
      if (requiresAcademyAuth(path) && !isGuestLandingPath(path)) {
        const returnPath = `${location.pathname}${location.search}`;
        const destination =
          path === "/discussions" || path.startsWith("/discussions/")
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
    courseAuthorRouteDenied,
    location.pathname,
    location.search,
    navigate,
    path,
    pending,
    queryClient,
    user,
  ]);

  const routeContentBlocked =
    (isDashboardPath && dashboardCapabilityPending) ||
    (!isGuestLandingPath(path) &&
      ((pending && authenticationRequired) ||
        shouldBlockAcademyRender(path, access) ||
        courseAuthorRouteDenied));

  const academyRouteGuardState = useMemo(
    () => ({
      canAccessDashboard,
      dashboardCapabilitiesResolved,
      routeContentBlocked,
    }),
    [canAccessDashboard, dashboardCapabilitiesResolved, routeContentBlocked],
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
