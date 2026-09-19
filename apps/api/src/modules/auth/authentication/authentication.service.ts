import crypto from "node:crypto";

import type { Database, DatabaseExecutor } from "@veolms/database";
import type {
  AvatarUploadCompleteRequest,
  AvatarUploadPresignRequest,
  ProfileUpdateRequest,
} from "@veolms/contracts";
import { buildDicebearSvgUrl, DEFAULT_AVATAR_STYLE } from "@veolms/contracts";
import type { S3StorageService } from "@veolms/storage";
import { sql, type Kysely } from "kysely";

import { AppError } from "../../../lib/errors.ts";
import {
  ADMIN_ROLE,
  STUDENT_ROLE,
  USERNAME_SUFFIX_ATTEMPTS,
} from "../shared/auth.constants.ts";
import type { IdentifierType, SessionUser } from "../shared/auth.types.ts";
import type { CreateUserInput } from "./authentication.types.ts";
import * as oauthRepository from "../oauth/oauth.repository.ts";
import * as userRepository from "./authentication.repository.ts";
import type { OtpService } from "../otp/otp.service.ts";
import type { SessionService } from "../session/session.service.ts";
import { normalizePhoneNumber } from "../shared/auth.utils.ts";
import {
  AVATAR_CONTENT_TYPES,
  AVATAR_UPLOAD_MAX_BYTES,
  avatarCdnUrl,
  avatarOriginalKey,
  avatarStoragePrefix,
  avatarSrcSetFromUrl,
  detectImageContentType,
  isStoredAvatarUrl,
  removeAvatarVariants,
  removeOtherAvatarOriginals,
  removeAvatarPrefix,
  storeAvatarBuffer,
  storeAvatarFromUrl,
} from "../../avatars/index.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";

