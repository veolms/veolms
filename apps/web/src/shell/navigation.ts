import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { BrainIcon as Brain } from "@phosphor-icons/react/Brain";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import { HouseIcon as House } from "@phosphor-icons/react/House";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/SquaresFour";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { ToteIcon as Tote } from "@phosphor-icons/react/Tote";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import type { Icon } from "@phosphor-icons/react";
import type { SidebarPreferences } from "../settings/settingsPreferences";

export interface NavigationItemMetadata {
  id: string;
  routeLink: string;
  parentId: string | null;
  source: "static" | "default";
}

export type NavigationItem = readonly [
  label: string,
  icon: Icon,
  metadata?: NavigationItemMetadata,
];

export type NavigationItemWithMetadata = NavigationItem;

type SystemRole =
  | "admin"
  | "instructor"
  | "student"
  | "course_manager"
  | "content_editor"
  | "thumbnail_editor"
  | "teaching_assistant"
  | "reviewer"
  | "analytics_viewer";

interface StaticMenuDefinition {
  id: string;
  label: string;
  routeLink: string;
  icon: Icon;
  roles: readonly SystemRole[];
}

const allRoles: readonly SystemRole[] = [
  "admin",
  "instructor",
  "student",
  "course_manager",
  "content_editor",
  "thumbnail_editor",
  "teaching_assistant",
  "reviewer",
  "analytics_viewer",
];

const requiredNavigationLabels = new Set(["Courses", "Settings"]);

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

/**
 * Static presentation data for the system roles currently seeded by the API.
 * Order matches the latest modern academy sidebar design.
 */
const staticMenus: readonly StaticMenuDefinition[] = [
  {
    id: "00000000-0000-4000-9000-000000000001",
    label: "Dashboard",
    routeLink: "/dashboard",
    icon: SquaresFour,
    roles: ["admin", "instructor", "course_manager"],
  },
  {
    id: "00000000-0000-4000-9000-000000000008",
    label: "Home",
    routeLink: "/home",
    icon: House,
    roles: ["admin", "student"],
  },
  {
    id: "00000000-0000-4000-9000-000000000002",
    label: "Courses",
    routeLink: "/courses",
    icon: GraduationCap,
    roles: [
      "admin",
      "instructor",
      "course_manager",
      "content_editor",
      "thumbnail_editor",
      "teaching_assistant",
      "reviewer",
      "analytics_viewer",
      "student",
    ],
  },
  {
    id: "00000000-0000-4000-9000-000000000013",
    label: "Wishlist",
    routeLink: "/wishlist",
    icon: Heart,
    roles: ["admin", "student"],
  },
  {
    id: "00000000-0000-4000-9000-000000000004",
    label: "Discussions",
    routeLink: "/discussions",
    icon: ChatCircleDots,
    roles: [
      "admin",
      "instructor",
      "student",
      "course_manager",
      "content_editor",
      "teaching_assistant",
    ],
  },
  {
    id: "00000000-0000-4000-9000-000000000014",
    label: "Order History",
    routeLink: "/order-history",
    icon: Tote,
    roles: ["admin", "student"],
  },
  {
    id: "00000000-0000-4000-9000-000000000010",
    label: "Notification",
    routeLink: "/notifications",
    icon: Bell,
    roles: ["admin", "student"],
  },
  {
    id: "00000000-0000-4000-9000-000000000003",
    label: "Students",
    routeLink: "/students",
    icon: Users,
    roles: ["admin", "instructor", "course_manager", "teaching_assistant"],
  },
  {
    id: "00000000-0000-4000-9000-000000000005",
    label: "Analytics",
    routeLink: "/analytics",
    icon: ChartBar,
    roles: ["admin", "instructor", "course_manager", "analytics_viewer"],
  },
  {
    id: "00000000-0000-4000-9000-000000000006",
    label: "Orders",
    routeLink: "/orders",
    icon: Tote,
    roles: ["admin", "instructor"],
  },
  {
    id: "00000000-0000-4000-9000-000000000018",
    label: "Coupons",
    routeLink: "/coupons",
    icon: Tag,
    roles: ["admin"],
  },
  {
    id: "00000000-0000-4000-8000-000000000701",
    label: "Quizzes",
    routeLink: "/quizzes",
    icon: Brain,
    roles: [
      "admin",
      "instructor",
      "student",
      "course_manager",
      "content_editor",
      "teaching_assistant",
      "reviewer",
    ],
  },
  {
    id: "00000000-0000-4000-9000-000000000007",
    label: "Settings",
    routeLink: "/settings",
    icon: GearSix,
    roles: ["admin", "instructor", "student", "course_manager"],
  },
];

