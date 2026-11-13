import crypto from "node:crypto";

import {
  PUSH_ACTION_ERROR_CODES,
  PUSH_ACTION_TOKEN_PREFIX,
} from "@veolms/contracts";
import type { Database, PushActionScope } from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../../lib/errors.ts";
import * as tokenRepository from "./push-action-tokens.repository.ts";
import { insertPushDeliveries } from "./push-deliveries.repository.ts";
import { chatReadPushDeliveries } from "./push-payloads.ts";

/**
 * Push action tokens (docs/mobile-push.md, "Reply from a notification").
 *
 * Issued once per chat push per phone, carried in that push's data. Each
 * one lets the app's native code, which never has the session, do one
 * thing in one chat as the phone's login: reply (which hands back a fresh
 * token for the next reply) or mark the chat read. Random 256 bits, stored
 * as a SHA-256; used once; ends when it expires, is superseded by a newer
 * push for the chat, or the chat is read up to its message anywhere.
 *
 * This service owns the token rows. Whether the login still holds and the
 * chat rules (member, blocked, slow mode, already read) are the chat
 * module's: it calls `begin`, checks, acts, then `rotate` or `release`.
 */

const ALL_SCOPES: PushActionScope[] = ["chat.reply", "chat.read"];

export interface IssuedPushActionToken {
  token: string;
  expiresAt: Date;
}

/** A token checked and spent for one action, its row locked meanwhile. */
export interface BegunPushAction {
  id: string;
  userId: string;
  deviceId: string;
  sessionId: string;
  roomId: string;
  seq: number;
  staleFromSeq: number;
  /** The same reply sent again (its response was lost): not a new use. */
  retry: boolean;
}

export const PushActionErrors = {
  invalid: () =>
    new AppError(
      401,
      PUSH_ACTION_ERROR_CODES.invalid,
      "This notification can no longer be used. Open the chat to reply.",
    ),
  expired: () =>
    new AppError(
      401,
      PUSH_ACTION_ERROR_CODES.expired,
      "This notification has expired. Open the chat to reply.",
    ),
  signedOut: () =>
    new AppError(401, PUSH_ACTION_ERROR_CODES.signedOut, "Sign in to reply."),
  stale: () =>
    new AppError(
      409,
      PUSH_ACTION_ERROR_CODES.stale,
      "This chat was read since this notification.",
    ),
};

