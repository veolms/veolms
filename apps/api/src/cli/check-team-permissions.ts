/* eslint-disable no-console -- an operator CLI: the terminal is its output */
/**
 * Checks, against a running API, that each permission-guarded route lets in
 * exactly who it should:
 *
 *   admin                      allowed
 *   custom role with the key   allowed
 *   custom role without it     403
 *   student                    403
 *   instructor                 as before the switch (allowed or 403 per row)
 *
 * It creates throwaway users, roles and sessions in the configured database
 * and deletes them at the end. Run against a development database only:
 *
 *   pnpm --filter @veolms/api dev                    # in one terminal
 *   pnpm --filter @veolms/api check:team-permissions  # in another
 */
import { createHash, randomBytes } from "node:crypto";
import { withImpliedPermissions, type Permission } from "@veolms/contracts";
import { createDatabase, grantPlatformRole } from "@veolms/database";
import { config } from "../config.ts";
import { SESSION_COOKIE } from "../modules/auth/shared/auth.constants.ts";

const API =
  process.env["TEAM_CHECK_API_URL"] ?? `http://localhost:${config.API_PORT}/v1`;
const NIL = "00000000-0000-4000-8000-00000000dead";

interface Row {
  method: "GET" | "DELETE";
  path: string;
  key: Permission;
  /** Whether an instructor gets past the guard (their access before the switch). */
  instructor: boolean;
}

const ROWS: Row[] = [
  {
    method: "GET",
    path: "/academy/brand",
    key: "platform.settings.read",
    instructor: false,
  },
  {
    method: "GET",
    path: "/home/page-settings",
    key: "platform.homepage.update",
    instructor: false,
  },
  {
    method: "GET",
    path: "/platform/settings",
    key: "platform.settings.read",
    instructor: false,
  },
  {
    method: "GET",
    path: `/access/users/${NIL}/grants`,
    key: "student.access.manage",
    instructor: false,
  },
  {
    method: "GET",
    path: "/bundles/manage",
    key: "bundle.manage",
    instructor: false,
  },
  { method: "GET", path: "/coupons", key: "coupon.read", instructor: true },
  {
    method: "DELETE",
    path: `/coupons/${NIL}`,
    key: "coupon.delete",
    instructor: false,
  },
  {
    method: "GET",
    path: "/enrollments",
    key: "enrollment.read",
    instructor: true,
  },
  {
    method: "GET",
    path: "/payments/gateway-config",
    key: "payment.gateway.manage",
    instructor: false,
  },
  {
    method: "GET",
    path: "/manual-payments",
    key: "payment.manual.verify",
    instructor: false,
  },
  {
    method: "GET",
    path: "/refund-requests",
    key: "refund.review",
    instructor: false,
  },
  {
    method: "GET",
    path: `/refunds/${NIL}`,
    key: "billing.read",
    instructor: false,
  },
  {
    method: "GET",
    path: "/orders?view=admin",
    key: "billing.read",
    instructor: false,
  },
  {
    method: "GET",
    path: "/bin/courses",
    key: "course.restore",
    instructor: false,
  },
  { method: "GET", path: "/categories", key: "course.read", instructor: true },
  {
    method: "DELETE",
    path: `/categories/${NIL}`,
    key: "category.manage",
    instructor: false,
  },
  {
    method: "GET",
    path: "/moderation/reports",
    key: "discussion.moderate",
    instructor: false,
  },
  { method: "GET", path: "/students", key: "student.read", instructor: true },
  { method: "GET", path: "/quizzes/mine", key: "quiz.read", instructor: true },
  {
    method: "GET",
    path: "/analytics/admin/overview",
    key: "analytics.revenue.read",
    instructor: false,
  },
  {
    method: "GET",
    path: "/analytics/instructor/overview",
    key: "analytics.course.read",
    instructor: true,
  },
  { method: "GET", path: "/team/roles", key: "role.read", instructor: false },
  { method: "GET", path: "/team/members", key: "team.read", instructor: false },
];

const db = createDatabase(config.DATABASE_URL);
const tag = `permcheck${Date.now()}`;
const createdUsers: string[] = [];
const createdRoles: string[] = [];

async function roleId(name: string): Promise<string> {
  const row = await db
    .selectFrom("roles")
    .select("id")
    .where("name", "=", name)
    .executeTakeFirstOrThrow();
  return row.id;
}

