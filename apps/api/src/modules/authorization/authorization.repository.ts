import { sql } from "kysely";
import type { DatabaseExecutor as Executor } from "@veolms/database";
import type { Permission } from "@veolms/contracts";

export interface PermissionCheckContext {
  userId: string;
  permissionKey: Permission;
  courseId?: string | null;
}

export interface ScopeCheckContext {
  userId: string;
  courseId?: string | null;
}

export interface ResourceScope {
  courseId: string | null;
}

export interface LessonResourceScope extends ResourceScope {
  lessonId: string;
}

export async function checkUserPermission(
  database: Executor,
  context: PermissionCheckContext,
): Promise<{ allowed: boolean; reason?: string }> {
  const { userId, permissionKey, courseId } = context;

  // Build query to find all applicable role assignments and their effects
  let query = database
    .selectFrom("role_assignments as ra")
    .innerJoin("role_permissions as rp", "rp.role_id", "ra.role_id")
    .innerJoin("permissions as p", "p.id", "rp.permission_id")
    .select(["rp.effect", "ra.scope_type", "ra.course_id"])
    .where("ra.user_id", "=", userId)
    .where("p.permission_key", "=", permissionKey)
    .where((eb) =>
      eb.or([
        eb("ra.expires_at", "is", null),
        eb("ra.expires_at", ">", sql<Date>`CURRENT_TIMESTAMP`),
      ]),
    );

  // Filter for matching scope hierarchy:
  // 1. Platform scope always matches
  // 2. Course scope matches if courseId matches
  query = query.where((eb) => {
    const conditions = [eb("ra.scope_type", "=", "platform")];

    if (courseId) {
      conditions.push(
        eb.and([
          eb("ra.scope_type", "=", "course"),
          eb("ra.course_id", "=", courseId),
        ]),
      );
    }

    return eb.or(conditions);
  });

  // Query platform user_roles for platform-scoped role compatibility
  const userRolesQuery = database
    .selectFrom("user_roles as ur")
    .innerJoin("role_permissions as rp", "rp.role_id", "ur.role_id")
    .innerJoin("permissions as p", "p.id", "rp.permission_id")
    .select([
      "rp.effect",
      sql<string>`'platform'`.as("scope_type"),
      sql<string | null>`null`.as("course_id"),
    ])
    .where("ur.user_id", "=", userId)
    .where("p.permission_key", "=", permissionKey);

  const [scopedAssignments, directRoleAssignments] = await Promise.all([
    query.execute(),
    userRolesQuery.execute(),
  ]);

  const matchingAssignments = [...scopedAssignments, ...directRoleAssignments];

  if (matchingAssignments.length === 0) {
    return {
      allowed: false,
      reason: "No matching role assignment grants this permission",
    };
  }

  // Explicit deny rule overrides any allow rule
  const hasDeny = matchingAssignments.some((a) => a.effect === "deny");
  if (hasDeny) {
    return { allowed: false, reason: "Permission explicitly denied by policy" };
  }

  const hasAllow = matchingAssignments.some((a) => a.effect === "allow");
  if (hasAllow) {
    return { allowed: true };
  }

  return { allowed: false, reason: "Permission not granted" };
}

export async function getUserEffectivePermissions(
  database: Executor,
  context: ScopeCheckContext,
): Promise<string[]> {
  const { userId, courseId } = context;

  let query = database
    .selectFrom("role_assignments as ra")
    .innerJoin("role_permissions as rp", "rp.role_id", "ra.role_id")
    .innerJoin("permissions as p", "p.id", "rp.permission_id")
    .select(["p.permission_key", "rp.effect"])
    .where("ra.user_id", "=", userId)
    .where((eb) =>
      eb.or([
        eb("ra.expires_at", "is", null),
        eb("ra.expires_at", ">", sql<Date>`CURRENT_TIMESTAMP`),
      ]),
    );

  query = query.where((eb) => {
    const conditions = [eb("ra.scope_type", "=", "platform")];

    if (courseId) {
      conditions.push(
        eb.and([
          eb("ra.scope_type", "=", "course"),
          eb("ra.course_id", "=", courseId),
        ]),
      );
    }

    return eb.or(conditions);
  });

  const userRolesQuery = database
    .selectFrom("user_roles as ur")
    .innerJoin("role_permissions as rp", "rp.role_id", "ur.role_id")
    .innerJoin("permissions as p", "p.id", "rp.permission_id")
    .select(["p.permission_key", "rp.effect"])
    .where("ur.user_id", "=", userId);

  const [scopedRows, directRows] = await Promise.all([
    query.execute(),
    userRolesQuery.execute(),
  ]);

  const rows = [...scopedRows, ...directRows];

  const deniedKeys = new Set<string>();
  const allowedKeys = new Set<string>();

  for (const row of rows) {
    if (row.effect === "deny") {
      deniedKeys.add(row.permission_key);
    } else if (row.effect === "allow") {
      allowedKeys.add(row.permission_key);
    }
  }

  // Filter out any explicitly denied permissions
  return Array.from(allowedKeys).filter((k) => !deniedKeys.has(k));
}

export async function isFeatureEnabled(
  database: Executor,
  featureKey: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("features")
    .select("enabled")
    .where("feature_key", "=", featureKey)
    .executeTakeFirst();

  return Boolean(row?.enabled ?? true);
}

export async function getFeatureMap(
  database: Executor,
): Promise<Record<string, boolean>> {
  const allFeatures = await database
    .selectFrom("features")
    .select(["feature_key", "enabled"])
    .execute();

  const featureMap: Record<string, boolean> = {};
  for (const f of allFeatures) {
    featureMap[f.feature_key] = Boolean(f.enabled);
  }

  return featureMap;
}

export async function resolveCourseScope(
  database: Executor,
  courseIdOrSlug: string,
): Promise<ResourceScope | null> {
  // Check UUID vs Slug
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      courseIdOrSlug,
    );

  let query = database.selectFrom("courses").select(["id"]);

  if (isUuid) {
    query = query.where("id", "=", courseIdOrSlug);
  } else {
    query = query.where("slug", "=", courseIdOrSlug);
  }

  const course = await query.executeTakeFirst();
  if (!course) return null;

  return {
    courseId: course.id,
  };
}

export async function resolveLessonScope(
  database: Executor,
  lessonId: string,
): Promise<LessonResourceScope | null> {
  const row = await database
    .selectFrom("course_lessons as cl")
    .select(["cl.id as lesson_id", "cl.course_id"])
    .where("cl.id", "=", lessonId)
    .executeTakeFirst();

  if (!row) return null;

  return {
    lessonId: row.lesson_id,
    courseId: row.course_id,
  };
}

export async function resolveSectionScope(
  database: Executor,
  sectionId: string,
): Promise<ResourceScope | null> {
  const row = await database
    .selectFrom("course_sections as cs")
    .select(["cs.course_id"])
    .where("cs.id", "=", sectionId)
    .executeTakeFirst();

  if (!row) return null;

  return {
    courseId: row.course_id,
  };
}
