import {
  ASSISTANT_LIMITS,
  type AssistantCardListResponse,
  type AssistantCardResponse,
  type AssistantInfoResponse,
} from "@veolms/contracts";
import { CLAUDE_ASSISTANT_USER_ID } from "@veolms/database";

import { AssistantErrors } from "../shared/assistant.errors.ts";
import { isFinishedState, presentCard } from "../shared/assistant.cards.ts";
import type { AssistantRuntime } from "../shared/assistant.runtime.ts";

/** The agent counts as online when it checked in within this time. */
const ONLINE_WINDOW_MS = 2 * 60_000;

/**
 * What admins and instructors do: find the assistant, open their private
 * chat with it, see the status cards of their requests and stop one.
 * Writing itself goes through the normal chat routes.
 */
export function createConversationService(runtime: AssistantRuntime) {
  const { database, repository, chat } = runtime;
  const assistantId = CLAUDE_ASSISTANT_USER_ID;

  async function assertOwnConversation(userId: string, roomId: string) {
    const conversation = await repository.findConversation(database, roomId);
    if (!conversation || conversation.user_id !== userId) {
      throw AssistantErrors.roomNotFound();
    }
    return conversation;
  }

  return {
    async info(userId: string): Promise<AssistantInfoResponse> {
      const available = await chat.canUseAssistant(userId);
      if (!available) {
        return {
          available: false,
          assistant: null,
          roomId: null,
          online: false,
          lastSeenAt: null,
          problem: null,
        };
      }
      const [conversation, heartbeat] = await Promise.all([
        repository.findConversationByUser(database, assistantId, userId),
        repository.findHeartbeat(database, assistantId),
      ]);
      const seen = heartbeat?.seen_at ?? null;
      const problem =
        typeof heartbeat?.info?.["problem"] === "string"
          ? (heartbeat.info["problem"] as string)
          : null;
      return {
        available: true,
        assistant: { userId: assistantId, name: "Claude" },
        roomId: conversation?.room_id ?? null,
        online: seen !== null && Date.now() - seen.getTime() < ONLINE_WINDOW_MS,
        lastSeenAt: seen ? seen.toISOString() : null,
        problem,
      };
    },

    async open(userId: string): Promise<{ roomId: string }> {
      if (!(await chat.canUseAssistant(userId))) {
        throw AssistantErrors.notAllowed();
      }
      const { roomId } = await chat.openConversation(userId, assistantId);
      await repository.insertConversation(database, {
        roomId,
        assistantId,
        userId,
      });
      return { roomId };
    },

    async cards(
      userId: string,
      roomId: string,
    ): Promise<AssistantCardListResponse> {
      await assertOwnConversation(userId, roomId);
      const rows = await repository.listCards(
        database,
        roomId,
        ASSISTANT_LIMITS.cardsPerPage,
      );
      return { cards: rows.map(presentCard) };
    },

    /** Asks the agent to stop. Safe to repeat; finished requests stay as they are. */
    async stop(userId: string, cardId: string): Promise<AssistantCardResponse> {
      const card = await repository.findCard(database, cardId);
      if (!card) throw AssistantErrors.cardNotFound();
      await assertOwnConversation(userId, card.room_id);
      if (isFinishedState(card.state) || card.stop_requested_at) {
        return { card: presentCard(card) };
      }
      const updated = (await repository.requestStop(database, cardId)) ?? card;
      return { card: presentCard(updated) };
    },
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
