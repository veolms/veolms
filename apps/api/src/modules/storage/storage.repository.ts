import type {
  DatabaseExecutor,
  StorageEventAction,
  StorageRequestStatus,
} from "@veolms/database";
import type {
  StorageFileKind,
  StorageFileSort,
  StorageFileSource,
  StorageLearnerFilter,
  StorageLearnerSort,
} from "@veolms/contracts";
import { STORAGE_NEAR_FULL_RATIO } from "@veolms/contracts";
import { sql, type RawBuilder } from "kysely";

import { escapeLikePattern } from "../../lib/like-pattern.ts";

/**
 * Learners' storage space (migration 20261123150000). `used_bytes` is kept
 * by database triggers on the upload tables; this repository only reads it,
 * and asks `storage_recount` to recompute it from the files.
 */

export interface StorageRow {
  user_id: string;
  used_bytes: string;
  limit_bytes: string | null;
  blocked_at: Date | null;
  block_reason: string | null;
  last_upload_at: Date | null;
  default_limit_bytes: string;
}

export interface StorageRequestRow {
  id: string;
  user_id: string;
  status: StorageRequestStatus;
  note: string | null;
  used_bytes: string;
  limit_bytes: string;
  granted_limit_bytes: string | null;
  decision_note: string | null;
  created_at: Date;
  decided_at: Date | null;
}

export interface LearnerRow extends StorageRequestColumns {
  user_id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
  avatar_data_url: string | null;
  used_bytes: string;
  limit_bytes: string;
  custom_limit: boolean;
  last_upload_at: Date | null;
  blocked_at: Date | null;
  block_reason: string | null;
}

/** One of a learner's own files, from any of the three upload tables. */
export interface OwnFileRow {
  source: StorageFileSource;
  id: string;
  kind: StorageFileKind;
  name: string;
  mime_type: string;
  size: string;
  created_at: Date;
  unsent: boolean;
  duration_ms: number | null;
  file_url: string | null;
  place: string | null;
}

interface StorageRequestColumns {
  request_id: string | null;
  request_status: StorageRequestStatus | null;
  request_note: string | null;
  request_used_bytes: string | null;
  request_limit_bytes: string | null;
  request_created_at: Date | null;
}

const requestColumns = [
  "id",
  "user_id",
  "status",
  "note",
  "used_bytes",
  "limit_bytes",
  "granted_limit_bytes",
  "decision_note",
  "created_at",
  "decided_at",
] as const;

/** Holders of any platform role beyond student (they are not limited). */
const isStaffUser = (userId: RawBuilder<unknown>) => sql<boolean>`(
  exists (
    select 1 from user_roles ur join roles r on r.id = ur.role_id
    where ur.user_id = ${userId} and r.name <> 'student'
  )
  or exists (
    select 1 from role_assignments ra join roles r on r.id = ra.role_id
    where ra.user_id = ${userId} and ra.scope_type = 'platform'
      and r.name <> 'student'
      and (ra.expires_at is null or ra.expires_at > now())
  )
)`;

