import crypto from "node:crypto";
import type {
  AcademyBrandResponse,
  ContactChangeCompletedResponse,
  ContactChangeResponse,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import { contactChangedEmail, type AppServices } from "@veolms/services";
import type { Kysely } from "kysely";
import { z } from "zod";

import { config } from "../../../config.ts";
import { AppError } from "../../../lib/errors.ts";
import type { OtpRequester, OtpService } from "../otp/otp.service.ts";
import { revokeOtherUserSessions } from "../session/session.repository.ts";
import { normalizePhoneIdentifier } from "../shared/auth.utils.ts";
import { evictCachedUserSessions } from "../shared/session-auth-cache.ts";
import * as repo from "./contact-change.repository.ts";
import {
  CONTACT_CHANGE_TTL_MS,
  contactChangeStep,
  maskEmail,
  maskPhone,
  type ContactChannel,
} from "./contact-change.rules.ts";

type ChangeRow = NonNullable<
  Awaited<ReturnType<typeof repo.findContactChange>>
>;
type AccountRow = NonNullable<
  Awaited<ReturnType<typeof repo.findAccountContact>>
>;

const emailValue = z.string().trim().toLowerCase().email().max(255);

const WHAT: Record<ContactChannel, string> = {
  email: "email address",
  phone: "mobile number",
};

function mask(channel: ContactChannel, value: string): string {
  return channel === "email" ? maskEmail(value) : maskPhone(value);
}

/** The value as the account stores it, or a 400 when it is not one. */
export function normalizeContactValue(
  channel: ContactChannel,
  raw: string,
): string {
  if (channel === "email") {
    const parsed = emailValue.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(400, "INVALID_EMAIL", "Enter a valid email address.");
    }
    return parsed.data;
  }
  const phone = normalizePhoneIdentifier(raw);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new AppError(
      400,
      "INVALID_PHONE_NUMBER",
      "Enter a valid mobile number.",
    );
  }
  return phone;
}

function taken(channel: ContactChannel): AppError {
  return channel === "email"
    ? new AppError(409, "EMAIL_TAKEN", "Already linked to another account.")
    : new AppError(409, "PHONE_TAKEN", "Already linked to another account.");
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "23505"
  );
}

function accountNotFound(): AppError {
  return new AppError(404, "USER_NOT_FOUND", "User account was not found.");
}

function currentOf(account: AccountRow, channel: ContactChannel) {
  return channel === "email"
    ? { value: account.email, confirmed: !!account.email_verified_at }
    : { value: account.phone_no, confirmed: !!account.phone_verified_at };
}

/**
 * The change, if there is one, at `step`. Anything else is told plainly:
 * gone, over, or a step taken out of turn. Asked again inside the write's
 * transaction, on the locked row, so a change that ran out or was
 * completed in the meantime is refused there too.
 */
function assertOpenAt(
  change: ChangeRow | undefined,
  step: "prove_current" | "confirm_new",
  now: Date,
): ChangeRow {
  if (!change) {
    throw new AppError(
      404,
      "CONTACT_CHANGE_NOT_FOUND",
      "This change was not found. Start again.",
    );
  }
  const at = contactChangeStep(change, now);
  if (at === "expired") {
    throw new AppError(
      400,
      "CONTACT_CHANGE_EXPIRED",
      "This change has expired. Start again.",
    );
  }
  if (at === "completed") {
    throw new AppError(
      400,
      "CONTACT_CHANGE_COMPLETED",
      "This change is already done.",
    );
  }
  if (at !== step) {
    throw new AppError(
      400,
      "CONTACT_CHANGE_OUT_OF_ORDER",
      step === "confirm_new"
        ? `Confirm your current ${WHAT[change.channel]} first.`
        : `Your current ${WHAT[change.channel]} is already confirmed.`,
    );
  }
  return change;
}

/**
 * The change still applies to the account as it is now: it holds the value
 * the change set out to replace, and a change that skipped proof (the value
 * was never confirmed) has not since seen it confirmed.
 */
function assertStillApplies(change: ChangeRow, account: AccountRow): void {
  const current = currentOf(account, change.channel);
  if (
    current.value !== change.current_value ||
    (!change.proof_required && current.confirmed)
  ) {
    throw new AppError(
      409,
      "CONTACT_CHANGED_MEANWHILE",
      `Your ${WHAT[change.channel]} changed in the meantime. Start again.`,
    );
  }
}

export interface ContactChangeLog {
  error(details: object, message: string): void;
}