const adminRoleAliases = new Set([
  "admin",
  "administrator",
  "platform_admin",
  "platform_administrator",
  "platform administrator",
]);

function normalizeSystemRoles(
  roles: readonly string[] | null | undefined,
): Set<SystemRole> {
  const normalized = new Set<SystemRole>();

  for (const rawRole of roles ?? []) {
    const role = rawRole.trim().toLowerCase();
    const normalizedRole = role.replace(/\s+/g, "_");

    if (adminRoleAliases.has(role) || adminRoleAliases.has(normalizedRole)) {
      normalized.add("admin");
      continue;
    }

    if (normalizedRole === "creator") {
      normalized.add("instructor");
      continue;
    }

    if (allRoles.includes(normalizedRole as SystemRole)) {
      normalized.add(normalizedRole as SystemRole);
    }
  }

  return normalized;
}

function getStaticNavigationItems(
  roles: readonly string[] | null | undefined,
): NavigationItemWithMetadata[] {
  const normalizedRoles = normalizeSystemRoles(roles);
  if (normalizedRoles.size === 0) return [...publicNavigation];

  const items = staticMenus
    .filter((menu) => menu.roles.some((role) => normalizedRoles.has(role)))
    .map<NavigationItemWithMetadata>((menu) => [
      menu.label,
      menu.icon,
      {
        id: menu.id,
        routeLink: menu.routeLink,
        parentId: null,
        source: "static",
      },
    ]);

  const seenLabels = new Set<string>();
  const uniqueItems = items.filter(([label]) => {
    if (seenLabels.has(label)) return false;
    seenLabels.add(label);
    return true;
  });

  // Preserve the old shell's Coupons fallback for authenticated roles that
  // received Courses through the seeded menu tree, while making that behavior
  // explicit in this static catalog path. Guests still receive public links.
  const hasCoupons = uniqueItems.some(([label]) => label === "Coupons");
  const hasStaffMenus = uniqueItems.some(([label]) =>
    [
      "Dashboard",
      "Courses",
      "Students",
      "Analytics",
      "Orders",
      "Quizzes",
      "Reviews",
    ].includes(label),
  );
  if (hasStaffMenus && !hasCoupons) {
    const couponItem: NavigationItemWithMetadata = [
      "Coupons",
      Tag,
      {
        id: "default-coupons",
        routeLink: "/coupons",
        parentId: null,
        source: "static",
      },
    ];
    const insertIndex = uniqueItems.findIndex(([label]) =>
      ["Orders", "Courses", "Analytics"].includes(label),
    );
    uniqueItems.splice(
      insertIndex === -1 ? uniqueItems.length : insertIndex + 1,
      0,
      couponItem,
    );
  }

  return uniqueItems.length > 0 ? uniqueItems : [...publicNavigation];
}

export function getPublicNavigationItems(): readonly NavigationItem[] {
  return publicNavigation;
}

/**
 * Resolves the shell navigation from the authenticated user's static role map.
 * Unauthenticated users always receive the two public destinations while
 * authenticated users with unknown roles fail closed to those same links.
 */
export function resolveShellNavigation(
  roles: readonly string[] | null | undefined,
  isAuthenticated: boolean,
): {
  items: readonly NavigationItemWithMetadata[];
  isDefault: boolean;
} {
  if (!isAuthenticated) {
    return { items: publicNavigation, isDefault: true };
  }

  return {
    items: getStaticNavigationItems(roles),
    isDefault: false,
  };
}

