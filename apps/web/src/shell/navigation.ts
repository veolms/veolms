import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { HouseIcon as House } from "@phosphor-icons/react/House";
import { ToteIcon as Tote } from "@phosphor-icons/react/Tote";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/SquaresFour";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import type { Icon } from "@phosphor-icons/react";
import type { SidebarPreferences } from "../settings/settingsPreferences";

export interface NavigationItemMetadata {
  id: string;
  routeLink: string;
  parentId: string | null;
  source: "default";
}

export type NavigationItem = readonly [
  label: string,
  icon: Icon,
  metadata?: NavigationItemMetadata,
];

export type NavigationItemWithMetadata = NavigationItem;

const createNavigationItem = (
  id: string,
  label: string,
  icon: Icon,
  routeLink: string,
): NavigationItem => [label, icon, { id, routeLink, parentId: null, source: "default" }];

// Students and signed-out visitors share the same order. Staff menus preserve
// the relative order of shared destinations.
const studentNavigation: readonly NavigationItem[] = [
  createNavigationItem("student-home", "Home", House, "/"),
  createNavigationItem("student-courses", "Courses", BookOpen, "/courses"),
  createNavigationItem("student-discussions", "Discussions", ChatCircleDots, "/discussions"),
  createNavigationItem("student-settings", "Settings", GearSix, "/settings"),
];

const creatorNavigation: readonly NavigationItem[] = [
  createNavigationItem("creator-courses", "Courses", BookOpen, "/courses"),
  createNavigationItem("creator-discussions", "Discussions", ChatCircleDots, "/discussions"),
  createNavigationItem("creator-dashboard", "Dashboard", SquaresFour, "/"),
  createNavigationItem("creator-students", "Students", Users, "/students"),
  createNavigationItem("creator-analytics", "Analytics", ChartBar, "/analytics"),
  createNavigationItem("creator-orders", "Orders", Tote, "/orders"),
  createNavigationItem("creator-settings", "Settings", GearSix, "/settings"),
];

const adminNavigation: readonly NavigationItem[] = [
  createNavigationItem("admin-home", "Home", House, "/"),
  createNavigationItem("creator-courses", "Courses", BookOpen, "/courses"),
  createNavigationItem("creator-discussions", "Discussions", ChatCircleDots, "/discussions"),
  createNavigationItem("creator-orders", "Orders", Tote, "/orders"),
  createNavigationItem("creator-students", "Students", Users, "/students"),
  createNavigationItem("creator-analytics", "Analytics", ChartBar, "/analytics"),
  createNavigationItem("admin-coupons", "Coupons", Tag, "/coupons"),
  createNavigationItem("creator-settings", "Settings", GearSix, "/settings"),
];

export function getRoleNavigationItems(
  role: "student" | "creator",
  isAdmin = false,
): readonly NavigationItem[] {
  if (role === "student") return studentNavigation;
  return isAdmin ? adminNavigation : creatorNavigation;
}

/** Public visitors get the same navigation as a student while `/auth/me` is resolving. */
export function getPublicNavigationItems(): readonly NavigationItem[] {
  return studentNavigation;
}

const navigationTones: Record<string, string> = {
  Home: "#5da9ff",
  Dashboard: "#5da9ff",
  Courses: "#8f70ff",
  Coupons: "#fbbf24",
  Students: "#55d98b",
  Reviews: "#f1be4b",
  "My Quiz": "#47d4d0",
  Discussions: "#58a8ff",
  Analytics: "#f09c4e",
  Orders: "#d68eea",
  "Purchase History": "#d68eea",
  Messages: "#63c8d5",
  Notifications: "#f1be4b",
  Settings: "#a16cff",
  Fullscreen: "#ff8a55",
  Logout: "#8c9294",
};

export function getDefaultNavigationOrder(
  navigationItems: readonly NavigationItemWithMetadata[],
): string[] {
  return navigationItems.map(([label]) => label);
}

