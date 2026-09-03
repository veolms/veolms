import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultNavigationOrder,
  getInitialNavigationOrder,
  getInitialNavigationVisibility,
  getNavigationDestination,
  getNavigationIconColor,
  getNavigationItemsFromMenus,
  getNavigationPreferenceStorageKey,
  getOrderedNavigation,
  getPublicNavigationItems,
  getVisibleOrderedNavigation,
  hasNavigationMenu,
  resolveShellNavigation,
} from "../../src/shell/navigation.js";
import type { AuthMenuNode } from "@veolms/contracts";
import type { NavigationItem } from "../../src/shell/navigation.ts";

const labels = (navigation: readonly NavigationItem[]) =>
  navigation.map(([label]) => label);

const dynamicMenus: AuthMenuNode[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    parentId: null,
    label: "Overview",
    routeLink: "/overview",
    icon: "House",
    expanded: false,
    isBoth: false,
    permissions: {
      canCreate: false,
      canRead: true,
      canUpdate: false,
      canDelete: false,
    },
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    parentId: null,
    label: "Learning Space",
    routeLink: "/learning-space",
    icon: null,
    expanded: true,
    isBoth: false,
    permissions: {
      canCreate: false,
      canRead: false,
      canUpdate: false,
      canDelete: false,
    },
    children: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        parentId: "22222222-2222-4222-8222-222222222222",
        label: "My Courses",
        routeLink: "/my-courses",
        icon: "BookOpen",
        expanded: false,
        isBoth: false,
        permissions: {
          canCreate: false,
          canRead: true,
          canUpdate: false,
          canDelete: false,
        },
      },
    ],
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    parentId: null,
    label: "Notification",
    routeLink: "/notifications",
    icon: "Bell",
    expanded: false,
    isBoth: false,
    permissions: {
      canCreate: false,
      canRead: true,
      canUpdate: false,
      canDelete: false,
    },
  },
];

describe("server menu navigation adapter", () => {
  it("maps every server menu node and child to a route-aware item", () => {
    const navigation = getNavigationItemsFromMenus(dynamicMenus);

    expect(labels(navigation)).toEqual([
      "Overview",
      "My Courses",
      "Notification",
    ]);
    expect(navigation[0]?.[2]).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      routeLink: "/overview",
      parentId: null,
      source: "server",
    });
    expect(getNavigationDestination(navigation[1]!)).toBe("/my-courses");
    expect(hasNavigationMenu(dynamicMenus, "Learning Space")).toBe(true);
    expect(hasNavigationMenu(dynamicMenus, "My Courses")).toBe(true);
  });

  it("returns no dynamic items for an empty server menu response", () => {
    expect(getNavigationItemsFromMenus([])).toEqual([]);
    expect(getNavigationItemsFromMenus(undefined)).toEqual([]);
  });

  it("provides Courses, Learning Space, and Settings outside an authenticated menu payload", () => {
    const navigation = getPublicNavigationItems();
    expect(labels(navigation)).toEqual([
      "Courses",
      "Learning Space",
      "Settings",
    ]);
    expect(getNavigationDestination(navigation[0]!)).toBe("/courses");
    expect(getNavigationDestination(navigation[1]!)).toBe("/learning-space");
    expect(getNavigationDestination(navigation[2]!)).toBe("/settings");
  });

  it("uses role menus when present and falls back to the default menu otherwise", () => {
    const withMenus = resolveShellNavigation(dynamicMenus);
    expect(withMenus.isDefault).toBe(false);
    expect(labels(withMenus.items)).toEqual([
      "Overview",
      "My Courses",
      "Notification",
      "Courses",
      "Learning Space",
      "Settings",
    ]);

    const withCoreMenus = resolveShellNavigation([
      ...dynamicMenus,
      {
        ...dynamicMenus[0]!,
        id: "66666666-6666-4666-8666-666666666666",
        label: "Courses",
        routeLink: "/courses",
        icon: "GraduationCap",
      },
      {
        ...dynamicMenus[0]!,
        id: "77777777-7777-4777-8777-777777777777",
        label: "Settings",
        routeLink: "/settings",
        icon: "GearSix",
      },
    ]);
    expect(
      labels(withCoreMenus.items)
        .filter((label) =>
          ["Courses", "Learning Space", "Settings"].includes(label),
        )
        .sort(),
    ).toEqual(["Courses", "Learning Space", "Settings"]);

    const emptyMenus = resolveShellNavigation([]);
    expect(emptyMenus.isDefault).toBe(true);
    expect(labels(emptyMenus.items)).toEqual([
      "Courses",
      "Learning Space",
      "Settings",
    ]);
    expect(getNavigationDestination(emptyMenus.items[0]!)).toBe("/courses");
    expect(getNavigationDestination(emptyMenus.items[1]!)).toBe(
      "/learning-space",
    );
    expect(getNavigationDestination(emptyMenus.items[2]!)).toBe("/settings");

    const guestMenus = resolveShellNavigation(undefined);
    expect(guestMenus.isDefault).toBe(true);
    expect(labels(guestMenus.items)).toEqual([
      "Courses",
      "Learning Space",
      "Settings",
    ]);
  });

  it("applies existing order and visibility preferences to server menus", () => {
    const navigation = getNavigationItemsFromMenus(dynamicMenus);
    localStorage.setItem(
      "veolms-navigation-order-student",
      JSON.stringify(["My Courses", "Overview"]),
    );
    localStorage.setItem(
      "veolms-navigation-visibility-student",
      JSON.stringify(["My Courses"]),
    );

    expect(
      labels(
        getVisibleOrderedNavigation(
          getInitialNavigationOrder("student", navigation),
          getInitialNavigationVisibility("student", navigation),
          navigation,
        ),
      ),
    ).toEqual(["My Courses"]);
  });
});

