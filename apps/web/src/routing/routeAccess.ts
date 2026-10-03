import { publicProfileUsernameParamsSchema } from "@veolms/contracts";
import type { MfaGateUser } from "../auth/mfaGate";
import { resolveMfaSetupView } from "../auth/mfaGate";
import { normalizeNavigationPath } from "./routeDescriptors";
import { CREATOR_ROLES, normalizeRoles } from "../shell/workspaceRole";
import { isCourseEditorPath } from "../courses/courseEditorRouting";

export const APP_HOME_PATH = "/";
export const LOGIN_PATH = "/login";
export const MFA_CHALLENGE_PATH = "/mfa-setup?mfa=required";

// Temporary product flag: keep lessons accessible while the login flow is disabled.
// Set this to false to restore authentication for learning routes.
export const ALLOW_GUEST_LEARNING = true;

const AUTH_FLOW_PATHS = new Set([LOGIN_PATH, "/register", "/mfa-setup", "/auth/callback"]);

const GUEST_LANDING_PATHS = new Set(["/"]);
const RESERVED_PROFILE_PATHS = new Set([
  "/home",
  "/dashboard",
  "/courses",
  "/wishlist",
  "/students",
  "/reviews",
  "/quizzes",
  "/discussions",
  "/analytics",
  "/orders",
  "/messages",
  "/purchase-history",
  "/notifications",
  "/settings",
  "/coupons",
  "/logout",
  LOGIN_PATH,
  "/register",
  "/mfa-setup",
  "/auth",
  "/explore-courses",
]);
const DASHBOARD_PERMISSION = "analytics.revenue.read";

export function hasDashboardAnalyticsPermission(
  permissions: readonly string[] | null | undefined,
): boolean {
  return permissions?.includes(DASHBOARD_PERMISSION) ?? false;
}

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

export function isCourseAuthorPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  const normalized = normalizeAppPath(path);
  return (
    normalized === "/dashboard" ||
    isCourseEditorPath(normalized) ||
    normalized === "/students" ||
    normalized.startsWith("/students/") ||
    normalized === "/quizzes/create" ||
    (normalized.startsWith("/quizzes/") && !normalized.startsWith("/quizzes/attempt/"))
  );
}

export function hasCourseAuthorRole(roles: readonly string[] | null | undefined): boolean {
  return normalizeRoles(roles).some((role) => CREATOR_ROLES.has(role));
}

export function shouldRedirectFromCourseAuthorPath(
  pathname: string,
  roles: readonly string[] | null | undefined,
): boolean {
  if (normalizeAppPath(pathname) === "/dashboard") {
    return false;
  }
  return isCourseAuthorPath(pathname) && !hasCourseAuthorRole(roles);
}

export function resolveCourseAuthorRouteFallback(pathname: string): string {
  const path = normalizeAppPath(pathname);
  return path === "/dashboard" || path === "/" ? "/courses" : "/";
}

export function isCoursesPublicPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return (
    path === "/courses" ||
    path === "/courses/enrolled" ||
    path === "/courses/not-enrolled" ||
    path === "/courses/wishlist"
  );
}

export function isPublicProfilePath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  const match = /^\/([^/]+)$/.exec(path);
  return Boolean(
    match?.[1] &&
    publicProfileUsernameParamsSchema.safeParse({ username: match[1] }).success &&
    !RESERVED_PROFILE_PATHS.has(path.toLowerCase()),
  );
}

export function isLearningPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);

  if (isCourseEditorPath(path)) {
    return false;
  }

  if (/^\/learn\/[^/]+(?:\/[^/]+)?$/.test(path)) {
    return true;
  }

  return /^\/courses\/[^/]+(?:\/[^/]+)?$/.test(path);
}

export function isPublicAcademyPath(pathname: string): boolean {
  return (
    isSettingsPath(pathname) ||
    isCoursesPublicPath(pathname) ||
    isPublicProfilePath(pathname) ||
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

export function sanitizeReturnTo(value: string | null | undefined): string | null {
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

export function buildMfaChallengePath(returnTo?: string | null): string {
  const target = sanitizeReturnTo(returnTo);
  if (!target) {
    return MFA_CHALLENGE_PATH;
  }
  return `${MFA_CHALLENGE_PATH}&returnTo=${encodeURIComponent(target)}`;
}

export interface SessionAccess {
  isAuthenticated: boolean;
  needsMfaChallenge: boolean;
  isSessionReady: boolean;
}

export function shouldBlockAcademyRender(pathname: string, access: SessionAccess): boolean {
  const path = normalizeAppPath(pathname);

  if (isGuestLandingPath(path)) {
    return true;
  }

  if (!access.isAuthenticated) {
    return requiresAcademyAuth(path);
  }

  return access.needsMfaChallenge && path !== "/logout";
}

export function resolveAcademyLandingDestination(access: SessionAccess): string {
  if (access.needsMfaChallenge) return MFA_CHALLENGE_PATH;
  return APP_HOME_PATH;
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

export function resolveAuthenticatedDestination(returnTo: string | null | undefined): string {
  return sanitizeReturnTo(returnTo) ?? APP_HOME_PATH;
}

export function resolveMfaBackPath(returnTo: string | null | undefined): string {
  return buildLoginPath(returnTo);
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
    isCoursesPublicPath(path) ||
    (ALLOW_GUEST_LEARNING && isLearningPath(path)) ||
    isGuestLandingPath(path)
  ) {
    return false;
  }

  return true;
}
