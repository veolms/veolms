import { describe, expect, it, vi } from "vitest";
import {
  getInitialNavigationOrder,
  getInitialNavigationVisibility,
  getNavigationDisplayLabel,
  getNavigationIconColor,
  getOrderedNavigation,
  getVisibleOrderedNavigation,
} from "../../src/shell/navigation.js";
import type { NavigationItem } from "../../src/shell/navigation.ts";

const labels = (navigation: readonly NavigationItem[]) =>
  navigation.map(([label]) => label);

const studentDefault = [
  "Home",
  "Courses",
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

  it("defaults creator menu visibility to every existing creator item", () => {
    expect(getInitialNavigationVisibility("creator")).toEqual(creatorDefault);
    expect(getInitialNavigationVisibility("student")).toEqual(studentDefault);
  });

  it("persists creator visibility choices and restores new defaults", () => {
    localStorage.setItem(
      "veolms-navigation-visibility-creator",
      JSON.stringify(["Dashboard", "Missing", "Dashboard", "Orders"]),
    );

    expect(getInitialNavigationVisibility("creator")).toEqual([
      "Dashboard",
      "Orders",
    ]);
    expect(
      labels(
        getVisibleOrderedNavigation("creator", creatorDefault, [
          "Orders",
          "Dashboard",
        ]),
      ),
    ).toEqual(["Dashboard", "Orders"]);
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
      JSON.stringify(["Wishlist", "Missing", "Wishlist", "Courses"]),
    );

    expect(getInitialNavigationOrder("student")).toEqual([
      "Wishlist",
      "Courses",
      "Home",
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
    expect(labels(getOrderedNavigation("guest", ["Courses"]))).toEqual([
      "Courses",
      ...studentDefault.filter((label) => label !== "Courses"),
    ]);
  });

  it("migrates every previous student course label into one Courses item", () => {
    localStorage.setItem(
      "veolms-navigation-order-student",
      JSON.stringify(["Courses", "Courses", "My Learning", "Home"]),
    );

    expect(getInitialNavigationOrder("student").slice(0, 3)).toEqual([
      "Courses",
      "Home",
      "Wishlist",
    ]);
    expect(getInitialNavigationOrder("creator")).toEqual(creatorDefault);
  });

  it("migrates previous student course labels in saved visibility", () => {
    localStorage.setItem(
      "veolms-navigation-visibility-student",
      JSON.stringify(["Home", "My Learning", "My Courses"]),
    );

    expect(getInitialNavigationVisibility("student")).toEqual([
      "Home",
      "Courses",
    ]);
  });

  it("falls back to role defaults when storage access throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    expect(getInitialNavigationOrder("creator")).toEqual(creatorDefault);
  });
});

describe("navigation display and icon color helpers", () => {
  it("singularizes Notifications outside the Courses page only", () => {
    expect(getNavigationDisplayLabel("Notifications", "courses")).toBe(
      "Notifications",
    );
    expect(getNavigationDisplayLabel("Notifications", "home")).toBe(
      "Notification",
    );
    expect(getNavigationDisplayLabel("Courses", "home")).toBe("Courses");
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
