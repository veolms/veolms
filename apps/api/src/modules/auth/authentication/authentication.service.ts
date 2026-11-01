import crypto from "node:crypto";

import type { Database, DatabaseExecutor } from "@veolms/database";
import type {
  AvatarUploadCompleteRequest,
  AvatarUploadPresignRequest,
  ProfileUpdateRequest,
} from "@veolms/contracts";
import {
  buildDicebearSvgUrl,
  DEFAULT_AVATAR_STYLE,
  DICEBEAR_BASE_URL,
  PUBLIC_PROFILE_USERNAME_MAX_LENGTH,
  PUBLIC_PROFILE_USERNAME_MIN_LENGTH,
} from "@veolms/contracts";
import type { S3StorageService } from "@veolms/storage";
import type { Kysely } from "kysely";

import { AppError } from "../../../lib/errors.ts";
import {
  ADMIN_ROLE,
  DISPLAY_NAME_MAX_LENGTH,
  STUDENT_ROLE,
  USERNAME_SUFFIX_ATTEMPTS,
} from "../shared/auth.constants.ts";
import type { IdentifierType, SessionUser } from "../shared/auth.types.ts";
import type { CreateUserInput } from "./authentication.types.ts";
import * as oauthRepository from "../oauth/oauth.repository.ts";
import * as userRepository from "./authentication.repository.ts";
import type { OtpService } from "../otp/otp.service.ts";
import type { SessionService } from "../session/session.service.ts";
import { normalizePhoneIdentifier } from "../shared/auth.utils.ts";
import { evictCachedUserSessions } from "../shared/session-auth-cache.ts";
import {
  AVATAR_CONTENT_TYPES,
  AVATAR_UPLOAD_MAX_BYTES,
  avatarCdnUrl,
  avatarOriginalKey,
  avatarStoragePrefix,
  avatarSrcSetFromUrl,
  detectImageContentType,
  displayAvatarUrl,
  isStoredAvatarUrl,
  removeAvatarVariants,
  removeOtherAvatarOriginals,
  removeAvatarPrefix,
  storeAvatarFromUrl,
} from "../../avatars/index.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";
import { type SessionLocation } from "../shared/request-location.ts";

const AVATAR_VALIDATION_RANGE = "bytes=0-31";
const USER_AVATAR_RETENTION_LIMIT = 2;
const DICEBEAR_ORIGIN = new URL(DICEBEAR_BASE_URL).origin;
/** "_" and three digits, appended when the plain name is taken. */
const USERNAME_SUFFIX_LENGTH = 4;

/**
 * First path segments the web app and its hosting serve themselves. A profile
 * lives at /<username> and these addresses win over it, so a profile with one
 * of these names could never be opened and its menu link led to another page.
 * Keep in step with the web's routes (packages/web-core/src/routes).
 */
const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "home",
  "dashboard",
  "courses",
  "wishlist",
  "students",
  "reviews",
  "quizzes",
  "discussions",
  "analytics",
  "orders",
  "messages",
  "purchase-history",
  "progress",
  "notifications",
  "settings",
  "coupons",
  "home-page",
  "logout",
  "login",
  "register",
  "mfa-setup",
  "auth",
  "explore-courses",
  "learn",
  "cdn",
  "v1",
  "static",
  "api",
]);

function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.trim().toLowerCase());
}

async function readObjectPrefix(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let remaining = maxBytes;

  for await (const chunk of body) {
    if (remaining <= 0) break;
    const bytes = Buffer.from(chunk).subarray(0, remaining);
    if (bytes.length > 0) {
      chunks.push(bytes);
      remaining -= bytes.length;
    }
  }

  return Buffer.concat(chunks);
}

export interface AuthServiceOptions {
  database: Kysely<Database>;
  otpService?: OtpService;
  sessionService?: SessionService;
  /** Omitted by the read-only callers (notification worker, course lookups)
   * that never create a user or touch an avatar. */
  storage?: S3StorageService;
}

