import type { Kysely } from "kysely";
import { permissions, type Permission } from "@veolms/contracts";
import type { Database } from "./schema/index.ts";

export const SYSTEM_ROLES = {
  admin: {
    id: "00000000-0000-4000-8000-000000000000",
    role_key: "admin",
    name: "Administrator",
    description: "Operates the entire VeoLMS platform with full access",
    is_system: true,
  },
  course_manager: {
    id: "00000000-0000-4000-8000-000000000003",
    role_key: "course_manager",
    name: "Course Manager",
    description: "Full course lifecycle and curriculum management",
    is_system: true,
  },
  content_editor: {
    id: "00000000-0000-4000-8000-000000000004",
    role_key: "content_editor",
    name: "Content Editor",
    description: "Curriculum and lesson content editing",
    is_system: true,
  },
  thumbnail_editor: {
    id: "00000000-0000-4000-8000-000000000005",
    role_key: "thumbnail_editor",
    name: "Thumbnail Editor",
    description: "Course and lesson thumbnails only",
    is_system: true,
  },
  instructor: {
    id: "00000000-0000-4000-8000-000000000006",
    role_key: "instructor",
    name: "Instructor",
    description: "Teaching, curriculum authoring, grading and discussion moderation",
    is_system: true,
  },
  teaching_assistant: {
    id: "00000000-0000-4000-8000-000000000007",
    role_key: "teaching_assistant",
    name: "Teaching Assistant",
    description: "Grading and discussion moderation",
    is_system: true,
  },
  reviewer: {
    id: "00000000-0000-4000-8000-000000000008",
    role_key: "reviewer",
    name: "Reviewer",
    description: "Preview draft course content read-only",
    is_system: true,
  },
  analytics_viewer: {
    id: "00000000-0000-4000-8000-000000000009",
    role_key: "analytics_viewer",
    name: "Analytics Viewer",
    description: "Read-only analytics across courses and revenue",
    is_system: true,
  },
} as const;

export const ROLES = {
  admin: SYSTEM_ROLES.admin,
  instructor: SYSTEM_ROLES.instructor,
  student: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "student",
    role_key: "student",
    description: "Enrolled student",
    is_system: true,
  },
} as const;

export const STANDARD_FEATURES = [
  { feature_key: "quizzes", description: "Quiz and assessment system", enabled: true },
  { feature_key: "certificates", description: "Course completion certificates", enabled: true },
  { feature_key: "payments", description: "Paid course enrollment and commerce", enabled: true },
  { feature_key: "live_classes", description: "Live class integration", enabled: true },
  { feature_key: "discussions", description: "Community discussions and Q&A", enabled: true },
  { feature_key: "custom_branding", description: "Organization branding and custom domains", enabled: true },
  { feature_key: "advanced_analytics", description: "Advanced reporting and analytics", enabled: true },
] as const;

export const ROLE_CAPABILITY_MAPPINGS: Record<keyof typeof SYSTEM_ROLES, readonly Permission[]> = {
  admin: permissions, // all platform capabilities
  course_manager: [
    "course.read",
    "course.preview",
    "course.create",
    "course.details.update",
    "course.thumbnail.update",
    "course.pricing.update",
    "course.curriculum.update",
    "course.publish",
    "course.unpublish",
    "course.archive",
    "course.delete",
    "lesson.read",
    "lesson.create",
    "lesson.details.update",
    "lesson.content.update",
    "lesson.video.update",
    "lesson.thumbnail.update",
    "lesson.reorder",
    "lesson.publish",
    "lesson.delete",
    "quiz.read",
    "quiz.create",
    "quiz.settings.update",
    "quiz.questions.manage",
    "quiz.publish",
    "quiz.delete",
    "assignment.read",
    "assignment.create",
    "assignment.update",
    "assignment.publish",
    "assignment.delete",
    "submission.read",
    "submission.grade",
    "enrollment.read",
    "enrollment.create",
    "discussion.read",
    "discussion.moderate",
    "analytics.course.read",
    "certificate.issue",
  ],
  content_editor: [
    "course.read",
    "course.preview",
    "course.details.update",
    "course.thumbnail.update",
    "course.curriculum.update",
    "lesson.read",
    "lesson.create",
    "lesson.details.update",
    "lesson.content.update",
    "lesson.video.update",
    "lesson.thumbnail.update",
    "lesson.reorder",
    "quiz.read",
    "quiz.create",
    "quiz.settings.update",
    "quiz.questions.manage",
    "assignment.read",
    "assignment.create",
    "assignment.update",
  ],
  thumbnail_editor: [
    "course.read",
    "course.thumbnail.update",
    "lesson.read",
    "lesson.thumbnail.update",
  ],
  instructor: [
    "course.read",
    "course.preview",
    "course.details.update",
    "course.thumbnail.update",
    "course.pricing.update",
    "course.curriculum.update",
    "lesson.read",
    "lesson.create",
    "lesson.details.update",
    "lesson.content.update",
    "lesson.video.update",
    "lesson.thumbnail.update",
    "lesson.reorder",
    "quiz.read",
    "quiz.create",
    "quiz.settings.update",
    "quiz.questions.manage",
    "quiz.publish",
    "assignment.read",
    "assignment.create",
    "assignment.update",
    "assignment.publish",
    "submission.read",
    "submission.grade",
    "discussion.read",
    "discussion.moderate",
    "analytics.course.read",
    "certificate.issue",
  ],
  teaching_assistant: [
    "course.read",
    "lesson.read",
    "quiz.read",
    "assignment.read",
    "submission.read",
    "submission.grade",
    "discussion.read",
    "discussion.moderate",
  ],
  reviewer: [
    "course.read",
    "course.preview",
    "lesson.read",
    "quiz.read",
    "assignment.read",
  ],
  analytics_viewer: [
    "analytics.course.read",
    "analytics.revenue.read",
    "course.read",
  ],
};

