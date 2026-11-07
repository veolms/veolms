import type {
  ChatDirectPolicy,
  ChatReason,
  ChatReportSnapshot,
  ChatRestrictionType,
  ChatRoomTable,
  ChatUploadKind,
  ChatAttachmentRef,
  DatabaseExecutor as Executor,
} from "@veolms/database";
import { sql, type Selectable } from "kysely";

import {
  fuzzyMatchesAny,
  fuzzySearchTerm,
  isFuzzySearchTerm,
} from "../../../lib/fuzzy-search.ts";
import { CHAT_CHANNEL } from "../realtime/chat-bus.ts";

/**
 * Every chat query. The chat tables are owned by this module; the course
 * reads (title, creator, openness) follow the discussions module's
 * precedent of reading course state directly for access decisions.
 *
 * Postgres bigint columns arrive as strings; presenters turn them into
 * numbers (chat numbers stay far below 2^53).
 */

export type ChatRoomRow = Selectable<ChatRoomTable>;

export interface CourseGateRow {
  id: string;
  title: string;
  creator_id: string | null;
  status: string;
  deleted_at: Date | null;
  access_type: string | null;
  pricing_type: string | null;
}

export interface PersonRow {
  id: string;
  display_name: string;
  avatar_data_url: string | null;
  is_deleted: boolean;
}

export interface MessageRow {
  room_id: string;
  seq: string;
  id: string;
  version_seq: string;
  sender_id: string | null;
  sender_role: string;
  kind: string;
  body: string;
  reply_to_seq: string | null;
  mentions: string[];
  mention_all: boolean;
  reaction_counts: Record<string, number>;
  attachments: ChatAttachmentRef[];
  pinned_at: Date | null;
  created_at: Date;
  edited_at: Date | null;
  deleted_at: Date | null;
  deleted_by: string | null;
  deleted_reason: string | null;
  sender_name: string | null;
  sender_avatar: string | null;
  sender_deleted: boolean | null;
  deleted_by_name: string | null;
  reply_body: string | null;
  reply_deleted_at: Date | null;
  reply_sender_name: string | null;
}

export interface RoomListRow extends ChatRoomRow {
  room_role: string | null;
  member_state: string | null;
  last_read_seq: string | null;
  last_delivered_seq: string | null;
  notify_level: string | null;
  archived_at: Date | null;
  member_pinned_at: Date | null;
  course_title: string | null;
  course_thumbnail: string | null;
  course_thumbnail_media_id: string | null;
  lm_seq: string | null;
  lm_sender_id: string | null;
  lm_sender_name: string | null;
  lm_body: string | null;
  lm_attachments: ChatAttachmentRef[] | null;
  lm_kind: string | null;
  lm_deleted_at: Date | null;
  lm_created_at: Date | null;
}

export interface RestrictionRow {
  id: string;
  user_id: string;
  room_id: string | null;
  type: ChatRestrictionType;
  until: Date | null;
  reason: ChatReason;
  note: string | null;
  created_by: string | null;
  created_at: Date;
  revoked_at: Date | null;
}

export interface SendResult {
  outcome:
    | "sent"
    | "duplicate"
    | "room_missing"
    | "locked"
    | "slow_mode"
    | "repeated"
    | "awaiting_accept";
  message_id: string | null;
  message_seq: string | null;
  message_event_seq: string | null;
  message_created_at: Date | null;
  wait_seconds: number | null;
}

/** Chat writes don't wait for the synchronous copy (plan decision 8). */
async function localCommit(trx: Executor): Promise<void> {
  await sql`set local synchronous_commit = local`.execute(trx);
}

