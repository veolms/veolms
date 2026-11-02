import { cacheTags, createCache } from "@veolms/api-core";
import type { DatabaseExecutor as Executor } from "@veolms/database";

import { config } from "../../config.ts";
import * as repo from "./authorization.repository.ts";
import type {
  PermissionCheckContext,
  ScopeCheckContext,
} from "./authorization.repository.ts";

/**
 * Permission checks answered from memory. A check used to cost two queries,
 * and most signed-in requests make several (the route guard, then each
 * service's own `hasAcademyPermission`). Instead two things are cached:
 *
 * - the rules: every role with what it allows and denies (`rbac`), shared
 *   by every user, kept for minutes;
 * - per user, the roles they hold and where (`user:<id>`), kept for
 *   SESSION_AUTH_CACHE_TTL_MS like the rest of a sign-in.
 *
 * and each check is decided from them as `checkUserPermission` decides it
 * in SQL: a platform role applies everywhere, a course role only to its
 * course, expired assignments not at all, a deny beats any allow.
 *
 * Granting or revoking a role evicts the user's sign-in
 * (`evictCachedUserSessions`), which clears their holdings in every process;
 * editing a role clears `rbac`. Inside a transaction nothing is cached: the
 * transaction may hold a change not yet committed.
 */

interface RoleHolding {
  roleId: string;
  scope: string;
  courseId: string | null;
  /** Epoch ms, or null for no expiry. */
  expiresAt: number | null;
}

interface RoleRules {
  ownCoursesOnly: boolean;
  /** Permission key to effect. */
  effects: Record<string, string>;
}

type RulesByRole = Record<string, RoleRules>;

const RULES_KEY = "all";
const RULES_TTL_MS = 5 * 60_000;

const roleRules = createCache<RulesByRole>({
  name: "authorization.role-rules",
  ttlMs: RULES_TTL_MS,
  maxBytes: 4 * 1024 * 1024,
});

const userHoldings = createCache<RoleHolding[]>({
  name: "authorization.user-roles",
  ttlMs: config.SESSION_AUTH_CACHE_TTL_MS,
  maxEntries: 50_000,
  maxBytes: 16 * 1024 * 1024,
});

const featureFlags = createCache<Record<string, boolean>>({
  name: "authorization.feature-flags",
  ttlMs: RULES_TTL_MS,
  maxBytes: 256 * 1024,
});

function isTransaction(database: Executor): boolean {
  return database.isTransaction;
}

async function loadRules(database: Executor): Promise<RulesByRole> {
  const rows = await repo.listRolePermissionRules(database);
  const rules: RulesByRole = {};
  for (const row of rows) {
    const role = (rules[row.role_id] ??= {
      ownCoursesOnly: Boolean(row.own_courses_only),
      effects: {},
    });
    if (!row.permission_key || !row.effect) continue;
    // A role listing the same permission twice: deny wins, as in SQL.
    if (role.effects[row.permission_key] !== "deny") {
      role.effects[row.permission_key] = row.effect;
    }
  }
  return rules;
}

async function loadHoldings(
  database: Executor,
  userId: string,
): Promise<RoleHolding[]> {
  const rows = await repo.listUserRoleHoldings(database, userId);
  return rows.map((row) => ({
    roleId: row.role_id,
    scope: row.scope_type,
    courseId: row.course_id?.toLowerCase() ?? null,
    expiresAt: row.expires_at ? row.expires_at.getTime() : null,
  }));
}

/**
 * The user's holdings and the rules for every role they hold. When a held
 * role is missing from the cached rules (created after they were read),
 * the rules are read again.
 */
