import crypto from "node:crypto";

import type { Database } from "@veolms/database";
import type { ProfileUpdateRequest } from "@veolms/contracts";
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
import { createOutboxService } from "../../../events/outbox.service.ts";

export interface AuthServiceOptions {
  database: Kysely<Database>;
  otpService?: OtpService;
  sessionService?: SessionService;
}

export function createAuthService({
  database,
  otpService,
  sessionService,
}: AuthServiceOptions) {
  const outbox = createOutboxService();

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

  async function updateProfile(userId: string, input: ProfileUpdateRequest) {
    const username = input.username?.trim().toLowerCase();
    if (
      username &&
      (await userRepository.usernameExists(database, username, userId))
    ) {
      throw new AppError(400, "USERNAME_TAKEN", "Username is already taken.");
    }

    const currentUser = await userRepository.findUserById(database, userId);
    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
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
      ...(input.linkedinPublic !== undefined || input.linkedinUrl !== undefined
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
              (input.websitePublic ?? currentUser.website_public) && websiteUrl,
            ),
          }
        : {}),
    });

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User account was not found.");
    }

    const rbac = await getUserRbac(userId);
    return { ...user, ...rbac };
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

    const rbac = await getUserRbac(userId);
    return { ...updatedUser, ...rbac };
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

  async function getUserRbac(userId: string) {
    const [roles, permissions, menus] = await Promise.all([
      userRepository.listUserRoleNames(database, userId),
      userRepository.listUserPermissions(database, userId),
      userRepository.listUserMenus(database, userId),
    ]);
    return { roles, permissions, menus };
  }

  async function login(input: {
    identifier: string;
    identifierType: IdentifierType;
    code: string;
    request: { ip: string; userAgent: string | null };
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
    const rbac = await getUserRbac(user.id);
    return { user: { ...user, ...rbac }, session };
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
    request: { ip: string; userAgent: string | null };
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
    const rbac = await getUserRbac(user.id);

    return { user: { ...user, ...rbac }, session };
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
    sendPhoneVerificationOtp,
    verifyPhoneNumber,
    sendEmailVerificationOtp,
    verifyEmail,
    login,
    register,
    getUserRbac,
    generateUniqueUsername,
    createUser,
    requireUser,
    deactivateAccount,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
