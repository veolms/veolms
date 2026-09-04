import type { AuthMenuNode } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";

export function findUserById(database: Executor, userId: string) {
  return database
    .selectFrom("users")
    .selectAll()
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
}

/** Used only by durable notification delivery after an account is deactivated. */
export function findUserByIdIncludingDeleted(
  database: Executor,
  userId: string,
) {
  return database
    .selectFrom("users")
    .selectAll()
    .where("id", "=", userId)
    .executeTakeFirst();
}

/** Looks a user up by whichever contact channel the flow was started with. */
export function findUserByIdentifier(
  database: Executor,
  identifier: string,
  identifierType: "email" | "phone",
) {
  return database
    .selectFrom("users")
    .selectAll()
    .where(identifierType === "email" ? "email" : "phone_no", "=", identifier)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
}

/** Includes deactivated rows so registration can return a controlled conflict. */
export function findUserByIdentifierIncludingDeleted(
  database: Executor,
  identifier: string,
  identifierType: "email" | "phone",
) {
  return database
    .selectFrom("users")
    .selectAll()
    .where(identifierType === "email" ? "email" : "phone_no", "=", identifier)
    .executeTakeFirst();
}

export function findUserByEmail(database: Executor, email: string) {
  return database
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
}

/** Only returns an account whose email ownership was already proven. */
export function findVerifiedUserByEmail(database: Executor, email: string) {
  return database
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email)
    .where("email_verified_at", "is not", null)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
}

export async function usernameExists(
  database: Executor,
  username: string,
  excludingUserId?: string,
): Promise<boolean> {
  let query = database
    .selectFrom("users")
    .select("id")
    .where("username", "=", username);

  if (excludingUserId) {
    query = query.where("id", "!=", excludingUserId);
  }

  const row = await query.executeTakeFirst();

  return Boolean(row);
}

export async function countUsers(database: Executor): Promise<number> {
  const row = await database
    .selectFrom("users")
    .select((eb) => eb.fn.count<string>("id").as("count"))
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

export interface InsertUserInput {
  id: string;
  email: string | null;
  phoneNo: string | null;
  username: string;
  displayName: string;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  mfaMandatory: boolean;
}

export async function insertUser(
  database: Executor,
  input: InsertUserInput,
): Promise<void> {
  await database
    .insertInto("users")
    .values({
      id: input.id,
      email: input.email,
      phone_no: input.phoneNo,
      username: input.username,
      display_name: input.displayName,
      email_verified_at: input.emailVerifiedAt,
      phone_verified_at: input.phoneVerifiedAt,
      mfa_mandatory: input.mfaMandatory,
    })
    .execute();
}

/** Atomically changes an active account into a deactivated account. */
export async function deactivateUser(database: Executor, userId: string) {
  return database
    .updateTable("users")
    .set({ is_deleted: true, updated_at: new Date() })
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .returningAll()
    .executeTakeFirst();
}

export interface UpdateUserProfileInput {
  username?: string;
  displayName?: string;
  avatarDataUrl?: string | null;
  bio?: string | null;
  emailPublic?: boolean;
  mobilePublic?: boolean;
  linkedinUrl?: string | null;
  linkedinPublic?: boolean;
  githubUrl?: string | null;
  githubPublic?: boolean;
  websiteUrl?: string | null;
  websitePublic?: boolean;
}

export async function updateUserProfile(
  database: Executor,
  userId: string,
  input: UpdateUserProfileInput,
) {
  const updates = {
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.displayName !== undefined
      ? { display_name: input.displayName }
      : {}),
    ...(input.avatarDataUrl !== undefined
      ? { avatar_data_url: input.avatarDataUrl }
      : {}),
    ...(input.bio !== undefined ? { bio: input.bio } : {}),
    ...(input.emailPublic !== undefined
      ? { email_public: input.emailPublic }
      : {}),
    ...(input.mobilePublic !== undefined
      ? { mobile_public: input.mobilePublic }
      : {}),
    ...(input.linkedinUrl !== undefined
      ? { linkedin_url: input.linkedinUrl }
      : {}),
    ...(input.linkedinPublic !== undefined
      ? { linkedin_public: input.linkedinPublic }
      : {}),
    ...(input.githubUrl !== undefined ? { github_url: input.githubUrl } : {}),
    ...(input.githubPublic !== undefined
      ? { github_public: input.githubPublic }
      : {}),
    ...(input.websiteUrl !== undefined
      ? { website_url: input.websiteUrl }
      : {}),
    ...(input.websitePublic !== undefined
      ? { website_public: input.websitePublic }
      : {}),
    updated_at: new Date(),
  };

  return database
    .updateTable("users")
    .set(updates)
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .returningAll()
    .executeTakeFirst();
}

