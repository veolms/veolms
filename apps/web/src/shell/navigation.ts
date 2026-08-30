import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
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

export type NavigationItem = readonly [label: string, icon: Icon];

export const MESSAGES_NAVIGATION_ENABLED = false;

const studentNavigation: readonly NavigationItem[] = [
  ["Home", House],
  ["Courses", GraduationCap],
  ["Wishlist", Heart],
  ["Discussions", ChatCircleDots],
  ["Order History", Tote],
  ["Notifications", Bell],
  ["Settings", GearSix],
];

const allCreatorNavigation: readonly NavigationItem[] = [
  ["Dashboard", SquaresFour],
  ["Courses", GraduationCap],
  ["Students", Users],
  ["Reviews", ChatTeardropDots],
  ["Wishlist", Heart],
  ["Discussions", ChatCircleDots],
  ["Analytics", ChartBar],
  ["Orders", Tote],
  ["Messages", EnvelopeSimple],
  ["Settings", GearSix],
];

const creatorNavigation = allCreatorNavigation.filter(
  ([label]) => MESSAGES_NAVIGATION_ENABLED || label !== "Messages",
);

const navigationByRole: Record<string, readonly NavigationItem[]> = {
  student: studentNavigation,
  creator: creatorNavigation,
};

export function getNavigationItems(role: string): readonly NavigationItem[] {
  return navigationByRole[role] || studentNavigation;
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

export function getNavigationDisplayLabel(label: string, page: string): string {
  if (page !== "courses" && label === "Notifications") return "Notification";
  return label;
}

const migrateStudentNavigationLabel = (label: string) => {
  if (
    label === "My Learning" ||
    label === "My Courses" ||
    label === "Explore Courses"
  )
    return "Courses";
  return label;
};

export function getDefaultNavigationOrder(role: string): string[] {
  return getNavigationItems(role).map(([label]) => label);
}

export function getDefaultNavigationVisibility(role: string): string[] {
  return getDefaultNavigationOrder(role);
}

export function getInitialNavigationOrder(role: string): string[] {
  const defaultOrder = getDefaultNavigationOrder(role);
  if (typeof window === "undefined") return defaultOrder;

  try {
    const parsedOrder: unknown = JSON.parse(
      localStorage.getItem(`veolms-navigation-order-${role}`) || "[]",
    );
    if (!Array.isArray(parsedOrder)) return defaultOrder;
    const savedOrder = parsedOrder
      .filter((label): label is string => typeof label === "string")
      .map((label) =>
        role === "student" ? migrateStudentNavigationLabel(label) : label,
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

export function getInitialNavigationVisibility(role: string): string[] {
  const defaultVisibility = getDefaultNavigationVisibility(role);
  if (typeof window === "undefined") return defaultVisibility;

  try {
    const parsedVisibility: unknown = JSON.parse(
      localStorage.getItem(`veolms-navigation-visibility-${role}`) || "null",
    );
    if (!Array.isArray(parsedVisibility)) return defaultVisibility;

    const normalizedVisibility = parsedVisibility
      .filter((label): label is string => typeof label === "string")
      .map((label) =>
        role === "student" ? migrateStudentNavigationLabel(label) : label,
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
  role: string,
  order: readonly string[] | undefined,
): NavigationItem[] {
  const navigationItems = getNavigationItems(role);
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
  role: string,
  order: readonly string[] | undefined,
  visibleLabels: readonly string[] | undefined,
): NavigationItem[] {
  const visible = new Set(
    visibleLabels ?? getDefaultNavigationVisibility(role),
  );
  return getOrderedNavigation(role, order).filter(([label]) =>
    visible.has(label),
  );
}

export function getMobilePrimaryNavigation(
  role: string,
  navigation: readonly NavigationItem[],
): NavigationItem[] {
  const capacity = role === "student" ? 3 : 4;
  const primary = navigation.slice(0, capacity);
  if (role !== "student" || primary.some(([label]) => label === "Courses"))
    return primary;

  const courses =
    navigation.find(([label]) => label === "Courses") ??
    getNavigationItems(role).find(([label]) => label === "Courses");
  if (!courses) return primary;
  return [...primary.slice(0, capacity - 1), courses];
}

export function getMobileOverflowNavigation(
  navigation: readonly NavigationItem[],
  primaryNavigation: readonly NavigationItem[],
): NavigationItem[] {
  const primaryLabels = new Set(primaryNavigation.map(([label]) => label));
  return navigation.filter(([label]) => !primaryLabels.has(label));
}

export function getNavigationDestination(label: string): string {
  if (label === "Home") return "home";
  if (label === "Dashboard") return "dashboard";
  if (label === "Courses") return "courses";
  if (label === "Wishlist") return "wishlist";
  return label;
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
