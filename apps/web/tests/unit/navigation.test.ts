import { describe, expect, it, vi } from "vitest";
import {
  getInitialNavigationOrder,
  getNavigationDisplayLabel,
  getNavigationIconColor,
  getOrderedNavigation,
} from "../../src/shell/navigation.js";
import type { NavigationItem } from "../../src/shell/navigation.ts";

const labels = (navigation: readonly NavigationItem[]) =>
  navigation.map(([label]) => label);

const studentDefault = [
  "Home",
  "My Courses",
  "Explore Courses",
  "Wishlist",
  "Discussions",
  "Order History",
  "Notifications",
  "Settings",
];

const creatorDefault = [
  "Dashboard",
  "Courses",
  "Students",
  "Reviews",
  "Wishlist",
  "Discussions",
  "Analytics",
  "Orders",
  "Settings",
];

describe("navigation order persistence", () => {
  it("uses the exact defaults for each role", () => {
    expect(getInitialNavigationOrder("student")).toEqual(studentDefault);
    expect(getInitialNavigationOrder("creator")).toEqual(creatorDefault);
  });

  it("falls back to defaults for invalid JSON and non-array saved values", () => {
    localStorage.setItem("veolms-navigation-order-student", "{");
    expect(getInitialNavigationOrder("student")).toEqual(studentDefault);

    localStorage.setItem(
      "veolms-navigation-order-creator",
      JSON.stringify({ order: ["Settings"] }),
    );
    expect(getInitialNavigationOrder("creator")).toEqual(creatorDefault);
  });

  it("removes duplicate and unknown saved labels while preserving their first valid order", () => {
    localStorage.setItem(
      "veolms-navigation-order-student",
      JSON.stringify(["Wishlist", "Missing", "Wishlist", "Explore Courses"]),
    );

    expect(getInitialNavigationOrder("student")).toEqual([
      "Wishlist",
      "Explore Courses",
      "Home",
      "My Courses",
      "Discussions",
      "Order History",
      "Notifications",
      "Settings",
    ]);
  });

  it("repairs missing labels after the requested order and keeps roles independent", () => {
    localStorage.setItem(
      "veolms-navigation-order-student",
      JSON.stringify(["Settings"]),
    );
    localStorage.setItem(
      "veolms-navigation-order-creator",
      JSON.stringify(["Messages", "Dashboard"]),
    );

    expect(getInitialNavigationOrder("student")).toEqual([
      "Settings",
      ...studentDefault.filter((label) => label !== "Settings"),
    ]);
    expect(getInitialNavigationOrder("creator")).toEqual([
      "Dashboard",
      ...creatorDefault.filter((label) => label !== "Dashboard"),
    ]);
    expect(
      labels(
        getOrderedNavigation("student", ["Settings", "Missing", "Settings"]),
      ),
    ).toEqual([
      "Settings",
      ...studentDefault.filter((label) => label !== "Settings"),
    ]);
  });

  it("uses student items for unknown roles while preserving the role-specific storage key", () => {
    localStorage.setItem(
      "veolms-navigation-order-guest",
      JSON.stringify(["Settings"]),
    );

    expect(getInitialNavigationOrder("guest")).toEqual([
      "Settings",
      ...studentDefault.filter((label) => label !== "Settings"),
    ]);
    expect(labels(getOrderedNavigation("guest", ["Explore Courses"]))).toEqual([
      "Explore Courses",
      ...studentDefault.filter((label) => label !== "Explore Courses"),
    ]);
  });

  it("migrates the previous student labels without changing creator Courses", () => {
    localStorage.setItem(
      "veolms-navigation-order-student",
      JSON.stringify(["Courses", "My Learning", "Home"]),
    );

    expect(getInitialNavigationOrder("student").slice(0, 3)).toEqual([
      "Explore Courses",
      "My Courses",
      "Home",
    ]);
    expect(getInitialNavigationOrder("creator")).toEqual(creatorDefault);
  });

  it("falls back to role defaults when storage access throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    expect(getInitialNavigationOrder("creator")).toEqual(creatorDefault);
  });
});

describe("navigation display and icon color helpers", () => {
  it("singularizes Notifications outside the Explore Courses page only", () => {
    expect(getNavigationDisplayLabel("Notifications", "explore-courses")).toBe(
      "Notifications",
    );
    expect(getNavigationDisplayLabel("Notifications", "home")).toBe(
      "Notification",
    );
    expect(getNavigationDisplayLabel("Explore Courses", "home")).toBe(
      "Explore Courses",
    );
  });

  it("uses tone, monochrome, and fallback colors exactly", () => {
    expect(getNavigationIconColor("Explore Courses")).toBe("#8f70ff");
    expect(getNavigationIconColor("Unknown")).toBe("#8c9294");
    expect(
      getNavigationIconColor("Explore Courses", {
        iconStyle: "monochrome",
        monochromeMode: "neutral",
      }),
    ).toBe("var(--text)");
    expect(
      getNavigationIconColor("Explore Courses", {
        iconStyle: "monochrome",
        monochromeMode: "custom",
        monochromeColor: "#123456",
      }),
    ).toBe("#123456");
    expect(
      getNavigationIconColor("Explore Courses", {
        iconStyle: "monochrome",
        monochromeMode: "custom",
      }),
    ).toBe("#6c78ff");
    expect(
      getNavigationIconColor("Explore Courses", {
        iconStyle: "monochrome",
        monochromeMode: "theme",
      }),
    ).toBe("var(--accent)");
  });
});