/** A user with a verified session (and an authenticator, as staff need one). */
async function persona(
  key: string,
  roleIds: string[],
): Promise<{ id: string; cookie: string }> {
  const id = crypto.randomUUID();
  createdUsers.push(id);
  await db
    .insertInto("users")
    .values({
      id,
      email: `${tag}-${key}@example.test`,
      username: `${tag}_${key}`.slice(0, 30),
      display_name: `Check ${key}`,
      phone_no: null,
      phone_verified_at: null,
      email_verified_at: new Date(),
      mfa_mandatory: false,
    })
    .execute();
  for (const role of roleIds)
    await grantPlatformRole(db, { userId: id, roleId: role });
  await db
    .insertInto("user_totp_credentials")
    .values({
      id: crypto.randomUUID(),
      user_id: id,
      secret_encrypted: "check-only",
      enabled: true,
    })
    .execute();
  const token = randomBytes(32).toString("hex");
  await db
    .insertInto("sessions")
    .values({
      id: crypto.randomUUID(),
      user_id: id,
      token_hash: createHash("sha256").update(token).digest("hex"),
      ip_address: null,
      user_agent: "check-team-permissions",
      mfa_verified: true,
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    })
    .execute();
  return { id, cookie: `${SESSION_COOKIE}=${token}` };
}

async function customRole(
  name: string,
  keys: Iterable<Permission>,
): Promise<string> {
  const id = crypto.randomUUID();
  createdRoles.push(id);
  await db
    .insertInto("roles")
    .values({
      id,
      name: `${tag} ${createdRoles.length} ${name}`,
      description: null,
      is_system: false,
    })
    .execute();
  const permissions = await db
    .selectFrom("permissions")
    .select("id")
    .where("permission_key", "in", [...keys])
    .execute();
  if (permissions.length > 0) {
    await db
      .insertInto("role_permissions")
      .values(
        permissions.map((p) => ({
          role_id: id,
          permission_id: p.id,
          effect: "allow" as const,
        })),
      )
      .execute();
  }
  return id;
}

async function status(row: Row, cookie: string): Promise<number> {
  const response = await fetch(`${API}${row.path}`, {
    method: row.method,
    headers: { cookie },
  });
  return response.status;
}

const passed = (code: number) => code !== 401 && code !== 403;

/** A run cut short (a dropped connection) leaves its users and roles behind. */
async function removeEarlierRuns(): Promise<void> {
  await db
    .deleteFrom("users")
    .where("email", "like", "permcheck%@example.test")
    .execute();
  await db
    .deleteFrom("roles")
    .where("name", "like", "permcheck%")
    .where("is_system", "=", false)
    .execute();
}

let failures = 0;
try {
  await removeEarlierRuns();
  const admin = await persona("admin", [await roleId("admin")]);
  const instructor = await persona("instructor", [await roleId("instructor")]);
  const student = await persona("student", [await roleId("student")]);
  const without = await persona("without", [
    await customRole("unrelated", ["certificate.issue"]),
  ]);
  const withKey = await persona("with", []);

  console.log(
    `${"route".padEnd(44)} admin  with  without  student  instructor`,
  );
  for (const row of ROWS) {
    // The "with" persona holds exactly this row's key (and what it needs).
    await db
      .deleteFrom("user_roles")
      .where("user_id", "=", withKey.id)
      .execute();
    await db
      .deleteFrom("role_assignments")
      .where("user_id", "=", withKey.id)
      .execute();
    await grantPlatformRole(db, {
      userId: withKey.id,
      roleId: await customRole(row.key, withImpliedPermissions([row.key])),
    });

    const codes = {
      admin: await status(row, admin.cookie),
      with: await status(row, withKey.cookie),
      without: await status(row, without.cookie),
      student: await status(row, student.cookie),
      instructor: await status(row, instructor.cookie),
    };
    const ok =
      passed(codes.admin) &&
      passed(codes.with) &&
      codes.without === 403 &&
      codes.student === 403 &&
      passed(codes.instructor) === row.instructor;
    if (!ok) failures += 1;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${`${row.method} ${row.path}`.padEnd(39)} ${String(codes.admin).padEnd(6)} ${String(codes.with).padEnd(5)} ${String(codes.without).padEnd(8)} ${String(codes.student).padEnd(8)} ${codes.instructor}`,
    );
  }
} finally {
  await db
    .deleteFrom("users")
    .where("id", "in", createdUsers.length ? createdUsers : [NIL])
    .execute();
  if (createdRoles.length)
    await db.deleteFrom("roles").where("id", "in", createdRoles).execute();
  await db.destroy();
}

console.log(
  failures === 0
    ? "\nAll routes let in exactly who they should."
    : `\n${failures} route(s) failed.`,
);
process.exitCode = failures === 0 ? 0 : 1;
