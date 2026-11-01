// The subpath import matters: the contracts barrel would put zod and every
// schema into this module's chunk, which loads in the startup path of every
// page. username-rules is dependency-free and stays in lockstep with
// publicProfileUsernameParamsSchema.
import { isValidPublicProfileUsername } from "@veolms/contracts/username-rules";
import { getDemoCourseTitle } from "../learning/courseMetadata";
import type { AcademyStaticPageData } from "../routes/academyStaticPageData";
import {
  PLATFORM_DEFAULT_TAB,
  PLATFORM_TABS,
  SETTINGS_DEFAULT_TAB,
  readDiscussionTab,
  readPlatformTab,
  readSettingsTab,
  resolveSessionTabPath,
} from "./tabSessionState";
import {
  isCourseCreateEditorPath,
  isCourseEditEditorPath,
} from "../courses/courseEditorRouting";
import { getCatalogueRouteIdFromPath } from "../courses/catalogueRoutes";
import { getShellPageContribution } from "../lib/web-contributions";

export const productName = "ProCodrr";

export type ShellPage =
  | "home"
  | "courses"
  | "coupons"
  | "coupon-builder"
  | "home-page-settings"
  | "platform"
  | "team"
  | "invite"
  | "reviews"
  | "quizzes"
  | "quiz-builder"
  | "quiz-attempt"
  | "orders"
  | "purchase-history"
  | "notifications"
  | "analytics"
  | "placeholder"
  | "settings"
  | "course-create"
  | "course-overview"
  | "workspace"
  | "students"
  | "student-details"
  | "progress"
  | "public-profile"
  /** A plugin page (see `shellRoutes`); the route renders its content. */
  | "extension";

export interface ShellRouteDescriptor {
  kind: "shell";
  page: ShellPage;
  section?: string;
  settingsTab?: string;
  platformTab?: string;
  /** The analytics section's id from the path (`/analytics/<tab>`). */
  analyticsTab?: string;
  discussionTab?: string;
  title: string;
  description: string;
}

export interface LearningRouteDescriptor {
  kind: "learning";
  page: "learning";
  section: "Courses";
  settingsTab?: undefined;
  platformTab?: undefined;
  analyticsTab?: undefined;
  discussionTab?: undefined;
}

export interface CourseOverviewRouteDescriptor {
  kind: "course-overview";
  page: "course-overview";
  section: "Courses";
  settingsTab?: undefined;
  platformTab?: undefined;
  analyticsTab?: undefined;
  discussionTab?: undefined;
}

export type RouteDescriptor =
  | ShellRouteDescriptor
  | LearningRouteDescriptor
  | CourseOverviewRouteDescriptor;

const discussionsRouteBase = {
  kind: "shell",
  page: "workspace",
  section: "Discussions",
  title: "Discussions",
  description: "All your discussions in one place.",
} as const;

export const NOT_FOUND_SECTION = "Not Found";

const notFoundRouteDescriptor = {
  kind: "shell",
  page: "placeholder",
  section: NOT_FOUND_SECTION,
  title: "Page not found",
  description: "This page does not exist or is no longer available.",
} as const;

/** The tab title of the not-found screen, for a page that finds out late. */
export const notFoundDocumentTitle = `${notFoundRouteDescriptor.title} · ${productName}`;

