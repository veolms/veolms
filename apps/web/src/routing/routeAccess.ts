// The subpath import matters: this module is in the API client's startup
// graph, and the contracts barrel would pull zod plus every schema with it.
import { isValidPublicProfileUsername } from "@veolms/contracts/username-rules";
import type { MfaGateUser } from "../auth/mfaGate";
import { resolveMfaSetupView } from "../auth/mfaGate";
import {
  NOT_FOUND_SECTION,
  getMatchedRouteDescriptor,
  normalizeNavigationPath,
} from "./routeDescriptors";
import { hasTeamRole } from "../shell/workspaceRole";
import { isCourseEditorPath } from "../courses/courseEditorRouting";

export const APP_HOME_PATH = "/";
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
  "/progress",
  "/notifications",
  "/settings",
  "/coupons",
  "/home-page",
  "/platform",
  "/team",
  "/invite",
  "/logout",
  LOGIN_PATH,
  "/register",
  "/mfa-setup",
  "/auth",
  "/explore-courses",
]);
/**
 * Whether the dashboard home opens. It does for every team member: what
 * it shows follows their permissions (the API leaves out the numbers they
 * may not see), so no one is sent away from Home.
 */
export function hasDashboardAnalyticsPermission(
  permissions: readonly string[] | null | undefined,
): boolean {
  return permissions !== null && permissions !== undefined;
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
    // Staff-only surfaces: the API already denies their data to
    // non-authoring roles, but without this entry a student landing on the
    // URL saw the empty staff UI shell instead of being redirected.
    normalized === "/analytics" ||
    normalized.startsWith("/analytics/") ||
    normalized === "/coupons" ||
    normalized.startsWith("/coupons/") ||
    normalized === "/home-page" ||
    normalized === "/platform" ||
    normalized.startsWith("/platform/") ||
    normalized === "/quizzes/create" ||
    (normalized.startsWith("/quizzes/") &&
      !normalized.startsWith("/quizzes/attempt/"))
  );
}

export function hasCourseAuthorRole(
  roles: readonly string[] | null | undefined,
): boolean {
  // Any team role may reach the staff pages; each page then checks the
  // permission it needs and shows "access denied" without it.
  return hasTeamRole(roles);
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
  // A course editor refused (no course.create, say) returns to the
  // courses rather than to a home that may be refused in turn.
  return path === "/dashboard" || path === "/" || isCourseEditorPath(path)
    ? "/courses"
    : "/";
}

export function isCoursesPublicPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return (
    path === "/courses" ||
    path === "/courses/enrolled" ||
    path === "/courses/not-enrolled" ||
    path === "/courses/free" ||
    path === "/courses/wishlist"
  );
}