const navigationTones: Record<string, string> = {
  Home: "#38bdf8",
  Dashboard: "#38bdf8",
  Courses: "#a855f7",
  "My Courses": "#a855f7",
  Coupons: "#fbbf24",
  Students: "#4ade80",
  Wishlist: "#f43f5e",
  Reviews: "#facc15",
  "My Quiz": "#2dd4bf",
  Quizzes: "#2dd4bf",
  Discussions: "#38bdf8",
  Analytics: "#fb923c",
  Orders: "#e879f9",
  "Order History": "#e879f9",
  Messages: "#38bdf8",
  Notification: "#facc15",
  Notifications: "#facc15",
  Settings: "#c084fc",
  Fullscreen: "#fb923c",
  Appearance: "#818cf8",
  "Reading Mode": "#38bdf8",
  Theme: "#f472b6",
  Logout: "#94a3b8",
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

export function getNavigationPreferenceStorageKey(
  preference: "order" | "visibility",
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

export function getNavigationMenuSignature(
  navigationItems: readonly NavigationItemWithMetadata[],
): string {
  return navigationItems
    .map(([label, , metadata]) =>
      [metadata?.id ?? label, label, metadata?.routeLink ?? ""].join(":"),
    )
    .join("|");
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
      localStorage.getItem(
        getNavigationPreferenceStorageKey("order", role, userId),
      ) || "[]",
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
  userId?: string | null,
): string[] {
  const defaultVisibility = getDefaultNavigationVisibility(navigationItems);
  if (typeof window === "undefined") return defaultVisibility;

  try {
    const visibilityKey = getNavigationPreferenceStorageKey(
      "visibility",
      role,
      userId,
    );
    const menuSignatureKey = `${visibilityKey}-menu-signature`;
    const menuSignature = getNavigationMenuSignature(navigationItems);
    const parsedVisibility: unknown = JSON.parse(
      localStorage.getItem(visibilityKey) || "null",
    );
    const previousMenuSignature = localStorage.getItem(menuSignatureKey);
    const menuSetChanged = previousMenuSignature !== menuSignature;
    const previousMenuEntries = new Set(
      previousMenuSignature?.split("|").filter(Boolean) ?? [],
    );
    localStorage.setItem(menuSignatureKey, menuSignature);
    if (!Array.isArray(parsedVisibility)) {
      localStorage.setItem(visibilityKey, JSON.stringify(defaultVisibility));
      return defaultVisibility;
    }

    const normalizedVisibility = parsedVisibility.filter(
      (label): label is string =>
        typeof label === "string" && defaultVisibility.includes(label),
    );
    const savedVisibility = normalizedVisibility.filter(
      (label, index) =>
        defaultVisibility.includes(label) &&
        normalizedVisibility.indexOf(label) === index,
    );
    if (!menuSetChanged) {
      return ensureRequiredNavigationVisibility(
        savedVisibility,
        navigationItems,
      );
    }

    const newlyAvailableLabels = navigationItems
      .filter(([label, , metadata]) => {
        const entry = [
          metadata?.id ?? label,
          label,
          metadata?.routeLink ?? "",
        ].join(":");
        return !previousMenuEntries.has(entry);
      })
      .map(([label]) => label);
    const nextVisibility = ensureRequiredNavigationVisibility(
      [...savedVisibility, ...newlyAvailableLabels],
      navigationItems,
    );
    localStorage.setItem(visibilityKey, JSON.stringify(nextVisibility));
    return nextVisibility;
  } catch {
    return defaultVisibility;
  }
}

export function ensureRequiredNavigationVisibility(
  visibleLabels: readonly string[],
  navigationItems: readonly NavigationItemWithMetadata[],
): string[] {
  const visible = new Set(visibleLabels);
  return navigationItems
    .map(([label]) => label)
    .filter(
      (label) => visible.has(label) || requiredNavigationLabels.has(label),
    );
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
  _role: string,
  navigation: readonly NavigationItemWithMetadata[],
): NavigationItemWithMetadata[] {
  const capacity = 3;
  return navigation
    .filter(([label]) => label !== "Settings")
    .slice(0, capacity);
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
