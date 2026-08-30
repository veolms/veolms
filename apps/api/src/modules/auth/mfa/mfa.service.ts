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
  BACKUP_CODE_MAX,
  BACKUP_CODE_MIN,
  WEBAUTHN_CHALLENGE_TTL_MS,
} from "../shared/auth.constants.ts";
import * as mfaRepository from "./mfa.repository.ts";
import * as sessionRepository from "../session/session.repository.ts";
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashToken,
  verifyTotp,
} from "../shared/auth.utils.ts";
import type { SessionService } from "../session/session.service.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";

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

  function setupTotp(user: AuthenticatedMfaUser) {
    const label = user.email || user.username || user.phoneNo || "user";
    return generateTotpSecret(label, config.RP_NAME);
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

    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      crypto.randomInt(BACKUP_CODE_MIN, BACKUP_CODE_MAX + 1).toString(),
    );

    const credentialId = crypto.randomUUID();
    await database.transaction().execute(async (trx) => {
      await mfaRepository.replaceTotpCredential(trx, {
        id: credentialId,
        userId,
        secretEncrypted: encryptSecret(secret, config.MFA_ENCRYPTION_KEY),
        lastUsedStep: String(result.step),
      });

      await mfaRepository.replaceBackupCodes(
        trx,
        userId,
        backupCodes.map((value) => ({
          id: crypto.randomUUID(),
          user_id: userId,
          code_hash: hashToken(value),
        })),
      );
      await outbox.publish(trx, {
        type: "auth.mfa_enabled",
        version: 1,
        dedupeKey: `auth.mfa_enabled:${credentialId}`,
        occurredAt: new Date(),
        payload: { recipientUserId: userId },
      });
    });

    await sessionService.completeMfaEnrolment(userId, sessionId);
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

  async function getPasskeyRegisterOptions(
    user: AuthenticatedMfaUser,
    mfaVerified: boolean,
  ) {
    await assertStepUpForFactorChange(user.id, mfaVerified);

    const existing = await mfaRepository.listUserPasskeys(database, user.id);
    const options = await generateRegistrationOptions({
      rpName: config.RP_NAME,
      rpID: config.RP_ID,
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
  }: {
    userId: string;
    sessionId: string;
    response: PasskeyRegisterVerifyRequest["response"];
  }): Promise<{ message: string }> {
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
        expectedOrigin: config.WEB_URL,
        expectedRPID: config.RP_ID,
        requireUserVerification: true,
      });
    } catch (cause) {
      throw new AppError(
        400,
        "REGISTRATION_VERIFICATION_FAILED",
        `WebAuthn verification failed: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
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
    await database.transaction().execute(async (trx) => {
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
    });

    await sessionService.completeMfaEnrolment(userId, sessionId);
    return { message: "Passkey registered successfully." };
  }

  async function getPasskeyLoginOptions(userId: string) {
    const passkeys = await mfaRepository.listUserPasskeys(database, userId);
    const options = await generateAuthenticationOptions({
      rpID: config.RP_ID,
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
  }: {
    userId: string;
    sessionId: string;
    response: PasskeyLoginVerifyRequest["response"];
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
        expectedOrigin: config.WEB_URL,
        expectedRPID: config.RP_ID,
        credential: {
          id: passkey.credential_id,
          publicKey: Buffer.from(passkey.public_key, "base64"),
          counter: Number(passkey.counter),
        },
        requireUserVerification: true,
      });
    } catch (cause) {
      throw new AppError(
        401,
        "ASSERTION_FAILED",
        `WebAuthn assertion failed: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
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
    verifyTotpCode,
    getPasskeyRegisterOptions,
    verifyPasskeyRegistration,
    getPasskeyLoginOptions,
    verifyPasskeyLogin,
  };
}

export type MfaService = ReturnType<typeof createMfaService>;
