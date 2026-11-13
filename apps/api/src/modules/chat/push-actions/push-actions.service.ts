import type {
  PushActionReadResponse,
  PushActionReplyRequest,
  PushActionReplyResponse,
} from "@veolms/contracts";

import { createSessionService } from "../../auth/index.ts";
import {
  PushActionErrors,
  type BegunPushAction,
} from "../../notifications/index.ts";
import { createMessagesService } from "../messages/messages.service.ts";
import type { ChatRuntime } from "../shared/chat.runtime.ts";

/**
 * "Reply" and "Mark as read" from a chat notification on the phone, called
 * by the app's native code with the push's single-use token instead of the
 * session (docs/mobile-push.md, "Reply from a notification").
 *
 * In order: the token is checked and spent (one transaction, row locked);
 * the login it was issued to must still hold, as for any request with the
 * cookie (signed in, not expired, no two-factor step pending); a reply is
 * refused once the chat was read since the push; then the action runs
 * through the same code as the cookie routes, with every chat rule
 * (member, blocked, request declined, slow mode). A refused action leaves
 * the token usable.
 */
export function createPushActionsService(runtime: ChatRuntime) {
  const { database, repository, actionTokens } = runtime;
  const messages = createMessagesService(runtime);
  const sessions = createSessionService({ database });

  async function userOf(action: BegunPushAction): Promise<string> {
    const login = await sessions.authenticateSessionById(action.sessionId);
    if (!login || login.userId !== action.userId) {
      throw PushActionErrors.signedOut();
    }
    return login.userId;
  }

  /** Read up to the token's message since the push (here or elsewhere). */
  async function assertNotReadSince(action: BegunPushAction) {
    const member = await repository.findMember(
      database,
      action.roomId,
      action.userId,
    );
    const readSeq = Number(member?.last_read_seq ?? 0);
    if (readSeq >= action.staleFromSeq) throw PushActionErrors.stale();
  }

  async function reply(
    token: string,
    input: PushActionReplyRequest,
  ): Promise<{ response: PushActionReplyResponse; duplicate: boolean }> {
    const action = await actionTokens.begin(
      token,
      "chat.reply",
      input.clientId,
    );
    let sent: Awaited<ReturnType<typeof messages.send>>;
    try {
      const userId = await userOf(action);
      // A retry was already sent: the user's own message counts as read.
      if (!action.retry) await assertNotReadSince(action);
      sent = await messages.send(userId, action.roomId, {
        clientId: input.clientId,
        body: input.body,
      });
    } catch (error) {
      await actionTokens.release(action, input.clientId);
      throw error;
    }
    const next = await actionTokens.rotate(action, sent.message.seq);
    return {
      duplicate: sent.duplicate || action.retry,
      response: {
        message: { seq: sent.message.seq, sentAt: sent.message.createdAt },
        nextToken: next.token,
        nextTokenExpiresAt: next.expiresAt.toISOString(),
      },
    };
  }

  async function markRead(token: string): Promise<PushActionReadResponse> {
    const action = await actionTokens.begin(token, "chat.read", null);
    try {
      const userId = await userOf(action);
      messages.receipts(userId, [
        { roomId: action.roomId, readSeq: action.seq },
      ]);
    } catch (error) {
      await actionTokens.release(action, null);
      throw error;
    }
    return { readSeq: action.seq };
  }

  return { reply, markRead, peekUserId: actionTokens.peekUserId };
}

export type PushActionsService = ReturnType<typeof createPushActionsService>;
