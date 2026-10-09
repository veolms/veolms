import crypto from "node:crypto";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  PasskeyLoginVerifyRequest,
  PasskeyRegisterVerifyRequest,
  TotpEnableRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { config } from "../../../config.ts";
import { AppError } from "../../../lib/errors.ts";
import {
  BACKUP_CODE_COUNT,
  BACKUP_CODE_LENGTH,
  BACKUP_CODE_MAX,
  BACKUP_CODE_MIN,
  WEBAUTHN_CHALLENGE_TTL_MS,
} from "../shared/auth.constants.ts";
import type { Executor } from "../shared/repository.types.ts";
import * as mfaRepository from "./mfa.repository.ts";
import * as sessionRepository from "../session/session.repository.ts";
import { evictCachedUserSessions } from "../shared/session-auth-cache.ts";
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashToken,
  verifyTotp,
} from "../shared/auth.utils.ts";
import type { AuthLogger } from "../shared/auth.types.ts";
import type { SessionService } from "../session/session.service.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";

import { isMfaMandatoryAccount } from "../shared/mfa-policy.ts";

export interface MfaServiceOptions {
  database: Kysely<Database>;
  sessionService: SessionService;
}

interface AuthenticatedMfaUser {
  id: string;
  username: string;
  email: string | null;
  phoneNo: string | null;
  name: string;
  roles?: string[];
  mfaMandatory?: boolean;
}