export function createAuthService({
  database,
  otpService,
  sessionService,
  storage,
}: AuthServiceOptions) {
  const outbox = createOutboxService();

  /** DiceBear needs no fetch at all — it's served straight from DiceBear's
   * own CDN, so this is just the deterministic default URL for a new user. */
  function defaultAvatarUrl(seed: string): string {
    return buildDicebearSvgUrl(DEFAULT_AVATAR_STYLE, seed);
  }

  function requireAvatarStorage(): S3StorageService {
    if (!storage) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires storage to upload an avatar photo.",
      );
    }
    return storage;
  }

  function validateAvatarUpload(input: {
    contentType: string;
    fileSize: number;
  }): void {
    if (!AVATAR_CONTENT_TYPES.has(input.contentType)) {
      throw new AppError(
        400,
        "INVALID_AVATAR_FILE",
        "Choose a JPEG, PNG, WebP, or GIF image.",
      );
    }
    if (input.fileSize > AVATAR_UPLOAD_MAX_BYTES) {
      throw new AppError(
        413,
        "AVATAR_FILE_TOO_LARGE",
        "The avatar file must be 2 MB or smaller.",
      );
    }
  }

  function findUserById(userId: string) {
    return userRepository.findUserById(database, userId);
  }

  function findUserByIdForNotification(userId: string) {
    return userRepository.findUserByIdIncludingDeleted(database, userId);
  }

  /** Bulk display-name lookup — one query instead of findUserById per row. */
  function listUserDisplayNamesByIds(userIds: readonly string[]) {
    return userRepository.listUserDisplayNamesByIds(database, userIds);
  }

  /** Bulk name and email lookup, for staff lists that search by either. */
  function listUserNamesAndEmailsByIds(userIds: readonly string[]) {
    return userRepository.listUserNamesAndEmailsByIds(database, userIds);
  }

  /** Name, username and avatar of each user, for lists that show people. */
  function listUserCardsByIds(userIds: readonly string[]) {
    return userRepository.listUserCardsByIds(database, userIds);
  }

  /** The same of one user, found by their username. */
  function findUserCardByUsername(username: string) {
    return userRepository.findUserCardByUsername(
      database,
      username.trim().toLowerCase(),
    );
  }

  /** Bulk notification-recipient lookup (includes soft-deleted users). */
  function listNotificationRecipientsByIds(userIds: readonly string[]) {
    return userRepository.listNotificationRecipientsByIds(database, userIds);
  }

  async function getPublicProfile(username: string) {
    const user = await userRepository.findPublicProfileByUsername(
      database,
      username.trim().toLowerCase(),
    );
    if (!user) {
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        "This profile isn't available.",
      );
    }
    return user;
  }

  function findUserByIdentifierIncludingDeleted(
    identifier: string,
    identifierType: IdentifierType,
  ) {
    return userRepository.findUserByIdentifierIncludingDeleted(
      database,
      identifier,
      identifierType,
    );
  }

  function findVerifiedUserByEmail(email: string) {
    return userRepository.findVerifiedUserByEmail(database, email);
  }

  function findUserByOauthAccountIncludingDeleted(
    provider: string,
    providerUserId: string,
  ) {
    return oauthRepository.findUserByOauthAccountIncludingDeleted(
      database,
      provider,
      providerUserId,
    );
  }

  function oauthAccountExists(provider: string, providerUserId: string) {
    return oauthRepository.oauthAccountExists(
      database,
      provider,
      providerUserId,
    );
  }

  function linkOauthAccount(input: {
    userId: string;
    provider: string;
    providerUserId: string;
  }): Promise<void> {
    return oauthRepository.insertOauthAccount(database, {
      id: crypto.randomUUID(),
      ...input,
    });
  }

  async function countUsers(): Promise<number> {
    return userRepository.countUsers(database);
  }

  async function usernameExists(username: string): Promise<boolean> {
    return userRepository.usernameExists(database, username);
  }

  const avatarMutationLocks = new Map<string, Promise<unknown>>();

  async function withAvatarLock<T>(
    userId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = avatarMutationLocks.get(userId) ?? Promise.resolve();
    let resolveCurrent: () => void;
    const current = new Promise<void>((resolve) => {
      resolveCurrent = resolve;
    });
    const chain = previous.then(
      () => current,
      () => current,
    );
    avatarMutationLocks.set(userId, chain);

    try {
      await previous.catch(() => {});
      return await fn();
    } finally {
      resolveCurrent!();
      if (avatarMutationLocks.get(userId) === chain) {
        avatarMutationLocks.delete(userId);
      }
    }
  }

  async function withAvatarDatabaseLock<T>(
    userId: string,
    fn: (executor: DatabaseExecutor) => Promise<T>,
  ): Promise<T> {
    const result = await database.transaction().execute(async (trx) => {
      await userRepository.lockUserAvatar(trx, userId);
      return fn(trx);
    });
    // Every avatar change is saved through here. See forgetCachedAccount.
    forgetCachedAccount(userId);
    return result;
  }

  /**
   * Drops the account's cached sign-in details once a change to them has
   * been saved. `/auth/me` answers from that cache, so without this it kept
   * returning the old name, photo, number or verified state until the entry
   * expired, in the session that made the change and in the account's other
   * sessions alike. Called after the write has committed: dropped any
   * sooner, a request arriving in between would cache the old row again.
   */
  function forgetCachedAccount(userId: string): void {
    evictCachedUserSessions(userId);
  }

  /**
   * A profile update may only point the avatar at an address this app
   * produces: a DiceBear avatar, or one of the caller's own stored photos.
   * Anything else would be handed to other people's browsers as an image
   * address of the caller's choosing.
   */
  function isAcceptedAvatarUrl(userId: string, avatarUrl: string): boolean {
    try {
      const url = new URL(avatarUrl);
      if (url.protocol === "https:" && url.origin === DICEBEAR_ORIGIN) {
        return true;
      }
    } catch {
      return false;
    }

    const ownAvatarsUrl = storage?.getPublicObjectUrl(
      avatarStoragePrefix(userId),
    );
    return Boolean(
      ownAvatarsUrl &&
      isStoredAvatarUrl(avatarUrl) &&
      (avatarUrl.startsWith(`${ownAvatarsUrl}/`) ||
        avatarUrl.startsWith(`${ownAvatarsUrl}--`)),
    );
  }

  async function updateProfile(userId: string, input: ProfileUpdateRequest) {
    const username = input.username?.trim().toLowerCase();
    const effectiveInput = input;
    if (
      username &&
      (await userRepository.usernameExists(database, username, userId))
    ) {
      throw new AppError(400, "USERNAME_TAKEN", "Username is already taken.");
    }

    const performUpdate = async (executor: DatabaseExecutor = database) => {
      const currentUser = await userRepository.findUserById(executor, userId);
      if (!currentUser) {
        throw new AppError(
          404,
          "USER_NOT_FOUND",
          "User account was not found.",
        );
      }

      // Only a change to a reserved name is refused. Someone who already has
      // one sends it back with every profile save and must still be able to
      // save their other fields.
      if (
        username &&
        username !== currentUser.username.toLowerCase() &&
        isReservedUsername(username)
      ) {
        throw new AppError(
          400,
          "USERNAME_TAKEN",
          "That username isn't available.",
        );
      }

      // Re-sending the avatar already on the account is always accepted, so
      // an older stored value never blocks an unrelated profile save.
      if (
        typeof effectiveInput.avatarDataUrl === "string" &&
        effectiveInput.avatarDataUrl !== currentUser.avatar_data_url &&
        !isAcceptedAvatarUrl(userId, effectiveInput.avatarDataUrl)
      ) {
        throw new AppError(
          400,
          "INVALID_AVATAR_URL",
          "Choose a generated avatar or upload a photo.",
        );
      }

      const linkedinUrl =
        effectiveInput.linkedinUrl !== undefined
          ? effectiveInput.linkedinUrl?.trim() || null
          : currentUser.linkedin_url;
      const githubUrl =
        effectiveInput.githubUrl !== undefined
          ? effectiveInput.githubUrl?.trim() || null
          : currentUser.github_url;
      const websiteUrl =
        effectiveInput.websiteUrl !== undefined
          ? effectiveInput.websiteUrl?.trim() || null
          : currentUser.website_url;

      const user = await userRepository.updateUserProfile(executor, userId, {
        ...(username ? { username } : {}),
        ...(effectiveInput.displayName !== undefined
          ? { displayName: effectiveInput.displayName.trim() }
          : {}),
        ...(effectiveInput.avatarDataUrl !== undefined
          ? { avatarDataUrl: effectiveInput.avatarDataUrl }
          : {}),
        ...(effectiveInput.bio !== undefined
          ? { bio: effectiveInput.bio?.trim() || null }
          : {}),
        ...(effectiveInput.emailPublic !== undefined
          ? {
              emailPublic: Boolean(
                effectiveInput.emailPublic &&
                currentUser.email &&
                currentUser.email_verified_at,
              ),
            }
          : {}),
        ...(effectiveInput.mobilePublic !== undefined
          ? {
              // A phone number is only publishable after the exact number on the
              // account has completed the verification flow.
              mobilePublic: Boolean(
                effectiveInput.mobilePublic &&
                currentUser.phone_no &&
                currentUser.phone_verified_at,
              ),
            }
          : {}),
        ...(effectiveInput.linkedinUrl !== undefined ? { linkedinUrl } : {}),
        ...(effectiveInput.linkedinPublic !== undefined ||
        effectiveInput.linkedinUrl !== undefined
          ? {
              linkedinPublic: Boolean(
                (effectiveInput.linkedinPublic ??
                  currentUser.linkedin_public) &&
                linkedinUrl,
              ),
            }
          : {}),
        ...(effectiveInput.githubUrl !== undefined ? { githubUrl } : {}),
        ...(effectiveInput.githubPublic !== undefined ||
        effectiveInput.githubUrl !== undefined
          ? {
              githubPublic: Boolean(
                (effectiveInput.githubPublic ?? currentUser.github_public) &&
                githubUrl,
              ),
            }
          : {}),
        ...(effectiveInput.websiteUrl !== undefined ? { websiteUrl } : {}),
        ...(effectiveInput.websitePublic !== undefined ||
        effectiveInput.websiteUrl !== undefined
          ? {
              websitePublic: Boolean(
                (effectiveInput.websitePublic ?? currentUser.website_public) &&
                websiteUrl,
              ),
            }
          : {}),
      });

      if (!user) {
        throw new AppError(
          404,
          "USER_NOT_FOUND",
          "User account was not found.",
        );
      }

      const roles = await getUserRoles(userId);
      return { ...user, roles };
    };

    if (input.avatarDataUrl !== undefined) {
      return withAvatarLock(userId, () =>
        withAvatarDatabaseLock(userId, (trx) => performUpdate(trx)),
      );
    }
    const updated = await performUpdate();
    forgetCachedAccount(userId);
    return updated;
  }

  /**
   * Ensures a provider-owned photo is tracked without replacing a user's
   * manually selected avatar. This also backfills the protected provider row
   * for accounts that existed before the avatar library migration.
   */
  async function syncProviderAvatar(
    userId: string,
    source: "google" | "github",
    sourceUrl?: string,
  ): Promise<void> {
    if (!storage || !sourceUrl || source !== "google") return;
    const avatarStorage = storage;

    await withAvatarLock(userId, async () => {
      // Refresh the provider snapshot on every successful OAuth login. Older
      // accounts may have a row whose object was never uploaded (or whose CDN
      // object was later removed), and skipping an existing row would make
      // those photos impossible to recover. The active avatar is only changed
      // below when the user was already using that provider snapshot.
      const avatarDataUrl = await storeAvatarFromUrl(
        avatarStorage,
        userId,
        sourceUrl,
        source,
      );
      if (!avatarDataUrl) return;

      await withAvatarDatabaseLock(userId, async (trx) => {
        const currentUser = await userRepository.findUserById(trx, userId);
        if (!currentUser) return;

        const existingAvatar = await userRepository.findUserAvatarBySource(
          trx,
          userId,
          source,
        );
        const previousProviderUrl = existingAvatar?.avatar_data_url;

        if (existingAvatar) {
          await userRepository.updateUserAvatar(
            trx,
            userId,
            existingAvatar.id,
            avatarDataUrl,
          );
        } else {
          await userRepository.insertUserAvatar(trx, {
            id: crypto.randomUUID(),
            userId,
            source,
            storagePrefix: avatarStoragePrefix(userId, source),
            avatarDataUrl,
          });
        }

        const isCurrentProviderAvatar =
          currentUser.avatar_data_url === (previousProviderUrl ?? sourceUrl);
        if (isCurrentProviderAvatar) {
          await userRepository.updateUserProfile(trx, userId, {
            avatarDataUrl,
          });
        }
      });
    });
  }

  async function sendPhoneVerificationOtp(
    userId: string,
    phoneNo: string,
    requesterIp?: string | null,
  ): Promise<void> {
    // Same canonical form login and registration use, so a number verified
    // from the profile can be used to sign in afterwards.
    const normalizedPhoneNo = normalizePhoneIdentifier(phoneNo);
    if (normalizedPhoneNo.length < 8) {
      throw new AppError(
        400,
        "INVALID_PHONE_NUMBER",
        "Enter a valid mobile number.",
      );
    }

    const currentUser = await userRepository.findUserContactById(
      database,
      userId,
    );
    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }

    if (!otpService) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires otpService for phone verification.",
      );
    }

    const existingUser = await userRepository.findUserIdByIdentifier(
      database,
      normalizedPhoneNo,
      "phone",
    );
    if (existingUser && existingUser.id !== userId) {
      // The owner of the account is told the number is taken, which they
      // need to know. It is counted against their daily allowance first, as
      // a sent code would be: a refusal that cost nothing let one account
      // test any quantity of numbers for membership.
      await otpService.recordRefusedSend(
        normalizedPhoneNo,
        "phone",
        "phone_verification",
        { userId, ip: requesterIp },
        // Charged to the asker only, never to the number's owner.
        { countAgainstDestination: false },
      );
      throw new AppError(
        409,
        "PHONE_TAKEN",
        "Already linked to another account.",
      );
    }

    await otpService.sendPhoneVerificationOtp(normalizedPhoneNo, {
      userId,
      ip: requesterIp,
    });
  }

  async function sendEmailVerificationOtp(
    userId: string,
    requesterIp?: string | null,
  ): Promise<void> {
    const currentUser = await userRepository.findUserContactById(
      database,
      userId,
    );
    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }
    if (!currentUser.email) {
      throw new AppError(
        400,
        "EMAIL_NOT_FOUND",
        "Add an email address before verifying it.",
      );
    }
    if (currentUser.email_verified_at) return;
    if (!otpService) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires otpService for email verification.",
      );
    }

    await otpService.sendEmailVerificationOtp(currentUser.email, {
      userId,
      ip: requesterIp,
    });
  }

  async function verifyEmail(userId: string, code: string): Promise<void> {
    const currentUser = await userRepository.findUserContactById(
      database,
      userId,
    );
    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }
    if (!currentUser.email) {
      throw new AppError(
        400,
        "EMAIL_NOT_FOUND",
        "Add an email address before verifying it.",
      );
    }
    if (currentUser.email_verified_at) return;
    if (!otpService) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires otpService for email verification.",
      );
    }

    await otpService.verifyAndConsumeOtp(
      currentUser.email,
      "email",
      "email_verification",
      code,
    );
    const updatedUser = await userRepository.markUserEmailVerified(
      database,
      userId,
      new Date(),
    );
    if (!updatedUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }
    forgetCachedAccount(userId);
  }

  async function verifyPhoneNumber(
    userId: string,
    phoneNo: string,
    code: string,
  ): Promise<void> {
    const normalizedPhoneNo = normalizePhoneIdentifier(phoneNo);
    if (normalizedPhoneNo.length < 8) {
      throw new AppError(
        400,
        "INVALID_PHONE_NUMBER",
        "Enter a valid mobile number.",
      );
    }

    const currentUser = await userRepository.findUserContactById(
      database,
      userId,
    );
    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }

    if (!otpService) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires otpService for phone verification.",
      );
    }

    // The code is checked before anything is said about the number. Asked
    // the other way round, this answered "taken" or "not taken" for any
    // number and any made-up code. No code is ever sent for a taken number,
    // so a caller without one learns nothing here.
    await otpService.assertOtpMatches(
      normalizedPhoneNo,
      "phone",
      "phone_verification",
      code,
    );

    const existingUser = await userRepository.findUserIdByIdentifier(
      database,
      normalizedPhoneNo,
      "phone",
    );
    if (existingUser && existingUser.id !== userId) {
      throw new AppError(
        409,
        "PHONE_TAKEN",
        "Already linked to another account.",
      );
    }

    await otpService.verifyAndConsumeOtp(
      normalizedPhoneNo,
      "phone",
      "phone_verification",
      code,
    );

    const updatedUser = await userRepository.updateUserPhoneNumber(
      database,
      userId,
      normalizedPhoneNo,
      new Date(),
    );
    if (!updatedUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }
    forgetCachedAccount(userId);
  }

  /**
   * An admin replaces a learner's email or phone number, or removes the
   * number (the email is required). Only what changed is written, and a
   * changed channel is saved unverified: the learner confirms it by code,
   * as when they change it themselves. The caller checks the admin role.
   */
  async function updateContactAsAdmin(
    userId: string,
    input: { email: string; phoneNo: string | null },
  ): Promise<{ email: string; phoneNo: string | null }> {
    const currentUser = await userRepository.findUserById(database, userId);
    if (!currentUser || currentUser.is_deleted) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }

    const email = input.email.trim().toLowerCase();
    const phoneNo = input.phoneNo?.trim()
      ? normalizePhoneIdentifier(input.phoneNo)
      : null;
    if (phoneNo !== null && phoneNo.length < 8) {
      throw new AppError(
        400,
        "INVALID_PHONE_NUMBER",
        "Enter a valid mobile number.",
      );
    }

    const emailChanged = email !== currentUser.email;
    const phoneChanged = phoneNo !== currentUser.phone_no;
    if (!emailChanged && !phoneChanged) return { email, phoneNo };

    // Deactivated accounts keep their email and number (both are unique
    // columns), so they count as taken too.
    if (emailChanged) {
      const owner = await userRepository.findUserStatusByIdentifier(
        database,
        email,
        "email",
      );
      if (owner && owner.id !== userId) {
        throw new AppError(
          409,
          "EMAIL_TAKEN",
          "This email is already used by another account.",
        );
      }
    }
    if (phoneChanged && phoneNo !== null) {
      const owner = await userRepository.findUserStatusByIdentifier(
        database,
        phoneNo,
        "phone",
      );
      if (owner && owner.id !== userId) {
        throw new AppError(
          409,
          "PHONE_TAKEN",
          "This phone number is already used by another account.",
        );
      }
    }

    let updated;
    try {
      updated = await userRepository.updateUserContact(database, userId, {
        ...(emailChanged ? { email } : {}),
        ...(phoneChanged ? { phoneNo } : {}),
      });
    } catch (error) {
      // Another account took the email or number between the check above
      // and this write.
      const constraint =
        (error as { code?: unknown; constraint?: unknown }).code === "23505"
          ? String((error as { constraint?: unknown }).constraint ?? "")
          : null;
      if (constraint === null) throw error;
      throw constraint.includes("phone")
        ? new AppError(
            409,
            "PHONE_TAKEN",
            "This phone number is already used by another account.",
          )
        : new AppError(
            409,
            "EMAIL_TAKEN",
            "This email is already used by another account.",
          );
    }
    if (!updated) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }
    forgetCachedAccount(userId);
    return { email: updated.email ?? email, phoneNo: updated.phone_no };
  }

  async function deactivateAccount(userId: string): Promise<void> {
    if (!sessionService) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires sessionService for account deactivation.",
      );
    }

    await database.transaction().execute(async (transaction) => {
      const user = await userRepository.deactivateUser(transaction, userId);
      if (!user) {
        throw new AppError(
          404,
          "USER_NOT_FOUND",
          "User account was not found or is already deactivated.",
        );
      }

      await sessionService.revokeAllSessions(userId, transaction);

      // Keyed on this deactivation, not on the account. Keyed on the
      // account alone, the notice went out the first time only: an account
      // that had been deactivated and brought back was deactivated again
      // with no email, because the event counted as already sent.
      await outbox.publish(transaction, {
        type: "auth.account_deactivated",
        version: 1,
        dedupeKey: `auth.account_deactivated:${userId}:${user.updated_at.toISOString()}`,
        occurredAt: new Date(),
        payload: { recipientUserId: userId },
      });
    });
    // The sessions were dropped from the cache inside the transaction. A
    // request arriving before the commit can have cached one again, so they
    // are dropped once more now that the deactivation is saved.
    forgetCachedAccount(userId);
  }

  async function getUserRoles(userId: string): Promise<string[]> {
    return userRepository.listUserRoleNames(database, userId);
  }

  async function login(input: {
    identifier: string;
    identifierType: IdentifierType;
    code: string;
    request: {
      ip: string;
      userAgent: string | null;
      existingSessionToken?: string | null;
      location?: SessionLocation | null;
    };
  }) {
    if (!otpService || !sessionService) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires otpService and sessionService for login.",
      );
    }

    const user = await findUserByIdentifierIncludingDeleted(
      input.identifier,
      input.identifierType,
    );

    // Nothing below says whether the identifier has an account until the
    // caller has proven the code that was sent to it. A wrong code gets the
    // same answer in every branch, so the answers cannot be used to list
    // accounts. The codes are only checked here, not consumed: sign-up
    // consumes its own, and the refused accounts never sign in.
    if (!user) {
      await otpService.assertOtpMatches(
        input.identifier,
        input.identifierType,
        input.identifierType === "email"
          ? "email_verification"
          : "phone_verification",
        input.code,
        { failureStatus: 401 },
      );
      throw new AppError(
        400,
        "REGISTRATION_REQUIRED",
        "Account does not exist. Please register first.",
      );
    }

    if (user.is_deleted) {
      await otpService.assertOtpMatches(
        input.identifier,
        input.identifierType,
        "login",
        input.code,
      );
      throw new AppError(
        403,
        "ACCOUNT_DEACTIVATED",
        "This account has been deactivated.",
      );
    }

    // A number nobody confirmed (the one typed during platform setup) is not
    // proof of ownership: whoever holds it would receive the code. It cannot
    // sign in until the owner confirms it from their profile. An account
    // with no confirmed email is left alone: its number is the channel it
    // was opened with, and it has no other way in.
    if (
      input.identifierType === "phone" &&
      !user.phone_verified_at &&
      user.email_verified_at
    ) {
      await otpService.assertOtpMatches(
        input.identifier,
        input.identifierType,
        "login",
        input.code,
      );
      throw new AppError(
        403,
        "PHONE_NOT_VERIFIED",
        "This mobile number has not been confirmed yet. Sign in with your email, then confirm the number in Settings.",
      );
    }

    // The read-only prerequisites of the session do not depend on the OTP,
    // so they load while the code is being consumed. Nothing is written for
    // the session until the OTP has been consumed: a rejected code fails
    // here and the prerequisites are simply discarded.
    const [, prerequisites] = await Promise.all([
      otpService.verifyAndConsumeOtp(
        input.identifier,
        input.identifierType,
        "login",
        input.code,
      ),
      sessionService.loadSessionPrerequisites(
        user.id,
        input.request.existingSessionToken,
      ),
    ]);

    const session = await sessionService.establishSession(
      user,
      input.request,
      prerequisites,
    );
    return { user: { ...user, roles: session.roles }, session };
  }

  async function register(input: {
    identifier: string;
    identifierType: IdentifierType;
    email?: string | undefined;
    phoneNo?: string | undefined;
    code?: string | undefined;
    emailCode?: string | undefined;
    phoneCode?: string | undefined;
    username: string;
    displayName: string;
    request: {
      ip: string;
      userAgent: string | null;
      existingSessionToken?: string | null;
      location?: SessionLocation | null;
    };
  }) {
    const hasBothChannels = Boolean(input.email && input.phoneNo);

    if (!otpService || !sessionService) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires otpService and sessionService for registration.",
      );
    }

    // The codes are checked before anything is said about the email, number
    // or username, so those answers cannot be read without a code sent to
    // the caller. They are consumed further down, once every check has
    // passed: with two channels, a wrong second code used to spend the
    // first one.
    if (hasBothChannels) {
      if (!input.emailCode || !input.phoneCode) {
        throw new AppError(
          400,
          "INVALID_REQUEST",
          "Email and phone verification codes are required.",
        );
      }

      await otpService.assertOtpMatches(
        input.email!,
        "email",
        "email_verification",
        input.emailCode,
      );
      await otpService.assertOtpMatches(
        input.phoneNo!,
        "phone",
        "phone_verification",
        input.phoneCode,
      );
    } else {
      if (!input.code) {
        throw new AppError(
          400,
          "INVALID_REQUEST",
          "A verification code is required.",
        );
      }

      await otpService.assertOtpMatches(
        input.identifier,
        input.identifierType,
        input.identifierType === "email"
          ? "email_verification"
          : "phone_verification",
        input.code,
      );
    }

    const existingUsers = hasBothChannels
      ? await Promise.all([
          userRepository.findUserStatusByIdentifier(
            database,
            input.email!,
            "email",
          ),
          userRepository.findUserStatusByIdentifier(
            database,
            input.phoneNo!,
            "phone",
          ),
        ])
      : [
          await userRepository.findUserStatusByIdentifier(
            database,
            input.identifier,
            input.identifierType,
          ),
        ];

    if (existingUsers.some(Boolean)) {
      throw new AppError(
        400,
        "USER_EXISTS",
        "An account with this email or phone number already exists.",
      );
    }

    if (isReservedUsername(input.username)) {
      throw new AppError(
        400,
        "USERNAME_TAKEN",
        "That username isn't available.",
      );
    }

    if (await usernameExists(input.username.toLowerCase())) {
      throw new AppError(400, "USERNAME_TAKEN", "Username is already taken.");
    }

    // The code (or both) is spent in the transaction that creates the
    // account. Spent before it, anything that then stopped the account being
    // created (another registration taking the username a moment earlier,
    // the second of two codes being used up in between) cost the visitor a
    // code they had entered correctly, and a wait for the next one.
    const consumeCodes = async (transaction: DatabaseExecutor) => {
      if (hasBothChannels) {
        await otpService.consumeOtpWithin(
          transaction,
          input.email!,
          "email",
          "email_verification",
          input.emailCode!,
        );
        await otpService.consumeOtpWithin(
          transaction,
          input.phoneNo!,
          "phone",
          "phone_verification",
          input.phoneCode!,
        );
      } else {
        await otpService.consumeOtpWithin(
          transaction,
          input.identifier,
          input.identifierType,
          input.identifierType === "email"
            ? "email_verification"
            : "phone_verification",
          input.code!,
        );
      }
    };

    const userId = await createUser(
      {
        email: input.email ?? null,
        phoneNo: input.phoneNo ?? null,
        username: input.username.toLowerCase(),
        displayName: input.displayName,
        emailVerified: Boolean(input.email),
        phoneVerified: Boolean(input.phoneNo),
      },
      consumeCodes,
    );
    const user = await requireUser(userId);
    const session = await sessionService.establishSession(user, input.request);

    return { user: { ...user, roles: session.roles }, session };
  }

  /**
   * Appends a numeric suffix until the username is free. A reserved name
   * (an email that starts "settings@", say) is treated as taken.
   *
   * The result never exceeds the length every response allows for a
   * username. A provider login or an email's local part can be longer than
   * that, and an account created with such a name could not load its own
   * profile afterwards.
   *
   * Nor is it shorter than a profile address allows. A one- or two-letter
   * provider login or email name ("al", "jo@example.com") is treated like a
   * taken one and gets the suffix; kept as it was, the account's profile
   * page could never be opened.
   */
  async function generateUniqueUsername(base: string): Promise<string> {
    const normalised =
      base
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .slice(0, PUBLIC_PROFILE_USERNAME_MAX_LENGTH) || "user";

    if (
      normalised.length >= PUBLIC_PROFILE_USERNAME_MIN_LENGTH &&
      !isReservedUsername(normalised) &&
      !(await userRepository.usernameExists(database, normalised))
    ) {
      return normalised;
    }

    const stem = normalised.slice(
      0,
      PUBLIC_PROFILE_USERNAME_MAX_LENGTH - USERNAME_SUFFIX_LENGTH,
    );

    for (let attempt = 0; attempt < USERNAME_SUFFIX_ATTEMPTS; attempt++) {
      const candidate = `${stem}_${crypto.randomInt(100, 1000)}`;
      if (!(await userRepository.usernameExists(database, candidate))) {
        return candidate;
      }
    }

    throw new AppError(
      409,
      "USERNAME_UNAVAILABLE",
      "Could not allocate a unique username. Please choose one explicitly.",
    );
  }

  /**
   * Creates an account. The very first account is the administrator, and
   * only the setup-token flow (`allowBootstrapAdmin`) may create it: without
   * that gate, whoever registered first on a fresh or restored-empty
   * database — by OTP or OAuth, no setup token needed — owned the platform.
   *
   * The whole thing runs in one transaction behind a transaction-scoped
   * advisory lock. Counting users outside the transaction (or even inside it
   * under READ COMMITTED) lets two concurrent first-registrations both observe
   * an empty table and both be granted ownership of the platform.
   *
   * `withinTransaction` runs in that transaction once the account's rows are
   * written, for work that must stand or fall with the account (spending the
   * code a registration was made with). If it throws, no account is created.
   */
  async function createUser(
    input: CreateUserInput,
    withinTransaction?: (transaction: DatabaseExecutor) => Promise<void>,
  ): Promise<string> {
    const userId = crypto.randomUUID();
    // A provider (Google/GitHub) photo is downloaded into R2 and used as the
    // avatar; any failure there — or no provider photo at all — falls back to
    // a deterministic DiceBear default seeded by the display name rather than
    // the (not-yet-known-to-the-client) user id. That lets the registration
    // screen preview this exact avatar live as the name is typed, before the
    // account — and its id — even exist.
    const providerAvatarDataUrl =
      input.avatarSourceUrl && storage && input.avatarSource
        ? await storeAvatarFromUrl(
            storage,
            userId,
            input.avatarSourceUrl,
            input.avatarSource,
          )
        : null;
    const avatarDataUrl =
      providerAvatarDataUrl ??
      defaultAvatarUrl(input.displayName.trim() || userId);
    const providerAvatarStored = Boolean(
      input.avatarSource &&
      providerAvatarDataUrl &&
      isStoredAvatarUrl(providerAvatarDataUrl),
    );

    if (
      storage &&
      input.avatarSource &&
      input.avatarSourceUrl &&
      !providerAvatarStored
    ) {
      await removeAvatarPrefix(
        storage,
        avatarStoragePrefix(userId, input.avatarSource),
      ).catch(() => undefined);
    }

    try {
      await database.transaction().execute(async (trx) => {
        await userRepository.lockUserBootstrap(trx);

        const isFirstUser = (await userRepository.countUsers(trx)) === 0;
        if (isFirstUser && !input.allowBootstrapAdmin) {
          throw new AppError(
            403,
            "SETUP_REQUIRED",
            "This platform has not been set up yet. An administrator must complete setup before accounts can be created.",
          );
        }

        await userRepository.insertUser(trx, {
          id: userId,
          email: input.email,
          phoneNo: input.phoneNo,
          username: input.username,
          // A provider's profile name has no length limit of its own.
          displayName: input.displayName.slice(0, DISPLAY_NAME_MAX_LENGTH),
          emailVerifiedAt: input.emailVerified ? new Date() : null,
          phoneVerifiedAt: input.phoneVerified ? new Date() : null,
          mfaMandatory: isFirstUser,
          avatarDataUrl,
        });

        if (providerAvatarStored && input.avatarSource === "google") {
          await userRepository.insertUserAvatar(trx, {
            id: crypto.randomUUID(),
            userId,
            source: input.avatarSource!,
            storagePrefix: avatarStoragePrefix(userId, input.avatarSource!),
            avatarDataUrl,
          });
        }

        if (input.oauth) {
          await oauthRepository.insertOauthAccount(trx, {
            id: crypto.randomUUID(),
            userId,
            provider: input.oauth.provider,
            providerUserId: input.oauth.providerUserId,
          });
        }

        const roleName = isFirstUser ? ADMIN_ROLE : STUDENT_ROLE;
        const roleId = await userRepository.findRoleIdByName(trx, roleName);

        if (!roleId) {
          throw new AppError(
            500,
            "ROLE_NOT_PROVISIONED",
            `The ${roleName} role is missing. Run the database seed.`,
          );
        }

        await userRepository.assignRole(trx, userId, roleId);

        await withinTransaction?.(trx);
      });
    } catch (error) {
      if (providerAvatarStored && storage && input.avatarSource) {
        await removeAvatarPrefix(
          storage,
          avatarStoragePrefix(userId, input.avatarSource),
        ).catch(() => undefined);
      }
      throw error;
    }

    return userId;
  }

  async function requireUser(userId: string): Promise<SessionUser> {
    const user = await userRepository.findUserById(database, userId);

    if (!user) {
      throw new AppError(
        500,
        "USER_LOOKUP_FAILED",
        "Failed to load the user record after writing it.",
      );
    }

    return user as SessionUser;
  }

  /** Issues a direct-to-storage upload URL for one immutable user avatar. */
  async function presignAvatarUpload(
    userId: string,
    input: AvatarUploadPresignRequest,
  ) {
    validateAvatarUpload(input);
    const avatarStorage = requireAvatarStorage();
    const uploadId = crypto.randomUUID();
    const uploadUrl = await avatarStorage.getPresignedPutUrl(
      avatarOriginalKey(userId, input.contentType, uploadId),
      input.contentType,
      input.fileSize,
      undefined,
      // Avatars are public. Unsigned, the type checked above was only a
      // promise: the upload could be sent, and stored, as anything.
      { bindContentType: true },
    );

    return { uploadId, uploadUrl };
  }

  /** Confirms the direct upload, then stores the canonical CDN variant URL. */
  async function completeAvatarUpload(
    userId: string,
    input: AvatarUploadCompleteRequest,
  ) {
    validateAvatarUpload(input);
    const avatarStorage = requireAvatarStorage();

    return withAvatarLock(userId, async () => {
      const avatarPrefix = avatarStoragePrefix(userId, input.uploadId);
      const storageKey = avatarOriginalKey(
        userId,
        input.contentType,
        input.uploadId,
      );
      const discardUploadedAvatar = async (): Promise<void> => {
        await removeAvatarPrefix(avatarStorage, avatarPrefix).catch(
          () => undefined,
        );
      };
      let evictedPrefixes: string[] = [];
      let user: Awaited<ReturnType<typeof userRepository.updateUserProfile>>;
      let uploadWasAlreadyCompleted = false;
      try {
        // A completed upload is idempotent even after its source object has
        // been cleaned up. Check the durable record before touching storage.
        const completedUser = await withAvatarDatabaseLock(
          userId,
          async (trx) => {
            const currentUser = await userRepository.findUserById(trx, userId);
            if (!currentUser) {
              throw new AppError(
                404,
                "USER_NOT_FOUND",
                "User account was not found.",
              );
            }

            const completedAvatar = await userRepository.findUserAvatarById(
              trx,
              userId,
              input.uploadId,
            );
            return completedAvatar ? currentUser : null;
          },
        );
        if (completedUser) {
          uploadWasAlreadyCompleted = true;
          const roles = await getUserRoles(userId);
          return { ...completedUser, roles };
        }

        const metadata = await avatarStorage.headObject(storageKey);
        if (!metadata) {
          throw new AppError(
            400,
            "FILE_NOT_FOUND",
            "File could not be found in storage.",
          );
        }

        if (
          metadata.contentLength !== undefined &&
          metadata.contentLength !== input.fileSize
        ) {
          throw new AppError(
            400,
            "FILE_SIZE_MISMATCH",
            "Uploaded file size does not match presigned size.",
          );
        }

        if (
          metadata.contentType !== undefined &&
          metadata.contentType !== input.contentType
        ) {
          throw new AppError(
            400,
            "INVALID_AVATAR_FILE",
            "Uploaded avatar content type does not match the presigned upload.",
          );
        }

        const object = await avatarStorage.getObject(storageKey, {
          range: AVATAR_VALIDATION_RANGE,
        });
        if (!object) {
          throw new AppError(
            400,
            "FILE_NOT_FOUND",
            "File could not be found in storage.",
          );
        }

        const detectedType = detectImageContentType(
          await readObjectPrefix(object.body, 32),
        );
        if (detectedType !== input.contentType) {
          throw new AppError(
            400,
            "INVALID_AVATAR_FILE",
            "Uploaded avatar bytes do not match the selected image type.",
          );
        }

        const avatarDataUrl =
          avatarCdnUrl(avatarStorage, userId, 160, input.uploadId) ??
          avatarStorage.getPublicObjectUrl(storageKey);
        if (!avatarDataUrl) {
          throw new AppError(
            503,
            "CDN_NOT_CONFIGURED",
            "Avatar CDN delivery is not configured.",
          );
        }

        await removeAvatarVariants(avatarStorage, userId, input.uploadId);
        await removeOtherAvatarOriginals(
          avatarStorage,
          userId,
          input.contentType,
          input.uploadId,
        );

        const result = await withAvatarDatabaseLock(userId, async (trx) => {
          const currentUser = await userRepository.findUserById(trx, userId);
          if (!currentUser) {
            throw new AppError(
              404,
              "USER_NOT_FOUND",
              "User account was not found.",
            );
          }

          const completedAvatar = await userRepository.findUserAvatarById(
            trx,
            userId,
            input.uploadId,
          );
          if (completedAvatar) {
            uploadWasAlreadyCompleted = true;
            return currentUser;
          }

          await userRepository.insertUserAvatar(trx, {
            id: input.uploadId,
            userId,
            source: "upload",
            storagePrefix: avatarPrefix,
            avatarDataUrl,
          });

          const updatedUser = await userRepository.updateUserProfile(
            trx,
            userId,
            { avatarDataUrl },
          );
          if (!updatedUser) {
            throw new AppError(
              404,
              "USER_NOT_FOUND",
              "User account was not found.",
            );
          }

          const uploadedAvatars = (
            await userRepository.listUserAvatars(trx, userId)
          ).filter((avatar) => avatar.source === "upload");
          const evicted = uploadedAvatars.slice(USER_AVATAR_RETENTION_LIMIT);
          evictedPrefixes = evicted.map((avatar) => avatar.storage_prefix);
          await userRepository.deleteUserAvatarsById(
            trx,
            userId,
            evicted.map((avatar) => avatar.id),
          );

          return updatedUser;
        });
        user = result;
      } catch (error) {
        if (!uploadWasAlreadyCompleted) {
          await discardUploadedAvatar();
        }
        throw error;
      }

      if (storage && evictedPrefixes.length > 0) {
        await Promise.all(
          evictedPrefixes.map(async (prefix) => {
            await removeAvatarPrefix(avatarStorage, prefix).catch(
              () => undefined,
            );
          }),
        );
      }

      if (!user) {
        throw new AppError(
          500,
          "AVATAR_COMPLETION_FAILED",
          "Avatar upload could not be completed.",
        );
      }

      const roles = await getUserRoles(userId);
      return { ...user, roles };
    });
  }

  async function listAvatars(userId: string) {
    const user = await userRepository.findUserAvatarUrlById(database, userId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }

    const avatars = await userRepository.listUserAvatars(database, userId);
    const googleAvatar = avatars.find((avatar) => avatar.source === "google");
    const uploadedAvatars = avatars
      .filter((avatar) => avatar.source === "upload")
      .slice(0, USER_AVATAR_RETENTION_LIMIT);

    const effectiveAvatars = [
      ...(googleAvatar ? [googleAvatar] : []),
      ...uploadedAvatars,
    ];

    return effectiveAvatars.map((avatar) => {
      const avatarDataUrl = displayAvatarUrl(avatar.avatar_data_url);
      return {
        id: avatar.id,
        avatarDataUrl,
        avatarSrcSet: avatarSrcSetFromUrl(avatarDataUrl),
        source: avatar.source,
        isCurrent:
          avatar.avatar_data_url === user.avatar_data_url ||
          avatarDataUrl === user.avatar_data_url,
      };
    });
  }

  async function selectAvatar(userId: string, avatarId: string) {
    return withAvatarLock(userId, async () => {
      const user = await withAvatarDatabaseLock(userId, async (trx) => {
        const avatar = await userRepository.findUserAvatarById(
          trx,
          userId,
          avatarId,
        );
        if (!avatar) {
          throw new AppError(
            404,
            "AVATAR_NOT_FOUND",
            "That avatar is no longer available.",
          );
        }

        const updated = await userRepository.updateUserProfile(trx, userId, {
          avatarDataUrl: avatar.avatar_data_url,
        });
        if (!updated) {
          throw new AppError(
            404,
            "USER_NOT_FOUND",
            "User account was not found.",
          );
        }
        await userRepository.touchUserAvatar(trx, userId, avatarId);
        return updated;
      });

      const roles = await getUserRoles(userId);
      return { ...user, roles };
    });
  }

  async function deleteUploadedAvatars(userId: string) {
    return withAvatarLock(userId, async () => {
      let deletedPrefixes: string[] = [];
      const user = await withAvatarDatabaseLock(userId, async (trx) => {
        const currentUser = await userRepository.findUserById(trx, userId);
        if (!currentUser) {
          throw new AppError(
            404,
            "USER_NOT_FOUND",
            "User account was not found.",
          );
        }

        const avatars = await userRepository.listUserAvatars(trx, userId);
        const uploaded = avatars.filter((avatar) => avatar.source === "upload");
        const currentUpload = uploaded.find(
          (avatar) => avatar.avatar_data_url === currentUser.avatar_data_url,
        );
        let avatarDataUrl = currentUser.avatar_data_url;

        if (currentUpload) {
          const providerAvatar = avatars.find(
            (avatar) => avatar.source === "google",
          );
          avatarDataUrl =
            providerAvatar?.avatar_data_url ??
            defaultAvatarUrl(currentUser.display_name.trim() || userId);
        }

        const updated = await userRepository.updateUserProfile(
          trx,
          userId,
          currentUser.avatar_data_url === avatarDataUrl
            ? {}
            : { avatarDataUrl },
        );
        if (!updated) {
          throw new AppError(
            404,
            "USER_NOT_FOUND",
            "User account was not found.",
          );
        }

        deletedPrefixes = uploaded.map((avatar) => avatar.storage_prefix);
        await userRepository.deleteUserUploadedAvatars(trx, userId);
        return updated;
      });

      if (storage && deletedPrefixes.length > 0) {
        await Promise.all(
          deletedPrefixes.map(async (prefix) => {
            await removeAvatarPrefix(storage, prefix).catch(() => undefined);
          }),
        );
      }

      const roles = await getUserRoles(userId);
      return { ...user, roles };
    });
  }

  return {
    findUserById,
    findUserByIdForNotification,
    listUserDisplayNamesByIds,
    listUserNamesAndEmailsByIds,
    listUserCardsByIds,
    findUserCardByUsername,
    listNotificationRecipientsByIds,
    getPublicProfile,
    findUserByIdentifierIncludingDeleted,
    findVerifiedUserByEmail,
    findUserByOauthAccountIncludingDeleted,
    oauthAccountExists,
    linkOauthAccount,
    countUsers,
    usernameExists,
    updateProfile,
    presignAvatarUpload,
    completeAvatarUpload,
    syncProviderAvatar,
    listAvatars,
    selectAvatar,
    deleteUploadedAvatars,
    sendPhoneVerificationOtp,
    verifyPhoneNumber,
    sendEmailVerificationOtp,
    verifyEmail,
    login,
    register,
    getUserRoles,
    generateUniqueUsername,
    createUser,
    requireUser,
    updateContactAsAdmin,
    deactivateAccount,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