// Legacy Menus definition for sidenav menu compatibility
export const MENUS = {
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
  coupons: {
    id: "00000000-0000-4000-9000-000000000018",
    parentId: null,
    label: "Coupons",
    routeLink: "/coupons",
    icon: "Tag",
    expanded: false,
    checkList: null,
    isBoth: false,
  },

  // Student Menus
  myCourses: {
    id: "00000000-0000-4000-9000-000000000012",
    parentId: null,
    label: "My Courses",
    routeLink: "/my-courses",
    icon: "GraduationCap",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
  wishlist: {
    id: "00000000-0000-4000-9000-000000000013",
    parentId: null,
    label: "Wishlist",
    routeLink: "/wishlist",
    icon: "Heart",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
  orderHistory: {
    id: "00000000-0000-4000-9000-000000000014",
    parentId: null,
    label: "Order History",
    routeLink: "/order-history",
    icon: "Tote",
    expanded: false,
    checkList: null,
    isBoth: false,
  },
} as const;

export async function seedRolesAndPermissions(database: Kysely<Database>): Promise<void> {
  // 1. Seed Features
  for (const feature of STANDARD_FEATURES) {
    await database
      .insertInto("features")
      .values(feature)
      .onConflict((conflict) =>
        conflict.column("feature_key").doUpdateSet({
          description: feature.description,
          enabled: feature.enabled,
        }),
      )
      .execute();
  }

  // 2. Seed Permissions Catalogue
  const permissionEntries = new Map<string, string>();
  for (let i = 0; i < permissions.length; i++) {
    const key = permissions[i]!;
    const domain = key.split(".")[0] ?? "general";
    const permId = `00000000-0000-4000-b000-${String(i + 1).padStart(12, "0")}`;
    permissionEntries.set(key, permId);

    await database
      .insertInto("permissions")
      .values({
        id: permId,
        permission_key: key,
        domain,
        description: `Permission to perform ${key}`,
      })
      .onConflict((conflict) =>
        conflict.column("permission_key").doUpdateSet({
          domain,
          description: `Permission to perform ${key}`,
        }),
      )
      .execute();
  }

  // 3. Seed System Roles
  for (const role of Object.values(SYSTEM_ROLES)) {
    await database
      .insertInto("roles")
      .values({
        id: role.id,
        role_key: role.role_key,
        name: role.name,
        description: role.description,
        is_system: true,
      })
      .onConflict((conflict) =>
        conflict.column("id").doUpdateSet({
          role_key: role.role_key,
          name: role.name,
          description: role.description,
          is_system: true,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  // 4. Seed Role Permissions
  for (const [roleKey, rolePermissions] of Object.entries(ROLE_CAPABILITY_MAPPINGS)) {
    const role = SYSTEM_ROLES[roleKey as keyof typeof SYSTEM_ROLES];
    for (const permKey of rolePermissions) {
      const permId = permissionEntries.get(permKey);
      if (!permId) continue;

      await database
        .insertInto("role_permissions")
        .values({
          role_id: role.id,
          permission_id: permId,
          effect: "allow",
        })
        .onConflict((conflict) =>
          conflict.columns(["role_id", "permission_id"]).doUpdateSet({
            effect: "allow",
          }),
        )
        .execute();
    }
  }

  // 5. Seed Menus (for UI sidebar)
  const menuList = Object.values(MENUS);
  const parentMenus = menuList.filter((m) => m.parentId === null);
  const childMenus = menuList.filter((m) => m.parentId !== null);

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

  console.info(
    `Seeded ${STANDARD_FEATURES.length} features, ${permissions.length} capability permissions, and ${Object.keys(SYSTEM_ROLES).length} system roles.`,
  );
}
