import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheTags, clearAllCaches, invalidateCache } from "@veolms/api-core";
import type { Permission } from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";

import {
  checkPermission,
  decideEffectivePermissions,
  decidePermission,
  isFeatureOn,
  listEffectivePermissions,
} from "./permission-cache.ts";

const USER = "00000000-0000-4000-8000-0000000000aa";
const COURSE = "00000000-0000-4000-8000-000000000002";
const OTHER_COURSE = "00000000-0000-4000-8000-000000000003";
const read = "course.read" as Permission;
const publish = "course.publish" as Permission;

const rules = {
  admin: {
    ownCoursesOnly: false,
    effects: { [read]: "allow", [publish]: "allow" },
  },
  instructor: {
    ownCoursesOnly: true,
    effects: { [read]: "allow", [publish]: "allow" },
  },
  reviewer: { ownCoursesOnly: false, effects: { [read]: "allow" } },
  banned: { ownCoursesOnly: false, effects: { [read]: "deny" } },
};

function holding(
  roleId: keyof typeof rules,
  scope: "platform" | "course" = "platform",
  courseId: string | null = null,
  expiresAt: number | null = null,
) {
  return { roleId, scope, courseId, expiresAt };
}

const now = Date.now();

await test("a platform role applies everywhere; a course role only on its course", () => {
  const platform = [holding("reviewer")];
  const onCourse = [holding("reviewer", "course", COURSE)];
  const check = (
    holdings: ReturnType<typeof holding>[],
    courseId: string | null,
  ) =>
    decidePermission(
      holdings,
      rules,
      { userId: USER, permissionKey: read, courseId },
      now,
    ).allowed;

  assert.equal(check(platform, null), true);
  assert.equal(check(platform, COURSE), true);
  assert.equal(check(onCourse, COURSE), true);
  assert.equal(
    check(onCourse, COURSE.toUpperCase()),
    true,
    "ids compare case-insensitively",
  );
  assert.equal(check(onCourse, OTHER_COURSE), false);
  assert.equal(
    check(onCourse, null),
    false,
    "a course role does not reach academy-wide checks",
  );
});

await test("an expired assignment grants nothing", () => {
  const decide = (expiresAt: number | null) =>
    decidePermission(
      [holding("reviewer", "platform", null, expiresAt)],
      rules,
      {
        userId: USER,
        permissionKey: read,
      },
      now,
    ).allowed;
  assert.equal(decide(now - 1), false);
  assert.equal(decide(now + 60_000), true);
  assert.equal(decide(null), true);
});

await test("a deny beats any allow, and no matching role is a refusal", () => {
  const denied = decidePermission(
    [holding("admin"), holding("banned")],
    rules,
    {
      userId: USER,
      permissionKey: read,
    },
    now,
  );
  assert.deepEqual(denied, {
    allowed: false,
    reason: "Permission explicitly denied by policy",
  });
  const none = decidePermission(
    [holding("reviewer")],
    rules,
    { userId: USER, permissionKey: publish },
    now,
  );
  assert.equal(none.allowed, false);
  assert.equal(
    none.reason,
    "No matching role assignment grants this permission",
  );
});

await test("leaving out own-course roles drops the instructor's permissions, not the admin's", () => {
  const context = {
    userId: USER,
    permissionKey: publish,
    excludeOwnCoursesOnlyRoles: true,
  };
  assert.equal(
    decidePermission([holding("instructor")], rules, context, now).allowed,
    false,
  );
  assert.equal(
    decidePermission([holding("admin")], rules, context, now).allowed,
    true,
  );
});

await test("effective permissions are every allowed key that no applicable role denies", () => {
  const keys = decideEffectivePermissions(
    [holding("admin"), holding("banned")],
    rules,
    { userId: USER },
    now,
  );
  assert.deepEqual(keys, [publish]);
});

/**
 * A database holding one user's roles, counting how often each table is
 * read. Answers the queries permission-cache.ts makes and nothing else.
 */
