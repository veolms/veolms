import { sql, type Kysely } from "kysely";

/**
 * Routes that let "admin or instructor" in by role name now check
 * permissions. Instructors keep exactly what they could do: their student
 * list, their coupons, their enrolments, and deleting their own quizzes.
 * The services still limit each of these to the instructor's own courses.
 */
const instructorKeys = [
  "student.read",
  "coupon.read",
  "coupon.manage",
  "enrollment.read",
  "quiz.delete",
] as const;

const keyList = sql.join(instructorKeys.map((key) => sql`${key}`));

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    insert into role_permissions (role_id, permission_id, effect)
    select roles.id, permissions.id, 'allow'
    from roles
    join permissions on permissions.permission_key in (${keyList})
    where roles.name = 'instructor'
    on conflict (role_id, permission_id) do update set effect = 'allow'
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    delete from role_permissions
    using roles, permissions
    where role_permissions.role_id = roles.id
      and role_permissions.permission_id = permissions.id
      and roles.name = 'instructor'
      and permissions.permission_key in (${keyList})
  `.execute(database);
}