export const routeDescriptors = {
  "root-courses": {
    kind: "shell",
    page: "home",
    title: "Home",
    description: "Your ProCodrr home screen.",
  },
  home: {
    kind: "shell",
    page: "home",
    title: "Home",
    description:
      "Continue learning and review recent student activity in ProCodrr.",
  },
  "home-alias": {
    kind: "shell",
    page: "home",
    title: "Home",
    description:
      "Continue learning and review recent student activity in ProCodrr.",
  },
  dashboard: {
    kind: "shell",
    page: "home",
    title: "Home",
    description: "Your ProCodrr home screen.",
  },
  courses: {
    kind: "shell",
    page: "courses",
    title: "Courses",
    description: "Browse available courses and continue learning in ProCodrr.",
  },
  "courses-enrolled": {
    kind: "shell",
    page: "courses",
    title: "Courses",
    description: "Browse available courses and continue learning in ProCodrr.",
  },
  "courses-not-enrolled": {
    kind: "shell",
    page: "courses",
    title: "Courses",
    description: "Browse available courses and continue learning in ProCodrr.",
  },
  "courses-free": {
    kind: "shell",
    page: "courses",
    title: "Courses",
    description: "Browse available courses and continue learning in ProCodrr.",
  },
  "courses-wishlist": {
    kind: "shell",
    page: "courses",
    title: "Courses",
    description: "Browse available courses and continue learning in ProCodrr.",
  },
  "course-create": {
    kind: "shell",
    page: "course-create",
    section: "Create Course",
    title: "Create Course",
    description: "Create and publish a new ProCodrr course.",
  },
  "course-create-tab": {
    kind: "shell",
    page: "course-create",
    section: "Create Course",
    title: "Create Course",
    description: "Create and publish a new ProCodrr course.",
  },
  "course-edit": {
    kind: "shell",
    page: "course-create",
    section: "Edit Course",
    title: "Edit Course",
    description: "Edit and publish a ProCodrr course.",
  },
  // course-overview is now handled by a dedicated RouteDescriptor kind;
  // the shell descriptor entry is kept only for routeId lookup / meta.
  // Academy-layout detects it via the learningDescriptor-like approach below.
  wishlist: {
    kind: "shell",
    page: "courses",
    section: "Courses",
    title: "Courses",
    description: "Browse available courses and continue learning in ProCodrr.",
  },
  students: {
    kind: "shell",
    page: "students",
    section: "Students",
    title: "Students",
    description: "Review learners, access, and progress across your academy.",
  },
  "student-details": {
    kind: "shell",
    page: "student-details",
    section: "Students",
    title: "Student profile",
    description: "Review learner details, enrolled courses, and progress.",
  },
  progress: {
    kind: "shell",
    page: "progress",
    section: "Progress",
    title: "Progress",
    description: "Your learning day by day, and the goals you have met.",
  },
  "progress-learner": {
    kind: "shell",
    page: "progress",
    section: "Progress",
    title: "Progress",
    description: "A learner's days of learning and the goals they have met.",
  },
  "public-profile": {
    kind: "shell",
    page: "public-profile",
    title: "Public profile",
    description: "View this member's public profile.",
  },
  // Course reviews have no backend yet. The page behind this address was a
  // design mock with sample reviews and a submit that saved nothing, so the
  // address answers "not found" until reviews are real.
  reviews: notFoundRouteDescriptor,
  quizzes: {
    kind: "shell",
    page: "quizzes",
    section: "Quizzes",
    title: "Quizzes",
    description: "Manage quiz assignments, attempts, results, and analytics.",
  },
  "quiz-create": {
    kind: "shell",
    page: "quiz-builder",
    section: "Quizzes",
    title: "Create quiz",
    description: "Build and publish a new assessment.",
  },
  "quiz-edit": {
    kind: "shell",
    page: "quiz-builder",
    section: "Quizzes",
    title: "Edit quiz",
    description: "Maintain assessment content and delivery settings.",
  },
  "quiz-attempt": {
    kind: "shell",
    page: "quiz-attempt",
    section: "Quizzes",
    title: "Quiz attempt",
    description: "Complete your assessment.",
  },
  discussions: {
    ...discussionsRouteBase,
    discussionTab: "all",
  },
  "discussions-all": {
    ...discussionsRouteBase,
    discussionTab: "all",
  },
  "discussions-q-and-a": {
    ...discussionsRouteBase,
    discussionTab: "q-and-a",
  },
  "discussions-comments": {
    ...discussionsRouteBase,
    discussionTab: "comments",
  },
  "discussions-notes": {
    ...discussionsRouteBase,
    discussionTab: "notes",
  },
  "discussions-mentions": {
    ...discussionsRouteBase,
    discussionTab: "mentions",
  },
  "discussions-following": {
    ...discussionsRouteBase,
    discussionTab: "following",
  },
  "discussions-saved": {
    ...discussionsRouteBase,
    discussionTab: "saved",
  },
  analytics: {
    kind: "shell",
    page: "analytics",
    section: "Analytics",
    title: "Analytics",
    description:
      "Understand learning activity, engagement, and academy performance.",
  },
  orders: {
    kind: "shell",
    page: "orders",
    section: "Orders",
    title: "Orders",
    description: "Review purchases, refunds, and commerce activity.",
  },
  // Messaging is not built; the address answers "not found".
  messages: notFoundRouteDescriptor,
  "purchase-history": {
    kind: "shell",
    page: "purchase-history",
    section: "Purchase History",
    title: "Purchase History",
    description: "Review your academy purchases and payment activity.",
  },
  notifications: {
    kind: "shell",
    page: "notifications",
    section: "Notifications",
    title: "Notifications",
    description: "See important updates about your learning journey.",
  },
  settings: {
    kind: "shell",
    page: "settings",
    section: "Settings",
    settingsTab: SETTINGS_DEFAULT_TAB,
    title: "Settings",
    description: "Manage your personal preferences and interface experience.",
  },
  "settings-profile": {
    kind: "shell",
    page: "settings",
    section: "Settings",
    settingsTab: "profile",
    title: "Settings",
    description: "Manage your personal preferences and interface experience.",
  },
  "settings-appearance": {
    kind: "shell",
    page: "settings",
    section: "Settings",
    settingsTab: "appearance",
    title: "Settings",
    description: "Manage your personal preferences and interface experience.",
  },
  "settings-sidebar": {
    kind: "shell",
    page: "settings",
    section: "Settings",
    settingsTab: "sidebar",
    title: "Settings",
    description: "Manage your personal preferences and interface experience.",
  },
  "settings-notifications": {
    kind: "shell",
    page: "settings",
    section: "Settings",
    settingsTab: "notifications",
    title: "Settings",
    description: "Manage your personal preferences and interface experience.",
  },
  "settings-learning": {
    kind: "shell",
    page: "settings",
    section: "Settings",
    settingsTab: "learning",
    title: "Settings",
    description: "Manage your personal preferences and interface experience.",
  },
  "settings-security": {
    kind: "shell",
    page: "settings",
    section: "Settings",
    settingsTab: "security",
    title: "Settings",
    description: "Manage your personal preferences and interface experience.",
  },
  "settings-account": {
    kind: "shell",
    page: "settings",
    section: "Settings",
    settingsTab: "account",
    title: "Settings",
    description: "Manage your personal preferences and interface experience.",
  },
  logout: {
    kind: "shell",
    page: "workspace",
    section: "Logout",
    title: "Sign out",
    description: "End your session safely on this device.",
  },
  coupons: {
    kind: "shell",
    page: "coupons",
    section: "Coupons",
    title: "Coupons & Promotions",
    description:
      "Create and manage discount coupons, promotional offers and special campaigns for your learners.",
  },
  // The old address of the Platform page's Home page tab; it leads there.
  "home-page-settings": {
    kind: "shell",
    page: "home-page-settings",
    section: "Platform",
    title: "Platform",
    description:
      "Choose what signed-out visitors see on the academy home page.",
  },
  platform: {
    kind: "shell",
    page: "platform",
    section: "Platform",
    platformTab: PLATFORM_DEFAULT_TAB,
    title: "Platform",
    description:
      "Manage academy-wide settings: the home page, the default look and the student rules.",
  },
  team: {
    kind: "shell",
    page: "team",
    section: "Team",
    title: "Team",
    description: "Who works on the academy and what each person may do.",
  },
  invite: {
    kind: "shell",
    page: "invite",
    title: "Team invitation",
    description: "Accept an invitation to join the academy's team.",
  },
  "coupon-create": {
    kind: "shell",
    page: "coupon-builder",
    section: "Coupons",
    title: "Create Coupon",
    description: "Create and publish a new discount coupon for your learners.",
  },
  "coupon-edit": {
    kind: "shell",
    page: "coupon-builder",
    section: "Coupons",
    title: "Edit Coupon",
    description: "Maintain coupon parameters, limits, and validity.",
  },
  // An address no page answers to. It used to render Home under the wrong
  // address; it now says the page was not found.
  "home-fallback": notFoundRouteDescriptor,
} as const satisfies Record<string, ShellRouteDescriptor>;

