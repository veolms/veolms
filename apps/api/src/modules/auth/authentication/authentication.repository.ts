import type { Executor } from "../shared/repository.types.ts";
import type { UserAvatarSource } from "@veolms/database";

export function findUserById(database: Executor, userId: string) {
  return database
    .selectFrom("users")
    .selectAll()
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
}

/**
 * Bulk display-name lookup for fan-out callers (quiz analytics, lists).
 * Narrow select on purpose: callers that loop findUserById per row pull the
 * full selectAll row — including avatar_data_url — once per user.
 */
export function listUserDisplayNamesByIds(
  database: Executor,
  userIds: readonly string[],
) {
  if (userIds.length === 0) {
    return Promise.resolve([] as { id: string; display_name: string }[]);
  }
  return database
    .selectFrom("users")
    .select(["id", "display_name"])
    .where("id", "in", [...userIds])
    .where("is_deleted", "=", false)
    .execute();
}

/**
 * Bulk id+email lookup for notification fan-out. Includes soft-deleted
 * users, matching findUserByIdIncludingDeleted's semantics (the per-id
 * variant the notification worker used one query at a time).
 */
export function listNotificationRecipientsByIds(
  database: Executor,
  userIds: readonly string[],
) {
  if (userIds.length === 0) {
    return Promise.resolve(
      [] as { id: string; email: string | null; isDeleted: boolean }[],
    );
  }
  return database
    .selectFrom("users")
    .select(["id", "email", "is_deleted as isDeleted"])
    .where("id", "in", [...userIds])
    .execute();
}

export function findPublicProfileByUsername(
  database: Executor,
  username: string,
) {
  return database
    .selectFrom("users")
    .select([
      "username",
      "display_name",
      "avatar_data_url",
      "bio",
      "email",
      "email_verified_at",
      "email_public",
      "phone_no",
      "phone_verified_at",
      "mobile_public",
      "linkedin_url",
      "linkedin_public",
      "github_url",
      "github_public",
      "website_url",
      "website_public",
    ])
    .where("username", "=", username)
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

/** The contact fields the verification flows read, without the whole row. */
export function findUserContactById(database: Executor, userId: string) {
  return database
    .selectFrom("users")
    .select(["id", "email", "email_verified_at"])
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
}

export function findUserAvatarUrlById(database: Executor, userId: string) {
  return database
    .selectFrom("users")
    .select("avatar_data_url")
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
}

/** Which active account, if any, owns a contact channel. */
export function findUserIdByIdentifier(
  database: Executor,
  identifier: string,
  identifierType: "email" | "phone",
) {
  return database
    .selectFrom("users")
    .select("id")
    .where(identifierType === "email" ? "email" : "phone_no", "=", identifier)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
}

/**
 * Whether a contact channel is taken, counting deactivated accounts, for
 * callers that only branch on existence and the deactivated flag.
 */
export function findUserStatusByIdentifier(
  database: Executor,
  identifier: string,
  identifierType: "email" | "phone",
) {
  return database
    .selectFrom("users")
    .select(["id", "is_deleted"])
    .where(identifierType === "email" ? "email" : "phone_no", "=", identifier)
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
  avatarDataUrl?: string | null;
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
      avatar_data_url: input.avatarDataUrl ?? null,
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

export interface InsertUserAvatarInput {
  id: string;
  userId: string;
  source: UserAvatarSource;
  storagePrefix: string;
  avatarDataUrl: string;
}

export function insertUserAvatar(
  database: Executor,
  input: InsertUserAvatarInput,
) {
  return database
    .insertInto("user_avatars")
    .values({
      id: input.id,
      user_id: input.userId,
      source: input.source,
      storage_prefix: input.storagePrefix,
      avatar_data_url: input.avatarDataUrl,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function findUserAvatarById(
  database: Executor,
  userId: string,
  avatarId: string,
) {
  return database
    .selectFrom("user_avatars")
    .selectAll()
    .where("id", "=", avatarId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
}

export function findUserAvatarBySource(
  database: Executor,
  userId: string,
  source: Exclude<UserAvatarSource, "upload">,
) {
  return database
    .selectFrom("user_avatars")
    .selectAll()
    .where("user_id", "=", userId)
    .where("source", "=", source)
    .executeTakeFirst();
}

export function listUserAvatars(database: Executor, userId: string) {
  return database
    .selectFrom("user_avatars")
    .select(["id", "source", "storage_prefix", "avatar_data_url"])
    .where("user_id", "=", userId)
    .orderBy("last_used_at", "desc")
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .execute();
}

export function touchUserAvatar(
  database: Executor,
  userId: string,
  avatarId: string,
) {
  return database
    .updateTable("user_avatars")
    .set({ last_used_at: new Date() })
    .where("id", "=", avatarId)
    .where("user_id", "=", userId)
    .returningAll()
    .executeTakeFirst();
}

export function updateUserAvatar(
  database: Executor,
  userId: string,
  avatarId: string,
  avatarDataUrl: string,
) {
  return database
    .updateTable("user_avatars")
    .set({ avatar_data_url: avatarDataUrl, last_used_at: new Date() })
    .where("id", "=", avatarId)
    .where("user_id", "=", userId)
    .returningAll()
    .executeTakeFirst();
}

export function deleteUserUploadedAvatars(database: Executor, userId: string) {
  return database
    .deleteFrom("user_avatars")
    .where("user_id", "=", userId)
    .where("source", "=", "upload")
    .returningAll()
    .execute();
}

export function deleteUserAvatarsById(
  database: Executor,
  userId: string,
  avatarIds: readonly string[],
) {
  if (avatarIds.length === 0) return Promise.resolve([]);

  return database
    .deleteFrom("user_avatars")
    .where("user_id", "=", userId)
    .where("source", "=", "upload")
    .where("id", "in", avatarIds)
    .returningAll()
    .execute();
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
    .returning("id")
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
    .returning("id")
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