export function createChatRepository() {
  function messageQuery(db: Executor, viewerId: string | null) {
    let query = db
      .selectFrom("chat_messages as m")
      .leftJoin("users as su", "su.id", "m.sender_id")
      .leftJoin("users as du", "du.id", "m.deleted_by")
      .leftJoin("chat_messages as rm", (join) =>
        join
          .onRef("rm.room_id", "=", "m.room_id")
          .onRef("rm.seq", "=", "m.reply_to_seq"),
      )
      .leftJoin("users as ru", "ru.id", "rm.sender_id")
      .select([
        "m.room_id",
        "m.seq",
        "m.id",
        "m.version_seq",
        "m.sender_id",
        "m.sender_role",
        "m.kind",
        "m.body",
        "m.reply_to_seq",
        // node-postgres does not parse uuid[]; text[] arrives as an array.
        sql<string[]>`m.mentions::text[]`.as("mentions"),
        "m.mention_all",
        "m.reaction_counts",
        "m.attachments",
        "m.pinned_at",
        "m.created_at",
        "m.edited_at",
        "m.deleted_at",
        "m.deleted_by",
        "m.deleted_reason",
        "su.display_name as sender_name",
        "su.avatar_data_url as sender_avatar",
        "su.is_deleted as sender_deleted",
        "du.display_name as deleted_by_name",
        "rm.body as reply_body",
        "rm.deleted_at as reply_deleted_at",
        "ru.display_name as reply_sender_name",
      ]);
    if (viewerId) {
      query = query.where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("chat_hidden_messages as h")
              .select(sql`1`.as("one"))
              .where("h.user_id", "=", viewerId)
              .whereRef("h.room_id", "=", "m.room_id")
              .whereRef("h.seq", "=", "m.seq"),
          ),
        ),
      );
    }
    return query;
  }

  return {
    // ---------------------------------------------------------------- settings
    async getSettings(db: Executor) {
      const row = await db
        .selectFrom("chat_settings")
        .selectAll()
        .where("id", "=", 1)
        .executeTakeFirst();
      return (
        row ?? {
          id: 1,
          direct_policy: "course_peers" as ChatDirectPolicy,
          course_retention_months: 12,
          max_direct_requests_per_day: 10,
          max_helpers_per_room: 10,
          updated_by: null,
          updated_at: new Date(0),
        }
      );
    },

    async updateSettings(
      db: Executor,
      patch: {
        direct_policy?: ChatDirectPolicy;
        course_retention_months?: number;
        max_direct_requests_per_day?: number;
        max_helpers_per_room?: number;
      },
      userId: string,
    ) {
      return db
        .insertInto("chat_settings")
        .values({ id: 1, ...patch, updated_by: userId })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            ...patch,
            updated_by: userId,
            updated_at: sql`now()`,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    // ------------------------------------------------------------- courses
    async findCourseGate(db: Executor, courseId: string) {
      return (await db
        .selectFrom("courses as c")
        .leftJoin("course_access_rules as ar", "ar.course_id", "c.id")
        .leftJoin("course_pricing as p", "p.course_id", "c.id")
        .select([
          "c.id",
          "c.title",
          "c.creator_id",
          "c.status",
          "c.deleted_at",
          "ar.access_type",
          "p.pricing_type",
        ])
        .where("c.id", "=", courseId)
        .executeTakeFirst()) as CourseGateRow | undefined;
    },

    async listCreatedCourseIds(db: Executor, userId: string) {
      const rows = await db
        .selectFrom("courses")
        .select("id")
        .where("creator_id", "=", userId)
        .where("deleted_at", "is", null)
        .execute();
      return rows.map((row) => row.id);
    },

    async listCourseCreators(db: Executor, courseIds: readonly string[]) {
      if (courseIds.length === 0) return [];
      return db
        .selectFrom("courses")
        .select(["id", "creator_id", "title"])
        .where("id", "in", courseIds)
        .execute();
    },

    // ---------------------------------------------------------------- rooms
    async findRoom(db: Executor, roomId: string) {
      return db
        .selectFrom("chat_rooms")
        .selectAll()
        .where("id", "=", roomId)
        .executeTakeFirst();
    },

    async findCourseRoom(db: Executor, courseId: string) {
      return db
        .selectFrom("chat_rooms")
        .selectAll()
        .where("kind", "=", "course")
        .where("course_id", "=", courseId)
        .executeTakeFirst();
    },

    async findDirectRoom(db: Executor, directKey: string) {
      return db
        .selectFrom("chat_rooms")
        .selectAll()
        .where("direct_key", "=", directKey)
        .executeTakeFirst();
    },

    /** Inserts a room; a race on a course or pair returns the existing one. */
    async insertRoom(
      db: Executor,
      values: {
        id: string;
        kind: "course" | "team" | "direct";
        course_id?: string | null;
        direct_key?: string | null;
        direct_status?: "requested" | "accepted" | null;
        requested_by?: string | null;
        title?: string | null;
        description?: string | null;
        posting_policy?: "everyone" | "staff_only";
        direct_messages_allowed?: boolean;
        created_by: string;
      },
    ) {
      const inserted = await db
        .insertInto("chat_rooms")
        .values(values)
        .onConflict((oc) => oc.doNothing())
        .returningAll()
        .executeTakeFirst();
      return { room: inserted, created: Boolean(inserted) };
    },

    async updateRoom(
      db: Executor,
      roomId: string,
      patch: Partial<{
        title: string | null;
        description: string | null;
        posting_policy: "everyone" | "staff_only";
        slow_mode_seconds: number;
        direct_messages_allowed: boolean;
        status: "active" | "locked" | "archived";
        direct_status: "requested" | "accepted" | "declined";
      }>,
    ) {
      return db
        .updateTable("chat_rooms")
        .set({
          ...patch,
          updated_at: sql`now()`,
          last_event_seq: sql`last_event_seq + 1`,
        })
        .where("id", "=", roomId)
        .returningAll()
        .executeTakeFirst();
    },

    async anyCourseAllowsDirect(db: Executor, courseIds: readonly string[]) {
      if (courseIds.length === 0) return false;
      const row = await db
        .selectFrom("chat_rooms")
        .select("id")
        .where("kind", "=", "course")
        .where("course_id", "in", courseIds)
        .where("direct_messages_allowed", "=", true)
        .where("status", "=", "active")
        .limit(1)
        .executeTakeFirst();
      return Boolean(row);
    },

    async listCourseRoomIds(
      db: Executor,
      courseIds: readonly string[] | "all",
      includeArchived: boolean,
    ) {
      let query = db
        .selectFrom("chat_rooms")
        .select(["id", "course_id"])
        .where("kind", "=", "course");
      if (courseIds !== "all") {
        if (courseIds.length === 0) return [];
        query = query.where("course_id", "in", courseIds);
      }
      if (!includeArchived) query = query.where("status", "<>", "archived");
      return query.execute();
    },

    async listMemberRoomIds(db: Executor, userId: string) {
      const rows = await db
        .selectFrom("chat_members as cm")
        .innerJoin("chat_rooms as r", "r.id", "cm.room_id")
        .select("cm.room_id")
        .where("cm.user_id", "=", userId)
        .where("r.kind", "in", ["team", "direct"])
        .where("cm.state", "in", ["active", "pending"])
        .execute();
      return rows.map((row) => row.room_id);
    },

    /** The private chats a person is in (where their presence is shown). */
    async listDirectRoomIds(db: Executor, userId: string) {
      const rows = await db
        .selectFrom("chat_members as cm")
        .innerJoin("chat_rooms as r", "r.id", "cm.room_id")
        .select("cm.room_id")
        .where("cm.user_id", "=", userId)
        .where("r.kind", "=", "direct")
        .where("cm.state", "in", ["active", "pending"])
        .execute();
      return rows.map((row) => row.room_id);
    },

    async listRoomsForUser(
      db: Executor,
      userId: string,
      roomIds: readonly string[],
    ): Promise<RoomListRow[]> {
      if (roomIds.length === 0) return [];
      return (await db
        .selectFrom("chat_rooms as r")
        .leftJoin("chat_members as m", (join) =>
          join.onRef("m.room_id", "=", "r.id").on("m.user_id", "=", userId),
        )
        .leftJoin("chat_messages as lm", (join) =>
          join
            .onRef("lm.room_id", "=", "r.id")
            .onRef("lm.seq", "=", "r.last_seq"),
        )
        .leftJoin("users as lu", "lu.id", "lm.sender_id")
        .leftJoin("courses as c", "c.id", "r.course_id")
        .selectAll("r")
        .select([
          "m.room_role",
          "m.state as member_state",
          "m.last_read_seq",
          "m.last_delivered_seq",
          "m.notify_level",
          "m.archived_at",
          "m.pinned_at as member_pinned_at",
          "c.title as course_title",
          "c.thumbnail_url as course_thumbnail",
          "c.thumbnail_media_id as course_thumbnail_media_id",
          "lm.seq as lm_seq",
          "lm.sender_id as lm_sender_id",
          "lu.display_name as lm_sender_name",
          "lm.body as lm_body",
          "lm.attachments as lm_attachments",
          "lm.kind as lm_kind",
          "lm.deleted_at as lm_deleted_at",
          "lm.created_at as lm_created_at",
        ])
        .where("r.id", "in", roomIds)
        .execute()) as RoomListRow[];
    },

    async listDirectPeers(
      db: Executor,
      userId: string,
      roomIds: readonly string[],
    ) {
      if (roomIds.length === 0) return [];
      return db
        .selectFrom("chat_members as cm")
        .innerJoin("users as u", "u.id", "cm.user_id")
        .select([
          "cm.room_id",
          "cm.last_read_seq",
          "cm.last_delivered_seq",
          "u.id",
          "u.display_name",
          "u.avatar_data_url",
          "u.is_deleted",
        ])
        .where("cm.room_id", "in", roomIds)
        .where("cm.user_id", "<>", userId)
        .execute();
    },

    async getHeads(db: Executor, roomIds: readonly string[]) {
      if (roomIds.length === 0) return [];
      return db
        .selectFrom("chat_rooms")
        .select(["id", "kind", "last_seq", "last_event_seq"])
        .where("id", "in", roomIds)
        .execute();
    },

    /**
     * For each group: the lowest received and read positions among its
     * active members, and how many there are (the group ticks).
     */
    async groupPositions(db: Executor, roomIds: readonly string[]) {
      if (roomIds.length === 0) return [];
      return db
        .selectFrom("chat_members")
        .select([
          "room_id",
          sql<string>`min(last_delivered_seq)`.as("delivered"),
          sql<string>`min(last_read_seq)`.as("read"),
          sql<string>`count(*)`.as("members"),
        ])
        .where("room_id", "in", roomIds)
        .where("state", "=", "active")
        .groupBy("room_id")
        .execute();
    },

    /** Who has received one message (its "Message info"), others first by name. */
    async messageReceipts(
      db: Executor,
      roomId: string,
      seq: number,
      senderId: string,
      limit: number,
    ) {
      const [reached, waiting] = await Promise.all([
        db
          .selectFrom("chat_members as cm")
          .innerJoin("users as u", "u.id", "cm.user_id")
          .select([
            "u.id",
            "u.display_name",
            "u.avatar_data_url",
            "u.is_deleted",
            "cm.last_read_seq",
            // The first time their position reached the message (marks are
            // kept 30 days; null before that or for very big groups).
            sql<Date | null>`(
              select min(k.at) from chat_receipt_marks k
              where k.room_id = cm.room_id and k.user_id = cm.user_id
                and k.delivered_seq >= ${String(seq)}::bigint
            )`.as("delivered_at"),
            sql<Date | null>`(
              select min(k.at) from chat_receipt_marks k
              where k.room_id = cm.room_id and k.user_id = cm.user_id
                and k.read_seq >= ${String(seq)}::bigint
            )`.as("read_at"),
          ])
          .where("cm.room_id", "=", roomId)
          .where("cm.state", "=", "active")
          .where("cm.user_id", "<>", senderId)
          .where("cm.last_delivered_seq", ">=", String(seq))
          .orderBy("u.display_name")
          .limit(limit)
          .execute(),
        db
          .selectFrom("chat_members")
          .select(sql<string>`count(*)`.as("n"))
          .where("room_id", "=", roomId)
          .where("state", "=", "active")
          .where("user_id", "<>", senderId)
          .where("last_delivered_seq", "<", String(seq))
          .executeTakeFirstOrThrow(),
      ]);
      return { reached, waiting: Number(waiting.n) };
    },

    /** When members' positions moved (Message info's times). */
    async insertReceiptMarks(
      db: Executor,
      rows: ReadonlyArray<{
        room_id: string;
        user_id: string;
        last_read_seq: string;
        last_delivered_seq: string;
      }>,
    ) {
      if (rows.length === 0) return;
      await db
        .insertInto("chat_receipt_marks")
        .values(
          rows.map((row) => ({
            room_id: row.room_id,
            user_id: row.user_id,
            read_seq: row.last_read_seq,
            delivered_seq: row.last_delivered_seq,
          })),
        )
        .execute();
    },

    async pruneReceiptMarks(db: Executor, before: Date, limit: number) {
      const result = await sql`
        delete from chat_receipt_marks
        where ctid in (
          select ctid from chat_receipt_marks where at < ${before} limit ${limit}
        )
      `.execute(db);
      return Number(result.numAffectedRows ?? 0);
    },

    /**
     * Messages in one chat whose text contains `term` (trigram index),
     * newest first, as the viewer sees them (not deleted, not hidden).
     */
    async searchMessages(
      db: Executor,
      viewerId: string,
      roomId: string,
      term: string,
      beforeSeq: number | null,
      limit: number,
    ) {
      const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const near = isFuzzySearchTerm(term);
      let query = messageQuery(db, viewerId)
        .where("m.room_id", "=", roomId)
        .where("m.deleted_at", "is", null)
        .where((eb) =>
          near
            ? eb.or([
                eb("m.body", "ilike", pattern),
                eb(sql<boolean>`${fuzzySearchTerm(term)} <% m.body`, "=", true),
              ])
            : eb("m.body", "ilike", pattern),
        );
      if (beforeSeq !== null)
        query = query.where("m.seq", "<", String(beforeSeq));
      const page = query.orderBy("m.seq", "desc").limit(limit + 1);
      // A typo in a long message scores about 0.5 ("homwork" against
      // "Homework is due…": 0.545); pg_trgm's default line (0.6) missed it.
      // Set for this one query, so the trigram index is still used.
      const rows = (
        near
          ? await db.transaction().execute(async (trx) => {
              await sql`select set_config('pg_trgm.word_similarity_threshold', '0.5', true)`.execute(
                trx,
              );
              return (await trx.executeQuery(page.compile())).rows;
            })
          : await page.execute()
      ) as MessageRow[];
      return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
    },

    /**
     * People for New chat and the chat list's search: by name or username
     * (a leading "@" is fine), and by e-mail or mobile number. Staff match
     * any part of an e-mail or number; everyone else only the whole e-mail,
     * or a whole 10-digit number (as WhatsApp finds a contact by number),
     * so nobody can trawl for other learners' details.
     */
    async searchPeople(
      db: Executor,
      term: string,
      excludeId: string,
      staff: boolean,
      limit: number,
      /**
       * Learners: only these people (staff they may message) and classmates
       * who opened these courses' groups. The search runs within them, so a
       * match is never crowded out by people they could not message.
       */
      among?: { userIds: readonly string[]; courseIds: readonly string[] },
    ) {
      const text = term.trim().replace(/^@/, "");
      const pattern = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const digits = text.replace(/\D/g, "");
      const looksLikeNumber = /^[+\d\s()-]+$/.test(text) && digits.length >= 4;
      const phoneDigits = sql<string>`regexp_replace(coalesce(u.phone_no, ''), '[^0-9]', '', 'g')`;
      return (
        db
          .selectFrom("users as u")
          .select([
            "u.id",
            "u.display_name",
            "u.avatar_data_url",
            "u.is_deleted",
          ])
          .where("u.id", "<>", excludeId)
          .where("u.is_deleted", "=", false)
          .$if(among !== undefined, (query) =>
            query.where((eb) =>
              eb.or([
                ...(among!.userIds.length > 0
                  ? [eb("u.id", "in", [...among!.userIds])]
                  : []),
                ...(among!.courseIds.length > 0
                  ? [
                      eb(
                        "u.id",
                        "in",
                        eb
                          .selectFrom("chat_members as cm")
                          .innerJoin("chat_rooms as r", "r.id", "cm.room_id")
                          .select("cm.user_id")
                          .where("r.kind", "=", "course")
                          .where("r.course_id", "in", [...among!.courseIds])
                          .where("cm.state", "=", "active"),
                      ),
                    ]
                  : []),
                // Nobody to look among: match nothing.
                eb.val(false),
              ]),
            ),
          )
          .where((eb) =>
            eb.or([
              eb("u.display_name", "ilike", pattern),
              eb("u.username", "ilike", pattern),
              eb(
                fuzzyMatchesAny(text, [
                  sql.ref("u.display_name"),
                  sql.ref("u.username"),
                ]),
                "=",
                true,
              ),
              ...(staff
                ? [
                    eb("u.email", "ilike", pattern),
                    ...(looksLikeNumber
                      ? [eb(phoneDigits, "like", `%${digits}%`)]
                      : []),
                  ]
                : [
                    eb(sql`lower(u.email)`, "=", text.toLowerCase()),
                    ...(looksLikeNumber && digits.length >= 10
                      ? [
                          eb(
                            sql`right(${phoneDigits}, 10)`,
                            "=",
                            digits.slice(-10),
                          ),
                        ]
                      : []),
                  ]),
            ]),
          )
          // The closest names first ("Bhupesh" before "Bhupeshwar"), then A–Z.
          .orderBy(
            sql`greatest(word_similarity(${fuzzySearchTerm(text)}, lower(u.display_name)), word_similarity(${fuzzySearchTerm(text)}, lower(u.username)))`,
            "desc",
          )
          .orderBy("u.display_name")
          .limit(limit)
          .execute()
      );
    },

    /** Which of these messages this person deleted "for me". */
    async hiddenSeqs(
      db: Executor,
      userId: string,
      roomId: string,
      seqs: readonly number[],
    ) {
      if (seqs.length === 0) return new Set<number>();
      const rows = await db
        .selectFrom("chat_hidden_messages")
        .select("seq")
        .where("user_id", "=", userId)
        .where("room_id", "=", roomId)
        .where("seq", "in", seqs.map(String))
        .execute();
      return new Set(rows.map((row) => Number(row.seq)));
    },

    /** Whether this person teaches any course (its creator). */
    async createsAnyCourse(db: Executor, userId: string) {
      const row = await db
        .selectFrom("courses")
        .select(sql`1`.as("one"))
        .where("creator_id", "=", userId)
        .limit(1)
        .executeTakeFirst();
      return Boolean(row);
    },

    /** An upload made the group's icon (kept like a sent file). */
    async attachIconUpload(db: Executor, uploadId: string) {
      await db
        .updateTable("chat_uploads")
        .set({ status: "attached" })
        .where("id", "=", uploadId)
        .execute();
    },

    /** A replaced icon: readable no more, removed by the retention job. */
    async releaseIconUpload(db: Executor, uploadId: string) {
      await db
        .updateTable("chat_uploads")
        .set({ status: "ready" })
        .where("id", "=", uploadId)
        .where("message_seq", "is", null)
        .execute();
    },

    /** A few active members' names, for a group header. */
    async memberNames(db: Executor, roomId: string, limit: number) {
      const rows = await db
        .selectFrom("chat_members as cm")
        .innerJoin("users as u", "u.id", "cm.user_id")
        .select(["u.id", "u.display_name"])
        .where("cm.room_id", "=", roomId)
        .where("cm.state", "=", "active")
        .where("u.is_deleted", "=", false)
        .orderBy("cm.joined_at")
        .limit(limit)
        .execute();
      return rows;
    },

    // ------------------------------------------------------------- profiles
    async getProfiles(db: Executor, userIds: readonly string[]) {
      if (userIds.length === 0) return [];
      return db
        .selectFrom("chat_profiles")
        .selectAll()
        .where("user_id", "in", userIds)
        .execute();
    },

    async saveProfile(
      db: Executor,
      userId: string,
      patch: {
        show_presence?: boolean;
        read_receipts?: boolean;
        enter_to_send?: boolean;
      },
    ) {
      return db
        .insertInto("chat_profiles")
        .values({ user_id: userId, ...patch })
        .onConflict((oc) =>
          oc
            .column("user_id")
            .doUpdateSet({ ...patch, updated_at: new Date() }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** These people have Chats open: online for the next `seconds`. */
    async markOnline(
      db: Executor,
      userIds: readonly string[],
      seconds: number,
    ) {
      if (userIds.length === 0) return;
      await sql`
        insert into chat_profiles (user_id, online_until)
        select id, now() + make_interval(secs => ${seconds})
        from unnest(${sql.val([...userIds])}::uuid[]) as t(id)
        where exists (select 1 from users u where u.id = t.id)
        on conflict (user_id) do update set online_until = excluded.online_until
      `.execute(db);
    },

    /** Their last chat tab closed: away now, last seen now. */
    async markAway(db: Executor, userId: string) {
      await db
        .updateTable("chat_profiles")
        .set({ online_until: new Date(), last_seen_at: new Date() })
        .where("user_id", "=", userId)
        .execute();
    },

    // -------------------------------------------------------------- members
    async findMember(db: Executor, roomId: string, userId: string) {
      return db
        .selectFrom("chat_members")
        .selectAll()
        .where("room_id", "=", roomId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    async listMembersOf(db: Executor, roomId: string) {
      return db
        .selectFrom("chat_members")
        .selectAll()
        .where("room_id", "=", roomId)
        .execute();
    },

    /**
     * Joins people to rooms they can see, starting their read position at
     * the room's newest message (like joining a WhatsApp group: no backlog
     * of unread). Existing rows are left alone.
     */
    async ensureMembers(
      db: Executor,
      rows: ReadonlyArray<{
        roomId: string;
        userId: string;
        state?: "active" | "pending";
        roomRole?: "owner" | "member";
      }>,
    ) {
      if (rows.length === 0) return;
      await db
        .insertInto("chat_members")
        .columns([
          "room_id",
          "user_id",
          "state",
          "room_role",
          "last_read_seq",
          "last_delivered_seq",
        ])
        .expression(
          sql`select v.room_id, v.user_id, v.state, v.room_role, r.last_seq, r.last_seq
              from (values ${sql.join(
                rows.map(
                  (row) =>
                    sql`(${row.roomId}::uuid, ${row.userId}::uuid, ${row.state ?? "active"}, ${row.roomRole ?? "member"})`,
                ),
              )}) as v(room_id, user_id, state, room_role)
              join chat_rooms r on r.id = v.room_id`,
        )
        .onConflict((oc) => oc.columns(["room_id", "user_id"]).doNothing())
        .execute();
    },

    async updateMember(
      db: Executor,
      roomId: string,
      userId: string,
      patch: Partial<{
        room_role: "owner" | "moderator" | "member";
        state: "active" | "left" | "pending" | "hidden";
        notify_level: "all" | "mentions" | "none";
        archived_at: Date | null;
        pinned_at: Date | null;
      }>,
    ) {
      return db
        .updateTable("chat_members")
        .set({ ...patch, updated_at: sql`now()` })
        .where("room_id", "=", roomId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** Of `userIds`, those in the room who still get its notifications. */
    async listNotifiableMembers(
      db: Executor,
      roomId: string,
      userIds: readonly string[],
    ) {
      if (userIds.length === 0) return [];
      const rows = await db
        .selectFrom("chat_members")
        .select("user_id")
        .where("room_id", "=", roomId)
        .where("user_id", "in", userIds)
        .where("state", "=", "active")
        .where("notify_level", "<>", "none")
        .execute();
      return rows.map((row) => row.user_id);
    },

    async countPinnedChats(db: Executor, userId: string) {
      const row = await db
        .selectFrom("chat_members")
        .select(sql<string>`count(*)`.as("n"))
        .where("user_id", "=", userId)
        .where("pinned_at", "is not", null)
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    async countHelpers(db: Executor, roomId: string) {
      const row = await db
        .selectFrom("chat_members")
        .select(sql<string>`count(*)`.as("n"))
        .where("room_id", "=", roomId)
        .where("room_role", "=", "moderator")
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    async countActiveMembers(db: Executor, roomId: string) {
      const row = await db
        .selectFrom("chat_members")
        .select(sql<string>`count(*)`.as("n"))
        .where("room_id", "=", roomId)
        .where("state", "=", "active")
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    /** One page of a room's members, by name (keyset on name, id). */
    async listMembersPage(
      db: Executor,
      roomId: string,
      options: {
        search?: string | undefined;
        after?: { name: string; id: string } | undefined;
        limit: number;
      },
    ) {
      let query = db
        .selectFrom("chat_members as cm")
        .innerJoin("users as u", "u.id", "cm.user_id")
        .select(["u.id", "u.display_name", "u.avatar_data_url", "cm.room_role"])
        .where("cm.room_id", "=", roomId)
        .where("cm.state", "=", "active")
        .where("u.is_deleted", "=", false);
      if (options.search) {
        const search = options.search;
        const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        query = query.where((eb) =>
          eb.or([
            eb("u.display_name", "ilike", pattern),
            eb("u.username", "ilike", pattern),
            eb(
              fuzzyMatchesAny(search, [
                sql.ref("u.display_name"),
                sql.ref("u.username"),
              ]),
              "=",
              true,
            ),
          ]),
        );
      }
      if (options.after) {
        const after = options.after;
        query = query.where((eb) =>
          eb.or([
            eb("u.display_name", ">", after.name),
            eb.and([
              eb("u.display_name", "=", after.name),
              eb("u.id", ">", after.id),
            ]),
          ]),
        );
      }
      return query
        .orderBy("u.display_name")
        .orderBy("u.id")
        .limit(options.limit + 1)
        .execute();
    },

    // --------------------------------------------------------------- people
    async getPeople(db: Executor, userIds: readonly string[]) {
      if (userIds.length === 0) return [] as PersonRow[];
      return db
        .selectFrom("users")
        .select(["id", "display_name", "avatar_data_url", "is_deleted"])
        .where("id", "in", userIds)
        .execute();
    },

    async listCourseClassmates(
      db: Executor,
      userId: string,
      courseIds: readonly string[],
      search: string | undefined,
      perCourse: number,
    ) {
      if (courseIds.length === 0) return [];
      const pattern = search
        ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
        : null;
      const result = await sql<{
        course_id: string;
        id: string;
        display_name: string;
        avatar_data_url: string | null;
      }>`
        select course_id, id, display_name, avatar_data_url from (
          select r.course_id, u.id, u.display_name, u.avatar_data_url,
            row_number() over (partition by r.course_id order by u.display_name, u.id) as rn
          from chat_members cm
          join chat_rooms r on r.id = cm.room_id and r.kind = 'course'
          join users u on u.id = cm.user_id
          where r.course_id in (${sql.join(courseIds.map((id) => sql`${id}::uuid`))})
            and cm.user_id <> ${userId}::uuid
            and cm.state = 'active'
            and u.is_deleted = false
            and (${pattern}::text is null or u.display_name ilike ${pattern})
        ) ranked
        where rn <= ${perCourse}
      `.execute(db);
      return result.rows;
    },

    // ------------------------------------------------------------- messages
    /** Saves one message (see the `chat_send` function in the migration). */
    async sendMessage(
      db: Executor,
      input: {
        roomId: string;
        id: string;
        senderId: string;
        senderRole: string;
        clientId: string | null;
        kind: "text" | "system";
        body: string;
        replyToSeq: number | null;
        mentions: readonly string[];
        mentionAll: boolean;
        exemptLimits: boolean;
        maxBeforeAccept: number | null;
        attachments?: readonly ChatAttachmentRef[];
      },
      inTransaction?: (trx: Executor) => Promise<void>,
    ): Promise<SendResult> {
      return db.transaction().execute(async (trx) => {
        await localCommit(trx);
        const result = await sql<SendResult>`
          select * from chat_send(
            ${input.roomId}::uuid, ${input.id}::uuid, ${input.senderId}::uuid,
            ${input.senderRole}, ${input.clientId}::uuid, ${input.kind},
            ${input.body}, ${input.replyToSeq}::bigint,
            ${
              input.mentions.length > 0
                ? sql`array[${sql.join(input.mentions.map((id) => sql`${id}::uuid`))}]::uuid[]`
                : sql`'{}'::uuid[]`
            },
            ${input.mentionAll}, ${input.exemptLimits},
            ${input.maxBeforeAccept}::integer,
            ${JSON.stringify(input.attachments ?? [])}::jsonb
          )
        `.execute(trx);
        const row = result.rows[0]!;
        if (row.outcome === "sent" && row.message_seq !== null) {
          // Sending means you have seen the chat up to your own message, so
          // a group's "everyone has read" (the ticks) can count you in.
          await trx
            .updateTable("chat_members")
            .set({
              last_read_seq: sql`greatest(last_read_seq, ${row.message_seq}::bigint)`,
              last_delivered_seq: sql`greatest(last_delivered_seq, ${row.message_seq}::bigint)`,
            })
            .where("room_id", "=", input.roomId)
            .where("user_id", "=", input.senderId)
            .execute();
        }
        if (row.outcome === "sent" && inTransaction) await inTransaction(trx);
        return row;
      });
    },

    async findMessage(db: Executor, roomId: string, seq: number) {
      return (await messageQuery(db, null)
        .where("m.room_id", "=", roomId)
        .where("m.seq", "=", String(seq))
        .executeTakeFirst()) as MessageRow | undefined;
    },

    async listMessages(
      db: Executor,
      viewerId: string | null,
      roomId: string,
      page:
        | { mode: "before"; seq: number; limit: number }
        | { mode: "after"; seq: number; limit: number }
        | { mode: "latest"; limit: number },
    ) {
      let query = messageQuery(db, viewerId).where("m.room_id", "=", roomId);
      if (page.mode === "before") {
        query = query
          .where("m.seq", "<", String(page.seq))
          .orderBy("m.seq", "desc");
      } else if (page.mode === "after") {
        query = query
          .where("m.seq", ">", String(page.seq))
          .orderBy("m.seq", "asc");
      } else {
        query = query.orderBy("m.seq", "desc");
      }
      const rows = (await query
        .limit(page.limit + 1)
        .execute()) as MessageRow[];
      const hasMore = rows.length > page.limit;
      const kept = rows.slice(0, page.limit);
      if (page.mode !== "after") kept.reverse();
      return { rows: kept, hasMore };
    },

    async listChangesSince(
      db: Executor,
      viewerId: string,
      roomId: string,
      since: number,
      limit: number,
    ) {
      return (await messageQuery(db, viewerId)
        .where("m.room_id", "=", roomId)
        .where("m.version_seq", ">", String(since))
        .orderBy("m.version_seq", "asc")
        .limit(limit + 1)
        .execute()) as MessageRow[];
    },

    async listPinned(db: Executor, viewerId: string, roomId: string) {
      return (await messageQuery(db, viewerId)
        .where("m.room_id", "=", roomId)
        .where("m.pinned_at", "is not", null)
        .where("m.deleted_at", "is", null)
        .orderBy("m.pinned_at", "desc")
        .execute()) as MessageRow[];
    },

    async oldestSeq(db: Executor, roomId: string) {
      const row = await db
        .selectFrom("chat_messages")
        .select(sql<string | null>`min(seq)`.as("seq"))
        .where("room_id", "=", roomId)
        .executeTakeFirst();
      return row?.seq ? Number(row.seq) : null;
    },

    async countSenderMessages(db: Executor, roomId: string, senderId: string) {
      const row = await db
        .selectFrom("chat_messages")
        .select(sql<string>`count(*)`.as("n"))
        .where("room_id", "=", roomId)
        .where("sender_id", "=", senderId)
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    /**
     * Changes one message and gives it the room's next change number, in
     * one statement (the room row is the per-room lock).
     */
    async changeMessage(
      db: Executor,
      roomId: string,
      seq: number,
      change:
        | { kind: "edit"; body: string }
        | { kind: "delete"; by: string; reason: "self" | "admin" }
        | { kind: "restore" }
        | { kind: "pin"; by: string }
        | { kind: "unpin" }
        | { kind: "recount_reactions" },
    ) {
      const set = (() => {
        switch (change.kind) {
          case "edit":
            return sql`body = ${change.body}, edited_at = now()`;
          case "delete":
            return sql`deleted_at = now(), deleted_by = ${change.by}::uuid, deleted_reason = ${change.reason}, pinned_at = null, pinned_by = null`;
          case "restore":
            return sql`deleted_at = null, deleted_by = null, deleted_reason = null`;
          case "pin":
            return sql`pinned_at = now(), pinned_by = ${change.by}::uuid`;
          case "unpin":
            return sql`pinned_at = null, pinned_by = null`;
          case "recount_reactions":
            return sql`reaction_counts = coalesce((
              select jsonb_object_agg(emoji, n) from (
                select emoji, count(*) as n from chat_reactions
                where room_id = ${roomId}::uuid and seq = ${seq}::bigint
                group by emoji
              ) counted
            ), '{}'::jsonb)`;
        }
      })();
      return db.transaction().execute(async (trx) => {
        await localCommit(trx);
        const result = await sql<{ version_seq: string }>`
          with bump as (
            update chat_rooms set last_event_seq = last_event_seq + 1
            where id = ${roomId}::uuid
            returning last_event_seq
          )
          update chat_messages set ${set},
            version_seq = (select last_event_seq from bump)
          where room_id = ${roomId}::uuid and seq = ${seq}::bigint
          returning version_seq
        `.execute(trx);
        return result.rows[0] ? Number(result.rows[0].version_seq) : null;
      });
    },

    async setReaction(
      db: Executor,
      roomId: string,
      seq: number,
      userId: string,
      emoji: string | null,
    ) {
      await db.transaction().execute(async (trx) => {
        await localCommit(trx);
        if (emoji === null) {
          await trx
            .deleteFrom("chat_reactions")
            .where("room_id", "=", roomId)
            .where("seq", "=", String(seq))
            .where("user_id", "=", userId)
            .execute();
        } else {
          await trx
            .insertInto("chat_reactions")
            .values({
              room_id: roomId,
              seq: String(seq),
              user_id: userId,
              emoji,
            })
            .onConflict((oc) =>
              oc
                .columns(["room_id", "seq", "user_id"])
                .doUpdateSet({ emoji, created_at: sql`now()` }),
            )
            .execute();
        }
      });
    },

    async hideMessageFor(
      db: Executor,
      userId: string,
      roomId: string,
      seq: number,
    ) {
      await db
        .insertInto("chat_hidden_messages")
        .values({ user_id: userId, room_id: roomId, seq: String(seq) })
        .onConflict((oc) => oc.doNothing())
        .execute();
    },

    async countPinnedMessages(db: Executor, roomId: string) {
      const row = await db
        .selectFrom("chat_messages")
        .select(sql<string>`count(*)`.as("n"))
        .where("room_id", "=", roomId)
        .where("pinned_at", "is not", null)
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    async setStar(
      db: Executor,
      userId: string,
      roomId: string,
      seq: number,
      starred: boolean,
    ) {
      if (starred) {
        await db
          .insertInto("chat_stars")
          .values({ user_id: userId, room_id: roomId, seq: String(seq) })
          .onConflict((oc) => oc.doNothing())
          .execute();
      } else {
        await db
          .deleteFrom("chat_stars")
          .where("user_id", "=", userId)
          .where("room_id", "=", roomId)
          .where("seq", "=", String(seq))
          .execute();
      }
    },

    async listStars(db: Executor, userId: string, limit: number) {
      return (await messageQuery(db, userId)
        .innerJoin("chat_stars as s", (join) =>
          join
            .onRef("s.room_id", "=", "m.room_id")
            .onRef("s.seq", "=", "m.seq")
            .on("s.user_id", "=", userId),
        )
        .innerJoin("chat_rooms as sr", "sr.id", "m.room_id")
        .leftJoin("courses as sc", "sc.id", "sr.course_id")
        .select([
          "s.created_at as starred_at",
          "sr.title as room_title",
          "sc.title as course_title",
          "sr.kind as room_kind",
        ])
        .orderBy("s.created_at", "desc")
        .limit(limit)
        .execute()) as Array<
        MessageRow & {
          starred_at: Date;
          room_title: string | null;
          course_title: string | null;
          room_kind: string;
        }
      >;
    },

    // -------------------------------------------------------------- uploads
    async insertUpload(
      db: Executor,
      values: {
        id: string;
        owner_id: string;
        room_id: string;
        kind: ChatUploadKind;
        mime_type: string;
        file_name: string;
        size_bytes: number;
        width: number | null;
        height: number | null;
        duration_ms: number | null;
        waveform: number[] | null;
        storage_key: string;
      },
    ) {
      await db
        .insertInto("chat_uploads")
        .values({
          ...values,
          waveform: values.waveform ? JSON.stringify(values.waveform) : null,
        })
        .execute();
    },

    async findUpload(db: Executor, id: string) {
      return db
        .selectFrom("chat_uploads")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /** A message this sender already sent with this client id (a retry). */
    async findSeqByClient(
      db: Executor,
      roomId: string,
      senderId: string,
      clientId: string,
    ) {
      const row = await db
        .selectFrom("chat_messages")
        .select("seq")
        .where("room_id", "=", roomId)
        .where("sender_id", "=", senderId)
        .where("client_id", "=", clientId)
        .executeTakeFirst();
      return row ? Number(row.seq) : null;
    },

    async markUploadReady(db: Executor, id: string) {
      await db
        .updateTable("chat_uploads")
        .set({ status: "ready" })
        .where("id", "=", id)
        .where("status", "=", "pending")
        .execute();
    },

    async listReadyUploads(
      db: Executor,
      ownerId: string,
      roomId: string,
      ids: readonly string[],
    ) {
      if (ids.length === 0) return [];
      return db
        .selectFrom("chat_uploads")
        .selectAll()
        .where("id", "in", ids)
        .where("owner_id", "=", ownerId)
        .where("room_id", "=", roomId)
        .where("status", "=", "ready")
        .execute();
    },

    async attachUploads(
      db: Executor,
      ids: readonly string[],
      roomId: string,
      seq: number,
    ) {
      if (ids.length === 0) return;
      await db
        .updateTable("chat_uploads")
        .set({ status: "attached", message_seq: String(seq) })
        .where("id", "in", ids)
        .where("room_id", "=", roomId)
        .execute();
    },

    /** Bytes uploaded by one person since `since` (daily allowance). */
    async uploadedBytesSince(db: Executor, ownerId: string, since: Date) {
      const row = await db
        .selectFrom("chat_uploads")
        .select(sql<string | null>`sum(size_bytes)`.as("n"))
        .where("owner_id", "=", ownerId)
        .where("created_at", ">", since)
        .executeTakeFirst();
      return Number(row?.n ?? 0);
    },

    /**
     * Uploads to remove from storage: never sent (pending/ready for a day),
     * or whose message is gone (retention) or deleted past its restore window.
     */
    async listRemovableUploads(
      db: Executor,
      olderThan: Date,
      deletedBefore: Date,
      limit: number,
    ) {
      const result = await sql<{ id: string; storage_key: string }>`
        select u.id, u.storage_key from chat_uploads u
        left join chat_messages m on m.room_id = u.room_id and m.seq = u.message_seq
        where (u.status <> 'attached' and u.created_at < ${olderThan})
           or (u.status = 'attached' and m.room_id is null)
           or (u.status = 'attached' and m.deleted_at < ${deletedBefore})
        limit ${limit}
      `.execute(db);
      return result.rows;
    },

    async deleteUploads(db: Executor, ids: readonly string[]) {
      if (ids.length === 0) return;
      await db.deleteFrom("chat_uploads").where("id", "in", ids).execute();
    },

    // ------------------------------------------------------------- receipts
    /**
     * Moves read and delivered positions forward in one statement, never
     * past a room's newest message and never backwards.
     */
    async flushReceipts(
      db: Executor,
      rows: ReadonlyArray<{
        roomId: string;
        userId: string;
        readSeq: number;
        deliveredSeq: number;
      }>,
    ) {
      if (rows.length === 0) return [];
      return db.transaction().execute(async (trx) => {
        await localCommit(trx);
        const result = await sql<{
          room_id: string;
          user_id: string;
          last_read_seq: string;
          last_delivered_seq: string;
          kind: string;
          direct_status: string | null;
        }>`
          update chat_members m set
            last_read_seq = greatest(m.last_read_seq, least(v.read_seq, r.last_seq)),
            last_delivered_seq = greatest(
              m.last_delivered_seq,
              least(greatest(v.delivered_seq, v.read_seq), r.last_seq)
            ),
            updated_at = now()
          from (values ${sql.join(
            rows.map(
              (row) =>
                sql`(${row.roomId}::uuid, ${row.userId}::uuid, ${row.readSeq}::bigint, ${row.deliveredSeq}::bigint)`,
            ),
          )}) as v(room_id, user_id, read_seq, delivered_seq)
          join chat_rooms r on r.id = v.room_id
          where m.room_id = v.room_id and m.user_id = v.user_id
            and (
              m.last_read_seq < least(v.read_seq, r.last_seq)
              or m.last_delivered_seq < least(greatest(v.delivered_seq, v.read_seq), r.last_seq)
            )
          returning m.room_id, m.user_id, m.last_read_seq, m.last_delivered_seq, r.kind, r.direct_status
        `.execute(trx);
        return result.rows;
      });
    },

    // ---------------------------------------------------------- restrictions
    async listActiveRestrictions(db: Executor, userId: string) {
      return (await db
        .selectFrom("chat_restrictions")
        .selectAll()
        .where("user_id", "=", userId)
        .where("revoked_at", "is", null)
        .where((eb) =>
          eb.or([eb("until", "is", null), eb("until", ">", sql<Date>`now()`)]),
        )
        .execute()) as RestrictionRow[];
    },

    async insertRestriction(
      db: Executor,
      values: {
        id: string;
        user_id: string;
        room_id: string | null;
        type: ChatRestrictionType;
        until: Date | null;
        reason: ChatReason;
        note: string | null;
        created_by: string;
      },
    ) {
      return (await db
        .insertInto("chat_restrictions")
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow()) as RestrictionRow;
    },

    async findRestriction(db: Executor, id: string) {
      return (await db
        .selectFrom("chat_restrictions")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst()) as RestrictionRow | undefined;
    },

    async revokeRestriction(db: Executor, id: string, userId: string) {
      return (await db
        .updateTable("chat_restrictions")
        .set({ revoked_at: sql`now()`, revoked_by: userId })
        .where("id", "=", id)
        .where("revoked_at", "is", null)
        .returningAll()
        .executeTakeFirst()) as RestrictionRow | undefined;
    },

    async listHelperRoomIds(db: Executor, userId: string) {
      const rows = await db
        .selectFrom("chat_members")
        .select("room_id")
        .where("user_id", "=", userId)
        .where("room_role", "=", "moderator")
        .execute();
      return rows.map((row) => row.room_id);
    },

    async listRestrictionById(db: Executor, id: string) {
      return this.listRestrictions(db, { id, activeOnly: false, limit: 1 });
    },

    async listRestrictions(
      db: Executor,
      filter: {
        id?: string | undefined;
        roomId?: string | undefined;
        platform?: boolean | undefined;
        activeOnly: boolean;
        limit: number;
      },
    ) {
      let query = db
        .selectFrom("chat_restrictions as cr")
        .innerJoin("users as u", "u.id", "cr.user_id")
        .leftJoin("users as cb", "cb.id", "cr.created_by")
        .leftJoin("chat_rooms as r", "r.id", "cr.room_id")
        .leftJoin("courses as c", "c.id", "r.course_id")
        .selectAll("cr")
        .select([
          "u.display_name as user_name",
          "u.avatar_data_url as user_avatar",
          "cb.display_name as created_by_name",
          "cb.avatar_data_url as created_by_avatar",
          "r.title as room_title",
          "c.title as course_title",
        ]);
      if (filter.id) query = query.where("cr.id", "=", filter.id);
      if (filter.roomId) query = query.where("cr.room_id", "=", filter.roomId);
      if (filter.platform) query = query.where("cr.room_id", "is", null);
      if (filter.activeOnly) {
        query = query
          .where("cr.revoked_at", "is", null)
          .where((eb) =>
            eb.or([
              eb("cr.until", "is", null),
              eb("cr.until", ">", sql<Date>`now()`),
            ]),
          );
      }
      return query
        .orderBy("cr.created_at", "desc")
        .limit(filter.limit)
        .execute();
    },

    // ---------------------------------------------------------------- blocks
    async blocksBetween(db: Executor, a: string, b: string) {
      return db
        .selectFrom("chat_user_blocks")
        .select(["blocker_id", "blocked_id"])
        .where((eb) =>
          eb.or([
            eb.and([eb("blocker_id", "=", a), eb("blocked_id", "=", b)]),
            eb.and([eb("blocker_id", "=", b), eb("blocked_id", "=", a)]),
          ]),
        )
        .execute();
    },

    async listBlocksInvolving(db: Executor, userId: string) {
      return db
        .selectFrom("chat_user_blocks")
        .select(["blocker_id", "blocked_id"])
        .where((eb) =>
          eb.or([eb("blocker_id", "=", userId), eb("blocked_id", "=", userId)]),
        )
        .execute();
    },

    async block(db: Executor, blockerId: string, blockedId: string) {
      await db
        .insertInto("chat_user_blocks")
        .values({ blocker_id: blockerId, blocked_id: blockedId })
        .onConflict((oc) => oc.doNothing())
        .execute();
    },

    async unblock(db: Executor, blockerId: string, blockedId: string) {
      await db
        .deleteFrom("chat_user_blocks")
        .where("blocker_id", "=", blockerId)
        .where("blocked_id", "=", blockedId)
        .execute();
    },

    async listBlocked(db: Executor, blockerId: string) {
      return db
        .selectFrom("chat_user_blocks as b")
        .innerJoin("users as u", "u.id", "b.blocked_id")
        .select(["u.id", "u.display_name", "u.avatar_data_url", "b.created_at"])
        .where("b.blocker_id", "=", blockerId)
        .orderBy("b.created_at", "desc")
        .execute();
    },

    // ---------------------------------------------------------------- direct
    async countDirectRequestsSince(db: Executor, userId: string, since: Date) {
      const row = await db
        .selectFrom("chat_rooms")
        .select(sql<string>`count(*)`.as("n"))
        .where("kind", "=", "direct")
        .where("requested_by", "=", userId)
        .where("created_at", ">", since)
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    // --------------------------------------------------------------- reports
    async insertReport(
      db: Executor,
      values: {
        id: string;
        room_id: string;
        seq: number;
        reported_user_id: string | null;
        reporter_id: string;
        reason: ChatReason;
        details: string | null;
        snapshot: ChatReportSnapshot;
      },
    ) {
      return db
        .insertInto("chat_reports")
        .values({
          ...values,
          seq: String(values.seq),
          snapshot: JSON.stringify(values.snapshot),
        })
        .onConflict((oc) => oc.doNothing())
        .returning("id")
        .executeTakeFirst();
    },

    async findReport(db: Executor, id: string) {
      return db
        .selectFrom("chat_reports")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async listReports(
      db: Executor,
      filter: {
        status?: string | undefined;
        roomIds: readonly string[] | "all";
        before?: { createdAt: Date; id: string } | undefined;
        limit: number;
      },
    ) {
      if (filter.roomIds !== "all" && filter.roomIds.length === 0) return [];
      let query = db
        .selectFrom("chat_reports as rp")
        .innerJoin("chat_rooms as r", "r.id", "rp.room_id")
        .leftJoin("courses as c", "c.id", "r.course_id")
        .leftJoin("users as ru", "ru.id", "rp.reported_user_id")
        .leftJoin("users as rr", "rr.id", "rp.reporter_id")
        .selectAll("rp")
        .select([
          "r.kind as room_kind",
          "r.title as room_title",
          "c.title as course_title",
          "ru.display_name as reported_name",
          "ru.avatar_data_url as reported_avatar",
          "rr.display_name as reporter_name",
          "rr.avatar_data_url as reporter_avatar",
          sql<string>`(select count(*) from chat_reports o where o.room_id = rp.room_id and o.seq = rp.seq)`.as(
            "report_count",
          ),
        ]);
      if (filter.status) {
        query = query.where("rp.status", "=", filter.status as "open");
      }
      if (filter.roomIds !== "all") {
        query = query.where("rp.room_id", "in", filter.roomIds);
      }
      if (filter.before) {
        const before = filter.before;
        query = query.where((eb) =>
          eb.or([
            eb("rp.created_at", "<", before.createdAt),
            eb.and([
              eb("rp.created_at", "=", before.createdAt),
              eb("rp.id", "<", before.id),
            ]),
          ]),
        );
      }
      return query
        .orderBy("rp.created_at", "desc")
        .orderBy("rp.id", "desc")
        .limit(filter.limit + 1)
        .execute();
    },

    async setReportStatus(
      db: Executor,
      room: { roomId: string; seq: number },
      status: "actioned" | "dismissed",
      userId: string,
    ) {
      // Every open report of the same message is handled together.
      await db
        .updateTable("chat_reports")
        .set({ status, handled_by: userId, handled_at: sql`now()` })
        .where("room_id", "=", room.roomId)
        .where("seq", "=", String(room.seq))
        .where("status", "=", "open")
        .execute();
    },

    async listRoomIdsWithKinds(
      db: Executor,
      kinds: ReadonlyArray<"course" | "team" | "direct">,
      courseIds?: readonly string[],
    ) {
      let query = db
        .selectFrom("chat_rooms")
        .select("id")
        .where("kind", "in", kinds);
      if (courseIds) {
        if (courseIds.length === 0) return [];
        query = query.where("course_id", "in", courseIds);
      }
      return (await query.execute()).map((row) => row.id);
    },

    // ------------------------------------------------------- moderation log
    async log(
      db: Executor,
      entry: {
        actorId: string;
        action: string;
        roomId?: string | null;
        targetUserId?: string | null;
        seq?: number | null;
        details?: Record<string, unknown>;
      },
    ) {
      await db
        .insertInto("chat_moderation_log")
        .values({
          id: crypto.randomUUID(),
          actor_id: entry.actorId,
          action: entry.action,
          room_id: entry.roomId ?? null,
          target_user_id: entry.targetUserId ?? null,
          seq: entry.seq == null ? null : String(entry.seq),
          details: JSON.stringify(entry.details ?? {}),
        })
        .execute();
    },

    async listLog(
      db: Executor,
      filter: {
        roomId?: string | undefined;
        before?: { createdAt: Date; id: string } | undefined;
        limit: number;
      },
    ) {
      let query = db
        .selectFrom("chat_moderation_log as l")
        .leftJoin("users as a", "a.id", "l.actor_id")
        .leftJoin("users as t", "t.id", "l.target_user_id")
        .selectAll("l")
        .select([
          "a.display_name as actor_name",
          "a.avatar_data_url as actor_avatar",
          "t.display_name as target_name",
          "t.avatar_data_url as target_avatar",
        ]);
      if (filter.roomId) query = query.where("l.room_id", "=", filter.roomId);
      if (filter.before) {
        const before = filter.before;
        query = query.where((eb) =>
          eb.or([
            eb("l.created_at", "<", before.createdAt),
            eb.and([
              eb("l.created_at", "=", before.createdAt),
              eb("l.id", "<", before.id),
            ]),
          ]),
        );
      }
      return query
        .orderBy("l.created_at", "desc")
        .orderBy("l.id", "desc")
        .limit(filter.limit + 1)
        .execute();
    },

    // ------------------------------------------------------------ retention
    /** Removes up to `limit` unpinned course-group messages sent before `cutoff`. */
    async purgeCourseMessages(db: Executor, cutoff: Date, limit: number) {
      const result = await sql`
        delete from chat_messages m
        using (
          select cm.room_id, cm.seq from chat_messages cm
          join chat_rooms r on r.id = cm.room_id and r.kind = 'course'
          where cm.created_at < ${cutoff} and cm.pinned_at is null
          limit ${limit}
        ) old
        where m.room_id = old.room_id and m.seq = old.seq
      `.execute(db);
      return Number(result.numAffectedRows ?? 0);
    },

    /** Clears the text of messages deleted before `cutoff` (no longer restorable). */
    async clearDeletedBodies(db: Executor, cutoff: Date, limit: number) {
      const result = await sql`
        update chat_messages m set body = '', reaction_counts = '{}'::jsonb
        from (
          select room_id, seq from chat_messages
          where deleted_at < ${cutoff} and body <> ''
          limit ${limit}
        ) old
        where m.room_id = old.room_id and m.seq = old.seq
      `.execute(db);
      return Number(result.numAffectedRows ?? 0);
    },

    // -------------------------------------------------------------- the bus
    /** Publishes after the change committed; never call inside its transaction. */
    async publish(db: Executor, payloads: readonly string[]) {
      for (const payload of payloads) {
        await sql`select pg_notify(${CHAT_CHANNEL}, ${payload})`.execute(db);
      }
    },
  };
}

export type ChatRepository = ReturnType<typeof createChatRepository>;
