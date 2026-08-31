import { lazy, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router";
import { AppLoadingScreen } from "../bootstrap/AppLoadingScreen";
import {
  isGuestLandingPath,
  normalizeAppPath,
  requiresAcademyAuth,
} from "./routeAccess";

const AuthenticatedAcademyRouteGuard = lazy(() =>
  import("./AuthenticatedRouteGuards").then((module) => ({
    default: module.AuthenticatedAcademyRouteGuard,
  })),
);
const AuthRouteGuardRuntime = lazy(() =>
  import("./AuthenticatedRouteGuards").then((module) => ({
    default: module.AuthRouteGuardRuntime,
  })),
);

export function AcademyRouteGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const path = normalizeAppPath(location.pathname);
  const authenticationRequired = requiresAcademyAuth(path);
  if (!authenticationRequired && !isGuestLandingPath(path)) return children;

  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <AuthenticatedAcademyRouteGuard>
        {children}
      </AuthenticatedAcademyRouteGuard>
    </Suspense>
  );
}

export function AuthRouteGuard() {
  return (
    <Suspense fallback={<AppLoadingScreen variant="embedded" />}>
      <AuthRouteGuardRuntime />
    </Suspense>
  );
}