const learningDescriptor = {
  kind: "learning",
  page: "learning",
  section: "Courses",
} as const satisfies LearningRouteDescriptor;

const courseOverviewDescriptor = {
  kind: "course-overview",
  page: "course-overview",
  section: "Courses",
} as const satisfies CourseOverviewRouteDescriptor;

export const destinationPaths: Readonly<Record<string, string>> = {
  home: "/",
  dashboard: "/",
  courses: "/courses",
  coupons: "/coupons",
  "home-page-settings": "/platform/home",
  platform: "/platform",
  team: "/team",
  "coupon-create": "/coupons/create",
  "coupon-edit": "/coupons/:couponId",
  "create-course": "/courses/create",
  "edit-course": "/courses/:courseId/edit/basics",
  students: "/students",
  "student-details": "/students/:username",
  progress: "/progress",
  "progress-learner": "/progress/:username",
  "public-profile": "/:username",
  reviews: "/reviews",
  quizzes: "/quizzes",
  "quiz-create": "/quizzes/create",
  "quiz-edit": "/quizzes/:quizId",
  "quiz-attempt": "/quizzes/attempt/:assignmentId",
  discussions: "/discussions",
  analytics: "/analytics",
  orders: "/orders",
  messages: "/messages",
  settings: "/settings",
  notifications: "/notifications",
  "purchase-history": "/purchase-history",
  logout: "/logout",
  Courses: "/courses",
  "/Courses": "/courses",
  Coupons: "/coupons",
  "/Coupons": "/coupons",
  "/coupons": "/coupons",
  "Home Page": "/platform/home",
  Platform: "/platform",
  Team: "/team",
  "/my-learning": "/courses",
  Students: "/students",
  Progress: "/progress",
  Reviews: "/reviews",
  Discussions: "/discussions",
  Analytics: "/analytics",
  Orders: "/orders",
  Messages: "/messages",
  Settings: "/settings",
  "Create Course": "/courses/create",
  "Purchase History": "/purchase-history",
  Notifications: "/notifications",
  Logout: "/logout",
};

