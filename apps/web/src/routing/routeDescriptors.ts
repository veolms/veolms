import { getCourseTitle } from "../learning/courseMetadata";
import {
  SETTINGS_DEFAULT_TAB,
  readDiscussionTab,
  readSettingsTab,
  resolveSessionTabPath,
} from "./tabSessionState";

export const productName = "ProCodrr";

export type ShellPage =
  | "home"
  | "courses"
  | "reviews"
  | "orders"
  | "order-history"
  | "notifications"
  | "placeholder"
  | "settings"
  | "course-create"
  | "course-overview"
  | "workspace";

export interface ShellRouteDescriptor {
  kind: "shell";
  page: ShellPage;
  section?: string;
  settingsTab?: string;
  discussionTab?: string;
  title: string;
  description: string;
}

export interface LearningRouteDescriptor {
  kind: "learning";
  page: "learning";
  section: "Learning Space";
  settingsTab?: undefined;
  discussionTab?: undefined;
}

export interface CourseOverviewRouteDescriptor {
  kind: "course-overview";
  page: "course-overview";
  section: "Courses";
  settingsTab?: undefined;
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
  description: "Bring course conversations, questions, and replies together.",
} as const;

export const routeDescriptors = {
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
    title: "Dashboard",
    description: "Review academy performance and creator activity in ProCodrr.",
  },
  courses: {
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
  // course-overview is now handled by a dedicated RouteDescriptor kind;
  // the shell descriptor entry is kept only for routeId lookup / meta.
  // Academy-layout detects it via the learningDescriptor-like approach below.
  wishlist: {
    kind: "shell",
    page: "courses",
    section: "Wishlist",
    title: "Wishlist",
    description: "Review the courses saved to your ProCodrr wishlist.",
  },
  students: {
    kind: "shell",
    page: "placeholder",
    section: "Students",
    title: "Students",
    description: "Review learners, access, and progress across your academy.",
  },
  reviews: {
    kind: "shell",
    page: "reviews",
    section: "Reviews",
    title: "Reviews",
    description: "Keep an eye on learner feedback and course sentiment.",
  },
  discussions: {
    ...discussionsRouteBase,
    discussionTab: "q-and-a",
  },
  "discussions-q-and-a": {
    ...discussionsRouteBase,
    discussionTab: "q-and-a",
  },
  "discussions-comments": {
    ...discussionsRouteBase,
    discussionTab: "comments",
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
    page: "placeholder",
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
  messages: {
    kind: "shell",
    page: "placeholder",
    section: "Messages",
    title: "Messages",
    description: "Manage direct communication with your learners.",
  },
  "order-history": {
    kind: "shell",
    page: "order-history",
    section: "Order History",
    title: "Order History",
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
  "home-fallback": {
    kind: "shell",
    page: "home",
    title: "Home",
    description:
      "Continue learning and review recent student activity in ProCodrr.",
  },
} as const satisfies Record<string, ShellRouteDescriptor>;

const learningDescriptor = {
  kind: "learning",
  page: "learning",
  section: "Learning Space",
} as const satisfies LearningRouteDescriptor;

const courseOverviewDescriptor = {
  kind: "course-overview",
  page: "course-overview",
  section: "Courses",
} as const satisfies CourseOverviewRouteDescriptor;

export const destinationPaths: Readonly<Record<string, string>> = {
  home: "/",
  dashboard: "/dashboard",
  courses: "/courses",
  "create-course": "/courses/create",
  wishlist: "/wishlist",
  students: "/students",
  reviews: "/reviews",
  discussions: "/discussions",
  analytics: "/analytics",
  orders: "/orders",
  messages: "/messages",
  settings: "/settings",
  notifications: "/notifications",
  logout: "/logout",
  Courses: "/courses",
  "/Courses": "/courses",
  "/explore-courses": "/courses",
  "/my-courses": "/courses",
  "/my-learning": "/courses",
  Students: "/students",
  Reviews: "/reviews",
  Discussions: "/discussions",
  Analytics: "/analytics",
  Orders: "/orders",
  Messages: "/messages",
  Settings: "/settings",
  "Create Course": "/courses/create",
  "Order History": "/order-history",
  Notifications: "/notifications",
  Logout: "/logout",
};

const canonicalPathsByRouteId = {
  home: "/",
  "home-alias": "/home",
  dashboard: "/dashboard",
  courses: "/courses",
  "course-create": "/courses/create",
  wishlist: "/wishlist",
  students: "/students",
  reviews: "/reviews",
  discussions: "/discussions",
  "discussions-q-and-a": "/discussions/q-and-a",
  "discussions-comments": "/discussions/comments",
  "discussions-mentions": "/discussions/mentions",
  "discussions-following": "/discussions/following",
  "discussions-saved": "/discussions/saved",
  analytics: "/analytics",
  orders: "/orders",
  messages: "/messages",
  "order-history": "/order-history",
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

export const normalizeNavigationPath = (path: string) =>
  String(path).replace(/\/+$/, "") || "/";

export const getEffectiveRouteId = (
  routeId: string,
  pathname: string,
): string => {
  const normalizedPath = normalizeNavigationPath(pathname);

  if (routeId === "settings") {
    if (normalizedPath === "/settings") return routeId;
    const match =
      /^\/settings\/(profile|appearance|sidebar|notifications|learning|security|account)$/.exec(
        normalizedPath,
      );
    return match?.[1] ? `settings-${match[1]}` : "home-fallback";
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
  if (routeId === "discussions") {
    return {
      ...routeDescriptors.discussions,
      discussionTab: readDiscussionTab(),
    };
  }
  return hasOwn(routeDescriptors, routeId)
    ? routeDescriptors[routeId as StaticRouteId]
    : undefined;
};

interface MatchIdentity {
  id: string;
}

export const getMatchedRouteDescriptor = (
  matches: readonly MatchIdentity[],
  pathname?: string,
): RouteDescriptor => {
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

export const getRouteMeta = (
  routeId: string | undefined,
  params: RouteParams = {},
  pathname?: string,
): RouteMetadata => {
  const effectiveRouteId =
    pathname === undefined || routeId === undefined
      ? routeId
      : getEffectiveRouteId(routeId, pathname);

  if (effectiveRouteId === "learning") {
    const title = getCourseTitle(params.courseSlug);
    return {
      title: `${title} \u00B7 ${productName}`,
      description: `Continue ${title} in the focused ${productName} learning workspace.`,
    };
  }

  if (effectiveRouteId === "course-overview") {
    const title = getCourseTitle(params.courseSlug);
    return {
      title: `${title} · ${productName}`,
      description: `Course overview for ${title} on ${productName}.`,
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