const AVATAR_VALIDATION_RANGE = "bytes=0-31";
const USER_AVATAR_RETENTION_LIMIT = 5;

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

  function findUserByIdentifier(
    identifier: string,
    identifierType: IdentifierType,
  ) {
    return userRepository.findUserByIdentifier(
      database,
      identifier,
      identifierType,
    );
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

  function findUserByOauthAccount(provider: string, providerUserId: string) {
    return oauthRepository.findUserByOauthAccount(
      database,
      provider,
      providerUserId,
    );
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
    return database.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext(${`veolms:user-avatar:${userId}`}))`.execute(
        trx,
      );
      return fn(trx);
    });
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
    return performUpdate();
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
    if (!storage || !sourceUrl) return;
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
  ): Promise<void> {
    const normalizedPhoneNo = normalizePhoneNumber(phoneNo);
    if (normalizedPhoneNo.length < 8) {
      throw new AppError(
        400,
        "INVALID_PHONE_NUMBER",
        "Enter a valid mobile number.",
      );
    }

    const currentUser = await userRepository.findUserById(database, userId);
    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }

    const existingUser = await userRepository.findUserByIdentifier(
      database,
      normalizedPhoneNo,
      "phone",
    );
    if (existingUser && existingUser.id !== userId) {
      throw new AppError(
        409,
        "PHONE_TAKEN",
        "That phone number is already linked to another account.",
      );
    }

    if (!otpService) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires otpService for phone verification.",
      );
    }

    await otpService.sendPhoneVerificationOtp(normalizedPhoneNo);
  }

  async function sendEmailVerificationOtp(userId: string): Promise<void> {
    const currentUser = await userRepository.findUserById(database, userId);
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

    await otpService.sendEmailVerificationOtp(currentUser.email);
  }

  async function verifyEmail(userId: string, code: string): Promise<void> {
    const currentUser = await userRepository.findUserById(database, userId);
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
  }

  async function verifyPhoneNumber(
    userId: string,
    phoneNo: string,
    code: string,
  ) {
    const normalizedPhoneNo = normalizePhoneNumber(phoneNo);
    if (normalizedPhoneNo.length < 8) {
      throw new AppError(
        400,
        "INVALID_PHONE_NUMBER",
        "Enter a valid mobile number.",
      );
    }

    const currentUser = await userRepository.findUserById(database, userId);
    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }

    const existingUser = await userRepository.findUserByIdentifier(
      database,
      normalizedPhoneNo,
      "phone",
    );
    if (existingUser && existingUser.id !== userId) {
      throw new AppError(
        409,
        "PHONE_TAKEN",
        "That phone number is already linked to another account.",
      );
    }

    if (!otpService) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires otpService for phone verification.",
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

    const roles = await getUserRoles(userId);
    return { ...updatedUser, roles };
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

      await outbox.publish(transaction, {
        type: "auth.account_deactivated",
        version: 1,
        dedupeKey: `auth.account_deactivated:${userId}`,
        occurredAt: new Date(),
        payload: { recipientUserId: userId },
      });
    });
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
    };
  }) {
    const user = await findUserByIdentifierIncludingDeleted(
      input.identifier,
      input.identifierType,
    );

    if (!user) {
      throw new AppError(
        400,
        "REGISTRATION_REQUIRED",
        "Account does not exist. Please register first.",
      );
    }

    if (user.is_deleted) {
      throw new AppError(
        403,
        "ACCOUNT_DEACTIVATED",
        "This account has been deactivated.",
      );
    }

    if (!otpService || !sessionService) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires otpService and sessionService for login.",
      );
    }

    await otpService.verifyAndConsumeOtp(
      input.identifier,
      input.identifierType,
      "login",
      input.code,
    );

    const session = await sessionService.establishSession(user, input.request);
    const roles = await getUserRoles(user.id);
    return { user: { ...user, roles }, session };
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
    };
  }) {
    const hasBothChannels = Boolean(input.email && input.phoneNo);
    const existingUsers = hasBothChannels
      ? await Promise.all([
          findUserByIdentifierIncludingDeleted(input.email!, "email"),
          findUserByIdentifierIncludingDeleted(input.phoneNo!, "phone"),
        ])
      : [
          await findUserByIdentifierIncludingDeleted(
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

    if (await usernameExists(input.username.toLowerCase())) {
      throw new AppError(400, "USERNAME_TAKEN", "Username is already taken.");
    }

    if (!otpService || !sessionService) {
      throw new AppError(
        500,
        "CONFIG_ERROR",
        "AuthService requires otpService and sessionService for registration.",
      );
    }

    if (hasBothChannels) {
      if (!input.emailCode || !input.phoneCode) {
        throw new AppError(
          400,
          "INVALID_REQUEST",
          "Email and phone verification codes are required.",
        );
      }

      await otpService.verifyAndConsumeOtp(
        input.email!,
        "email",
        "email_verification",
        input.emailCode,
      );
      await otpService.verifyAndConsumeOtp(
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

      await otpService.verifyAndConsumeOtp(
        input.identifier,
        input.identifierType,
        input.identifierType === "email"
          ? "email_verification"
          : "phone_verification",
        input.code,
      );
    }

    const userId = await createUser({
      email: input.email ?? null,
      phoneNo: input.phoneNo ?? null,
      username: input.username.toLowerCase(),
      displayName: input.displayName,
      emailVerified: Boolean(input.email),
      phoneVerified: Boolean(input.phoneNo),
    });
    const user = await requireUser(userId);
    const session = await sessionService.establishSession(user, input.request);
    const roles = await getUserRoles(user.id);

    return { user: { ...user, roles }, session };
  }

  /** Appends a numeric suffix until the username is free. */
  async function generateUniqueUsername(base: string): Promise<string> {
    const normalised = base.toLowerCase().replace(/[^a-z0-9_]/g, "_") || "user";

    if (!(await userRepository.usernameExists(database, normalised))) {
      return normalised;
    }

    for (let attempt = 0; attempt < USERNAME_SUFFIX_ATTEMPTS; attempt++) {
      const candidate = `${normalised}_${crypto.randomInt(100, 1000)}`;
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
   * Creates an account, granting the administrator role to the very first user.
   *
   * The whole thing runs in one transaction behind a transaction-scoped
   * advisory lock. Counting users outside the transaction (or even inside it
   * under READ COMMITTED) lets two concurrent first-registrations both observe
   * an empty table and both be granted ownership of the platform.
   */
  async function createUser(input: CreateUserInput): Promise<string> {
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
        await sql`select pg_advisory_xact_lock(hashtext('veolms:user-bootstrap'))`.execute(
          trx,
        );

        const isFirstUser = (await userRepository.countUsers(trx)) === 0;

        await userRepository.insertUser(trx, {
          id: userId,
          email: input.email,
          phoneNo: input.phoneNo,
          username: input.username,
          displayName: input.displayName,
          emailVerifiedAt: input.emailVerified ? new Date() : null,
          phoneVerifiedAt: input.phoneVerified ? new Date() : null,
          mfaMandatory: isFirstUser,
          avatarDataUrl,
        });

        if (providerAvatarStored) {
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

        const avatarDataUrl = avatarCdnUrl(
          avatarStorage,
          userId,
          160,
          input.uploadId,
        );
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
    const user = await userRepository.findUserById(database, userId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }

    const avatars = await userRepository.listUserAvatars(database, userId);
    return avatars.map((avatar) => ({
      id: avatar.id,
      avatarDataUrl: avatar.avatar_data_url,
      avatarSrcSet: avatarSrcSetFromUrl(avatar.avatar_data_url),
      source: avatar.source,
      createdAt: avatar.created_at.toISOString(),
      isCurrent: avatar.avatar_data_url === user.avatar_data_url,
      canDelete: avatar.source === "upload",
    }));
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
            (avatar) =>
              avatar.source === "google" || avatar.source === "github",
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
    findUserByIdentifier,
    findUserByIdentifierIncludingDeleted,
    findVerifiedUserByEmail,
    findUserByOauthAccount,
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
    deactivateAccount,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