const canonicalPathsByRouteId = {
  "root-courses": "/",
  home: "/",
  "home-alias": "/home",
  dashboard: "/dashboard",
  courses: "/courses",
  coupons: "/coupons",
  "home-page-settings": "/home-page",
  platform: "/platform",
  "platform-home": "/platform/home",
  "platform-appearance": "/platform/appearance",
  "platform-security": "/platform/security",
  "platform-general": "/platform/general",
  "coupon-create": "/coupons/create",
  "coupon-edit": "/coupons/:couponId",
  "course-create": "/courses/create",
  "course-create-tab": "/courses/create/:editTab",
  "course-edit": "/courses/:courseId/edit/:editTab",
  "courses-enrolled": "/courses/enrolled",
  "courses-not-enrolled": "/courses/not-enrolled",
  "courses-free": "/courses/free",
  "courses-wishlist": "/courses/wishlist",
  wishlist: "/wishlist",
  students: "/students",
  "student-details": "/students/:username",
  progress: "/progress",
  "progress-learner": "/progress/:username",
  reviews: "/reviews",
  quizzes: "/quizzes",
  "quiz-create": "/quizzes/create",
  "quiz-edit": "/quizzes/:quizId",
  "quiz-attempt": "/quizzes/attempt/:assignmentId",
  discussions: "/discussions",
  "discussions-all": "/discussions/all",
  "discussions-q-and-a": "/discussions/q-and-a",
  "discussions-comments": "/discussions/comments",
  "discussions-notes": "/discussions/notes",
  "discussions-mentions": "/discussions/mentions",
  "discussions-following": "/discussions/following",
  "discussions-saved": "/discussions/saved",
  analytics: "/analytics",
  orders: "/orders",
  messages: "/messages",
  "purchase-history": "/purchase-history",
  notifications: "/notifications",
  settings: "/settings",
  "settings-profile": "/settings/profile",
  "settings-appearance": "/settings/appearance",
  "settings-sidebar": "/settings/sidebar",
  "settings-notifications": "/settings/notifications",
  "settings-learning": "/settings/learning",
  "settings-security": "/settings/security",
  "settings-account": "/settings/account",
  logout: "/logout",
} as const;

type StaticRouteId = keyof typeof routeDescriptors;
type CanonicalRouteId = keyof typeof canonicalPathsByRouteId;