export function createStorageRepository() {
  return {
    /** Makes sure the person has a row (to lock it), then locks it. */
    async lockForUpload(
      db: DatabaseExecutor,
      userId: string,
    ): Promise<StorageRow> {
      await db
        .insertInto("user_storage")
        .values({ user_id: userId })
        .onConflict((conflict) => conflict.column("user_id").doNothing())
        .execute();
      const result = await sql<StorageRow>`
        select s.user_id, s.used_bytes, s.limit_bytes, s.blocked_at,
          s.block_reason, s.last_upload_at,
          (select default_limit_bytes from storage_settings where id) as default_limit_bytes
        from user_storage s
        where s.user_id = ${userId}
        for update
      `.execute(db);
      return result.rows[0]!;
    },

    async find(db: DatabaseExecutor, userId: string): Promise<StorageRow> {
      const result = await sql<StorageRow>`
        select ${userId}::uuid as user_id,
          coalesce(s.used_bytes, 0) as used_bytes, s.limit_bytes, s.blocked_at,
          s.block_reason, s.last_upload_at, settings.default_limit_bytes
        from storage_settings settings
        left join user_storage s on s.user_id = ${userId}
        where settings.id
      `.execute(db);
      return result.rows[0]!;
    },

    /** Recomputes from the files; returns the new count per person. */
    async recount(db: DatabaseExecutor, userIds: readonly string[]) {
      if (userIds.length === 0) return [];
      const result = await sql<{
        user_id: string;
        before_bytes: string;
        after_bytes: string;
      }>`select * from storage_recount(${[...userIds]}::uuid[])`.execute(db);
      return result.rows.map((row) => ({
        userId: row.user_id,
        before: Number(row.before_bytes),
        after: Number(row.after_bytes),
      }));
    },

    async touchLastUpload(db: DatabaseExecutor, userId: string) {
      await db
        .updateTable("user_storage")
        .set({ last_upload_at: sql`now()` })
        .where("user_id", "=", userId)
        .execute();
    },

    /** What each kind of file takes (the same rules as the count). */
    async breakdown(db: DatabaseExecutor, userId: string) {
      const result = await sql<{
        chat: string;
        discussion: string;
        support: string;
      }>`
        select
          (select coalesce(sum(storage_chat_upload_bytes(c.is_copy, c.message_deleted, c.status, c.created_at, c.size_bytes)), 0)
            from chat_uploads c where c.owner_id = ${userId}) as chat,
          (select coalesce(sum(storage_learning_attachment_bytes(l.status, l.created_at, l.file_size)), 0)
            from learning_attachments l where l.owner_id = ${userId}) as discussion,
          (select coalesce(sum(storage_support_attachment_bytes(t.ticket_id, t.message_id, t.created_at, t.file_size)), 0)
            from support_attachments t where t.owner_id = ${userId}) as support
      `.execute(db);
      const row = result.rows[0];
      return {
        chatBytes: Number(row?.chat ?? 0),
        discussionBytes: Number(row?.discussion ?? 0),
        supportBytes: Number(row?.support ?? 0),
      };
    },

    /**
     * The person's own files that take space (the same rules as the count),
     * a page at a time, with the totals of the kind asked for and of every
     * kind. Group icons are left out (they belong to the group).
     */
    async listOwnFiles(
      db: DatabaseExecutor,
      userId: string,
      input: {
        sort: StorageFileSort;
        kind: StorageFileKind | undefined;
        /** Null: every file (the service searches them itself). */
        limit: number | null;
        offset: number;
      },
    ) {
      const kindOf = (mime: RawBuilder<unknown>) => sql`case
        when ${mime} like 'image/%' then 'image'
        when ${mime} like 'video/%' then 'video'
        when ${mime} like 'audio/%' then 'audio'
        else 'file' end`;
      const files = sql`
        select 'chat' as source, c.id, c.kind::text as kind, c.file_name as name,
          c.mime_type, c.size_bytes::bigint as size, c.created_at,
          (c.status <> 'attached') as unsent, c.duration_ms,
          null::text as file_url,
          case when r.kind = 'direct' then (
            select coalesce(nullif(u.display_name, ''), u.username)
            from chat_members m join users u on u.id = m.user_id
            where m.room_id = r.id and m.user_id <> c.owner_id
            limit 1
          ) else coalesce(r.title, co.title) end as place
        from chat_uploads c
        join chat_rooms r on r.id = c.room_id
        left join courses co on co.id = r.course_id
        where c.owner_id = ${userId}
          and storage_chat_upload_bytes(c.is_copy, c.message_deleted, c.status, c.created_at, c.size_bytes) > 0
          and not exists (
            select 1 from chat_rooms ir where ir.icon_upload_id = c.id
          )
        union all
        select 'discussion', l.id, ${kindOf(sql.ref("l.mime_type"))},
          l.file_name, l.mime_type, l.file_size::bigint, l.created_at,
          (l.status <> 'ready' or l.target_id is null), null::int,
          case when l.status = 'ready' then l.file_url end,
          case l.target_type
            when 'note' then 'Notes'
            when 'thread' then (
              select coalesce(t.title, tc.title) from learning_threads t
              left join courses tc on tc.id = t.course_id
              where t.id = l.target_id
            )
            when 'reply' then (
              select coalesce(t.title, tc.title) from learning_replies rp
              join learning_threads t on t.id = rp.thread_id
              left join courses tc on tc.id = t.course_id
              where rp.id = l.target_id
            )
          end
        from learning_attachments l
        where l.owner_id = ${userId}
          and storage_learning_attachment_bytes(l.status, l.created_at, l.file_size) > 0
        union all
        select 'support', s.id, ${kindOf(sql.ref("s.mime_type"))},
          s.file_name, s.mime_type, s.file_size::bigint, s.created_at,
          (s.ticket_id is null and s.message_id is null), null::int, null::text,
          coalesce((
            select tk.title from support_tickets tk
            where tk.id = coalesce(s.ticket_id, (
              select sm.ticket_id from support_messages sm where sm.id = s.message_id
            ))
          ), 'Support')
        from support_attachments s
        where s.owner_id = ${userId}
          and storage_support_attachment_bytes(s.ticket_id, s.message_id, s.created_at, s.file_size) > 0
      `;
      const orderBy =
        input.sort === "newest"
          ? sql`f.created_at desc, f.id`
          : input.sort === "oldest"
            ? sql`f.created_at asc, f.id`
            : sql`f.size desc, f.created_at desc, f.id`;
      const [page, kinds] = await Promise.all([
        sql<OwnFileRow & { total: string; total_bytes: string }>`
          with files as (${files})
          select f.*, count(*) over () as total,
            sum(f.size) over () as total_bytes
          from files f
          where ${input.kind ? sql`f.kind = ${input.kind}` : sql`true`}
          order by ${orderBy}
          ${input.limit === null ? sql`` : sql`limit ${input.limit} offset ${input.offset}`}
        `.execute(db),
        sql<{ kind: StorageFileKind; count: string; bytes: string }>`
          with files as (${files})
          select f.kind, count(*) as count, sum(f.size) as bytes
          from files f group by f.kind
        `.execute(db),
      ]);
      return { rows: page.rows, kinds: kinds.rows };
    },

    // ------------------------------------------------------------ limits
    async setLimit(
      db: DatabaseExecutor,
      userId: string,
      limitBytes: number | null,
    ) {
      await db
        .insertInto("user_storage")
        .values({ user_id: userId, limit_bytes: limitBytes })
        .onConflict((conflict) =>
          conflict.column("user_id").doUpdateSet({
            limit_bytes: limitBytes,
            updated_at: sql`now()`,
          }),
        )
        .execute();
    },

    async setBlocked(
      db: DatabaseExecutor,
      userId: string,
      input: { by: string; reason: string | null } | null,
    ) {
      const values = input
        ? {
            blocked_at: sql<Date>`now()`,
            blocked_by: input.by,
            block_reason: input.reason,
          }
        : { blocked_at: null, blocked_by: null, block_reason: null };
      await db
        .insertInto("user_storage")
        .values({ user_id: userId, ...values })
        .onConflict((conflict) =>
          conflict
            .column("user_id")
            .doUpdateSet({ ...values, updated_at: sql`now()` }),
        )
        .execute();
    },

    async defaultLimit(db: DatabaseExecutor): Promise<number> {
      const row = await db
        .selectFrom("storage_settings")
        .select("default_limit_bytes")
        .where("id", "=", true)
        .executeTakeFirst();
      return Number(row?.default_limit_bytes ?? 0);
    },

    async setDefaultLimit(
      db: DatabaseExecutor,
      limitBytes: number,
      updatedBy: string,
    ) {
      await db
        .insertInto("storage_settings")
        .values({
          id: true,
          default_limit_bytes: limitBytes,
          updated_by: updatedBy,
        })
        .onConflict((conflict) =>
          conflict.column("id").doUpdateSet({
            default_limit_bytes: limitBytes,
            updated_by: updatedBy,
            updated_at: sql`now()`,
          }),
        )
        .execute();
    },

    // ---------------------------------------------------------- requests
    async findPendingRequest(db: DatabaseExecutor, userId: string) {
      return (await db
        .selectFrom("storage_requests")
        .select(requestColumns)
        .where("user_id", "=", userId)
        .where("status", "=", "pending")
        .executeTakeFirst()) as StorageRequestRow | undefined;
    },

    /** The open request, else the latest decided since `since`. */
    async findCurrentRequest(
      db: DatabaseExecutor,
      userId: string,
      since: Date,
    ) {
      return (await db
        .selectFrom("storage_requests")
        .select(requestColumns)
        .where("user_id", "=", userId)
        .where((eb) =>
          eb.or([
            eb("status", "=", "pending"),
            eb.and([
              eb("status", "in", ["approved", "declined"]),
              eb("decided_at", ">", since),
            ]),
          ]),
        )
        .orderBy(sql`status = 'pending'`, "desc")
        .orderBy("created_at", "desc")
        .limit(1)
        .executeTakeFirst()) as StorageRequestRow | undefined;
    },

    /** Null when one is already open (two taps at once meet here). */
    async insertRequest(
      db: DatabaseExecutor,
      input: {
        userId: string;
        note: string | null;
        usedBytes: number;
        limitBytes: number;
      },
    ) {
      const result = await sql<StorageRequestRow>`
        insert into storage_requests (user_id, note, used_bytes, limit_bytes)
        values (${input.userId}, ${input.note}, ${input.usedBytes}, ${input.limitBytes})
        on conflict (user_id) where status = 'pending' do nothing
        returning ${sql.join(requestColumns.map((column) => sql.ref(column)))}
      `.execute(db);
      return result.rows[0] ?? null;
    },

    async lockRequest(db: DatabaseExecutor, requestId: string) {
      const result = await sql<StorageRequestRow>`
        select ${sql.join(requestColumns.map((column) => sql.ref(column)))}
        from storage_requests where id = ${requestId}
        for update
      `.execute(db);
      return result.rows[0];
    },

    async decideRequest(
      db: DatabaseExecutor,
      requestId: string,
      input: {
        status: Exclude<StorageRequestStatus, "pending">;
        by: string | null;
        note: string | null;
        grantedLimitBytes: number | null;
      },
    ) {
      return (await db
        .updateTable("storage_requests")
        .set({
          status: input.status,
          decided_by: input.by,
          decided_at: sql<Date>`now()`,
          decision_note: input.note,
          granted_limit_bytes: input.grantedLimitBytes,
        })
        .where("id", "=", requestId)
        .where("status", "=", "pending")
        .returning(requestColumns)
        .executeTakeFirst()) as StorageRequestRow | undefined;
    },

    async listRequests(db: DatabaseExecutor, userId: string, limit: number) {
      return (await db
        .selectFrom("storage_requests")
        .select(requestColumns)
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .limit(limit)
        .execute()) as StorageRequestRow[];
    },

    // ------------------------------------------------------------ events
    async insertEvent(
      db: DatabaseExecutor,
      input: {
        userId: string;
        actorId: string | null;
        action: StorageEventAction;
        fromLimitBytes?: number | null;
        toLimitBytes?: number | null;
        requestId?: string | null;
        note?: string | null;
      },
    ) {
      await db
        .insertInto("storage_events")
        .values({
          user_id: input.userId,
          actor_id: input.actorId,
          action: input.action,
          from_limit_bytes: input.fromLimitBytes ?? null,
          to_limit_bytes: input.toLimitBytes ?? null,
          request_id: input.requestId ?? null,
          note: input.note ?? null,
        })
        .execute();
    },

    async listEvents(db: DatabaseExecutor, userId: string, limit: number) {
      return db
        .selectFrom("storage_events as e")
        .leftJoin("users as actor", "actor.id", "e.actor_id")
        .select([
          "e.id",
          "e.action",
          "e.actor_id",
          "actor.display_name as actor_name",
          "e.from_limit_bytes",
          "e.to_limit_bytes",
          "e.note",
          "e.created_at",
        ])
        .where("e.user_id", "=", userId)
        .orderBy("e.created_at", "desc")
        .limit(limit)
        .execute();
    },

    // ------------------------------------------------------- admin list
    /**
     * Learners (no role beyond student) with their space, one page. People
     * who never stored a file have no row and count as 0 bytes used.
     */
    async listLearners(
      db: DatabaseExecutor,
      input: {
        search?: string | undefined;
        filter: StorageLearnerFilter;
        sort: StorageLearnerSort;
        order: "asc" | "desc";
        limit: number;
        offset: number;
        userId?: string;
      },
    ) {
      const term = input.search?.replace(/^@+/, "").trim();
      const like = term ? `%${escapeLikePattern(term)}%` : null;
      const filter = (() => {
        switch (input.filter) {
          case "requested":
            return sql`and l.request_id is not null`;
          case "near_full":
            return sql`and l.used_bytes >= l.limit_bytes * ${STORAGE_NEAR_FULL_RATIO} and l.used_bytes < l.limit_bytes`;
          case "full":
            return sql`and l.used_bytes >= l.limit_bytes`;
          case "blocked":
            return sql`and l.blocked_at is not null`;
          case "custom":
            return sql`and l.custom_limit`;
          default:
            return sql``;
        }
      })();
      const direction = sql.raw(input.order === "asc" ? "asc" : "desc");
      const nulls = sql.raw(
        input.order === "asc" ? "nulls first" : "nulls last",
      );
      const orderBy = (() => {
        switch (input.sort) {
          case "name":
            return sql`lower(coalesce(l.display_name, l.username, '')) ${direction}, l.user_id`;
          case "percent":
            return sql`(l.used_bytes::numeric / greatest(l.limit_bytes, 1)) ${direction}, l.user_id`;
          case "last_upload":
            return sql`l.last_upload_at ${direction} ${nulls}, l.user_id`;
          case "requested":
            return sql`l.request_created_at ${direction} ${nulls}, l.used_bytes desc, l.user_id`;
          default:
            return sql`l.used_bytes ${direction}, l.user_id`;
        }
      })();
      const result = await sql<LearnerRow & { total: string }>`
        with learners as (
          select
            u.id as user_id, u.display_name, u.username, u.email,
            u.avatar_data_url,
            coalesce(s.used_bytes, 0) as used_bytes,
            coalesce(s.limit_bytes, settings.default_limit_bytes) as limit_bytes,
            (s.limit_bytes is not null) as custom_limit,
            s.last_upload_at, s.blocked_at, s.block_reason,
            r.id as request_id, r.status as request_status,
            r.note as request_note, r.used_bytes as request_used_bytes,
            r.limit_bytes as request_limit_bytes,
            r.created_at as request_created_at
          from users u
          cross join storage_settings settings
          left join user_storage s on s.user_id = u.id
          left join storage_requests r
            on r.user_id = u.id and r.status = 'pending'
          where settings.id
            and u.is_deleted = false
            and not ${isStaffUser(sql.ref("u.id"))}
            ${input.userId ? sql`and u.id = ${input.userId}` : sql``}
            ${
              like
                ? sql`and (u.display_name ilike ${like} or u.username ilike ${like} or u.email ilike ${like})`
                : sql``
            }
        )
        select l.*, count(*) over () as total
        from learners l
        where true ${filter}
        order by ${orderBy}
        limit ${input.limit} offset ${input.offset}
      `.execute(db);
      return result.rows;
    },

    /** Totals over all learners, for the page's header. */
    async summary(db: DatabaseExecutor) {
      const result = await sql<{
        default_limit_bytes: string;
        learners: string;
        total_used: string;
        pending: string;
        blocked: string;
        full: string;
      }>`
        with learners as (
          select coalesce(s.used_bytes, 0) as used_bytes,
            coalesce(s.limit_bytes, settings.default_limit_bytes) as limit_bytes,
            s.blocked_at
          from users u
          cross join storage_settings settings
          left join user_storage s on s.user_id = u.id
          where settings.id
            and u.is_deleted = false
            and not ${isStaffUser(sql.ref("u.id"))}
        )
        select
          (select default_limit_bytes from storage_settings where id) as default_limit_bytes,
          count(*) as learners,
          coalesce(sum(used_bytes), 0) as total_used,
          (select count(*) from storage_requests where status = 'pending') as pending,
          count(*) filter (where blocked_at is not null) as blocked,
          count(*) filter (where used_bytes >= limit_bytes) as full
        from learners
      `.execute(db);
      const row = result.rows[0]!;
      return {
        defaultLimitBytes: Number(row.default_limit_bytes),
        learners: Number(row.learners),
        totalUsedBytes: Number(row.total_used),
        pendingRequests: Number(row.pending),
        blocked: Number(row.blocked),
        full: Number(row.full),
      };
    },

    // --------------------------------------------------------- the job
    /**
     * People whose count may have gone stale: a file of theirs passed its
     * "within a day / an hour" mark (uploads in the last two days), or the
     * full pass (`all`), a page at a time by id.
     */
    async listForRecount(
      db: DatabaseExecutor,
      input: { all: boolean; afterUserId: string | null; limit: number },
    ) {
      let query = db
        .selectFrom("user_storage")
        .select("user_id")
        .orderBy("user_id")
        .limit(input.limit);
      if (!input.all) {
        query = query.where(
          "last_upload_at",
          ">",
          sql<Date>`now() - interval '2 days'`,
        );
      }
      if (input.afterUserId) {
        query = query.where("user_id", ">", input.afterUserId);
      }
      return (await query.execute()).map((row) => row.user_id);
    },
  };
}

export type StorageRepository = ReturnType<typeof createStorageRepository>;