function newToken(): { token: string; hash: string } {
  const token = `${PUSH_ACTION_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return { token, hash: hashPushActionToken(token) };
}

export function hashPushActionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createPushActionTokenService({
  database,
  enabled,
  ttlHours,
  pushEnabled,
  now = () => new Date(),
}: {
  database: Kysely<Database>;
  /** PUSH_ACTIONS_ENABLED: off, tokens carry no scopes and pushes no token. */
  enabled: boolean;
  ttlHours: number;
  /** Whether this server queues pushes at all (isPushConfigured). */
  pushEnabled: boolean;
  now?: () => Date;
}) {
  const ttlMs = ttlHours * 60 * 60 * 1000;

  async function insert(input: {
    userId: string;
    deviceId: string;
    sessionId: string;
    roomId: string;
    seq: number;
    staleFromSeq: number;
    at: Date;
  }): Promise<{ id: string } & IssuedPushActionToken> {
    const { token, hash } = newToken();
    const expiresAt = new Date(input.at.getTime() + ttlMs);
    const id = await tokenRepository.insertToken(database, {
      tokenHash: hash,
      userId: input.userId,
      deviceId: input.deviceId,
      sessionId: input.sessionId,
      roomId: input.roomId,
      seq: input.seq,
      staleFromSeq: input.staleFromSeq,
      // Off, the row still records that the phone may show the chat's
      // notification, so a read elsewhere clears it; it allows nothing.
      scopes: enabled ? ALL_SCOPES : [],
      expiresAt,
    });
    return { id, token, expiresAt };
  }

  /**
   * One token for one chat push to one phone; older ones for the same
   * phone and chat stop working. Null when push actions are off (nothing
   * goes into the push then).
   */
  async function issueForChatPush(input: {
    userId: string;
    deviceId: string;
    sessionId: string;
    roomId: string;
    seq: number;
  }): Promise<IssuedPushActionToken | null> {
    const at = now();
    const issued = await insert({ ...input, staleFromSeq: input.seq, at });
    await tokenRepository.revokeDeviceRoomTokens(database, {
      deviceId: input.deviceId,
      roomId: input.roomId,
      belowSeq: input.seq,
      exceptId: issued.id,
      reason: "superseded",
      now: at,
    });
    return enabled
      ? { token: issued.token, expiresAt: issued.expiresAt }
      : null;
  }

  /**
   * Checks a token for `scope` and spends it, in one transaction with the
   * row locked. A reply sent again with the same `clientId` (the phone lost
   * the answer) passes as a retry. Throws PUSH_ACTION_INVALID / _EXPIRED.
   */
  async function begin(
    token: string,
    scope: PushActionScope,
    clientId: string | null,
  ): Promise<BegunPushAction> {
    if (!token.startsWith(PUSH_ACTION_TOKEN_PREFIX)) {
      throw PushActionErrors.invalid();
    }
    const hash = hashPushActionToken(token);
    return await database.transaction().execute(async (trx) => {
      const row = await tokenRepository.findTokenForUpdate(trx, hash);
      if (!row || !row.scopes.includes(scope) || row.revoked_at) {
        throw PushActionErrors.invalid();
      }
      const retry =
        row.used_at !== null &&
        clientId !== null &&
        row.used_client_id === clientId;
      if (row.used_at && !retry) throw PushActionErrors.invalid();
      if (!retry && row.expires_at.getTime() <= now().getTime()) {
        throw PushActionErrors.expired();
      }
      if (!retry) {
        await tokenRepository.markTokenUsed(trx, {
          id: row.id,
          clientId,
          now: now(),
        });
      }
      return {
        id: row.id,
        userId: row.user_id,
        deviceId: row.push_device_id,
        sessionId: row.session_id,
        roomId: row.room_id,
        seq: row.seq,
        staleFromSeq: row.stale_from_seq,
        retry,
      };
    });
  }

  /** The action was refused (chat rules, slow mode): the token works again. */
  async function release(action: BegunPushAction, clientId: string | null) {
    if (action.retry) return;
    await tokenRepository.unmarkTokenUsed(database, {
      id: action.id,
      clientId,
    });
  }

  /**
   * After a reply: the token for the next reply from the same notification.
   * It goes stale only when a message after the reply is read (the user's
   * own message already counts as read). Tokens this replaces, among them
   * one handed out for a first attempt whose answer never arrived, stop
   * working.
   */
  async function rotate(
    action: BegunPushAction,
    replySeq: number,
  ): Promise<IssuedPushActionToken> {
    const at = now();
    const issued = await insert({
      userId: action.userId,
      deviceId: action.deviceId,
      sessionId: action.sessionId,
      roomId: action.roomId,
      seq: replySeq,
      staleFromSeq: replySeq + 1,
      at,
    });
    await tokenRepository.revokeDeviceRoomTokens(database, {
      deviceId: action.deviceId,
      roomId: action.roomId,
      uptoSeq: replySeq,
      exceptId: issued.id,
      reason: "rotated",
      now: at,
    });
    return { token: issued.token, expiresAt: issued.expiresAt };
  }

  /** Who a token belongs to (rate limits), or null. Never spends it. */
  async function peekUserId(token: string): Promise<string | null> {
    if (!token.startsWith(PUSH_ACTION_TOKEN_PREFIX)) return null;
    return await tokenRepository.findTokenUserId(
      database,
      hashPushActionToken(token),
    );
  }

  /**
   * Chats read up to `readSeq` (anywhere): their now-stale tokens stop
   * working, and the phones that held them get a silent "chat read" push
   * so the notification goes away. Clean-up only: the check at use reads
   * the read position itself.
   */
  async function onChatRead(
    reads: ReadonlyArray<{ userId: string; roomId: string; readSeq: number }>,
  ): Promise<void> {
    const at = now();
    const revoked = await tokenRepository.revokeReadTokens(database, reads, at);
    if (revoked.length === 0 || !pushEnabled) return;
    const byChat = new Map<
      string,
      { userId: string; roomId: string; readSeq: number; deviceIds: string[] }
    >();
    for (const row of revoked) {
      const key = `${row.user_id}|${row.room_id}`;
      const read = reads.find(
        (entry) => entry.userId === row.user_id && entry.roomId === row.room_id,
      )!;
      const entry = byChat.get(key) ?? {
        userId: row.user_id,
        roomId: row.room_id,
        readSeq: read.readSeq,
        deviceIds: [],
      };
      if (!entry.deviceIds.includes(row.push_device_id)) {
        entry.deviceIds.push(row.push_device_id);
      }
      byChat.set(key, entry);
    }
    await insertPushDeliveries(
      database,
      chatReadPushDeliveries([...byChat.values()], at),
    );
  }

  /** Hourly upkeep: rows done with for a day. */
  async function deleteOld(): Promise<number> {
    return await tokenRepository.deleteOldTokens(
      database,
      new Date(now().getTime() - 24 * 60 * 60 * 1000),
    );
  }

  return {
    issueForChatPush,
    begin,
    release,
    rotate,
    peekUserId,
    onChatRead,
    deleteOld,
  };
}

export type PushActionTokenService = ReturnType<
  typeof createPushActionTokenService
>;
