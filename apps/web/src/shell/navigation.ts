import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { HouseIcon as House } from "@phosphor-icons/react/House";
import { ToteIcon as Tote } from "@phosphor-icons/react/Tote";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { SlidersHorizontalIcon as SlidersHorizontal } from "@phosphor-icons/react/SlidersHorizontal";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/SquaresFour";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import type { Icon } from "@phosphor-icons/react";
import type { SidebarPreferences } from "../settings/settingsPreferences";
import { canOpenNavigationPath } from "./navigationPermissions";

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
): NavigationItem => [
  label,
  icon,
  { id, routeLink, parentId: null, source: "default" },
];

// Students and signed-out visitors share the same order. Staff menus preserve
// the relative order of shared destinations.
const studentNavigation: readonly NavigationItem[] = [
  createNavigationItem("student-home", "Home", House, "/"),
  createNavigationItem("student-courses", "Courses", BookOpen, "/courses"),
  createNavigationItem(
    "student-discussions",
    "Discussions",
    ChatCircleDots,
    "/discussions",
  ),
  createNavigationItem("student-settings", "Settings", GearSix, "/settings"),
];

const creatorNavigation: readonly NavigationItem[] = [
  createNavigationItem("creator-courses", "Courses", BookOpen, "/courses"),
  createNavigationItem(
    "creator-discussions",
    "Discussions",
    ChatCircleDots,
    "/discussions",
  ),
  createNavigationItem("creator-dashboard", "Dashboard", SquaresFour, "/"),
  createNavigationItem("creator-students", "Students", Users, "/students"),
  createNavigationItem(
    "creator-analytics",
    "Analytics",
    ChartBar,
    "/analytics",
  ),
  createNavigationItem("creator-orders", "Orders", Tote, "/orders"),
  createNavigationItem("creator-settings", "Settings", GearSix, "/settings"),
];

const adminNavigation: readonly NavigationItem[] = [
  createNavigationItem("admin-home", "Home", House, "/"),
  createNavigationItem("creator-courses", "Courses", BookOpen, "/courses"),
  createNavigationItem(
    "creator-discussions",
    "Discussions",
    ChatCircleDots,
    "/discussions",
  ),
  createNavigationItem("creator-orders", "Orders", Tote, "/orders"),
  createNavigationItem("creator-students", "Students", Users, "/students"),
  createNavigationItem(
    "creator-analytics",
    "Analytics",
    ChartBar,
    "/analytics",
  ),
  createNavigationItem("admin-coupons", "Coupons", Tag, "/coupons"),
  // Academy-wide settings, the home page among them.
  createNavigationItem(
    "admin-platform",
    "Platform",
    SlidersHorizontal,
    "/platform",
  ),
  // Who works on the academy and what each person may do.
  createNavigationItem("admin-team", "Team", UsersThree, "/team"),
  createNavigationItem("creator-settings", "Settings", GearSix, "/settings"),
];

/** What the sidebar knows of a team member beyond admin or instructor. */
export interface TeamNavigationAccess {
  roles: readonly string[];
  /** Null while capabilities load: only pages anyone may open show. */
  permissions: readonly string[] | null;
}

/** On the team in some role other than (or besides) instructor. */
function holdsOtherTeamRole(roles: readonly string[]): boolean {
  return roles.some((role) => {
    const name = role.trim().toLowerCase();
    return name !== "student" && name !== "instructor" && name !== "creator";
  });
}