const hasOwn = <ObjectType extends object>(
  value: ObjectType,
  key: PropertyKey,
): key is keyof ObjectType => Object.prototype.hasOwnProperty.call(value, key);

const isPlatformTab = (value: string) =>
  (PLATFORM_TABS as readonly string[]).includes(value);

/**
 * `/analytics/<tab>`: the analytics page with that section open. The
 * sections are not a fixed list (a plugin adds its own), so any id-shaped
 * segment is accepted here and the page falls back to its overview for one
 * it does not have.
 */
const ANALYTICS_TAB_PATH = /^\/analytics\/([a-z0-9][a-z0-9-]*)$/;

const analyticsDescriptorForPath = (
  normalizedPath: string,
): RouteDescriptor | undefined => {
  if (normalizedPath === "/analytics") return routeDescriptors.analytics;
  const tab = ANALYTICS_TAB_PATH.exec(normalizedPath)?.[1];
  return tab ? { ...routeDescriptors.analytics, analyticsTab: tab } : undefined;
};

export const normalizeNavigationPath = (path: string) =>
  String(path).replace(/\/+$/, "") || "/";

export const getEffectiveRouteId = (
  routeId: string,
  pathname: string,
): string => {
  const normalizedPath = normalizeNavigationPath(pathname);
  const catalogueRouteId = getCatalogueRouteIdFromPath(normalizedPath);
  if (catalogueRouteId) return catalogueRouteId;

  if (routeId === "settings") {
    if (normalizedPath === "/settings") return routeId;
    const match =
      /^\/settings\/(profile|appearance|sidebar|notifications|learning|security|account)$/.exec(
        normalizedPath,
      );
    return match?.[1] ? `settings-${match[1]}` : "home-fallback";
  }

  if (routeId === "platform") {
    if (normalizedPath === "/platform") return routeId;
    const tab = /^\/platform\/([^/]+)$/.exec(normalizedPath)?.[1];
    return tab && isPlatformTab(tab) ? `platform-${tab}` : "home-fallback";
  }

  if (routeId === "analytics") {
    return analyticsDescriptorForPath(normalizedPath)
      ? routeId
      : "home-fallback";
  }

  if (routeId === "team") {
    return /^\/team(?:\/(?:members|roles|invitations))?$/.test(normalizedPath)
      ? routeId
      : "home-fallback";
  }

  if (routeId === "invite") {
    return /^\/invite\/[A-Za-z0-9_-]{32,128}$/.test(normalizedPath)
      ? routeId
      : "home-fallback";
  }

  if (routeId === "learning" || routeId === "legacy-learning") {
    const routePrefix = routeId === "learning" ? "learn" : "courses";
    const match = new RegExp(`^/${routePrefix}/([^/]+)(?:/([^/]+))?$`).exec(
      normalizedPath,
    );
    const encodedSlug = match?.[1];
    if (!encodedSlug) return "home-fallback";
    try {
      decodeURIComponent(encodedSlug);
      if (match?.[2]) decodeURIComponent(match[2]);
      return routeId;
    } catch {
      return "home-fallback";
    }
  }

  if (routeId === "course-overview") {
    const match = /^\/courses\/([^/]+)\/overview$/.exec(normalizedPath);
    const encodedSlug = match?.[1];
    if (!encodedSlug) return "home-fallback";
    try {
      decodeURIComponent(encodedSlug);
      return routeId;
    } catch {
      return "home-fallback";
    }
  }

  if (routeId === "quiz-edit") {
    return /^\/quizzes\/[^/]+$/.test(normalizedPath)
      ? routeId
      : "home-fallback";
  }

  if (routeId === "coupon-edit") {
    return /^\/coupons\/[^/]+$/.test(normalizedPath)
      ? routeId
      : "home-fallback";
  }

  if (routeId === "quiz-attempt") {
    return /^\/quizzes\/attempt\/[^/]+$/.test(normalizedPath)
      ? routeId
      : "home-fallback";
  }

  if (routeId === "student-details") {
    return /^\/students\/[^/]+$/.test(normalizedPath)
      ? routeId
      : "home-fallback";
  }

  if (routeId === "progress-learner") {
    return /^\/progress\/[^/]+$/.test(normalizedPath)
      ? routeId
      : "home-fallback";
  }

  if (routeId === "public-profile") {
    const match = /^\/([^/]+)$/.exec(normalizedPath);
    if (!match?.[1]) return "home-fallback";
    try {
      const username = decodeURIComponent(match[1]);
      return isValidPublicProfileUsername(username) ? routeId : "home-fallback";
    } catch {
      return "home-fallback";
    }
  }

  if (routeId === "course-create") {
    return normalizedPath === "/courses/create" ? routeId : "home-fallback";
  }

  if (routeId === "course-create-tab") {
    return isCourseCreateEditorPath(normalizedPath) &&
      normalizedPath !== "/courses/create"
      ? routeId
      : "home-fallback";
  }

  if (routeId === "course-edit") {
    return isCourseEditEditorPath(normalizedPath) ? routeId : "home-fallback";
  }

  const canonicalPath = hasOwn(canonicalPathsByRouteId, routeId)
    ? canonicalPathsByRouteId[routeId as CanonicalRouteId]
    : undefined;
  if (!canonicalPath || normalizedPath === canonicalPath) return routeId;
  return "home-fallback";
};

