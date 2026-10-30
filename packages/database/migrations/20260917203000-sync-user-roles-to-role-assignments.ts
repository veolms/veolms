import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Backfill platform-scoped role_assignments for all users holding roles in user_roles
  // who do not already have an active platform role assignment for that role.
  await sql`
    INSERT INTO role_assignments (id, user_id, role_id, scope_type, course_id, created_at)
    SELECT 
      gen_random_uuid(),
      ur.user_id,
      ur.role_id,
      'platform',
      NULL,
      CURRENT_TIMESTAMP
    FROM user_roles ur
    WHERE NOT EXISTS (
      SELECT 1 FROM role_assignments ra
      WHERE ra.user_id = ur.user_id
        AND ra.role_id = ur.role_id
        AND ra.scope_type = 'platform'
        AND ra.course_id IS NULL
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // No-op rollback: preserving role assignments does not break invariants
}
