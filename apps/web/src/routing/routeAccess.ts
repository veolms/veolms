import type { MfaGateUser } from "../auth/mfaGate";
import { resolveMfaSetupView } from "../auth/mfaGate";
import { normalizeNavigationPath } from "./routeDescriptors";

export const APP_HOME_PATH = "/courses";
export const LOGIN_PATH = "/login";
export const MFA_CHALLENGE_PATH = "/mfa-setup?mfa=required";

// Temporary product flag: keep lessons accessible while the login flow is disabled.
// Set this to false to restore authentication for learning routes.
export const ALLOW_GUEST_LEARNING = true;

const AUTH_FLOW_PATHS = new Set([
  LOGIN_PATH,
  "/register",
  "/mfa-setup",
  "/auth/callback",
]);

const GUEST_LANDING_PATHS = new Set(["/", "/home", "/dashboard"]);

export function normalizeAppPath(pathname: string): string {
  return normalizeNavigationPath(pathname);
}

export function isAuthFlowPath(pathname: string): boolean {
  return AUTH_FLOW_PATHS.has(normalizeAppPath(pathname));
}

export function isSettingsPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return path === "/settings" || path.startsWith("/settings/");
}

export function isCoursesPublicPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  if (path === "/courses") {
    return true;
  }
  return /^\/courses\/[^/]+\/overview$/.test(path);
}

export function isLearningPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);

  if (/^\/learn\/[^/]+(?:\/[^/]+)?$/.test(path)) {
    return true;
  }

  return (
    path !== "/courses/create" && /^\/courses\/[^/]+(?:\/[^/]+)?$/.test(path)
  );
}

export function isPublicAcademyPath(pathname: string): boolean {
  return (
    isSettingsPath(pathname) ||
    isCoursesPublicPath(pathname) ||
    (ALLOW_GUEST_LEARNING && isLearningPath(pathname))
  );
}

export function isGuestLandingPath(pathname: string): boolean {
  return GUEST_LANDING_PATHS.has(normalizeAppPath(pathname));
}

export function requiresAcademyAuth(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  if (path === "/logout") {
    return false;
  }
  return !isPublicAcademyPath(path);
}

export function sanitizeReturnTo(
  value: string | null | undefined,
): string | null {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(value, "https://procodrr.local");
    const path = normalizeAppPath(url.pathname);
    if (isAuthFlowPath(path)) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function buildLoginPath(returnTo?: string | null): string {
  const target = sanitizeReturnTo(returnTo);
  if (!target) {
    return LOGIN_PATH;
  }
  return `${LOGIN_PATH}?returnTo=${encodeURIComponent(target)}`;
}

export interface SessionAccess {
  isAuthenticated: boolean;
  needsMfaChallenge: boolean;
  isSessionReady: boolean;
}

export function resolveSessionAccess(input: {
  user: MfaGateUser | null | undefined;
  isAuthenticated: boolean;
}): SessionAccess {
  const isAuthenticated = input.isAuthenticated || Boolean(input.user);

  if (!isAuthenticated || !input.user) {
    return {
      isAuthenticated,
      needsMfaChallenge: false,
      isSessionReady: false,
    };
  }

  const view = resolveMfaSetupView(input.user);
  if (view === "done") {
    return {
      isAuthenticated: true,
      needsMfaChallenge: false,
      isSessionReady: true,
    };
  }

  if (view === "login") {
    return {
      isAuthenticated: false,
      needsMfaChallenge: false,
      isSessionReady: false,
    };
  }

  return {
    isAuthenticated: true,
    needsMfaChallenge: true,
    isSessionReady: false,
  };
}

export function resolveAuthenticatedDestination(
  returnTo: string | null | undefined,
): string {
  return sanitizeReturnTo(returnTo) ?? APP_HOME_PATH;
}

export function shouldRedirectToMfaChallenge(
  pathname: string,
  error: { status: number; code: string },
): boolean {
  if (error.status !== 403 || error.code !== "MFA_REQUIRED") {
    return false;
  }

  const path = normalizeAppPath(pathname);
  if (
    isAuthFlowPath(path) ||
    isPublicAcademyPath(path) ||
    isGuestLandingPath(path)
  ) {
    return false;
  }

  return true;
}