export const getRouteDescriptor = (
  routeId: string,
): RouteDescriptor | undefined => {
  if (routeId === "course-overview") return courseOverviewDescriptor;
  if (routeId === "learning" || routeId === "legacy-learning")
    return learningDescriptor;
  if (routeId === "settings") {
    return { ...routeDescriptors.settings, settingsTab: readSettingsTab() };
  }
  if (routeId === "platform") {
    return { ...routeDescriptors.platform, platformTab: readPlatformTab() };
  }
  if (routeId.startsWith("platform-")) {
    const tab = routeId.slice("platform-".length);
    return isPlatformTab(tab)
      ? { ...routeDescriptors.platform, platformTab: tab }
      : undefined;
  }
  if (routeId === "discussions") {
    return {
      ...routeDescriptors.discussions,
      discussionTab: readDiscussionTab(),
    };
  }
  if (hasOwn(routeDescriptors, routeId)) {
    return routeDescriptors[routeId as StaticRouteId];
  }
  const extensionPage = getShellPageContribution(routeId);
  return extensionPage
    ? {
        kind: "shell",
        page: "extension",
        title: extensionPage.title,
        description: extensionPage.description,
      }
    : undefined;
};

interface MatchIdentity {
  id: string;
}

/**
 * Resolves a pathname to its descriptor without a router match. Only routes
 * with a fixed address can be resolved this way; a parameterised route
 * (a quiz, a student, a coupon) yields `undefined`.
 */
export const getStaticRouteDescriptor = (
  pathname: string,
): RouteDescriptor | undefined => {
  const catalogueRouteId = getCatalogueRouteIdFromPath(pathname);
  if (catalogueRouteId) {
    const catalogueDescriptor = getRouteDescriptor(catalogueRouteId);
    if (catalogueDescriptor) return catalogueDescriptor;
  }

  const normalizedPath = normalizeNavigationPath(pathname);
  const analyticsDescriptor = analyticsDescriptorForPath(normalizedPath);
  if (analyticsDescriptor) return analyticsDescriptor;
  const canonicalRoute = Object.entries(canonicalPathsByRouteId).find(
    ([, canonicalPath]) => canonicalPath === normalizedPath,
  );
  return canonicalRoute ? getRouteDescriptor(canonicalRoute[0]) : undefined;
};

export const getMatchedRouteDescriptor = (
  matches: readonly MatchIdentity[],
  pathname?: string,
): RouteDescriptor => {
  if (pathname !== undefined) {
    const staticDescriptor = getStaticRouteDescriptor(pathname);
    if (staticDescriptor) return staticDescriptor;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    if (!match) continue;
    const routeId =
      pathname === undefined
        ? match.id
        : getEffectiveRouteId(match.id, pathname);
    const descriptor = getRouteDescriptor(routeId);
    if (descriptor) return descriptor;
  }
  return routeDescriptors.home;
};

export const getDestinationPath = (destination: string): string =>
  resolveSessionTabPath(destinationPaths[destination] ?? destination);

interface RouteParams {
  courseSlug?: string;
  [key: string]: string | undefined;
}

export interface RouteMetadata {
  title: string;
  description: string;
}