export function isPublicProfilePath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  const match = /^\/([^/]+)$/.exec(path);
  return Boolean(
    match?.[1] &&
    isValidPublicProfileUsername(match[1]) &&
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

/** A team invitation link: open signed out, so the invitee can sign in. */
export function isInvitePath(pathname: string): boolean {
  return /^\/invite\/[^/]+$/.test(normalizeAppPath(pathname));
}

export function isPublicAcademyPath(pathname: string): boolean {
  return (
    normalizeAppPath(pathname) === "/home" ||
    isInvitePath(pathname) ||
    isSettingsPath(pathname) ||
    isCoursesPublicPath(pathname) ||
    isPublicProfilePath(pathname) ||
    (ALLOW_GUEST_LEARNING && isLearningPath(pathname))
  );
}

const LOGIN_PROMPT_PATH_ROOTS = [
  "/dashboard",
  "/wishlist",
  "/students",
  "/quizzes",
  "/discussions",
  "/analytics",
  "/orders",
  "/purchase-history",
  "/progress",
  "/notifications",
  "/coupons",
  "/home-page",
  "/platform",
  "/team",
] as const;

/**
 * Signed-in pages a signed-out visitor is asked to log in for — with the page
 * kept as the place to return to — instead of being sent to the home page.
 * These are the addresses emails, notifications and bookmarks point at. An
 * address under one of them that no page answers to is asked about too: the
 * visitor may simply be signed out. Any other address the app does not know
 * shows the not-found screen (see `guestMayView`).
 */
export function shouldPromptLoginFor(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return (
    isCourseEditorPath(path) ||
    LOGIN_PROMPT_PATH_ROOTS.some(
      (root) => path === root || path.startsWith(`${root}/`),
    )
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

/**
 * Whether no page of its own answers to the address: the router fell through
 * to its catch-all, matched a pattern the address does not really fit, or
 * could only hand the address to the profile page although the path rules do
 * not count it as a profile address. Takes the router's matches because only
 * the route tree knows which addresses exist.
 *
 * The last case is a single word held back from the public profile addresses
 * (see `isPublicProfilePath`): a reserved word with no page of its own
 * ("/auth"), or one written in another case ("/Orders") or percent-encoded,
 * which no page's own route matches. It was taken for a signed-in page, so a
 * signed-out visitor was sent to the home page while a signed-in one saw
 * "Page not found". Nothing signed-in is behind it: what the router gave it
 * to is the profile page, which looks the name up and shows the not-found
 * screen when it is no one's.
 */
export function isUnknownAddress(
  matches: readonly { id: string }[],
  pathname: string,
): boolean {
  const descriptor = getMatchedRouteDescriptor(matches, pathname);
  if (descriptor.kind !== "shell") return false;
  if (descriptor.page === "placeholder") {
    return descriptor.section === NOT_FOUND_SECTION;
  }
  return descriptor.page === "public-profile" && !isPublicProfilePath(pathname);
}

/**
 * Whether a signed-out visitor is shown the page at this address rather than
 * being sent elsewhere. Public pages, and an address no page answers to: the
 * not-found screen has nothing to protect, and sending the visitor to the
 * home page instead left them on a page they did not ask for with no word
 * that the address was wrong. An unknown address under a signed-in page
 * keeps its login prompt.
 */
export function guestMayView(
  pathname: string,
  addressUnknown: boolean,
): boolean {
  const path = normalizeAppPath(pathname);
  if (!requiresAcademyAuth(path)) return true;
  return addressUnknown && !shouldPromptLoginFor(path);
}

export function sanitizeReturnTo(
  value: string | null | undefined,
): string | null {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  try {
    const base = "https://procodrr.local";
    const url = new URL(value, base);
    // Checked after parsing, because the parser rewrites the path:
    // "/.//evil.com" and "/\\evil.com" both come out as "//evil.com",
    // which a browser follows to another site.
    if (url.origin !== base || url.pathname.startsWith("//")) {
      return null;
    }
    const path = normalizeAppPath(url.pathname);
    if (isAuthFlowPath(path)) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function buildLoginPath(
  returnTo?: string | null,
  purpose?: LoginPurpose | null,
): string {
  const params = new URLSearchParams();
  const target = sanitizeReturnTo(returnTo);
  if (target) params.set("returnTo", target);
  if (purpose) params.set(LOGIN_PURPOSE_PARAM, purpose);
  const query = params.toString();
  return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH;
}

/** The query parameter that opens the login pop-up over a page. */
export const LOGIN_DIALOG_PARAM = "login";

/**
 * What the visitor was trying to do when asked to log in, so the pop-up can
 * say so ("Log in to join the discussion").
 */
export const LOGIN_PURPOSE_PARAM = "loginFor";
export type LoginPurpose = "discussion";

export function readLoginPurpose(search: string): LoginPurpose | null {
  return new URLSearchParams(search).get(LOGIN_PURPOSE_PARAM) === "discussion"
    ? "discussion"
    : null;
}

function canGuestStayOn(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  return !requiresAcademyAuth(pathname) || isGuestLandingPath(pathname);
}

/**
 * The address that shows the login pop-up. Logging in happens in a pop-up
 * over a page rather than on a page of its own, so this picks the page to
 * show behind it:
 *
 * - `returnTo`, when a signed-out visitor may be on it (a lesson, a course);
 * - otherwise the page they are on now, or the home page, with `returnTo`
 *   kept in the address so they are taken there once signed in.
 */
export function buildLoginDialogPath(
  returnTo?: string | null,
  currentPath?: string | null,
  purpose?: LoginPurpose | null,
): string {
  const target = sanitizeReturnTo(returnTo);
  const current = sanitizeReturnTo(currentPath);
  const behind =
    target && canGuestStayOn(target)
      ? target
      : current && canGuestStayOn(current)
        ? current
        : APP_HOME_PATH;
  const url = new URL(behind, "https://procodrr.local");
  url.searchParams.set(LOGIN_DIALOG_PARAM, "1");
  if (target && behind !== target) url.searchParams.set("returnTo", target);
  else url.searchParams.delete("returnTo");
  if (purpose) url.searchParams.set(LOGIN_PURPOSE_PARAM, purpose);
  else url.searchParams.delete(LOGIN_PURPOSE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A page's query string without the login pop-up's parameters. */
export function stripLoginDialogParams(search: string): string {
  const params = new URLSearchParams(search);
  if (!params.has(LOGIN_DIALOG_PARAM)) return search;
  params.delete(LOGIN_DIALOG_PARAM);
  params.delete("returnTo");
  params.delete(LOGIN_PURPOSE_PARAM);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Carries an open login pop-up over to an address a page rewrites itself to
 * (a lesson settling on its canonical address, for instance), so tidying the
 * address does not close the pop-up.
 */
export function keepLoginDialogOpen(search: string, nextPath: string): string {
  const params = new URLSearchParams(search);
  if (!params.has(LOGIN_DIALOG_PARAM)) return nextPath;
  const url = new URL(nextPath, "https://procodrr.local");
  url.searchParams.set(LOGIN_DIALOG_PARAM, "1");
  const returnTo = params.get("returnTo");
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  const purpose = readLoginPurpose(search);
  if (purpose) url.searchParams.set(LOGIN_PURPOSE_PARAM, purpose);
  return `${url.pathname}${url.search}${url.hash}`;
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

export function shouldBlockAcademyRender(
  pathname: string,
  access: SessionAccess,
  addressUnknown = false,
): boolean {
  const path = normalizeAppPath(pathname);

  if (isGuestLandingPath(path)) {
    return true;
  }

  if (!access.isAuthenticated) {
    return !guestMayView(path, addressUnknown);
  }

  return access.needsMfaChallenge && path !== "/logout";
}

export function resolveAcademyLandingDestination(
  access: SessionAccess,
): string {
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

export function resolveAuthenticatedDestination(
  returnTo: string | null | undefined,
): string {
  return sanitizeReturnTo(returnTo) ?? APP_HOME_PATH;
}

/**
 * Where "Back" on the two-factor step leads: the login pop-up it was reached
 * from. The sign-in is called off first (see `cancelPendingLogin`), so this
 * is the pop-up for a visitor who is signed out again.
 */
export function resolveMfaBackPath(
  returnTo: string | null | undefined,
): string {
  return buildLoginDialogPath(returnTo);
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
