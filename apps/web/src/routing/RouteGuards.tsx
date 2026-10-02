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
import { useCurrentUser } from "../services/auth";
import { useAuthStore } from "../store/auth.store";
import {
  APP_HOME_PATH,
  buildMfaChallengePath,
  buildLoginPath,
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

function useSessionAccess() {
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
        navigate(APP_HOME_PATH, { replace: true });
      }
      return;
    }

    if (access.needsMfaChallenge && path !== "/logout") {
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
  const [searchParams] = useSearchParams();
  const { access, pending } = useSessionAccess();
  const path = normalizeAppPath(location.pathname);

  useIsomorphicLayoutEffect(() => {
    if (pending || path === "/auth/callback") {
      return;
    }

    if (path === "/mfa-setup") {
      if (!access.isAuthenticated) {
        navigate(buildLoginPath(), { replace: true });
        return;
      }

      if (access.isSessionReady) {
        navigate(APP_HOME_PATH, { replace: true });
      }
      return;
    }

    if (access.needsMfaChallenge) {
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
    searchParams,
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