export interface ContactChangeService {
  start(
    userId: string,
    channel: ContactChannel,
    requester: OtpRequester,
  ): Promise<ContactChangeResponse>;
  proveCurrent(
    userId: string,
    changeId: string,
    code: string,
  ): Promise<ContactChangeResponse>;
  sendToNew(
    userId: string,
    changeId: string,
    value: string,
    requester: OtpRequester,
  ): Promise<ContactChangeResponse>;
  confirmNew(
    userId: string,
    changeId: string,
    value: string,
    code: string,
    currentSessionId: string,
  ): Promise<ContactChangeCompletedResponse>;
}

export function createContactChangeService({
  database,
  otpService,
  services,
  getAcademyBrand,
  log,
  now = () => new Date(),
}: {
  database: Kysely<Database>;
  otpService: Pick<
    OtpService,
    | "sendContactChangeOtp"
    | "sendEmailVerificationOtp"
    | "sendPhoneVerificationOtp"
    | "assertOtpMatches"
    | "consumeOtpWithin"
    | "recordRefusedSend"
  >;
  services: Pick<AppServices, "email">;
  getAcademyBrand: () => Promise<AcademyBrandResponse>;
  log?: ContactChangeLog;
  now?: () => Date;
}): ContactChangeService {
  const codeSeconds = config.OTP_TTL_MINUTES * 60;

  function toResponse(
    change: ChangeRow,
    sent: string | null,
  ): ContactChangeResponse {
    return {
      id: change.id,
      channel: change.channel,
      step: change.current_proven_at ? "confirm_new" : "prove_current",
      sentTo: sent ? mask(change.channel, sent) : null,
      codeExpiresInSeconds: sent ? codeSeconds : null,
      expiresAt: change.expires_at,
    };
  }

  async function accountOf(userId: string): Promise<AccountRow> {
    const account = await repo.findAccountContact(database, userId);
    if (!account) throw accountNotFound();
    return account;
  }

  async function start(
    userId: string,
    channel: ContactChannel,
    requester: OtpRequester,
  ): Promise<ContactChangeResponse> {
    const current = currentOf(await accountOf(userId), channel);
    // A value never confirmed proves nothing (staff may have typed it, or
    // mistyped it): there is nothing to prove, only a new value to confirm.
    const needsProof = Boolean(current.value && current.confirmed);

    // Sent before the change is written: a code refused by the send limits
    // leaves no change behind.
    if (needsProof) {
      await otpService.sendContactChangeOtp(current.value!, channel, {
        ...requester,
        userId,
      });
    }

    const change = await database.transaction().execute(async (trx) => {
      // The account's row, held: two starts at once write one after the
      // other, and the second closes the first.
      const account = await repo.findAccountContact(trx, userId, {
        forUpdate: true,
      });
      if (!account) throw accountNotFound();
      const locked = currentOf(account, channel);
      if (
        locked.value !== current.value ||
        locked.confirmed !== current.confirmed
      ) {
        throw new AppError(
          409,
          "CONTACT_CHANGED_MEANWHILE",
          `Your ${WHAT[channel]} changed in the meantime. Start again.`,
        );
      }
      const startedAt = now();
      return repo.startContactChange(trx, {
        id: crypto.randomUUID(),
        user_id: userId,
        channel,
        current_value: current.value,
        current_proven_at: needsProof ? null : startedAt,
        proof_required: needsProof,
        expires_at: new Date(startedAt.getTime() + CONTACT_CHANGE_TTL_MS),
      });
    });
    return toResponse(change, needsProof ? current.value : null);
  }

  async function proveCurrent(
    userId: string,
    changeId: string,
    code: string,
  ): Promise<ContactChangeResponse> {
    const change = assertOpenAt(
      await repo.findContactChange(database, userId, changeId),
      "prove_current",
      now(),
    );
    assertStillApplies(change, await accountOf(userId));
    // A wrong guess is counted here; the code is spent with the write below,
    // so a write that fails leaves it usable.
    await otpService.assertOtpMatches(
      change.current_value!,
      change.channel,
      "contact_change",
      code,
    );

    const proven = await database.transaction().execute(async (trx) => {
      const locked = assertOpenAt(
        await repo.findContactChange(trx, userId, changeId, {
          forUpdate: true,
        }),
        "prove_current",
        now(),
      );
      await otpService.consumeOtpWithin(
        trx,
        locked.current_value!,
        locked.channel,
        "contact_change",
        code,
      );
      return repo.updateContactChange(trx, locked.id, {
        current_proven_at: now(),
      });
    });
    return toResponse(proven, null);
  }

  async function sendToNew(
    userId: string,
    changeId: string,
    rawValue: string,
    requester: OtpRequester,
  ): Promise<ContactChangeResponse> {
    const change = assertOpenAt(
      await repo.findContactChange(database, userId, changeId),
      "confirm_new",
      now(),
    );
    const value = normalizeContactValue(change.channel, rawValue);
    assertStillApplies(change, await accountOf(userId));
    if (value === change.current_value) {
      throw new AppError(
        400,
        "CONTACT_UNCHANGED",
        `That is already your ${WHAT[change.channel]}.`,
      );
    }

    const sender = { ...requester, userId };
    const purpose =
      change.channel === "email" ? "email_verification" : "phone_verification";
    const holder = await repo.findAccountHolding(
      database,
      change.channel,
      value,
    );
    if (holder && holder.id !== userId) {
      // Told, as the learner needs to know, but charged as a sent code:
      // a free refusal would let an account test addresses for membership.
      await otpService.recordRefusedSend(
        value,
        change.channel,
        purpose,
        sender,
        {
          countAgainstDestination: false,
        },
      );
      throw taken(change.channel);
    }

    if (change.channel === "email") {
      await otpService.sendEmailVerificationOtp(value, sender);
    } else {
      await otpService.sendPhoneVerificationOtp(value, sender);
    }
    const sent = await repo.updateContactChange(database, change.id, {
      new_value: value,
    });
    return toResponse(sent, value);
  }

  async function confirmNew(
    userId: string,
    changeId: string,
    rawValue: string,
    code: string,
    currentSessionId: string,
  ): Promise<ContactChangeCompletedResponse> {
    const change = assertOpenAt(
      await repo.findContactChange(database, userId, changeId),
      "confirm_new",
      now(),
    );
    const value = normalizeContactValue(change.channel, rawValue);
    if (value !== change.new_value) {
      throw new AppError(
        400,
        "CONTACT_CHANGE_VALUE_MISMATCH",
        `Enter the code sent to the new ${WHAT[change.channel]}.`,
      );
    }
    assertStillApplies(change, await accountOf(userId));

    const purpose =
      change.channel === "email" ? "email_verification" : "phone_verification";
    // The code first: nothing is said about the value to a caller without it.
    await otpService.assertOtpMatches(value, change.channel, purpose, code);
    const holder = await repo.findAccountHolding(
      database,
      change.channel,
      value,
    );
    if (holder && holder.id !== userId) throw taken(change.channel);

    // Everything that makes the change happens together or not at all: the
    // code spent, the value replaced, the change completed and the other
    // devices signed out. All of it is checked again here, on the account's
    // and the change's rows, held, so nothing between the checks above and
    // these writes (a verification, a staff edit, another change, the time
    // running out) can be overwritten.
    let previous: AccountRow;
    try {
      previous = await database.transaction().execute(async (trx) => {
        const account = await repo.findAccountContact(trx, userId, {
          forUpdate: true,
        });
        if (!account) throw accountNotFound();
        const locked = assertOpenAt(
          await repo.findContactChange(trx, userId, changeId, {
            forUpdate: true,
          }),
          "confirm_new",
          now(),
        );
        assertStillApplies(locked, account);
        if (locked.new_value !== value) {
          throw new AppError(
            400,
            "CONTACT_CHANGE_VALUE_MISMATCH",
            `Enter the code sent to the new ${WHAT[locked.channel]}.`,
          );
        }

        await otpService.consumeOtpWithin(
          trx,
          value,
          locked.channel,
          purpose,
          code,
        );
        const confirmedAt = now();
        const updated = await repo.replaceAccountContact(
          trx,
          userId,
          locked.channel,
          value,
          confirmedAt,
        );
        if (!updated) throw accountNotFound();
        await repo.updateContactChange(trx, locked.id, {
          completed_at: confirmedAt,
        });
        // Whoever else held a session (a stolen one included) signs in
        // again, now with the new value.
        await revokeOtherUserSessions(trx, userId, currentSessionId);
        return account;
      });
    } catch (err) {
      // Taken by another account between the check and the write.
      if (isUniqueViolation(err)) throw taken(change.channel);
      throw err;
    }

    // Dropped after the commit as well: a request between the revocation
    // and the commit could have cached the sessions as they were.
    evictCachedUserSessions(userId);
    await notifyChange(previous, change.channel, value);
    return { channel: change.channel, value };
  }

  /**
   * Tells the account's confirmed email address (the old one, when the
   * email changed) that the change was made. Sent only once the change has
   * committed, and best effort: the change stands whether or not the
   * message goes out.
   */
  async function notifyChange(
    account: AccountRow,
    channel: ContactChannel,
    newValue: string,
  ) {
    if (!account.email || !account.email_verified_at) return;
    try {
      const brand = await getAcademyBrand();
      await services.email.send(
        account.email,
        contactChangedEmail({
          academyName: brand.name,
          logoUrl: brand.logoUrl,
          channel,
          newValueMasked: mask(channel, newValue),
        }),
      );
    } catch (err) {
      log?.error(
        { err, userId: account.id, channel },
        "the contact change notice could not be sent",
      );
    }
  }

  return { start, proveCurrent, sendToNew, confirmNew };
}