export async function updateUserPhoneNumber(
  database: Executor,
  userId: string,
  phoneNo: string,
  verifiedAt: Date,
) {
  return database
    .updateTable("users")
    .set({
      phone_no: phoneNo,
      phone_verified_at: verifiedAt,
      // A newly verified number must be explicitly published again.
      mobile_public: false,
      updated_at: new Date(),
    })
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .returningAll()
    .executeTakeFirst();
}

export async function markUserEmailVerified(
  database: Executor,
  userId: string,
  verifiedAt: Date,
) {
  return database
    .updateTable("users")
    .set({
      email_verified_at: verifiedAt,
      updated_at: new Date(),
    })
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .returningAll()
    .executeTakeFirst();
}

export async function listUserRoleNames(
  database: Executor,
  userId: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("user_roles")
    .innerJoin("roles", "roles.id", "user_roles.role_id")
    .select("roles.name")
    .where("user_roles.user_id", "=", userId)
    .execute();

  return rows.map((row) => row.name);
}

export async function listUserPermissions(
  database: Executor,
  userId: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("user_roles")
    .innerJoin("permissions", "permissions.role_id", "user_roles.role_id")
    .innerJoin("menus", "menus.id", "permissions.menu_id")
    .select([
      "menus.route_link",
      "permissions.can_create",
      "permissions.can_read",
      "permissions.can_update",
      "permissions.can_delete",
    ])
    .where("user_roles.user_id", "=", userId)
    .execute();

  const permissions = new Set<string>();
  for (const row of rows) {
    const baseRoute = row.route_link.replace(/^\//, "") || "home";
    if (row.can_create) permissions.add(`${baseRoute}:create`);
    if (row.can_read) permissions.add(`${baseRoute}:read`);
    if (row.can_update) permissions.add(`${baseRoute}:update`);
    if (row.can_delete) permissions.add(`${baseRoute}:delete`);
  }

  return Array.from(permissions);
}

export async function listUserMenus(
  database: Executor,
  userId: string,
): Promise<AuthMenuNode[]> {
  const rows = await database
    .selectFrom("user_roles")
    .innerJoin("permissions", "permissions.role_id", "user_roles.role_id")
    .innerJoin("menus", "menus.id", "permissions.menu_id")
    .select([
      "menus.id",
      "menus.parent_id",
      "menus.label",
      "menus.route_link",
      "menus.icon",
      "menus.expanded",
      "menus.check_list",
      "menus.is_both",
      "permissions.can_create",
      "permissions.can_read",
      "permissions.can_update",
      "permissions.can_delete",
    ])
    .where("user_roles.user_id", "=", userId)
    // A joined permission query has no guaranteed row order. Keep the menu
    // payload stable so the shell cannot appear to change between requests.
    .orderBy("menus.created_at", "asc")
    .orderBy("menus.id", "asc")
    .execute();

  const menuMap = new Map<string, AuthMenuNode>();
  for (const row of rows) {
    const existing = menuMap.get(row.id);
    if (existing) {
      existing.permissions.canCreate =
        existing.permissions.canCreate || Boolean(row.can_create);
      existing.permissions.canRead =
        existing.permissions.canRead || Boolean(row.can_read);
      existing.permissions.canUpdate =
        existing.permissions.canUpdate || Boolean(row.can_update);
      existing.permissions.canDelete =
        existing.permissions.canDelete || Boolean(row.can_delete);
    } else {
      menuMap.set(row.id, {
        id: row.id,
        parentId: row.parent_id,
        label: row.label,
        routeLink: row.route_link,
        icon: row.icon,
        expanded: Boolean(row.expanded),
        checkList: row.check_list,
        isBoth: Boolean(row.is_both),
        permissions: {
          canCreate: Boolean(row.can_create),
          canRead: Boolean(row.can_read),
          canUpdate: Boolean(row.can_update),
          canDelete: Boolean(row.can_delete),
        },
      });
    }
  }

  const accessibleMenus = Array.from(menuMap.values()).filter(
    (m) =>
      m.permissions.canRead ||
      m.permissions.canCreate ||
      m.permissions.canUpdate ||
      m.permissions.canDelete,
  );

  const rootMenus: AuthMenuNode[] = [];
  const accessibleMap = new Map(accessibleMenus.map((m) => [m.id, m]));

  for (const menu of accessibleMenus) {
    if (menu.parentId && accessibleMap.has(menu.parentId)) {
      const parent = accessibleMap.get(menu.parentId)!;
      parent.children = parent.children ?? [];
      parent.children.push(menu);
    } else {
      rootMenus.push(menu);
    }
  }

  return rootMenus;
}

export async function findRoleIdByName(
  database: Executor,
  name: string,
): Promise<string | undefined> {
  const row = await database
    .selectFrom("roles")
    .select("id")
    .where("name", "=", name)
    .executeTakeFirst();

  return row?.id;
}

export async function assignRole(
  database: Executor,
  userId: string,
  roleId: string,
): Promise<void> {
  await database
    .insertInto("user_roles")
    .values({ user_id: userId, role_id: roleId })
    .execute();
}