export function getRoleNavigationItems(
  role: "student" | "creator",
  isAdmin = false,
  team?: TeamNavigationAccess,
): readonly NavigationItem[] {
  if (role === "student") return studentNavigation;
  if (isAdmin) return adminNavigation;
  if (!team) return creatorNavigation;
  // An instructor alone keeps their usual menu, less any page their
  // permissions do not open; it shows whole while those load. Any other team
  // role gets the staff menu, cut down the same way; until permissions are
  // known, only pages that need none, so nothing appears and then vanishes.
  const permissions = new Set(team.permissions ?? []);
  const opens = ([, , metadata]: NavigationItem) =>
    canOpenNavigationPath(metadata?.routeLink ?? "/", permissions);
  if (!holdsOtherTeamRole(team.roles)) {
    return team.permissions
      ? creatorNavigation.filter(opens)
      : creatorNavigation;
  }
  return adminNavigation.filter(opens);
}

/** Public visitors get the same navigation as a student while `/auth/me` is resolving. */
export function getPublicNavigationItems(): readonly NavigationItem[] {
  return studentNavigation;
}

// Neighbouring menu items take colours from different parts of the spectrum,
// so the multicolour sidebar does not read as shades of one hue.
const navigationTones: Record<string, string> = {
  Home: "#5da9ff",
  Dashboard: "#5da9ff",
  Courses: "#f472b6",
  Coupons: "#fbbf24",
  Platform: "#38bdf8",
  Team: "#818cf8",
  Students: "#2dd4bf",
  Reviews: "#f1be4b",
  "My Quiz": "#f87171",
  Discussions: "#4ade80",
  Progress: "#fb923c",
  Analytics: "#f09c4e",
  Orders: "#d68eea",
  "Purchase History": "#d68eea",
  Messages: "#63c8d5",
  Notifications: "#f1be4b",
  Settings: "#a16cff",
  // Dock controls that are not pages.
  // The colour theme button takes the theme's own primary colour.
  Appearance: "var(--accent)",
  "Reading mode": "#34d399",
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

/**
 * Menu items that took a new name, by their old one: a saved menu order keeps
 * the item where its owner put it.
 */
const RENAMED_ITEMS: Readonly<Record<string, string>> = {
  // The Home Page screen became the Platform page's first tab.
  "Home Page": "Platform",
};

export function getInitialNavigationOrder(
  role: string,
  navigationItems: readonly NavigationItemWithMetadata[],
  userId?: string | null,
): string[] {
  const defaultOrder = getDefaultNavigationOrder(navigationItems);
  if (typeof window === "undefined") return defaultOrder;

  try {
    const parsedOrder: unknown = JSON.parse(
      localStorage.getItem(
        getNavigationPreferenceStorageKey("order", role, userId),
      ) || "[]",
    );
    if (!Array.isArray(parsedOrder)) return defaultOrder;
    const savedOrder = parsedOrder
      .map((label: unknown) =>
        typeof label === "string" ? (RENAMED_ITEMS[label] ?? label) : label,
      )
      .filter(
        (label): label is string =>
          typeof label === "string" && defaultOrder.includes(label),
      );
    const validSavedOrder = savedOrder.filter(
      (label, index) =>
        defaultOrder.includes(label) && savedOrder.indexOf(label) === index,
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
  const orderedLabels = [
    ...(order || []),
    ...navigationItems.map(([label]) => label),
  ].filter(
    (label, index, labels) =>
      itemByLabel.has(label) && labels.indexOf(label) === index,
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
  nextOrder.splice(
    targetIndex + (position === "after" ? 1 : 0),
    0,
    sourceLabel,
  );
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

export function getNavigationDestination(
  destination: string | NavigationItemWithMetadata,
): string {
  if (typeof destination !== "string") {
    return destination[2]?.routeLink || destination[0];
  }
  return destination;
}

export function getNavigationIconColor(
  label: string,
  sidebarPreferences?: SidebarPreferences | null,
): string {
  if (sidebarPreferences?.iconStyle !== "monochrome")
    return navigationTones[label] || "#8c9294";
  if (sidebarPreferences?.monochromeMode === "neutral") return "var(--text)";
  if (sidebarPreferences?.monochromeMode === "custom")
    return sidebarPreferences.monochromeColor || "#6c78ff";
  return "var(--accent)";
}