export const getAuthRouteMeta = (
  title: string,
  description: string,
): RouteMetadata => ({
  title: `${title} · ${productName}`,
  description,
});

interface RouteMetaMatch {
  id: string;
  loaderData?: unknown;
}

/** What a course page's head tags say about its course. */
export interface CourseHeadDetails {
  slug: string;
  title: string;
  shortDescription?: string | null;
  thumbnailUrl?: string | null;
}

/** A head tag, in the shape a route's `meta` export returns. */
export type HeadTagDescriptor =
  | { name: string; content: string }
  | { property: string; content: string }
  | { tagName: "link"; rel: "canonical"; href: string };

/**
 * The course the data this document was built with already holds — the
 * prerendered overview of this course, or the first catalogue page. Nothing
 * is fetched for a head tag.
 */
const getRouteCourse = (
  courseSlug: string | undefined,
  matches: readonly (RouteMetaMatch | undefined)[] | undefined,
): CourseHeadDetails | undefined => {
  if (!courseSlug) return undefined;
  const pageData = matches?.find((match) => match?.id === "root")
    ?.loaderData as AcademyStaticPageData | null | undefined;
  return [
    pageData?.courseCurriculum?.curriculum.course,
    pageData?.lessonPage?.curriculum.course,
    ...(pageData?.publishedCoursePage?.courses ?? []),
  ].find((course) => course?.slug === courseSlug || course?.id === courseSlug);
};

/**
 * The lesson a lesson page's document was built with, when it is the one
 * the address names: its title and, when it is for everyone, its
 * description.
 */
const getRouteLesson = (
  params: RouteParams,
  matches: readonly (RouteMetaMatch | undefined)[] | undefined,
) => {
  const pageData = matches?.find((match) => match?.id === "root")
    ?.loaderData as AcademyStaticPageData | null | undefined;
  const seed = pageData?.lessonPage;
  if (
    !seed ||
    !params.courseSlug ||
    (seed.curriculum.course.slug !== params.courseSlug &&
      seed.curriculum.course.id !== params.courseSlug) ||
    params.lectureSlug !== `lecture-${seed.lessonNumber}`
  ) {
    return undefined;
  }
  return seed.curriculum.sections
    .flatMap((section) => section.lessons ?? [])
    .find((lesson) => lesson.id === seed.lessonId);
};