export function createMfaService({
  database,
  sessionService,
}: MfaServiceOptions) {
  const outbox = createOutboxService();
  async function assertStepUpForFactorChange(
    userId: string,
    mfaVerified: boolean,
  ): Promise<void> {
    if ((await sessionService.userHasAnyMfaFactor(userId)) && !mfaVerified) {
      throw new AppError(
        403,
        "MFA_STEP_UP_REQUIRED",
        "Verify an existing MFA factor before adding or replacing another.",
      );
    }
  }

  /** Replaces the user's backup codes and returns the new ones in the clear. */
  async function issueBackupCodes(
    executor: Executor,
    userId: string,
  ): Promise<string[]> {
    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      crypto.randomInt(BACKUP_CODE_MIN, BACKUP_CODE_MAX + 1).toString(),
    );

    await mfaRepository.replaceBackupCodes(
      executor,
      userId,
      backupCodes.map((value) => ({
        id: crypto.randomUUID(),
        user_id: userId,
        code_hash: hashToken(value),
      })),
    );

    return backupCodes;
  }

  function setupTotp(user: AuthenticatedMfaUser) {
    const label = user.email || user.username || user.phoneNo || "user";
    return generateTotpSecret(label, config.RP_NAME);
  }

  async function disableTotp(
    user: AuthenticatedMfaUser,
    mfaVerified: boolean,
  ): Promise<{ message: string }> {
    await assertStepUpForFactorChange(user.id, mfaVerified);

    const isMandatory = isMfaMandatoryAccount(
      Boolean(user.mfaMandatory),
      user.roles,
      { skipAdminMfa: config.SKIP_ADMIN_MFA },
    );
    const passkeyCount = await mfaRepository.countUserPasskeys(
      database,
      user.id,
    );
    if (isMandatory && passkeyCount === 0) {
      throw new AppError(
        400,
        "MFA_MANDATORY",
        "MFA is required for your account. Register a passkey before removing your authenticator app.",
      );
    }

    await database.transaction().execute(async (trx) => {
      await mfaRepository.deleteTotpCredential(trx, user.id);
      // Backup codes stand behind whichever factor is left, so they go only
      // when this removal leaves the account with no second factor at all.
      if (passkeyCount === 0) {
        await mfaRepository.deleteBackupCodes(trx, user.id);
      }
    });
    // The cached auth context still says the factor is enrolled. Without
    // this, the settings page's next read of the account showed the removed
    // authenticator as active until the cache entry expired.
    evictCachedUserSessions(user.id);
    return { message: "Authenticator app removed successfully." };
  }

  async function deletePasskeys(
    user: AuthenticatedMfaUser,
    mfaVerified: boolean,
  ): Promise<{ message: string }> {
    await assertStepUpForFactorChange(user.id, mfaVerified);

    const isMandatory = isMfaMandatoryAccount(
      Boolean(user.mfaMandatory),
      user.roles,
      { skipAdminMfa: config.SKIP_ADMIN_MFA },
    );
    const totpActive = await mfaRepository.isTotpEnabled(database, user.id);
    if (isMandatory && !totpActive) {
      throw new AppError(
        400,
        "MFA_MANDATORY",
        "MFA is required for your account. Set up an authenticator app before removing your passkey.",
      );
    }

    await database.transaction().execute(async (trx) => {
      await mfaRepository.deleteAllUserPasskeys(trx, user.id);
      // See disableTotp: the codes outlive a factor, not the last one.
      if (!totpActive) {
        await mfaRepository.deleteBackupCodes(trx, user.id);
      }
    });
    // See disableTotp: drop the cached "passkey enrolled" state.
    evictCachedUserSessions(user.id);
    return { message: "Passkeys removed successfully." };
  }

  async function enableTotp({
    userId,
    sessionId,
    mfaVerified,
    code,
    secret,
  }: {
    userId: string;
    sessionId: string;
    mfaVerified: boolean;
    code: TotpEnableRequest["code"];
    secret: TotpEnableRequest["secret"];
  }): Promise<{ backupCodes: string[] }> {
    await assertStepUpForFactorChange(userId, mfaVerified);

    const result = verifyTotp(secret, code, {
      backwardSteps: config.TOTP_BACKWARD_STEPS,
      forwardSteps: config.TOTP_FORWARD_STEPS,
    });

    if (!result?.verified) {
      throw new AppError(400, "INVALID_CODE", "Invalid verification code.");
    }

    const credentialId = crypto.randomUUID();
    const backupCodes = await database.transaction().execute(async (trx) => {
      await mfaRepository.replaceTotpCredential(trx, {
        id: credentialId,
        userId,
        secretEncrypted: encryptSecret(secret, config.MFA_ENCRYPTION_KEY),
        lastUsedStep: String(result.step),
      });

      const issued = await issueBackupCodes(trx, userId);
      await outbox.publish(trx, {
        type: "auth.mfa_enabled",
        version: 1,
        dedupeKey: `auth.mfa_enabled:${credentialId}`,
        occurredAt: new Date(),
        payload: { recipientUserId: userId },
      });
      return issued;
    });

    await sessionService.completeMfaEnrolment(userId, sessionId);
    return { backupCodes };
  }

  /**
   * Replaces the caller's backup codes. The old set stops working, which is
   * also how a user retires codes they think someone else has seen.
   */
  async function regenerateBackupCodes(
    userId: string,
    mfaVerified: boolean,
  ): Promise<{ backupCodes: string[] }> {
    if (!(await sessionService.userHasAnyMfaFactor(userId))) {
      throw new AppError(
        400,
        "MFA_NOT_ENABLED",
        "Set up a passkey or authenticator app before creating backup codes.",
      );
    }
    if (!mfaVerified) {
      throw new AppError(
        403,
        "MFA_STEP_UP_REQUIRED",
        "Verify an existing MFA factor before creating new backup codes.",
      );
    }

    const backupCodes = await database
      .transaction()
      .execute((trx) => issueBackupCodes(trx, userId));
    return { backupCodes };
  }

  async function verifyTotpCode({
    userId,
    sessionId,
    code,
  }: {
    userId: string;
    sessionId: string;
    code: string;
  }): Promise<{ message: string }> {
    const credential = await mfaRepository.findTotpCredential(database, userId);

    // Backup codes are checked before the TOTP-enabled gate so passkey-only
    // accounts can still redeem recovery codes.
    const backupCode = await mfaRepository.findUnusedBackupCode(
      database,
      userId,
      hashToken(code),
    );

    if (backupCode) {
      if (await mfaRepository.redeemBackupCode(database, backupCode.id)) {
        await sessionRepository.markSessionMfaVerified(database, sessionId);
        return { message: "MFA verified using backup code" };
      }
    }

    if (!credential?.enabled) {
      // A passkey-only account gets here with a backup code that matched
      // nothing. "TOTP is not enabled" gave that user nothing to act on.
      if (code.length === BACKUP_CODE_LENGTH) {
        throw new AppError(
          401,
          "INVALID_CODE",
          "That backup code is not valid or has already been used.",
        );
      }

      throw new AppError(
        400,
        "MFA_NOT_ENABLED",
        "TOTP MFA is not enabled for this user.",
      );
    }

    if (credential.locked_until && credential.locked_until > new Date()) {
      throw new AppError(
        429,
        "TOTP_LOCKED",
        "Too many failed attempts. Try again later.",
      );
    }

    const result = verifyTotp(
      decryptSecret(credential.secret_encrypted, config.MFA_ENCRYPTION_KEY),
      code,
      { backwardSteps: config.TOTP_BACKWARD_STEPS, forwardSteps: 0 },
    );

    if (!result?.verified) {
      await mfaRepository.recordTotpFailure(database, credential.id);
      throw new AppError(401, "INVALID_CODE", "Invalid verification code.");
    }

    if (!(await mfaRepository.advanceTotpStep(database, userId, result.step))) {
      throw new AppError(
        401,
        "INVALID_CODE",
        "TOTP code has already been used.",
      );
    }

    await sessionRepository.markSessionMfaVerified(database, sessionId);
    return { message: "MFA verified successfully" };
  }

  function resolveRpIdForOrigin(requestOrigin?: string): string {
    if (requestOrigin) {
      try {
        const hostname = new URL(requestOrigin).hostname;
        if (config.WEBAUTHN_RP_IDS.includes(hostname)) {
          return hostname;
        }
        if (
          hostname === config.RP_ID ||
          (config.RP_ID && hostname.endsWith(`.${config.RP_ID}`))
        ) {
          return config.RP_ID;
        }
      } catch {
        // ignore malformed URL
      }
    }
    return config.RP_ID;
  }

  async function getPasskeyRegisterOptions(
    user: AuthenticatedMfaUser,
    mfaVerified: boolean,
    requestOrigin?: string,
  ) {
    await assertStepUpForFactorChange(user.id, mfaVerified);

    const rpId = resolveRpIdForOrigin(requestOrigin);
    const existing = await mfaRepository.listUserPasskeys(database, user.id);
    const options = await generateRegistrationOptions({
      rpName: config.RP_NAME,
      rpID: rpId,
      userID: Uint8Array.from(Buffer.from(user.id)),
      userName: user.email || user.username || user.phoneNo || "user",
      userDisplayName: user.name,
      attestationType: "none",
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.credential_id,
        type: "public-key",
      })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });

    await mfaRepository.replaceChallenge(database, {
      id: crypto.randomUUID(),
      userId: user.id,
      challenge: options.challenge,
      type: "registration",
      expiresAt: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS),
    });

    return options;
  }

  async function verifyPasskeyRegistration({
    userId,
    sessionId,
    response,
    logger,
  }: {
    userId: string;
    sessionId: string;
    response: PasskeyRegisterVerifyRequest["response"];
    logger?: AuthLogger;
  }): Promise<{ message: string; backupCodes?: string[] }> {
    const record = await mfaRepository.findActiveChallenge(
      database,
      userId,
      "registration",
    );

    if (!record) {
      throw new AppError(
        400,
        "CHALLENGE_MISSING",
        "Registration challenge missing, expired, or already used. Call register/options first.",
      );
    }

    if (!(await mfaRepository.consumeChallenge(database, record.id))) {
      throw new AppError(
        400,
        "VERIFICATION_FAILED",
        "Challenge has already been used.",
      );
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: record.challenge,
        expectedOrigin: config.WEBAUTHN_ORIGINS,
        expectedRPID: config.WEBAUTHN_RP_IDS,
        requireUserVerification: true,
      });
    } catch (cause) {
      // The library's reason stays in the log; the client gets a fixed
      // message.
      logger?.warn(
        { err: cause, userId },
        "WebAuthn registration verification failed",
      );
      throw new AppError(
        400,
        "REGISTRATION_VERIFICATION_FAILED",
        "Passkey verification failed.",
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new AppError(
        400,
        "VERIFICATION_FAILED",
        "Passkey verification failed.",
      );
    }

    const { credential } = verification.registrationInfo;
    const passkeyId = crypto.randomUUID();
    const backupCodes = await database.transaction().execute(async (trx) => {
      await mfaRepository.insertPasskey(trx, {
        id: passkeyId,
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64"),
        counter: credential.counter,
        transports: response.transports?.join(",") ?? null,
      });
      await outbox.publish(trx, {
        type: "auth.passkey_added",
        version: 1,
        dedupeKey: `auth.passkey_added:${passkeyId}`,
        occurredAt: new Date(),
        payload: { recipientUserId: userId, passkeyId },
      });

      // A passkey lives on one device or password manager. Without a code
      // to fall back on, an account whose only factor is a passkey was
      // locked out the moment that passkey was out of reach. Codes are
      // issued whenever the account has none left: a first factor, or one
      // enrolled before passkeys came with codes.
      if (await mfaRepository.hasUnusedBackupCode(trx, userId)) {
        return undefined;
      }
      return issueBackupCodes(trx, userId);
    });

    await sessionService.completeMfaEnrolment(userId, sessionId);
    return {
      message: "Passkey registered successfully.",
      ...(backupCodes ? { backupCodes } : {}),
    };
  }

  async function getPasskeyLoginOptions(
    userId: string,
    requestOrigin?: string,
  ) {
    const rpId = resolveRpIdForOrigin(requestOrigin);
    const passkeys = await mfaRepository.listUserPasskeys(database, userId);
    const options = await generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credential_id,
        type: "public-key",
        transports: passkey.transports
          ? (passkey.transports.split(",") as never)
          : undefined,
      })),
      userVerification: "required",
    });

    await mfaRepository.replaceChallenge(database, {
      id: crypto.randomUUID(),
      userId,
      challenge: options.challenge,
      type: "authentication",
      expiresAt: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS),
    });

    return options;
  }

  async function verifyPasskeyLogin({
    userId,
    sessionId,
    response,
    logger,
  }: {
    userId: string;
    sessionId: string;
    response: PasskeyLoginVerifyRequest["response"];
    logger?: AuthLogger;
  }): Promise<{ message: string }> {
    const record = await mfaRepository.findActiveChallenge(
      database,
      userId,
      "authentication",
    );

    if (!record) {
      throw new AppError(
        400,
        "CHALLENGE_MISSING",
        "Authentication challenge missing, expired, or already used. Call login/options first.",
      );
    }

    if (!(await mfaRepository.consumeChallenge(database, record.id))) {
      throw new AppError(
        400,
        "VERIFICATION_FAILED",
        "Challenge has already been used.",
      );
    }

    const passkey = await mfaRepository.findUserPasskey(
      database,
      userId,
      response.id,
    );

    if (!passkey) {
      throw new AppError(
        400,
        "CREDENTIAL_NOT_FOUND",
        "Passkey credential matching this session is not registered.",
      );
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: record.challenge,
        expectedOrigin: config.WEBAUTHN_ORIGINS,
        expectedRPID: config.WEBAUTHN_RP_IDS,
        credential: {
          id: passkey.credential_id,
          publicKey: Buffer.from(passkey.public_key, "base64"),
          counter: Number(passkey.counter),
        },
        requireUserVerification: true,
      });
    } catch (cause) {
      logger?.warn({ err: cause, userId }, "WebAuthn assertion failed");
      throw new AppError(
        401,
        "ASSERTION_FAILED",
        "Passkey verification failed.",
      );
    }

    if (!verification.verified || !verification.authenticationInfo) {
      throw new AppError(
        401,
        "VERIFICATION_FAILED",
        "Assertion verification failed.",
      );
    }

    await database.transaction().execute(async (trx) => {
      await mfaRepository.updatePasskeyCounter(
        trx,
        passkey.id,
        verification.authenticationInfo.newCounter,
      );
      await sessionRepository.markSessionMfaVerified(trx, sessionId);
    });

    return { message: "MFA verified successfully." };
  }

  return {
    setupTotp,
    enableTotp,
    regenerateBackupCodes,
    disableTotp,
    deletePasskeys,
    verifyTotpCode,
    getPasskeyRegisterOptions,
    verifyPasskeyRegistration,
    getPasskeyLoginOptions,
    verifyPasskeyLogin,
  };
}

export type MfaService = ReturnType<typeof createMfaService>;