function fakeDatabase(state: {
  assignments: Array<{
    role_id: string;
    scope_type: string;
    course_id: string | null;
    expires_at: Date | null;
  }>;
  platformRoles: Array<{ role_id: string }>;
  features?: Array<{ feature_key: string; enabled: boolean | null }>;
}) {
  const reads: Record<string, number> = {};
  const rows = (table: string): unknown[] => {
    reads[table] = (reads[table] ?? 0) + 1;
    if (table === "role_assignments") return state.assignments;
    if (table === "user_roles") return state.platformRoles;
    if (table === "features") return state.features ?? [];
    if (table === "roles as r") {
      return Object.entries(rules).flatMap(([roleId, role]) =>
        Object.entries(role.effects).map(([key, effect]) => ({
          role_id: roleId,
          own_courses_only: role.ownCoursesOnly,
          permission_key: key,
          effect,
        })),
      );
    }
    throw new Error(`unexpected table ${table}`);
  };
  const builder = (table: string): unknown =>
    new Proxy(
      {},
      {
        get: (_target, key) => {
          if (key === "then") return undefined;
          if (key === "execute") return async () => rows(table);
          return () => builder(table);
        },
      },
    );
  const database = {
    isTransaction: false,
    selectFrom: (table: string) => builder(table),
  } as unknown as DatabaseExecutor;
  return { database, reads, state };
}

await test("a user's checks are answered from one read of their roles and one of the rules", async () => {
  clearAllCaches();
  const { database, reads } = fakeDatabase({
    assignments: [],
    platformRoles: [{ role_id: "reviewer" }],
  });
  assert.equal(
    (await checkPermission(database, { userId: USER, permissionKey: read }))
      .allowed,
    true,
  );
  assert.equal(
    (await checkPermission(database, { userId: USER, permissionKey: publish }))
      .allowed,
    false,
  );
  assert.deepEqual(await listEffectivePermissions(database, { userId: USER }), [
    read,
  ]);
  assert.deepEqual(reads, {
    role_assignments: 1,
    user_roles: 1,
    "roles as r": 1,
  });
});

await test("a role granted to the user is seen once their sign-in is evicted", async () => {
  clearAllCaches();
  const fake = fakeDatabase({
    assignments: [],
    platformRoles: [{ role_id: "reviewer" }],
  });
  assert.equal(
    (
      await checkPermission(fake.database, {
        userId: USER,
        permissionKey: publish,
      })
    ).allowed,
    false,
  );

  fake.state.platformRoles.push({ role_id: "admin" });
  // What the team module's role change does (evictCachedUserSessions).
  invalidateCache([cacheTags.user(USER)]);

  assert.equal(
    (
      await checkPermission(fake.database, {
        userId: USER,
        permissionKey: publish,
      })
    ).allowed,
    true,
  );
  assert.equal(
    fake.reads["roles as r"],
    1,
    "the shared rules are not read again",
  );
});

await test("a role the cached rules do not know yet makes them read again", async () => {
  clearAllCaches();
  const fake = fakeDatabase({
    assignments: [],
    platformRoles: [{ role_id: "reviewer" }],
  });
  await checkPermission(fake.database, { userId: USER, permissionKey: read });
  fake.state.platformRoles.push({ role_id: "brand-new-role" });
  invalidateCache([cacheTags.user(USER)]);
  await checkPermission(fake.database, { userId: USER, permissionKey: read });
  assert.equal(fake.reads["roles as r"], 2);
});

await test("inside a transaction nothing is cached", async () => {
  clearAllCaches();
  const fake = fakeDatabase({
    assignments: [],
    platformRoles: [{ role_id: "reviewer" }],
  });
  const transaction = Object.assign(Object.create(fake.database), {
    isTransaction: true,
  }) as DatabaseExecutor;
  await checkPermission(transaction, { userId: USER, permissionKey: read });
  await checkPermission(transaction, { userId: USER, permissionKey: read });
  assert.equal(fake.reads.user_roles, 2);
});

await test("feature flags: a missing or null row is on, a disabled one off, all from one read", async () => {
  clearAllCaches();
  const { database, reads } = fakeDatabase({
    assignments: [],
    platformRoles: [],
    features: [
      { feature_key: "off", enabled: false },
      { feature_key: "unset", enabled: null },
    ],
  });
  assert.equal(await isFeatureOn(database, "off"), false);
  assert.equal(await isFeatureOn(database, "unset"), true);
  assert.equal(await isFeatureOn(database, "no-row"), true);
  assert.equal(reads.features, 1);
});