/** A description's first words, as search results show them; none for no text. */
const toMetaDescription = (text: string | null | undefined) => {
  const plain = text
    ?.replace(/<[^>]*>/gu, " ")
    .replace(/[#*_`>[\]()]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!plain) return undefined;
  return plain.length > 160 ? `${plain.slice(0, 157).trimEnd()}…` : plain;
};

/**
 * The name to put in a course page's title: the real one when the document
 * was built with it. Any other course gets no name: every unknown course
 * used to be titled "UI/UX Design Mastery", a demo course.
 */
const getRouteCourseTitle = (
  courseSlug: string | undefined,
  matches: readonly (RouteMetaMatch | undefined)[] | undefined,
): string | undefined =>
  getRouteCourse(courseSlug, matches)?.title.trim() ||
  (courseSlug ? getDemoCourseTitle(courseSlug) : undefined);

const getCourseOverviewDescription = (
  title: string | undefined,
  shortDescription?: string | null,
): string =>
  shortDescription?.trim() ||
  (title
    ? `Course overview for ${title} on ${productName}.`
    : `Course overview on ${productName}.`);

const toAbsoluteUrl = (value: string, origin?: string): string | undefined => {
  try {
    return new URL(value, origin).href;
  } catch {
    return undefined;
  }
};

/**
 * The description and share tags of a course's overview page. The page's
 * address (`og:url` and the canonical link) is included only when `origin`
 * is given: a page built ahead of time knows the site it will be served
 * from only when the build was told (`configuredSiteOrigin`). A picture is
 * included only when its address is complete.
 */
export const getCourseHeadTags = (
  course: CourseHeadDetails,
  origin?: string,
): HeadTagDescriptor[] => {
  const title = course.title.trim();
  const description = getCourseOverviewDescription(
    title,
    course.shortDescription,
  );
  const tags: HeadTagDescriptor[] = [
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
  const thumbnailUrl = course.thumbnailUrl?.trim();
  const imageUrl = thumbnailUrl
    ? toAbsoluteUrl(thumbnailUrl, origin)
    : undefined;
  if (imageUrl) tags.push({ property: "og:image", content: imageUrl });
  if (origin) {
    const url = `${origin}/courses/${encodeURIComponent(course.slug)}/overview`;
    tags.push(
      { property: "og:url", content: url },
      { tagName: "link", rel: "canonical", href: url },
    );
  }
  return tags;
};

/**
 * The share tags a route's `meta` adds to what `getRouteMeta` gives: those
 * of the course, on the overview of a course this document was built with.
 * `origin` is the site's public address when the build knows it.
 */
export const getRouteShareTags = (
  routeId: string | undefined,
  params: RouteParams = {},
  pathname: string,
  matches?: readonly (RouteMetaMatch | undefined)[],
  origin?: string,
): HeadTagDescriptor[] => {
  if (
    routeId === undefined ||
    getEffectiveRouteId(routeId, pathname) !== "course-overview"
  ) {
    return [];
  }
  const course = getRouteCourse(params.courseSlug, matches);
  return course
    ? getCourseHeadTags(course, origin).filter((tag) => !("name" in tag))
    : [];
};

export const getRouteMeta = (
  routeId: string | undefined,
  params: RouteParams = {},
  pathname?: string,
  matches?: readonly (RouteMetaMatch | undefined)[],
): RouteMetadata => {
  const effectiveRouteId =
    pathname === undefined || routeId === undefined
      ? routeId
      : getEffectiveRouteId(routeId, pathname);

  if (effectiveRouteId === "learning") {
    const title = getRouteCourseTitle(params.courseSlug, matches);
    const lesson = getRouteLesson(params, matches);
    if (title && lesson) {
      return {
        title: [lesson.title, title, productName].join(" · "),
        description:
          toMetaDescription(lesson.description) ??
          `${lesson.title}, a lesson of ${title} on ${productName}.`,
      };
    }
    return {
      title: `${title ?? "Course"} \u00B7 ${productName}`,
      description: title
        ? `Continue ${title} in the focused ${productName} learning workspace.`
        : `Continue learning in the focused ${productName} learning workspace.`,
    };
  }

  if (effectiveRouteId === "course-overview") {
    const title = getRouteCourseTitle(params.courseSlug, matches);
    return {
      title: `${title ?? "Course"} · ${productName}`,
      description: getCourseOverviewDescription(
        title,
        getRouteCourse(params.courseSlug, matches)?.shortDescription,
      ),
    };
  }

  const matchedDescriptor = effectiveRouteId
    ? (getRouteDescriptor(effectiveRouteId) ?? routeDescriptors.home)
    : routeDescriptors.home;
  const descriptor =
    matchedDescriptor.kind === "shell"
      ? matchedDescriptor
      : routeDescriptors.home;
  return {
    title: `${descriptor.title} \u00B7 ${productName}`,
    description: descriptor.description,
  };
};

/** What the client has fetched about the course a course page shows. */
export interface LoadedCourseTitles {
  courseTitle?: string | null;
  /** The lesson being studied; used on the learning page only. */
  lessonTitle?: string | null;
}

/**
 * The tab title of a course page (its overview or a lesson) from what the
 * client holds now. `getRouteMeta` can only name a course the document was
 * built with, so most course pages were titled "Course"; once the course
 * has been fetched its own name is used, and a lesson page leads with the
 * lesson's name. Until then, and for an address that is not a course page
 * after all, the title is exactly the one `getRouteMeta` gives.
 */
export const getCourseDocumentTitle = (
  routeId: "learning" | "course-overview",
  params: RouteParams,
  pathname: string,
  matches: readonly (RouteMetaMatch | undefined)[] | undefined,
  loaded: LoadedCourseTitles,
): string => {
  const courseTitle = loaded.courseTitle?.trim();
  if (!courseTitle || getEffectiveRouteId(routeId, pathname) !== routeId) {
    return getRouteMeta(routeId, params, pathname, matches).title;
  }
  const lessonTitle =
    routeId === "learning" ? loaded.lessonTitle?.trim() : undefined;
  return [lessonTitle, courseTitle, productName]
    .filter(Boolean)
    .join(" \u00B7 ");
};
