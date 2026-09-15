import crypto from "node:crypto";

import type { Database } from "@veolms/database";
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
  detectImageContentType,
  isStoredAvatarUrl,
  removeAvatarVariants,
  removeOtherAvatarOriginals,
  removeAvatar,
  storeAvatarBuffer,
  storeAvatarFromUrl,
} from "../../avatars/index.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";

const AVATAR_VALIDATION_RANGE = "bytes=0-31";

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

  async function updateProfile(userId: string, input: ProfileUpdateRequest) {
    const username = input.username?.trim().toLowerCase();
    if (
      username &&
      (await userRepository.usernameExists(database, username, userId))
    ) {
      throw new AppError(400, "USERNAME_TAKEN", "Username is already taken.");
    }

    const performUpdate = async () => {
      const currentUser = await userRepository.findUserById(database, userId);
      if (!currentUser) {
        throw new AppError(
          404,
          "USER_NOT_FOUND",
          "User account was not found.",
        );
      }

      const linkedinUrl =
        input.linkedinUrl !== undefined
          ? input.linkedinUrl?.trim() || null
          : currentUser.linkedin_url;
      const githubUrl =
        input.githubUrl !== undefined
          ? input.githubUrl?.trim() || null
          : currentUser.github_url;
      const websiteUrl =
        input.websiteUrl !== undefined
          ? input.websiteUrl?.trim() || null
          : currentUser.website_url;

      const user = await userRepository.updateUserProfile(database, userId, {
        ...(username ? { username } : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName.trim() }
          : {}),
        ...(input.avatarDataUrl !== undefined
          ? { avatarDataUrl: input.avatarDataUrl }
          : {}),
        ...(input.bio !== undefined ? { bio: input.bio?.trim() || null } : {}),
        ...(input.emailPublic !== undefined
          ? {
              emailPublic: Boolean(
                input.emailPublic &&
                currentUser.email &&
                currentUser.email_verified_at,
              ),
            }
          : {}),
        ...(input.mobilePublic !== undefined
          ? {
              // A phone number is only publishable after the exact number on the
              // account has completed the verification flow.
              mobilePublic: Boolean(
                input.mobilePublic &&
                currentUser.phone_no &&
                currentUser.phone_verified_at,
              ),
            }
          : {}),
        ...(input.linkedinUrl !== undefined ? { linkedinUrl } : {}),
        ...(input.linkedinPublic !== undefined ||
        input.linkedinUrl !== undefined
          ? {
              linkedinPublic: Boolean(
                (input.linkedinPublic ?? currentUser.linkedin_public) &&
                linkedinUrl,
              ),
            }
          : {}),
        ...(input.githubUrl !== undefined ? { githubUrl } : {}),
        ...(input.githubPublic !== undefined || input.githubUrl !== undefined
          ? {
              githubPublic: Boolean(
                (input.githubPublic ?? currentUser.github_public) && githubUrl,
              ),
            }
          : {}),
        ...(input.websiteUrl !== undefined ? { websiteUrl } : {}),
        ...(input.websitePublic !== undefined || input.websiteUrl !== undefined
          ? {
              websitePublic: Boolean(
                (input.websitePublic ?? currentUser.website_public) &&
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

      // Remove the stored avatar files when the profile changes to a DiceBear
      // avatar or is cleared.
      if (
        storage &&
        input.avatarDataUrl !== undefined &&
        isStoredAvatarUrl(currentUser.avatar_data_url) &&
        currentUser.avatar_data_url !== user.avatar_data_url &&
        !isStoredAvatarUrl(user.avatar_data_url)
      ) {
        await removeAvatar(storage, userId);
      }

      const roles = await getUserRoles(userId);
      return { ...user, roles };
    };

    if (input.avatarDataUrl !== undefined) {
      return withAvatarLock(userId, performUpdate);
    }
    return performUpdate();
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
    const avatarDataUrl =
      (input.avatarSourceUrl && storage
        ? await storeAvatarFromUrl(storage, userId, input.avatarSourceUrl)
        : null) ?? defaultAvatarUrl(input.displayName.trim() || userId);

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

  /** Issues a direct-to-storage upload URL for the user's flat avatar key. */
  async function presignAvatarUpload(
    userId: string,
    input: AvatarUploadPresignRequest,
  ) {
    validateAvatarUpload(input);
    const avatarStorage = requireAvatarStorage();
    await avatarStorage.ensureBucketCors();
    const uploadUrl = await avatarStorage.getPresignedPutUrl(
      avatarOriginalKey(userId, input.contentType),
      input.contentType,
      input.fileSize,
    );

    return { uploadUrl };
  }

  /** Confirms the direct upload, then stores the canonical CDN variant URL. */
  async function completeAvatarUpload(
    userId: string,
    input: AvatarUploadCompleteRequest,
  ) {
    validateAvatarUpload(input);
    const avatarStorage = requireAvatarStorage();

    return withAvatarLock(userId, async () => {
      const storageKey = avatarOriginalKey(userId, input.contentType);
      const discardUploadedAvatar = async (): Promise<void> => {
        await avatarStorage.deleteObject(storageKey).catch(() => undefined);
      };
      const metadata = await avatarStorage.headObject(storageKey);
      if (!metadata) {
        await discardUploadedAvatar();
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
        await discardUploadedAvatar();
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
        await discardUploadedAvatar();
        throw new AppError(
          400,
          "INVALID_AVATAR_FILE",
          "Uploaded avatar content type does not match the presigned upload.",
        );
      }

      try {
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
      } catch (error) {
        await discardUploadedAvatar();
        throw error;
      }

      const avatarDataUrl = avatarCdnUrl(avatarStorage, userId);
      if (!avatarDataUrl) {
        throw new AppError(
          503,
          "CDN_NOT_CONFIGURED",
          "Avatar CDN delivery is not configured.",
        );
      }

      await removeAvatarVariants(avatarStorage, userId);
      await removeOtherAvatarOriginals(
        avatarStorage,
        userId,
        input.contentType,
      );

      const user = await userRepository.updateUserProfile(database, userId, {
        avatarDataUrl,
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
