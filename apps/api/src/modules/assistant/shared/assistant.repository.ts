import type {
  AssistantCardLink,
  AssistantCardState,
  AssistantCardStep,
  AssistantCardKind,
  DatabaseExecutor as Executor,
} from "@veolms/database";
import { sql } from "kysely";

/** Assistant tables: conversations, status cards and heartbeats. */
export function createAssistantRepository() {
  return {
    async findConversationByUser(
      db: Executor,
      assistantId: string,
      userId: string,
    ) {
      return db
        .selectFrom("assistant_conversations")
        .selectAll()
        .where("assistant_id", "=", assistantId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    async findConversation(db: Executor, roomId: string) {
      return db
        .selectFrom("assistant_conversations")
        .selectAll()
        .where("room_id", "=", roomId)
        .executeTakeFirst();
    },

    async insertConversation(
      db: Executor,
      values: { roomId: string; assistantId: string; userId: string },
    ) {
      await db
        .insertInto("assistant_conversations")
        .values({
          room_id: values.roomId,
          assistant_id: values.assistantId,
          user_id: values.userId,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    },

    async listConversations(db: Executor, assistantId: string) {
      return db
        .selectFrom("assistant_conversations")
        .select(["room_id", "user_id", "delivered_seq"])
        .where("assistant_id", "=", assistantId)
        .execute();
    },

    /** Moves the read position forward only (never back). */
    async advanceDelivered(db: Executor, roomId: string, seq: number) {
      await db
        .updateTable("assistant_conversations")
        .set({ delivered_seq: sql`greatest(delivered_seq, ${seq}::bigint)` })
        .where("room_id", "=", roomId)
        .execute();
    },

    async findCard(db: Executor, cardId: string) {
      return db
        .selectFrom("assistant_cards")
        .selectAll()
        .where("id", "=", cardId)
        .executeTakeFirst();
    },

    async findCardByRequest(db: Executor, roomId: string, requestSeq: number) {
      return db
        .selectFrom("assistant_cards")
        .selectAll()
        .where("room_id", "=", roomId)
        .where("request_seq", "=", String(requestSeq))
        .executeTakeFirst();
    },

    async insertCard(
      db: Executor,
      values: {
        id: string;
        roomId: string;
        requestSeq: number;
        requesterId: string;
        kind: AssistantCardKind;
        title: string;
        steps: AssistantCardStep[];
      },
    ) {
      return db
        .insertInto("assistant_cards")
        .values({
          id: values.id,
          room_id: values.roomId,
          request_seq: values.requestSeq,
          requester_id: values.requesterId,
          kind: values.kind,
          title: values.title,
          steps: JSON.stringify(values.steps),
        })
        .onConflict((oc) => oc.doNothing())
        .returningAll()
        .executeTakeFirst();
    },

    async updateCard(
      db: Executor,
      cardId: string,
      patch: Partial<{
        title: string;
        state: AssistantCardState;
        steps: AssistantCardStep[];
        links: AssistantCardLink[];
        message_seq: number;
        finished: boolean;
      }>,
    ) {
      return db
        .updateTable("assistant_cards")
        .set({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.state !== undefined ? { state: patch.state } : {}),
          ...(patch.steps !== undefined
            ? { steps: JSON.stringify(patch.steps) }
            : {}),
          ...(patch.links !== undefined
            ? { links: JSON.stringify(patch.links) }
            : {}),
          ...(patch.message_seq !== undefined
            ? { message_seq: patch.message_seq }
            : {}),
          ...(patch.finished ? { finished_at: sql<Date>`now()` } : {}),
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", cardId)
        .returningAll()
        .executeTakeFirst();
    },

    async listCards(db: Executor, roomId: string, limit: number) {
      return db
        .selectFrom("assistant_cards")
        .selectAll()
        .where("room_id", "=", roomId)
        .orderBy("created_at", "desc")
        .limit(limit)
        .execute();
    },

    /** Marks a stop request once; later calls change nothing. */
    async requestStop(db: Executor, cardId: string) {
      return db
        .updateTable("assistant_cards")
        .set({
          stop_requested_at: sql<Date>`now()`,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", cardId)
        .where("stop_requested_at", "is", null)
        .returningAll()
        .executeTakeFirst();
    },

    /** Stop clicks the agent has not been told about, for its chats. */
    async listPendingStops(db: Executor, assistantId: string) {
      return db
        .selectFrom("assistant_cards as c")
        .innerJoin("assistant_conversations as v", "v.room_id", "c.room_id")
        .select(["c.id", "c.room_id", "c.stop_requested_at"])
        .where("v.assistant_id", "=", assistantId)
        .where("c.stop_requested_at", "is not", null)
        .where("c.stop_delivered_at", "is", null)
        .orderBy("c.stop_requested_at")
        .limit(100)
        .execute();
    },

    async markStopsDelivered(
      db: Executor,
      assistantId: string,
      cardIds: readonly string[],
    ) {
      if (cardIds.length === 0) return;
      await db
        .updateTable("assistant_cards")
        .set({ stop_delivered_at: sql<Date>`now()` })
        .where("id", "in", [...cardIds])
        .where("stop_requested_at", "is not", null)
        .where("stop_delivered_at", "is", null)
        .where(
          "room_id",
          "in",
          db
            .selectFrom("assistant_conversations")
            .select("room_id")
            .where("assistant_id", "=", assistantId),
        )
        .execute();
    },

    async upsertHeartbeat(
      db: Executor,
      assistantId: string,
      values: { version: string | null; info: Record<string, unknown> },
    ) {
      await db
        .insertInto("assistant_heartbeats")
        .values({
          assistant_id: assistantId,
          version: values.version,
          info: JSON.stringify(values.info),
        })
        .onConflict((oc) =>
          oc.column("assistant_id").doUpdateSet({
            seen_at: sql<Date>`now()`,
            version: values.version,
            info: JSON.stringify(values.info),
          }),
        )
        .execute();
    },

    async findHeartbeat(db: Executor, assistantId: string) {
      return db
        .selectFrom("assistant_heartbeats")
        .selectAll()
        .where("assistant_id", "=", assistantId)
        .executeTakeFirst();
    },
  };
}

export type AssistantRepository = ReturnType<typeof createAssistantRepository>;
export type AssistantCardRow = NonNullable<
  Awaited<ReturnType<AssistantRepository["findCard"]>>
>;