describe("navigation preferences", () => {
  beforeEach(() => localStorage.clear());

  it("uses the supplied menu list as the complete default", () => {
    const navigation = getNavigationItemsFromMenus(dynamicMenus);
    expect(getDefaultNavigationOrder(navigation)).toEqual([
      "Overview",
      "My Courses",
      "Notification",
    ]);
    expect(getInitialNavigationOrder("student", navigation)).toEqual([
      "Overview",
      "My Courses",
      "Notification",
    ]);
    expect(getInitialNavigationVisibility("student", navigation)).toEqual([
      "Overview",
      "My Courses",
      "Notification",
    ]);
  });

  it("removes duplicate and unknown saved labels while preserving valid order", () => {
    const navigation = getNavigationItemsFromMenus(dynamicMenus);
    localStorage.setItem(
      "veolms-navigation-order-student",
      JSON.stringify(["My Courses", "Missing", "My Courses", "Overview"]),
    );

    expect(getInitialNavigationOrder("student", navigation)).toEqual([
      "My Courses",
      "Overview",
      "Notification",
    ]);
  });

  it("restores required menu items from stale visibility preferences", () => {
    const navigation = resolveShellNavigation(dynamicMenus).items;
    localStorage.setItem("veolms-navigation-visibility-student", "[]");

    expect(getInitialNavigationVisibility("student", navigation)).toEqual([
      "Courses",
      "Learning Space",
      "Settings",
    ]);
  });

  it("falls back to the supplied menu list when storage is invalid", () => {
    const navigation = getPublicNavigationItems();
    localStorage.setItem("veolms-navigation-order-student", "{");

    expect(getInitialNavigationOrder("student", navigation)).toEqual([
      "Courses",
      "Learning Space",
      "Settings",
    ]);
  });

  it("handles storage access errors without inventing role menus", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    expect(
      getInitialNavigationOrder("student", getPublicNavigationItems()),
    ).toEqual(["Courses", "Learning Space", "Settings"]);
  });

  it("scopes saved preferences to the authenticated account", () => {
    const navigation = getNavigationItemsFromMenus(dynamicMenus);
    const firstUserKey = getNavigationPreferenceStorageKey(
      "order",
      "student",
      "user-one",
    );
    const secondUserKey = getNavigationPreferenceStorageKey(
      "order",
      "student",
      "user-two",
    );

    expect(firstUserKey).not.toBe(secondUserKey);
    localStorage.setItem(firstUserKey, JSON.stringify(["My Courses"]));

    expect(
      getInitialNavigationOrder("student", navigation, "user-one"),
    ).toEqual(["My Courses", "Overview", "Notification"]);
    expect(
      getInitialNavigationOrder("student", navigation, "user-two"),
    ).toEqual(["Overview", "My Courses", "Notification"]);
  });
});

describe("navigation display and icon color helpers", () => {
  it("uses route metadata for server items and labels for public items", () => {
    const navigation = getNavigationItemsFromMenus(dynamicMenus);
    expect(getNavigationDestination(navigation[0]!)).toBe("/overview");
    expect(getNavigationDestination("Courses")).toBe("Courses");
    expect(getNavigationDestination("Settings")).toBe("Settings");
    expect(getNavigationDestination(getPublicNavigationItems()[0]!)).toBe(
      "/courses",
    );
    expect(getNavigationDestination(getPublicNavigationItems()[1]!)).toBe(
      "/learning-space",
    );
    expect(getNavigationDestination(getPublicNavigationItems()[2]!)).toBe(
      "/settings",
    );
  });

  it("orders supplied items and applies visibility", () => {
    const navigation = getNavigationItemsFromMenus(dynamicMenus);
    expect(
      labels(getOrderedNavigation(["Notification", "Missing"], navigation)),
    ).toEqual(["Notification", "Overview", "My Courses"]);
    expect(
      labels(
        getVisibleOrderedNavigation(
          ["Notification", "Overview"],
          ["Overview"],
          navigation,
        ),
      ),
    ).toEqual(["Overview"]);
  });

  it("uses tone, monochrome, and fallback colors exactly", () => {
    expect(getNavigationIconColor("Courses")).toBe("#8f70ff");
    expect(getNavigationIconColor("Unknown")).toBe("#8c9294");
    expect(
      getNavigationIconColor("Courses", {
        iconStyle: "monochrome",
        monochromeMode: "neutral",
      }),
    ).toBe("var(--text)");
    expect(
      getNavigationIconColor("Courses", {
        iconStyle: "monochrome",
        monochromeMode: "custom",
        monochromeColor: "#123456",
      }),
    ).toBe("#123456");
    expect(
      getNavigationIconColor("Courses", {
        iconStyle: "monochrome",
        monochromeMode: "custom",
      }),
    ).toBe("#6c78ff");
    expect(
      getNavigationIconColor("Courses", {
        iconStyle: "monochrome",
        monochromeMode: "theme",
      }),
    ).toBe("var(--accent)");
  });
});