async function loadAccess(
  database: Executor,
  userId: string,
): Promise<{ holdings: RoleHolding[]; rules: RulesByRole }> {
  if (isTransaction(database)) {
    const [holdings, rules] = await Promise.all([
      loadHoldings(database, userId),
      loadRules(database),
    ]);
    return { holdings, rules };
  }
  const readRules = () =>
    roleRules.fetch(RULES_KEY, () => loadRules(database), {
      tags: [cacheTags.rbac],
    });
  const [holdings, rules] = await Promise.all([
    userHoldings.fetch(
      userId.toLowerCase(),
      () => loadHoldings(database, userId),
      {
        tags: [cacheTags.user(userId), cacheTags.rbac],
      },
    ),
    readRules(),
  ]);
  if (holdings.some((holding) => !(holding.roleId in rules))) {
    roleRules.delete(RULES_KEY);
    return { holdings, rules: await readRules() };
  }
  return { holdings, rules };
}

/** The roles that apply to a check, with their rules. */
function applicableRoles(
  holdings: readonly RoleHolding[],
  rules: RulesByRole,
  context: ScopeCheckContext,
  now: number,
): RoleRules[] {
  const courseId = context.courseId?.toLowerCase() ?? null;
  const applicable: RoleRules[] = [];
  for (const holding of holdings) {
    if (holding.expiresAt !== null && holding.expiresAt <= now) continue;
    const reaches =
      holding.scope === "platform" ||
      (holding.scope === "course" &&
        courseId !== null &&
        holding.courseId === courseId);
    if (!reaches) continue;
    const role = rules[holding.roleId];
    if (!role) continue;
    if (context.excludeOwnCoursesOnlyRoles && role.ownCoursesOnly) continue;
    applicable.push(role);
  }
  return applicable;
}

/** `checkUserPermission`, decided in memory. */
export function decidePermission(
  holdings: readonly RoleHolding[],
  rules: RulesByRole,
  context: PermissionCheckContext,
  now = Date.now(),
): { allowed: boolean; reason?: string } {
  const effects = applicableRoles(holdings, rules, context, now)
    .map((role) => role.effects[context.permissionKey])
    .filter((effect) => effect !== undefined);
  if (effects.length === 0) {
    return {
      allowed: false,
      reason: "No matching role assignment grants this permission",
    };
  }
  if (effects.includes("deny")) {
    return { allowed: false, reason: "Permission explicitly denied by policy" };
  }
  if (effects.includes("allow")) return { allowed: true };
  return { allowed: false, reason: "Permission not granted" };
}

/** `getUserEffectivePermissions`, decided in memory. */
export function decideEffectivePermissions(
  holdings: readonly RoleHolding[],
  rules: RulesByRole,
  context: ScopeCheckContext,
  now = Date.now(),
): string[] {
  const allowed = new Set<string>();
  const denied = new Set<string>();
  for (const role of applicableRoles(holdings, rules, context, now)) {
    for (const [key, effect] of Object.entries(role.effects)) {
      if (effect === "deny") denied.add(key);
      else if (effect === "allow") allowed.add(key);
    }
  }
  return [...allowed].filter((key) => !denied.has(key));
}

/** Whether the user holds the permission (see `checkUserPermission`). */
export async function checkPermission(
  database: Executor,
  context: PermissionCheckContext,
): Promise<{ allowed: boolean; reason?: string }> {
  const { holdings, rules } = await loadAccess(database, context.userId);
  return decidePermission(holdings, rules, context);
}

/** What the user may do (see `getUserEffectivePermissions`). */
export async function listEffectivePermissions(
  database: Executor,
  context: ScopeCheckContext,
): Promise<string[]> {
  const { holdings, rules } = await loadAccess(database, context.userId);
  return decideEffectivePermissions(holdings, rules, context);
}

/** Whether a feature is on; one without a row is on. */
export async function isFeatureOn(
  database: Executor,
  featureKey: string,
): Promise<boolean> {
  const flags = isTransaction(database)
    ? null
    : await featureFlags.fetch(
        "all",
        async () =>
          Object.fromEntries(
            (await repo.listFeatureFlags(database)).map((row) => [
              row.feature_key,
              Boolean(row.enabled ?? true),
            ]),
          ),
        { tags: [cacheTags.rbac] },
      );
  if (!flags) return await repo.isFeatureEnabled(database, featureKey);
  return flags[featureKey] ?? true;
}
