import { isCourseEditorPath } from "../courses/courseEditorRouting";

interface PreloadUser {
  id?: string | null;
  roles?: readonly string[];
}

const routePreloadPromises = new Map<string, Promise<void>>();
const CREATOR_HOME_ROLES = new Set([
  "creator",
  "instructor",
  "admin",
  "administrator",
  "platform_admin",
  "platform administrator",
]);

function normalizeRoutePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  return path.replace(/\/+$/, "") || "/";
}

function getHomeViewKey(
  user?: PreloadUser | null,
): "creator" | "student" | "anonymous" {
  if (user === null) return "anonymous";

  let selectedRole = "student";
  try {
    const userRole = user?.id
      ? localStorage.getItem(`veolms-role-${user.id}`)
      : null;
    selectedRole =
      userRole ?? localStorage.getItem("veolms-role") ?? "student";
  } catch {
    // Private browsing or storage restrictions fall back to the student view.
  }

  if (selectedRole !== "creator") return "student";
  if (!user) return "creator";
  return (user.roles ?? []).some((role) =>
    CREATOR_HOME_ROLES.has(role.trim().toLowerCase()),
  )
    ? "creator"
    : "student";
}

function preloadHome(user?: PreloadUser | null): Promise<unknown> {
  const view = getHomeViewKey(user);
  if (view === "anonymous") return Promise.resolve();
  return view === "creator"
    ? import("../CreatorDashboard")
    : import("../StudentHome");
}

function getRouteImporter(
  pathname: string,
  user?: PreloadUser | null,
): (() => Promise<unknown>) | undefined {
  const path = normalizeRoutePath(pathname);

  if (path === "/" || path === "/courses" || path === "/wishlist") {
    return () => import("../courses/CourseCatalogue");
  }

  if (path === "/home" || path === "/dashboard") {
    return () => preloadHome(user);
  }

  if (path === "/settings" || path.startsWith("/settings/")) {
    const tab = path.split("/")[2] ?? "profile";
    return () =>
      import("../SettingsPage").then((module) =>
        module.preloadSettingsTab(tab),
      );
  }

  if (isCourseEditorPath(path)) {
    return () => import("../courses/CourseCreatePage");
  }

  if (/^\/courses\/[^/]+\/overview$/.test(path)) {
    return () => import("../courses/CourseOverviewPage");
  }

  if (/^\/courses\/[^/]+(?:\/[^/]+)?$/.test(path)) {
    return () => import("../routes/legacy-learning");
  }

  if (path.startsWith("/learn/")) {
    return () => import("../learning/LearningWorkspace");
  }

  if (path === "/catalogue") {
    return () => import("../routes/public-course-catalogue");
  }

  if (/^\/catalogue\/[^/]+\/overview$/.test(path)) {
    return () => import("../routes/public-course-overview");
  }

  if (path === "/login") return () => import("../routes/login");
  if (path === "/register") return () => import("../routes/register");
  if (path === "/mfa-setup") return () => import("../routes/mfa-setup");
  if (path === "/auth/callback") {
    return () => import("../routes/auth-callback");
  }

  if (path === "/discussions" || path.startsWith("/discussions/")) {
    return () => import("../workspace/WorkspacePages");
  }
  if (path === "/logout") {
    return () => import("../workspace/WorkspacePages");
  }
  if (path === "/messages") {
    return () => import("../courses/PlaceholderPage");
  }

  if (path === "/reviews") return () => import("../reviews/ReviewsPage");
  if (path === "/orders") return () => import("../orders/OrdersPage");
  if (path === "/order-history") {
    return () => import("../order-history/OrderHistoryPage");
  }
  if (path === "/notifications") {
    return () => import("../notifications/NotificationsPage");
  }

  if (path === "/quizzes") {
    return () => import("../quizzes/QuizAnalyticsPage");
  }
  if (path === "/quizzes/create" || /^\/quizzes\/[^/]+$/.test(path)) {
    return () => import("../quizzes/QuizBuilderPage");
  }
  if (/^\/quizzes\/attempt\/[^/]+$/.test(path)) {
    return () => import("../quizzes/QuizDirectAttemptPage");
  }

  if (/^\/students\/[^/]+$/.test(path)) {
    return () => import("../students/StudentDetailsPage");
  }
  if (path === "/students") return () => import("../students/StudentsPage");
  if (path === "/analytics") {
    return () => import("../analytics/AnalyticsDashboardPage");
  }

  if (path === "/coupons") return () => import("../coupons/CouponsPage");
  if (path === "/coupons/create" || /^\/coupons\/[^/]+$/.test(path)) {
    return () => import("../coupons/CouponBuilderPage");
  }

  return () => import("../courses/PlaceholderPage");
}

export function preloadActiveRouteForHydration(
  pathname: string,
  user?: PreloadUser | null | Promise<PreloadUser | null>,
): Promise<void> {
  const path = normalizeRoutePath(pathname);
  const hasUserPromise =
    typeof user === "object" && user !== null && "then" in user;
  const isHomeRoute = path === "/home" || path === "/dashboard";
  const importer = getRouteImporter(
    path,
    hasUserPromise ? undefined : user,
  );
  if (!importer) return Promise.resolve();

  const cacheKey = isHomeRoute
    ? `${path}:${hasUserPromise ? "session" : getHomeViewKey(user as PreloadUser | null | undefined)}`
    : path;
  const existing = routePreloadPromises.get(cacheKey);
  if (existing) return existing;

  const preload =
    isHomeRoute && hasUserPromise
      ? Promise.resolve(user)
          .then((resolvedUser) => preloadHome(resolvedUser))
          .then(() => undefined)
      : importer().then(() => undefined);
  routePreloadPromises.set(cacheKey, preload);
  void preload.catch(() => {
    routePreloadPromises.delete(cacheKey);
  });
  return preload;
}

function getInternalAnchorPath(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;

  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || anchor.hasAttribute("download") || anchor.target === "_blank") {
    return null;
  }

  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return null;
  return destination.pathname;
}

export function installRouteIntentPrefetching(): void {
  const preloadFromIntent = (event: Event) => {
    const pathname = getInternalAnchorPath(event.target);
    if (
      !pathname ||
      normalizeRoutePath(pathname) ===
        normalizeRoutePath(window.location.pathname)
    ) {
      return;
    }
    if (pathname === "/home" || pathname === "/dashboard") return;

    void preloadActiveRouteForHydration(pathname).catch(() => undefined);
  };

  document.addEventListener("pointerover", preloadFromIntent, {
    passive: true,
  });
  document.addEventListener("focusin", preloadFromIntent);
}
