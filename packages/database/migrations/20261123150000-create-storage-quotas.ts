import { sql, type Kysely } from "kysely";

/**
 * Storage for learners' files. Every learner may keep a set amount (2 GB by
 * default) of the files they upload: chat photos, videos, voice messages and
 * documents, discussion and note attachments, and support attachments. An
 * admin can give one person more, set it back to the default, or block
 * their uploads; a learner who is full can ask for more.
 *
 * Tables (API module `storage`):
 * - `storage_settings`: one row, the default limit for everyone.
 * - `user_storage`: one row per person who has stored a file or been given
 *   a limit: `used_bytes`, `limit_bytes` (null: the default), the block.
 * - `storage_requests`: "Request more space"; at most one pending each.
 * - `storage_events`: who changed whose limit or block, and when.
 *
 * How `used_bytes` stays right. A file counts while it takes space for its
 * owner (`COUNTED_FILES` below, one rule per kind of file):
 * - chat: not a forwarded copy (`is_copy`: it shares another upload's
 *   stored file), its message not deleted (`message_deleted`, kept by the
 *   trigger on `chat_messages`), and sent, or started within a day (an
 *   unsent one is removed by the chat retention job after a day);
 * - discussions and notes: `ready`, or `uploading` started within an hour
 *   (an upload slot takes its file for an hour);
 * - support: on a ticket or message, or added within a day (an unsent one
 *   is removed a day later).
 * Statement triggers on the three tables add what each statement added or
 * removed, per owner, locking the owners' rows in one order (two statements
 * never deadlock on them). They catch every way a file goes, cascades
 * included. A file passing its "within a day / an hour" mark changes no row,
 * so the count can then be too high, never too low: `storage_recount`
 * recomputes from the files, and the API runs it before refusing an upload,
 * on a schedule, and when an admin asks.
 *
 * Adds `storage.read` and `storage.manage` for admins. Ids as in
 * 20261110110000: the preferred one, else a random one when it is taken.
 */
const storagePermissions = [
  { key: "storage.read", id: "00000000-0000-4000-b000-000000000101" },
  { key: "storage.manage", id: "00000000-0000-4000-b000-000000000102" },
] as const;

const DEFAULT_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * The three kinds of file a person's space holds, and what one row takes
 * (`bytes`, over a row alias). Plain columns go to the SQL functions, not
 * whole rows: the rows a statement trigger sees have no table type.
 */
const COUNTED_FILES = [
  {
    table: "chat_uploads",
    bytes: (row: string) =>
      `storage_chat_upload_bytes(${row}.is_copy, ${row}.message_deleted, ${row}.status, ${row}.created_at, ${row}.size_bytes)`,
  },
  {
    table: "learning_attachments",
    bytes: (row: string) =>
      `storage_learning_attachment_bytes(${row}.status, ${row}.created_at, ${row}.file_size)`,
  },
  {
    table: "support_attachments",
    bytes: (row: string) =>
      `storage_support_attachment_bytes(${row}.ticket_id, ${row}.message_id, ${row}.created_at, ${row}.file_size)`,
  },
] as const;

