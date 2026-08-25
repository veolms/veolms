import type { Kysely } from "kysely";
import type { Database } from "./schema.ts";

export const ROLES = {
  admin: {
    id: "00000000-0000-4000-8000-000000000000",
    name: "admin",
    description: "System administrator with full platform access",
  },
  creator: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "creator",
    description: "Platform owner and creator",
  },
  student: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "student",
    description: "Enrolled student",
  },
} as const;

export interface SeedMenuDefinition {
  id: string;
  parentId: string | null;
  label: string;
  routeLink: string;
  icon: string | null;
  expanded: boolean;
  checkList: string | null;
  isBoth: boolean;
}

export interface RolePermissionRule {
  roleId: string;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export const MENUS = {
  // Creator / Shared Menus
  dashboard: {
    id: "00000000-0000-4000-9000-000000000001",
    parentId: null,
    label: "Dashboard",
    routeLink: "/dashboard",
    icon: "SquaresFour",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
  creatorCourses: {
    id: "00000000-0000-4000-9000-000000000002",
    parentId: null,
    label: "Courses",
    routeLink: "/courses",
    icon: "BookOpen",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
  students: {
    id: "00000000-0000-4000-9000-000000000003",
    parentId: null,
    label: "Students",
    routeLink: "/students",
    icon: "Users",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
  discussions: {
    id: "00000000-0000-4000-9000-000000000004",
    parentId: null,
    label: "Discussions",
    routeLink: "/discussions",
    icon: "ChatCircleDots",
    expanded: false,
    checkList: null,
    isBoth: true,
  },
  analytics: {
    id: "00000000-0000-4000-9000-000000000005",
    parentId: null,
    label: "Analytics",
    routeLink: "/analytics",
    icon: "ChartBar",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
  orders: {
    id: "00000000-0000-4000-9000-000000000006",
    parentId: null,
    label: "Orders",
    routeLink: "/orders",
    icon: "Tote",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
  settings: {
    id: "00000000-0000-4000-9000-000000000007",
    parentId: null,
    label: "Settings",
    routeLink: "/settings",
    icon: "GearSix",
    expanded: false,
    checkList: null,
    isBoth: true,
  },

  // Student Menus
  home: {
    id: "00000000-0000-4000-9000-000000000008",
    parentId: null,
    label: "Home",
    routeLink: "/home",
    icon: "House",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
  studentCourses: {
    id: "00000000-0000-4000-9000-000000000009",
    parentId: null,
    label: "Courses",
    routeLink: "/explore-courses",
    icon: "BookOpen",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
  notification: {
    id: "00000000-0000-4000-9000-000000000010",
    parentId: null,
    label: "Notification",
    routeLink: "/notifications",
    icon: "Bell",
    expanded: false,
    checkList: null,
    isBoth: false,
  },

  // Student Nested Learning Space Parent & Children
  learningSpace: {
    id: "00000000-0000-4000-9000-000000000011",
    parentId: null,
    label: "Learning Space",
    routeLink: "/learning-space",
    icon: "GraduationCap",
    expanded: true,
    checkList: null,
    isBoth: false,
  },
  myCourses: {
    id: "00000000-0000-4000-9000-000000000012",
    parentId: "00000000-0000-4000-9000-000000000011",
    label: "My Courses",
    routeLink: "/my-courses",
    icon: "GraduationCap",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
  wishlist: {
    id: "00000000-0000-4000-9000-000000000013",
    parentId: "00000000-0000-4000-9000-000000000011",
    label: "Wishlist",
    routeLink: "/wishlist",
    icon: "Heart",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
  orderHistory: {
    id: "00000000-0000-4000-9000-000000000014",
    parentId: "00000000-0000-4000-9000-000000000011",
    label: "Order History",
    routeLink: "/order-history",
    icon: "Tote",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
} as const satisfies Record<string, SeedMenuDefinition>;

export const PERMISSION_ASSIGNMENTS: Record<string, readonly RolePermissionRule[]> = {
  // 1. Dashboard -> Admin & Creator
  [MENUS.dashboard.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.creator.id, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
  ],

  // 2. Creator Courses -> Admin & Creator
  [MENUS.creatorCourses.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.creator.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
  ],

  // 3. Students -> Admin & Creator
  [MENUS.students.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.creator.id, canCreate: false, canRead: true, canUpdate: true, canDelete: false },
  ],

  // 4. Discussions -> Admin, Creator, Student
  [MENUS.discussions.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.creator.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.student.id, canCreate: true, canRead: true, canUpdate: true, canDelete: false },
  ],

  // 5. Analytics -> Admin & Creator
  [MENUS.analytics.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.creator.id, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
  ],

  // 6. Orders -> Admin & Creator
  [MENUS.orders.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.creator.id, canCreate: false, canRead: true, canUpdate: true, canDelete: false },
  ],

  // 7. Settings -> Admin, Creator, Student
  [MENUS.settings.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.creator.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.student.id, canCreate: false, canRead: true, canUpdate: true, canDelete: false },
  ],

  // 8. Home -> Admin & Student
  [MENUS.home.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.student.id, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
  ],

  // 9. Student Explore Courses -> Admin & Student
  [MENUS.studentCourses.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.student.id, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
  ],

  // 10. Notification -> Admin & Student
  [MENUS.notification.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.student.id, canCreate: false, canRead: true, canUpdate: true, canDelete: true },
  ],

  // 11. Learning Space (Parent) -> Admin & Student
  [MENUS.learningSpace.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.student.id, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
  ],

  // 12. My Courses (Child) -> Admin & Student
  [MENUS.myCourses.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.student.id, canCreate: false, canRead: true, canUpdate: true, canDelete: false },
  ],

  // 13. Wishlist (Child) -> Admin & Student
  [MENUS.wishlist.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.student.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
  ],

  // 14. Order History (Child) -> Admin & Student
  [MENUS.orderHistory.id]: [
    { roleId: ROLES.admin.id, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
    { roleId: ROLES.student.id, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
  ],
};

export async function seedRolesAndPermissions(database: Kysely<Database>): Promise<void> {
  // 1. Seed Roles (Admin, Creator, Student)
  const roleList = Object.values(ROLES);
  for (const role of roleList) {
    await database
      .insertInto("roles")
      .values(role)
      .onConflict((conflict) =>
        conflict.column("name").doUpdateSet({
          description: role.description,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  // 2. Seed Menus (Parents first, then children to respect foreign keys)
  const menuList: readonly SeedMenuDefinition[] = Object.values(MENUS);
  const parentMenus = menuList.filter((menu) => menu.parentId === null);
  const childMenus = menuList.filter((menu) => menu.parentId !== null);

  for (const menu of [...parentMenus, ...childMenus]) {
    await database
      .insertInto("menus")
      .values({
        id: menu.id,
        parent_id: menu.parentId,
        label: menu.label,
        route_link: menu.routeLink,
        icon: menu.icon,
        expanded: menu.expanded,
        check_list: menu.checkList,
        is_both: menu.isBoth,
      })
      .onConflict((conflict) =>
        conflict.column("id").doUpdateSet({
          parent_id: menu.parentId,
          label: menu.label,
          route_link: menu.routeLink,
          icon: menu.icon,
          expanded: menu.expanded,
          check_list: menu.checkList,
          is_both: menu.isBoth,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  // 3. Seed Permissions
  let permissionsCount = 0;
  for (const [menuId, rules] of Object.entries(PERMISSION_ASSIGNMENTS)) {
    for (const rule of rules) {
      // Deterministic permission UUID based on role ID and menu ID segments
      const roleSuffix = rule.roleId.slice(-4);
      const menuSuffix = menuId.slice(-4);
      const permId = `00000000-0000-4000-a000-${roleSuffix}${menuSuffix}0000`;

      await database
        .insertInto("permissions")
        .values({
          id: permId,
          role_id: rule.roleId,
          menu_id: menuId,
          can_create: rule.canCreate,
          can_read: rule.canRead,
          can_update: rule.canUpdate,
          can_delete: rule.canDelete,
        })
        .onConflict((conflict) =>
          conflict.columns(["role_id", "menu_id"]).doUpdateSet({
            can_create: rule.canCreate,
            can_read: rule.canRead,
            can_update: rule.canUpdate,
            can_delete: rule.canDelete,
            updated_at: new Date(),
          }),
        )
        .execute();
      permissionsCount++;
    }
  }

  console.info(
    `Seeded ${roleList.length} roles, ${menuList.length} menus, and ${permissionsCount} role-permission mappings.`,
  );
}
