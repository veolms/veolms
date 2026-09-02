import type { ReactNode } from "react";
import { useEffect } from "react";
import {
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { AppLoadingScreen } from "../bootstrap/AppLoadingScreen";
import { useCurrentUser } from "../services/auth";
import { useAuthStore } from "../store/auth.store";
import {
  APP_HOME_PATH,
  MFA_CHALLENGE_PATH,
  buildLoginPath,
  isGuestLandingPath,
  normalizeAppPath,
  requiresAcademyAuth,
  resolveAcademyLandingDestination,
  resolveAuthenticatedDestination,
  resolveSessionAccess,
  shouldBlockAcademyRender,
} from "./routeAccess";

function useSessionAccess() {
  const { data: user, isPending, isFetched } = useCurrentUser();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const access = resolveSessionAccess({ user, isAuthenticated });

  return {
    access,
    pending: isPending && !isFetched,
  };
}

export function AcademyRouteGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { access, pending } = useSessionAccess();
  const path = normalizeAppPath(location.pathname);

  useEffect(() => {
    if (pending) {
      return;
    }

    if (isGuestLandingPath(path)) {
      navigate(resolveAcademyLandingDestination(access), { replace: true });
      return;
    }

    if (!access.isAuthenticated) {
      if (requiresAcademyAuth(path)) {
        navigate(APP_HOME_PATH, { replace: true });
      }
      return;
    }

    if (access.needsMfaChallenge && path !== "/logout") {
      navigate(MFA_CHALLENGE_PATH, { replace: true });
    }
  }, [
    access.isAuthenticated,
    access.isSessionReady,
    access.needsMfaChallenge,
    location.pathname,
    location.search,
    navigate,
    path,
    pending,
  ]);

  if (pending || shouldBlockAcademyRender(path, access)) {
    return <AppLoadingScreen />;
  }

  return <>{children}</>;
}

export function AuthRouteGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { access, pending } = useSessionAccess();
  const path = normalizeAppPath(location.pathname);

  useEffect(() => {
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
        navigate(MFA_CHALLENGE_PATH, { replace: true });
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
