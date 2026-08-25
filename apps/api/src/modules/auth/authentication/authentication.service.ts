import crypto from "node:crypto";

import type { Database } from "@veolms/database";
import { sql, type Kysely } from "kysely";

import { AppError } from "../../../lib/errors.ts";
import {
  CREATOR_ROLE,
  STUDENT_ROLE,
  USERNAME_SUFFIX_ATTEMPTS,
} from "../shared/auth.constants.ts";
import type { IdentifierType, SessionUser } from "../shared/auth.types.ts";
import type { CreateUserInput } from "./authentication.types.ts";
import * as oauthRepository from "../oauth/oauth.repository.ts";
import * as userRepository from "./authentication.repository.ts";
import type { OtpService } from "../otp/otp.service.ts";
import type { SessionService } from "../session/session.service.ts";

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
  function findUserById(userId: string) {
    return userRepository.findUserById(database, userId);
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
    const user = await findUserByIdentifier(
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
          findUserByIdentifier(input.email!, "email"),
          findUserByIdentifier(input.phoneNo!, "phone"),
        ])
      : [await findUserByIdentifier(input.identifier, input.identifierType)];

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
   * Creates an account, granting the creator role to the very first user.
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

      const isCreator = (await userRepository.countUsers(trx)) === 0;

      await userRepository.insertUser(trx, {
        id: userId,
        email: input.email,
        phoneNo: input.phoneNo,
        username: input.username,
        displayName: input.displayName,
        emailVerifiedAt: input.emailVerified ? new Date() : null,
        mfaMandatory: isCreator,
      });

      if (input.oauth) {
        await oauthRepository.insertOauthAccount(trx, {
          id: crypto.randomUUID(),
          userId,
          provider: input.oauth.provider,
          providerUserId: input.oauth.providerUserId,
        });
      }

      const roleName = isCreator ? CREATOR_ROLE : STUDENT_ROLE;
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
    findUserByIdentifier,
    findVerifiedUserByEmail,
    findUserByOauthAccount,
    oauthAccountExists,
    linkOauthAccount,
    countUsers,
    usernameExists,
    login,
    register,
    getUserRbac,
    generateUniqueUsername,
    createUser,
    requireUser,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
