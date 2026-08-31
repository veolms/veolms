import { beforeEach, describe, expect, it, vi } from "vitest";
import frameworkRoutes from "../../src/routes.ts";
import {
  destinationPaths,
  getAuthRouteMeta,
  getDestinationPath,
  getEffectiveRouteId,
  getMatchedRouteDescriptor,
  getRouteDescriptor,
  getRouteMeta,
  normalizeNavigationPath,
  routeDescriptors,
} from "../../src/routing/routeDescriptors.ts";
import {
  DISCUSSIONS_DEFAULT_TAB,
  DISCUSSIONS_TAB_SESSION_KEY,
  readDiscussionTab,
  readSettingsTab,
  SETTINGS_DEFAULT_TAB,
  SETTINGS_TAB_SESSION_KEY,
} from "../../src/routing/tabSessionState.ts";

beforeEach(() => {
  sessionStorage.clear();
});

describe("React Router framework route configuration", () => {
  const academyLayout = frameworkRoutes[0]!;
  const childRoutes = academyLayout.children!;
  const authLayout = frameworkRoutes[1]!;
  const authChildRoutes = authLayout.children!;

  it("keeps every app URL beneath one persistent academy layout", () => {
    expect(academyLayout).toMatchObject({
      id: "academy-layout",
      file: "routes/academy-layout.tsx",
    });
    expect(
      Object.fromEntries(
        childRoutes.map(({ id, index, path }) => [id, index ? "/" : path]),
      ),
    ).toEqual({
      home: "/",
      "home-alias": "home",
      dashboard: "dashboard",
      courses: "courses",
      "course-create": "courses/create",
      wishlist: "wishlist",
      students: "students",
      reviews: "reviews",
      discussions: "discussions",
      "discussions-q-and-a": "discussions/q-and-a",
      "discussions-comments": "discussions/comments",
      "discussions-mentions": "discussions/mentions",
      "discussions-following": "discussions/following",
      "discussions-saved": "discussions/saved",
      analytics: "analytics",
      orders: "orders",
      messages: "messages",
      "order-history": "order-history",
      notifications: "notifications",
      settings: "settings",
      "settings-profile": "settings/profile",
      "settings-appearance": "settings/appearance",
      "settings-sidebar": "settings/sidebar",
      "settings-notifications": "settings/notifications",
      "settings-learning": "settings/learning",
      "settings-security": "settings/security",
      "settings-account": "settings/account",
      logout: "logout",
      "course-overview": "courses/:courseSlug/overview",
      learning: "learn/:courseSlug/:lectureSlug?",
      "legacy-learning": "courses/:courseSlug/:lectureSlug?",
      "home-fallback": "*",
    });
  });

  it("declares the root, learning, and fallback routes explicitly", () => {
    expect(childRoutes.find(({ id }) => id === "home")).toMatchObject({
      index: true,
      file: "routes/home-marker.tsx",
    });
    expect(childRoutes.find(({ id }) => id === "learning")).toMatchObject({
      path: "learn/:courseSlug/:lectureSlug?",
      file: "routes/learning.tsx",
      caseSensitive: true,
    });
    expect(
      childRoutes.find(({ id }) => id === "legacy-learning"),
    ).toMatchObject({
      path: "courses/:courseSlug/:lectureSlug?",
      file: "routes/legacy-learning.tsx",
      caseSensitive: true,
    });
    expect(
      childRoutes.find(({ id }) => id === "course-overview"),
    ).toMatchObject({
      path: "courses/:courseSlug/overview",
      file: "routes/academy-marker.tsx",
      caseSensitive: true,
    });
    expect(childRoutes.find(({ id }) => id === "home-fallback")).toMatchObject({
      path: "*",
      file: "routes/academy-marker.tsx",
      caseSensitive: true,
    });
    expect(
      childRoutes
        .filter(({ index }) => !index)
        .every(({ caseSensitive }) => caseSensitive),
    ).toBe(true);
  });

  it("serves authentication from a sibling layout, never from the academy shell", () => {
    expect(frameworkRoutes).toHaveLength(2);
    expect(authLayout).toMatchObject({
      id: "auth-layout",
      file: "routes/auth-layout.tsx",
    });
    expect(
      Object.fromEntries(authChildRoutes.map(({ id, path }) => [id, path])),
    ).toEqual({
      login: "login",
      register: "register",
      "auth-callback": "auth/callback",
      "mfa-setup": "mfa-setup",
    });
    expect(authChildRoutes.find(({ id }) => id === "login")).toMatchObject({
      file: "routes/login.tsx",
      caseSensitive: true,
    });
    expect(authChildRoutes.find(({ id }) => id === "register")).toMatchObject({
      file: "routes/register.tsx",
      caseSensitive: true,
    });
    expect(
      authChildRoutes.find(({ id }) => id === "auth-callback"),
    ).toMatchObject({
      file: "routes/auth-callback.tsx",
      caseSensitive: true,
    });
    expect(authChildRoutes.find(({ id }) => id === "mfa-setup")).toMatchObject({
      file: "routes/mfa-setup.tsx",
      caseSensitive: true,
    });
    expect(
      childRoutes.some(({ id }) => id === "login" || id === "register"),
    ).toBe(false);
  });
});

