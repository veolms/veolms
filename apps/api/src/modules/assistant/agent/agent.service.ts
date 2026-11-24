import { setTimeout as sleep } from "node:timers/promises";

import {
  ASSISTANT_LIMITS,
  type AssistantCardResponse,
  type AssistantCreateCardRequest,
  type AssistantHeartbeatRequest,
  type AssistantInboxAckRequest,
  type AssistantInboxMessage,
  type AssistantInboxResponse,
  type AssistantInboxStop,
  type AssistantSendRequest,
  type AssistantSendResponse,
  type AssistantUpdateCardRequest,
  type ChatMessage,
} from "@veolms/contracts";
import { CLAUDE_ASSISTANT_USER_ID } from "@veolms/database";

import { listPlatformRoleNames } from "../../authorization/index.ts";
import { AssistantErrors } from "../shared/assistant.errors.ts";
import {
  isFinishedState,
  presentCard,
  renderCardBody,
} from "../shared/assistant.cards.ts";
import type { AssistantCardRow } from "../shared/assistant.repository.ts";
import type { AssistantRuntime } from "../shared/assistant.runtime.ts";
import { isValidAck, planInboxPage } from "./agent.inbox.ts";

/** How often a waiting inbox call looks again. */
const POLL_INTERVAL_MS = 1500;

/** The first steps every new card shows. */
const DEFAULT_STEPS = [{ label: "Queued", state: "done" as const }];

/** Files the agent may attach: what people can preview or download safely. */
const AGENT_UPLOAD_TYPES = [
  /^image\/(png|jpeg|webp|gif)$/u,
  /^video\/(mp4|webm)$/u,
  /^application\/(pdf|json|zip)$/u,
  /^text\/(plain|markdown|csv)$/u,
];

export function isAgentUploadType(mimeType: string): boolean {
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  return AGENT_UPLOAD_TYPES.some((pattern) => pattern.test(base));
}

/**
 * What the agent service does through the LMS: read new messages and stop
 * clicks (the inbox), confirm what it has saved, check in, post and update
 * status cards, and write messages and files as the assistant.
 */