export function getNavigationPreferenceStorageKey(
  preference: "order",
  role: string,
  userId?: string | null,
): string {
  // Keep the old key for anonymous callers and backwards-compatible tests.
  // Authenticated callers must include the account id or one user's sidebar
  // choices can leak into another user's session in the same browser.
  return userId
    ? `veolms-navigation-${preference}-${userId}-${role}`
    : `veolms-navigation-${preference}-${role}`;
}

export function getInitialNavigationOrder(
  role: string,
  navigationItems: readonly NavigationItemWithMetadata[],
  userId?: string | null,
): string[] {
  const defaultOrder = getDefaultNavigationOrder(navigationItems);
  if (typeof window === "undefined") return defaultOrder;

  try {
    const parsedOrder: unknown = JSON.parse(
      localStorage.getItem(getNavigationPreferenceStorageKey("order", role, userId)) || "[]",
    );
    if (!Array.isArray(parsedOrder)) return defaultOrder;
    const savedOrder = parsedOrder.filter(
      (label): label is string => typeof label === "string" && defaultOrder.includes(label),
    );
    const validSavedOrder = savedOrder.filter(
      (label, index) => defaultOrder.includes(label) && savedOrder.indexOf(label) === index,
    );
    return [
      ...validSavedOrder,
      ...defaultOrder.filter((label) => !validSavedOrder.includes(label)),
    ];
  } catch {
    return defaultOrder;
  }
}

export function getOrderedNavigation(
  order: readonly string[] | undefined,
  navigationItems: readonly NavigationItemWithMetadata[],
): NavigationItemWithMetadata[] {
  const itemByLabel = new Map(navigationItems.map((item) => [item[0], item]));
  const orderedLabels = [...(order || []), ...navigationItems.map(([label]) => label)].filter(
    (label, index, labels) => itemByLabel.has(label) && labels.indexOf(label) === index,
  );
  return orderedLabels.map((label) => itemByLabel.get(label)!);
}

export type NavigationOrderPosition = "before" | "after";

export function reorderNavigationOrder(
  order: readonly string[],
  sourceLabel: string,
  targetLabel: string,
  position: NavigationOrderPosition = "before",
): string[] {
  if (
    !sourceLabel ||
    !targetLabel ||
    sourceLabel === targetLabel ||
    !order.includes(sourceLabel) ||
    !order.includes(targetLabel)
  ) {
    return [...order];
  }

  const nextOrder = [...order];
  nextOrder.splice(nextOrder.indexOf(sourceLabel), 1);
  const targetIndex = nextOrder.indexOf(targetLabel);
  nextOrder.splice(targetIndex + (position === "after" ? 1 : 0), 0, sourceLabel);
  return nextOrder;
}

export function getMobilePrimaryNavigation(
  role: string,
  navigation: readonly NavigationItemWithMetadata[],
): NavigationItemWithMetadata[] {
  const capacity = role === "student" ? 3 : 4;
  return navigation.slice(0, capacity);
}

export function getMobileOverflowNavigation(
  navigation: readonly NavigationItem[],
  primaryNavigation: readonly NavigationItem[],
): NavigationItem[] {
  const primaryLabels = new Set(primaryNavigation.map(([label]) => label));
  return navigation.filter(([label]) => !primaryLabels.has(label));
}

export function getNavigationDestination(destination: string | NavigationItemWithMetadata): string {
  if (typeof destination !== "string") {
    return destination[2]?.routeLink || destination[0];
  }
  return destination;
}

export function getNavigationIconColor(
  label: string,
  sidebarPreferences?: SidebarPreferences | null,
): string {
  if (sidebarPreferences?.iconStyle !== "monochrome") return navigationTones[label] || "#8c9294";
  if (sidebarPreferences?.monochromeMode === "neutral") return "var(--text)";
  if (sidebarPreferences?.monochromeMode === "custom")
    return sidebarPreferences.monochromeColor || "#6c78ff";
  return "var(--accent)";
}