describe("session tab routing", () => {
  it("falls back to each first tab when session storage reads are blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(readSettingsTab()).toBe(SETTINGS_DEFAULT_TAB);
    expect(readDiscussionTab()).toBe(DISCUSSIONS_DEFAULT_TAB);
  });
});

describe("framework route descriptors", () => {
  it("normalizes same-route comparisons without changing leading path syntax", () => {
    expect(normalizeNavigationPath("/courses///")).toBe("/courses");
    expect(normalizeNavigationPath("///")).toBe("/");
    expect(normalizeNavigationPath("")).toBe("/");
    expect(normalizeNavigationPath("//home")).toBe("//home");
  });

  it("maps route IDs to the existing shell contracts", () => {
    expect(getRouteDescriptor("home-alias")).toEqual(routeDescriptors.home);
    expect(getRouteDescriptor("settings-learning")).toMatchObject({
      kind: "shell",
      page: "settings",
      section: "Settings",
      settingsTab: "learning",
    });
    expect(getRouteDescriptor("discussions-comments")).toMatchObject({
      kind: "shell",
      page: "workspace",
      section: "Discussions",
      discussionTab: "comments",
    });
    expect(getRouteDescriptor("reviews")).toMatchObject({
      kind: "shell",
      page: "reviews",
      section: "Reviews",
      title: "Reviews",
    });
    expect(getRouteDescriptor("orders")).toMatchObject({
      kind: "shell",
      page: "orders",
      section: "Orders",
      title: "Orders",
    });
    expect(getRouteDescriptor("order-history")).toMatchObject({
      kind: "shell",
      page: "order-history",
      section: "Order History",
      title: "Order History",
    });
    expect(getRouteDescriptor("notifications")).toMatchObject({
      kind: "shell",
      page: "notifications",
      section: "Notifications",
      title: "Notifications",
    });
    expect(getRouteDescriptor("learning")).toEqual({
      kind: "learning",
      page: "learning",
      section: "Learning Space",
    });
    expect(getRouteDescriptor("course-overview")).toMatchObject({
      kind: "course-overview",
      page: "course-overview",
    });
    expect(getRouteDescriptor("missing")).toBeUndefined();
  });

  it("preserves case-sensitive route behavior around framework hydration", () => {
    expect(getEffectiveRouteId("courses", "/courses")).toBe("courses");
    expect(getEffectiveRouteId("courses", "/courses/")).toBe("courses");
    expect(getEffectiveRouteId("courses", "/COURSES")).toBe("home-fallback");
    expect(getEffectiveRouteId("dashboard", "/DASHBOARD")).toBe(
      "home-fallback",
    );
    expect(getEffectiveRouteId("settings-learning", "/settings/Learning")).toBe(
      "home-fallback",
    );
    expect(
      getEffectiveRouteId("discussions-comments", "/discussions/Comments"),
    ).toBe("home-fallback");
  });

  it("validates learning-route structure and encoding without changing course-slug casing", () => {
    expect(getEffectiveRouteId("learning", "/learn/TypeScript-Course")).toBe(
      "learning",
    );
    expect(getEffectiveRouteId("learning", "/learn/c%2B%2B-basics/")).toBe(
      "learning",
    );
    expect(getEffectiveRouteId("learning", "/learn/%2F")).toBe("learning");
    expect(getEffectiveRouteId("learning", "/COURSES/typescript-course")).toBe(
      "home-fallback",
    );
    expect(
      getEffectiveRouteId("learning", "/learn/typescript-course/lesson-1"),
    ).toBe("learning");
    expect(
      getEffectiveRouteId(
        "learning",
        "/learn/typescript-course/the-design-mindset",
      ),
    ).toBe("learning");
    expect(
      getEffectiveRouteId("learning", "/learn/typescript-course/a/b"),
    ).toBe("home-fallback");
    expect(
      getEffectiveRouteId("learning", "/learn/typescript-course/%E0%A4%A"),
    ).toBe("home-fallback");
    expect(getEffectiveRouteId("learning", "/learn/%E0%A4%A")).toBe(
      "home-fallback",
    );
    expect(
      getEffectiveRouteId(
        "legacy-learning",
        "/courses/typescript-course/the-design-mindset",
      ),
    ).toBe("legacy-learning");
    expect(
      getEffectiveRouteId(
        "legacy-learning",
        "/courses/typescript-course/%E0%A4%A",
      ),
    ).toBe("home-fallback");
    expect(
      getEffectiveRouteId(
        "course-overview",
        "/courses/typescript-course/overview",
      ),
    ).toBe("course-overview");
    expect(
      getEffectiveRouteId("course-overview", "/courses/%E0%A4%A/overview"),
    ).toBe("home-fallback");
  });

  it("selects the deepest matched descriptor and safely falls back home", () => {
    expect(
      getMatchedRouteDescriptor([
        { id: "academy-layout" },
        { id: "settings-sidebar" },
      ]),
    ).toBe(routeDescriptors["settings-sidebar"]);
    expect(getMatchedRouteDescriptor([{ id: "academy-layout" }])).toBe(
      routeDescriptors.home,
    );
    expect(
      getMatchedRouteDescriptor(
        [{ id: "academy-layout" }, { id: "legacy-learning" }],
        "/courses/typescript-course",
      ),
    ).toMatchObject({ kind: "learning", page: "learning" });
  });

  it("generates the existing static and course metadata", () => {
    expect(getRouteMeta("courses")).toEqual({
      title: "Courses \u00B7 ProCodrr",
      description:
        "Browse available courses and continue learning in ProCodrr.",
    });
    expect(
      getRouteMeta("learning", { courseSlug: "typescript-course" }),
    ).toEqual({
      title: "The Ultimate TypeScript Course \u00B7 ProCodrr",
      description:
        "Continue The Ultimate TypeScript Course in the focused ProCodrr learning workspace.",
    });
    expect(getRouteMeta("missing")).toEqual({
      title: "Home \u00B7 ProCodrr",
      description: routeDescriptors.home.description,
    });
    expect(getRouteMeta("courses", {}, "/COURSES")).toEqual({
      title: "Home \u00B7 ProCodrr",
      description: routeDescriptors.home.description,
    });
  });

  it("brands authentication metadata like every other route", () => {
    expect(getAuthRouteMeta("Log in", "Log in or create an account.")).toEqual({
      title: "Log in · ProCodrr",
      description: "Log in or create an account.",
    });
  });

  it("preserves navigation destination aliases and direct paths", () => {
    expect(destinationPaths).toMatchObject({
      home: "/",
      Courses: "/courses",
      "/Courses": "/courses",
      "/explore-courses": "/courses",
      "/my-courses": "/courses",
      settings: "/settings",
      Settings: "/settings",
      discussions: "/discussions",
      Discussions: "/discussions",
      "Create Course": "/courses/create",
      Students: "/students",
      "Order History": "/order-history",
      Logout: "/logout",
    });
    expect(getDestinationPath("Courses")).toBe("/courses");
    expect(getDestinationPath("/Courses")).toBe("/courses");
    expect(getDestinationPath("/explore-courses")).toBe("/courses");
    expect(getDestinationPath("Settings")).toBe("/settings/profile");
    expect(getDestinationPath("Discussions")).toBe("/discussions/q-and-a");
    sessionStorage.setItem(SETTINGS_TAB_SESSION_KEY, "sidebar");
    sessionStorage.setItem(DISCUSSIONS_TAB_SESSION_KEY, "mentions");
    expect(getRouteDescriptor("settings")).toMatchObject({
      settingsTab: "sidebar",
    });
    expect(getRouteDescriptor("discussions")).toMatchObject({
      discussionTab: "mentions",
    });
    expect(getDestinationPath("Settings")).toBe("/settings/sidebar");
    expect(getDestinationPath("Discussions")).toBe("/discussions/mentions");
    sessionStorage.setItem(SETTINGS_TAB_SESSION_KEY, "invalid");
    sessionStorage.setItem(DISCUSSIONS_TAB_SESSION_KEY, "invalid");
    expect(getDestinationPath("Settings")).toBe("/settings/profile");
    expect(getDestinationPath("Discussions")).toBe("/discussions/q-and-a");
    expect(getDestinationPath("/courses/custom-course")).toBe(
      "/courses/custom-course",
    );
  });

  it("keeps deferred product surfaces on the shared empty state", () => {
    for (const routeId of ["students", "analytics", "messages"]) {
      expect(getRouteDescriptor(routeId)).toMatchObject({
        kind: "shell",
        page: "placeholder",
      });
    }

    expect(getRouteDescriptor("course-create")).toMatchObject({
      kind: "shell",
      page: "course-create",
    });
  });
});