export function createAgentService(runtime: AssistantRuntime) {
  const { database, repository, chat } = runtime;
  const assistantId = CLAUDE_ASSISTANT_USER_ID;

  async function assertConversation(roomId: string) {
    const conversation = await repository.findConversation(database, roomId);
    if (!conversation || conversation.assistant_id !== assistantId) {
      throw AssistantErrors.roomNotFound();
    }
    return conversation;
  }

  function toInboxMessage(
    message: ChatMessage,
    platformRoles: string[],
  ): AssistantInboxMessage {
    return {
      kind: "message",
      roomId: message.roomId,
      seq: message.seq,
      sender: {
        id: message.sender!.id,
        name: message.sender!.name,
        role: message.sender!.role,
        platformRoles,
      },
      body: message.body,
      replyToSeq:
        message.replyTo && !message.replyTo.roomId ? message.replyTo.seq : null,
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        width: attachment.width,
        height: attachment.height,
        durationMs: attachment.durationMs,
      })),
      sentAt: message.createdAt,
    };
  }

  /** One look at every conversation: what is new, plus stop clicks. */
  async function collect(
    limit: number,
  ): Promise<AssistantInboxResponse["items"]> {
    const items: AssistantInboxResponse["items"] = [];
    const conversations = await repository.listConversations(
      database,
      assistantId,
    );
    const lastSeqs = await chat.lastSeqs(conversations.map((c) => c.room_id));
    const rolesByUser = new Map<string, string[]>();

    for (const conversation of conversations) {
      if (items.length >= limit) break;
      const delivered = Number(conversation.delivered_seq);
      const last = lastSeqs.get(conversation.room_id) ?? 0;
      if (last <= delivered) continue;

      // Someone who may no longer use the assistant: nothing of theirs is
      // delivered, and the position moves on so it is not read again.
      if (!(await chat.canUseAssistant(conversation.user_id))) {
        await repository.advanceDelivered(database, conversation.room_id, last);
        continue;
      }
      const page = await chat.messagesAfter(
        conversation.room_id,
        delivered,
        limit - items.length,
      );
      const plan = planInboxPage(page, assistantId);
      if (plan.skipTo !== null) {
        await repository.advanceDelivered(
          database,
          conversation.room_id,
          plan.skipTo,
        );
      }
      for (const message of plan.deliver) {
        const senderId = message.sender!.id;
        let roles = rolesByUser.get(senderId);
        if (!roles) {
          roles = await listPlatformRoleNames(database, senderId);
          rolesByUser.set(senderId, roles);
        }
        items.push(toInboxMessage(message, roles));
      }
    }

    const stops = await repository.listPendingStops(database, assistantId);
    for (const stop of stops) {
      const item: AssistantInboxStop = {
        kind: "stop",
        roomId: stop.room_id,
        cardId: stop.id,
        requestedAt: (stop.stop_requested_at ?? new Date()).toISOString(),
      };
      items.push(item);
    }
    return items;
  }

  async function sendCardMessage(card: AssistantCardRow) {
    const body = renderCardBody(presentCard(card));
    const result = await chat.send(assistantId, card.room_id, {
      // The card's id: a retry never posts a second card.
      clientId: card.id,
      body,
      replyToSeq: Number(card.request_seq),
    });
    return (
      (await repository.updateCard(database, card.id, {
        message_seq: result.message.seq,
      })) ?? card
    );
  }

  return {
    /** New items, waiting up to `waitSeconds` when there are none. */
    async inbox(query: {
      waitSeconds: number;
      limit: number;
    }): Promise<AssistantInboxResponse> {
      const deadline = Date.now() + query.waitSeconds * 1000;
      for (;;) {
        const items = await collect(query.limit);
        if (items.length > 0 || Date.now() + POLL_INTERVAL_MS > deadline) {
          return { items };
        }
        await sleep(POLL_INTERVAL_MS);
      }
    },

    /** Confirms saved items: read positions move forward only. */
    async ack(input: AssistantInboxAckRequest) {
      const roomIds = [...new Set(input.messages.map((m) => m.roomId))];
      const lastSeqs = await chat.lastSeqs(roomIds);
      for (const roomId of roomIds) {
        const conversation = await repository.findConversation(
          database,
          roomId,
        );
        if (!conversation || conversation.assistant_id !== assistantId)
          continue;
        const highest = Math.max(
          ...input.messages
            .filter((m) => m.roomId === roomId)
            .map((m) => m.seq),
        );
        if (isValidAck(highest, lastSeqs.get(roomId))) {
          await repository.advanceDelivered(database, roomId, highest);
        }
      }
      await repository.markStopsDelivered(database, assistantId, input.stops);
      return { ok: true as const };
    },

    async heartbeat(input: AssistantHeartbeatRequest) {
      await repository.upsertHeartbeat(database, assistantId, {
        version: input.version ?? null,
        info: {
          running: input.running,
          queued: input.queued,
          problem: input.problem ?? null,
        },
      });
      return { ok: true as const };
    },

    /** Posts a request's status card; the same id returns the same card. */
    async createCard(
      input: AssistantCreateCardRequest,
    ): Promise<AssistantCardResponse> {
      const conversation = await assertConversation(input.roomId);
      let card = await repository.findCard(database, input.id);
      if (card && card.room_id !== input.roomId)
        throw AssistantErrors.cardNotFound();
      if (!card) {
        card =
          (await repository.insertCard(database, {
            id: input.id,
            roomId: input.roomId,
            requestSeq: input.requestSeq,
            requesterId: conversation.user_id,
            kind: input.kind,
            title: input.title,
            steps: input.steps ?? DEFAULT_STEPS,
          })) ??
          (await repository.findCardByRequest(
            database,
            input.roomId,
            input.requestSeq,
          ));
      }
      if (!card) throw AssistantErrors.cardNotFound();
      if (card.message_seq === null) card = await sendCardMessage(card);
      return { card: presentCard(card) };
    },

    /** Changes a card and redraws its message. Finished cards stay finished. */
    async updateCard(
      cardId: string,
      patch: AssistantUpdateCardRequest,
    ): Promise<AssistantCardResponse> {
      const card = await repository.findCard(database, cardId);
      if (!card) throw AssistantErrors.cardNotFound();
      await assertConversation(card.room_id);
      if (isFinishedState(card.state)) {
        const changes =
          (patch.state !== undefined && patch.state !== card.state) ||
          patch.steps !== undefined ||
          patch.links !== undefined ||
          patch.title !== undefined;
        if (changes) throw AssistantErrors.cardFinished();
        return { card: presentCard(card) };
      }
      let updated =
        (await repository.updateCard(database, cardId, {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.state !== undefined ? { state: patch.state } : {}),
          ...(patch.steps !== undefined ? { steps: patch.steps } : {}),
          ...(patch.links !== undefined ? { links: patch.links } : {}),
          finished: patch.state !== undefined && isFinishedState(patch.state),
        })) ?? card;
      if (updated.message_seq === null) {
        updated = await sendCardMessage(updated);
      } else {
        await chat.edit(
          assistantId,
          updated.room_id,
          Number(updated.message_seq),
          renderCardBody(presentCard(updated)),
        );
      }
      return { card: presentCard(updated) };
    },

    async send(
      roomId: string,
      input: AssistantSendRequest,
    ): Promise<AssistantSendResponse> {
      await assertConversation(roomId);
      const result = await chat.send(assistantId, roomId, input);
      return { seq: result.message.seq, duplicate: result.duplicate };
    },

    async upload(
      roomId: string,
      file: { name: string; mimeType: string; bytes: Buffer },
    ) {
      await assertConversation(roomId);
      if (file.bytes.length > ASSISTANT_LIMITS.uploadMaxBytes) {
        throw AssistantErrors.fileTooLarge(ASSISTANT_LIMITS.uploadMaxBytes);
      }
      if (file.bytes.length === 0 || !isAgentUploadType(file.mimeType)) {
        throw AssistantErrors.fileType();
      }
      return chat.uploadFile(assistantId, roomId, file);
    },

    async readFile(roomId: string, uploadId: string) {
      await assertConversation(roomId);
      return chat.readFile(assistantId, roomId, uploadId);
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;
