import type { AuthMenuNode } from "@veolms/contracts";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import { HouseIcon as House } from "@phosphor-icons/react/House";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { ToteIcon as Tote } from "@phosphor-icons/react/Tote";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/SquaresFour";
import type { Icon } from "@phosphor-icons/react";
import type { SidebarPreferences } from "../settings/settingsPreferences";

import { ChatTeardropDotsIcon as ChatTeardropDots } from "@phosphor-icons/react/ChatTeardropDots";

export interface NavigationItemMetadata {
  id: string;
  routeLink: string;
  parentId: string | null;
  source: "server" | "default";
}

export type NavigationItem = readonly [
  label: string,
  icon: Icon,
  metadata?: NavigationItemMetadata,
];

export type DynamicNavigationItem = readonly [
  label: string,
  icon: Icon,
  metadata: NavigationItemMetadata,
];

export type NavigationItemWithMetadata = NavigationItem;

const publicNavigation: readonly NavigationItem[] = [
  [
    "Courses",
    GraduationCap,
    {
      id: "default-courses",
      routeLink: "/courses",
      parentId: null,
      source: "default",
    },
  ],
  [
    "Settings",
    GearSix,
    {
      id: "default-settings",
      routeLink: "/settings",
      parentId: null,
      source: "default",
    },
  ],
];

const menuIcons: Record<string, Icon> = {
  Bell,
  BookOpen,
  ChartBar,
  ChatCircleDots,
  ChatTeardropDots,
  EnvelopeSimple,
  GearSix,
  GraduationCap,
  Heart,
  House,
  SquaresFour,
  Star,
  Tote,
  Users,
};

const getMenuIcon = (iconName: string | null): Icon =>
  (iconName && menuIcons[iconName]) || SquaresFour;

/**
 * Converts the server's effective RBAC menu tree to the shell's flat
 * navigation shape. Learning Space remains a special shell control because it
 * owns transient course-player sessions; its database children are still
 * exposed as ordinary navigation items.
 */
export function getNavigationItemsFromMenus(
  menus: readonly AuthMenuNode[] | null | undefined,
): DynamicNavigationItem[] {
  if (!menus?.length) return [];

  const items: DynamicNavigationItem[] = [];
  const seenLabels = new Set<string>();

  const visit = (nodes: readonly AuthMenuNode[]) => {
    for (const menu of nodes) {
      if (menu.label !== "Learning Space") {
        // The current shell is label-oriented for drag/drop and preference
        // persistence. Keep the first effective entry when an admin receives
        // both student and instructor variants of the same menu label.
        if (!seenLabels.has(menu.label)) {
          seenLabels.add(menu.label);
          items.push([
            menu.label,
            getMenuIcon(menu.icon),
            {
              id: menu.id,
              routeLink: menu.routeLink,
              parentId: menu.parentId,
              source: "server",
            },
          ]);
        }
      }

      if (menu.children?.length) visit(menu.children);
    }
  };

  visit(menus);
  return items;
}

export function hasNavigationMenu(
  menus: readonly AuthMenuNode[] | null | undefined,
  label: string,
): boolean {
  if (!menus?.length) return false;

  return menus.some(
    (menu) => menu.label === label || hasNavigationMenu(menu.children, label),
  );
}

export function getPublicNavigationItems(): readonly NavigationItem[] {
  return publicNavigation;
}

/**
 * Sidebar items for the current session: role menus from `/auth/me` when the
 * backend returns any, otherwise the public Courses and Settings defaults.
 * Guests, empty `menus: []`, and menus that flatten to nothing all use the
 * same fallback so the sidebar never renders blank.
 */
export function resolveShellNavigation(
  menus: readonly AuthMenuNode[] | null | undefined,
): {
  items: readonly NavigationItemWithMetadata[];
  isDefault: boolean;
} {
  const serverItems = getNavigationItemsFromMenus(menus);
  if (serverItems.length > 0) {
    return { items: serverItems, isDefault: false };
  }
  return { items: getPublicNavigationItems(), isDefault: true };
}

const navigationTones: Record<string, string> = {
  Home: "#5da9ff",
  Dashboard: "#5da9ff",
  Courses: "#8f70ff",
  Students: "#55d98b",
  Wishlist: "#ff6684",
  Reviews: "#f1be4b",
  "My Quiz": "#47d4d0",
  Discussions: "#58a8ff",
  "Learning Space": "#329ca6",
  Analytics: "#f09c4e",
  Orders: "#d68eea",
  "Order History": "#d68eea",
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

export function getDefaultNavigationVisibility(
  navigationItems: readonly NavigationItemWithMetadata[],
): string[] {
  return getDefaultNavigationOrder(navigationItems);
}

export function getInitialNavigationOrder(
  role: string,
  navigationItems: readonly NavigationItemWithMetadata[],
): string[] {
  const defaultOrder = getDefaultNavigationOrder(navigationItems);
  if (typeof window === "undefined") return defaultOrder;

  try {
    const parsedOrder: unknown = JSON.parse(
      localStorage.getItem(`veolms-navigation-order-${role}`) || "[]",
    );
    if (!Array.isArray(parsedOrder)) return defaultOrder;
    const savedOrder = parsedOrder.filter(
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

export function getInitialNavigationVisibility(
  role: string,
  navigationItems: readonly NavigationItemWithMetadata[],
): string[] {
  const defaultVisibility = getDefaultNavigationVisibility(navigationItems);
  if (typeof window === "undefined") return defaultVisibility;

  try {
    const parsedVisibility: unknown = JSON.parse(
      localStorage.getItem(`veolms-navigation-visibility-${role}`) || "null",
    );
    if (!Array.isArray(parsedVisibility)) return defaultVisibility;

    const normalizedVisibility = parsedVisibility.filter(
      (label): label is string =>
        typeof label === "string" && defaultVisibility.includes(label),
    );
    const savedVisibility = normalizedVisibility.filter(
      (label, index) =>
        defaultVisibility.includes(label) &&
        normalizedVisibility.indexOf(label) === index,
    );
    return defaultVisibility.filter((label) => savedVisibility.includes(label));
  } catch {
    return defaultVisibility;
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

export function getVisibleOrderedNavigation(
  order: readonly string[] | undefined,
  visibleLabels: readonly string[] | undefined,
  navigationItems: readonly NavigationItemWithMetadata[],
): NavigationItemWithMetadata[] {
  const visible = new Set(
    visibleLabels ?? getDefaultNavigationVisibility(navigationItems),
  );
  return getOrderedNavigation(order, navigationItems).filter(([label]) =>
    visible.has(label),
  );
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
