import { sql, type Kysely } from "kysely";
import type { Database } from "./schema.ts";
import { ROLES } from "./seed-rbac.ts";

export interface AdminUserSeed {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
}

export const ADMIN_USERS: readonly AdminUserSeed[] = [
  {
    id: "00000000-0000-4000-8000-000000000011",
    email: "b29.bhupesh@gmail.com",
    username: "bhupesh_kumar",
    displayName: "Bhupesh Kumar",
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    email: "jit78546@gmail.com",
    username: "jit78546",
    displayName: "Jit",
  },
  {
    id: "00000000-0000-4000-8000-000000000013",
    email: "joydipbag27@gmail.com",
    username: "joydip",
    displayName: "Joydip",
  },
  {
    id: "00000000-0000-4000-8000-000000000014",
    email: "mrsingh@karanxdev.in",
    username: "mrsingh",
    displayName: "Mr Singh",
  },
  {
    id: "00000000-0000-4000-8000-000000000015",
    email: "nileshkumaryadav8369@gmail.com",
    username: "nileshkumaryadav8369",
    displayName: "Nilesh Kumar Yadav",
  },
  {
    id: "00000000-0000-4000-8000-000000000016",
    email: "parvez.tm@outlook.com",
    username: "parvez_tm",
    displayName: "Parvez TM",
  },
  {
    id: "00000000-0000-4000-8000-000000000017",
    email: "prap.sin.25@gmail.com",
    username: "prasanna_singh",
    displayName: "Prasanna P. Singh",
  },
  {
    id: "00000000-0000-4000-8000-000000000018",
    email: "sujalkrsoni@gmail.com",
    username: "sujalkrsoni",
    displayName: "Sujal Kumar Soni",
  },
  {
    id: "00000000-0000-4000-8000-000000000019",
    email: "thedhruvish@gmail.com",
    username: "thedhruvish",
    displayName: "Dhruvish",
  },
  {
    id: "00000000-0000-4000-8000-000000000020",
    email: "yogeshgupta279@gmail.com",
    username: "yogesh_gupta",
    displayName: "Yogesh Gupta",
  },
  {
    id: "00000000-0000-4000-8000-000000000021",
    email: "anuragsinghbam@gmail.com",
    username: "anuragsinghbam",
    displayName: "Anurag Singh",
  },
] as const;

export async function seedAdminUsers(
  database: Kysely<Database>,
): Promise<void> {
  const adminRoleId = ROLES.admin.id;

  // 1. Ensure admin role exists in roles table
  await database
    .insertInto("roles")
    .values({
      id: ROLES.admin.id,
      name: ROLES.admin.name,
      description: ROLES.admin.description,
    })
    .onConflict((conflict) =>
      conflict.column("name").doUpdateSet({
        description: ROLES.admin.description,
        updated_at: new Date(),
      }),
    )
    .execute();

  const emails = ADMIN_USERS.map((u) => u.email.toLowerCase());
  const ids = ADMIN_USERS.map((u) => u.id);
  const usernames = ADMIN_USERS.map((u) => u.username.toLowerCase());

  // 2. Remove any existing users matching these emails, ids, or usernames
  // to ensure a completely clean fresh state (no stale sessions, old student roles, etc.)
  await database
    .deleteFrom("users")
    .where((eb) =>
      eb.or([
        eb(sql`LOWER(email)`, "in", emails),
        eb("id", "in", ids),
        eb(sql`LOWER(username)`, "in", usernames),
      ]),
    )
    .execute();

  // 3. Seed fresh admin users
  for (const admin of ADMIN_USERS) {
    const normalizedEmail = admin.email.trim().toLowerCase();

    await database
      .insertInto("users")
      .values({
        id: admin.id,
        email: normalizedEmail,
        phone_no: null,
        username: admin.username,
        display_name: admin.displayName,
        email_verified_at: new Date(),
        phone_verified_at: null,
        mfa_mandatory: false,
        is_deleted: false,
      })
      .execute();

    // Assign ONLY the admin role
    await database
      .insertInto("user_roles")
      .values({
        user_id: admin.id,
        role_id: adminRoleId,
      })
      .onConflict((conflict) => conflict.doNothing())
      .execute();
  }

  console.info(
    `Cleanly seeded ${ADMIN_USERS.length} admin accounts with exclusive Admin role.`,
  );
}