export async function up(database: Kysely<unknown>): Promise<void> {
  for (const permission of storagePermissions) {
    await sql`
      insert into permissions (id, permission_key, domain, description)
      select
        case
          when exists (select 1 from permissions where id = ${permission.id}::uuid)
            then gen_random_uuid()
          else ${permission.id}::uuid
        end,
        ${permission.key},
        'storage',
        ${`Permission to perform ${permission.key}`}
      on conflict (permission_key) do nothing
    `.execute(database);
    await sql`
      insert into role_permissions (role_id, permission_id, effect)
      select roles.id, permissions.id, 'allow'
      from roles
      join permissions on permissions.permission_key = ${permission.key}
      where roles.name = 'admin'
      on conflict (role_id, permission_id) do update set effect = 'allow'
    `.execute(database);
  }

  await sql`
    create table if not exists storage_settings (
      id boolean primary key default true check (id),
      default_limit_bytes bigint not null,
      updated_by uuid references users (id) on delete set null,
      updated_at timestamptz not null default current_timestamp,
      constraint storage_settings_limit_valid check (default_limit_bytes >= 0)
    )
  `.execute(database);
  await sql`
    insert into storage_settings (id, default_limit_bytes)
    values (true, ${DEFAULT_LIMIT_BYTES})
    on conflict (id) do nothing
  `.execute(database);

  await sql`
    create table if not exists user_storage (
      user_id uuid primary key references users (id) on delete cascade,
      used_bytes bigint not null default 0,
      limit_bytes bigint,
      blocked_at timestamptz,
      blocked_by uuid references users (id) on delete set null,
      block_reason text,
      last_upload_at timestamptz,
      reconciled_at timestamptz,
      updated_at timestamptz not null default current_timestamp,
      constraint user_storage_used_valid check (used_bytes >= 0),
      constraint user_storage_limit_valid check (limit_bytes is null or limit_bytes >= 0),
      constraint user_storage_reason_length check (char_length(block_reason) <= 500)
    )
  `.execute(database);
  // The admin list sorted by space used, and the scheduled recount.
  await sql`
    create index if not exists idx_user_storage_used
      on user_storage (used_bytes desc)
  `.execute(database);
  await sql`
    create index if not exists idx_user_storage_last_upload
      on user_storage (last_upload_at)
      where last_upload_at is not null
  `.execute(database);

  await sql`
    create table if not exists storage_requests (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users (id) on delete cascade,
      status text not null default 'pending',
      note text,
      used_bytes bigint not null,
      limit_bytes bigint not null,
      granted_limit_bytes bigint,
      decided_by uuid references users (id) on delete set null,
      decided_at timestamptz,
      decision_note text,
      created_at timestamptz not null default current_timestamp,
      constraint storage_requests_status_valid
        check (status in ('pending', 'approved', 'declined', 'cancelled')),
      constraint storage_requests_note_length check (char_length(note) <= 500),
      constraint storage_requests_decision_note_length
        check (char_length(decision_note) <= 500)
    )
  `.execute(database);
  // One open request per person; two at once (a double tap) meet here.
  await sql`
    create unique index if not exists storage_requests_one_pending
      on storage_requests (user_id) where status = 'pending'
  `.execute(database);
  await sql`
    create index if not exists idx_storage_requests_user
      on storage_requests (user_id, created_at desc)
  `.execute(database);

  await sql`
    create table if not exists storage_events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users (id) on delete cascade,
      actor_id uuid references users (id) on delete set null,
      action text not null,
      from_limit_bytes bigint,
      to_limit_bytes bigint,
      request_id uuid references storage_requests (id) on delete set null,
      note text,
      created_at timestamptz not null default current_timestamp,
      constraint storage_events_action_valid check (action in (
        'request', 'cancel_request', 'approve_request', 'decline_request',
        'set_limit', 'reset_limit', 'block', 'unblock', 'recount',
        'set_default_limit'
      ))
    )
  `.execute(database);
  await sql`
    create index if not exists idx_storage_events_user
      on storage_events (user_id, created_at desc)
  `.execute(database);

  // Chat: forwarded copies use no new space; a deleted message's files stop
  // counting (they stay stored a while for an admin's restore).
  await sql`
    alter table chat_uploads
      add column if not exists is_copy boolean not null default false,
      add column if not exists message_deleted boolean not null default false
  `.execute(database);
  await sql`
    update chat_uploads u set is_copy = true
    from (
      select id, row_number() over (
        partition by storage_key order by created_at, id
      ) as n
      from chat_uploads
    ) ranked
    where ranked.id = u.id and ranked.n > 1
  `.execute(database);
  await sql`
    update chat_uploads u set message_deleted = true
    from chat_messages m
    where m.room_id = u.room_id and m.seq = u.message_seq
      and m.deleted_at is not null
  `.execute(database);
  await sql`
    create or replace function chat_uploads_follow_message_deletion()
    returns trigger
    language plpgsql
    as $fn$
    begin
      update chat_uploads
        set message_deleted = (new.deleted_at is not null)
        where room_id = new.room_id and message_seq = new.seq
          and message_deleted is distinct from (new.deleted_at is not null);
      return null;
    end;
    $fn$
  `.execute(database);
  await sql`
    drop trigger if exists chat_messages_uploads_follow_deletion on chat_messages
  `.execute(database);
  await sql`
    create trigger chat_messages_uploads_follow_deletion
      after update of deleted_at on chat_messages
      for each row
      when (old.deleted_at is distinct from new.deleted_at)
      execute function chat_uploads_follow_message_deletion()
  `.execute(database);

  // What one file takes from its owner's space (see the comment on top).
  await sql`
    create or replace function storage_chat_upload_bytes(
      p_is_copy boolean, p_message_deleted boolean, p_status text,
      p_created_at timestamptz, p_size bigint
    )
    returns bigint
    language sql
    stable
    as $fn$
      select case
        when not p_is_copy and not p_message_deleted
          and (p_status = 'attached' or p_created_at > now() - interval '1 day')
        then p_size else 0
      end
    $fn$
  `.execute(database);
  await sql`
    create or replace function storage_learning_attachment_bytes(
      p_status text, p_created_at timestamptz, p_size bigint
    )
    returns bigint
    language sql
    stable
    as $fn$
      select case
        when p_status = 'ready'
          or (p_status = 'uploading' and p_created_at > now() - interval '1 hour')
        then p_size else 0
      end
    $fn$
  `.execute(database);
  await sql`
    create or replace function storage_support_attachment_bytes(
      p_ticket_id uuid, p_message_id uuid, p_created_at timestamptz,
      p_size bigint
    )
    returns bigint
    language sql
    stable
    as $fn$
      select case
        when p_ticket_id is not null or p_message_id is not null
          or p_created_at > now() - interval '1 day'
        then p_size else 0
      end
    $fn$
  `.execute(database);

  // Adds each person's change, in person order. Only a person gaining bytes
  // gets a new row: one being deleted only loses them (and their row may be
  // gone already, through the cascade).
  await sql`
    create or replace function storage_apply(p_users uuid[], p_deltas bigint[])
    returns void
    language plpgsql
    as $fn$
    begin
      insert into user_storage (user_id)
        select d.user_id from unnest(p_users, p_deltas) as d (user_id, delta)
        where d.delta > 0
        order by d.user_id
        on conflict (user_id) do nothing;
      perform 1 from user_storage
        where user_id = any (p_users)
        order by user_id
        for update;
      update user_storage s
        set used_bytes = greatest(0, s.used_bytes + d.delta),
            updated_at = now()
        from unnest(p_users, p_deltas) as d (user_id, delta)
        where s.user_id = d.user_id;
    end;
    $fn$
  `.execute(database);

  // One trigger function per table, all of one shape: what the statement
  // added (new rows) less what it took away (old rows), per owner.
  for (const files of COUNTED_FILES) {
    const table = sql.raw(files.table);
    const track = sql.raw(`storage_track_${files.table}`);
    const newBytes = sql.raw(files.bytes("n"));
    const oldBytes = sql.raw(files.bytes("o"));
    await sql`
      create or replace function ${track}()
      returns trigger
      language plpgsql
      as $fn$
      declare
        v_users uuid[];
        v_deltas bigint[];
      begin
        if tg_op = 'INSERT' then
          select array_agg(owner_id order by owner_id), array_agg(bytes order by owner_id)
            into v_users, v_deltas
            from (
              select n.owner_id, sum(${newBytes})::bigint as bytes
              from new_rows n group by n.owner_id
            ) changed
            where bytes <> 0;
        elsif tg_op = 'DELETE' then
          select array_agg(owner_id order by owner_id), array_agg(bytes order by owner_id)
            into v_users, v_deltas
            from (
              select o.owner_id, -sum(${oldBytes})::bigint as bytes
              from old_rows o group by o.owner_id
            ) changed
            where bytes <> 0;
        else
          select array_agg(owner_id order by owner_id), array_agg(bytes order by owner_id)
            into v_users, v_deltas
            from (
              select owner_id, sum(bytes)::bigint as bytes
              from (
                select n.owner_id, ${newBytes} as bytes from new_rows n
                union all
                select o.owner_id, -${oldBytes} from old_rows o
              ) both_sides
              group by owner_id
            ) changed
            where bytes <> 0;
        end if;
        if v_users is not null then
          perform storage_apply(v_users, v_deltas);
        end if;
        return null;
      end;
      $fn$
    `.execute(database);

    const trigger = (event: string) =>
      sql.raw(`storage_${files.table}_${event}`);
    for (const event of ["insert", "update", "delete"]) {
      await sql`drop trigger if exists ${trigger(event)} on ${table}`.execute(
        database,
      );
    }
    await sql`
      create trigger ${trigger("insert")} after insert on ${table}
        referencing new table as new_rows
        for each statement execute function ${track}()
    `.execute(database);
    await sql`
      create trigger ${trigger("update")} after update on ${table}
        referencing old table as old_rows new table as new_rows
        for each statement execute function ${track}()
    `.execute(database);
    await sql`
      create trigger ${trigger("delete")} after delete on ${table}
        referencing old table as old_rows
        for each statement execute function ${track}()
    `.execute(database);
  }

  // Recomputes these people's space from their files. Their rows are locked
  // first: an upload under way either finished before (and is counted) or
  // adds itself after (its trigger waits for the lock).
  await sql`
    create or replace function storage_recount(p_users uuid[])
    returns table (user_id uuid, before_bytes bigint, after_bytes bigint)
    language plpgsql
    as $fn$
    begin
      perform 1 from user_storage s
        where s.user_id = any (p_users)
        order by s.user_id
        for update;
      return query
        with counted as (
          select ids.id, coalesce((
            select sum(b) from (
              select ${sql.raw(COUNTED_FILES[0].bytes("c"))} as b
              from chat_uploads c where c.owner_id = ids.id
              union all
              select ${sql.raw(COUNTED_FILES[1].bytes("l"))}
              from learning_attachments l where l.owner_id = ids.id
              union all
              select ${sql.raw(COUNTED_FILES[2].bytes("t"))}
              from support_attachments t where t.owner_id = ids.id
            ) files
          ), 0)::bigint as bytes
          from unnest(p_users) as ids (id)
        ),
        previous as (
          select s.user_id, s.used_bytes from user_storage s
          where s.user_id = any (p_users)
        ),
        changed as (
          update user_storage s
            set used_bytes = counted.bytes,
                reconciled_at = now(),
                updated_at = case
                  when s.used_bytes <> counted.bytes then now() else s.updated_at
                end
            from counted
            where s.user_id = counted.id
            returning s.user_id, counted.bytes
        )
        select changed.user_id, previous.used_bytes, changed.bytes
        from changed join previous on previous.user_id = changed.user_id;
    end;
    $fn$
  `.execute(database);

  // Everyone who already has files starts with the right count.
  await sql`
    insert into user_storage (user_id)
    select owner_id from chat_uploads
    union
    select owner_id from learning_attachments
    union
    select owner_id from support_attachments
    on conflict (user_id) do nothing
  `.execute(database);
  await sql`
    select count(*) from storage_recount(array(select user_id from user_storage))
  `.execute(database);
  await sql`
    update user_storage s set last_upload_at = latest.at
    from (
      select owner_id, max(created_at) as at from (
        select owner_id, created_at from chat_uploads where not is_copy
        union all
        select owner_id, created_at from learning_attachments
        union all
        select owner_id, created_at from support_attachments
      ) files
      group by owner_id
    ) latest
    where latest.owner_id = s.user_id
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  for (const { table } of COUNTED_FILES) {
    for (const event of ["insert", "update", "delete"]) {
      await sql`drop trigger if exists ${sql.raw(`storage_${table}_${event}`)} on ${sql.raw(table)}`.execute(
        database,
      );
    }
    await sql`drop function if exists ${sql.raw(`storage_track_${table}`)}()`.execute(
      database,
    );
  }
  await sql`drop trigger if exists chat_messages_uploads_follow_deletion on chat_messages`.execute(
    database,
  );
  await sql`drop function if exists storage_recount(uuid[])`.execute(database);
  await sql`drop function if exists storage_apply(uuid[], bigint[])`.execute(
    database,
  );
  await sql`drop function if exists storage_chat_upload_bytes(boolean, boolean, text, timestamptz, bigint)`.execute(
    database,
  );
  await sql`drop function if exists storage_learning_attachment_bytes(text, timestamptz, bigint)`.execute(
    database,
  );
  await sql`drop function if exists storage_support_attachment_bytes(uuid, uuid, timestamptz, bigint)`.execute(
    database,
  );
  await sql`drop function if exists chat_uploads_follow_message_deletion()`.execute(
    database,
  );
  await sql`
    alter table chat_uploads
      drop column if exists is_copy,
      drop column if exists message_deleted
  `.execute(database);
  await sql`drop table if exists storage_events`.execute(database);
  await sql`drop table if exists storage_requests`.execute(database);
  await sql`drop table if exists user_storage`.execute(database);
  await sql`drop table if exists storage_settings`.execute(database);
  for (const permission of storagePermissions) {
    await sql`delete from permissions where permission_key = ${permission.key}`.execute(
      database,
    );
  }
}
