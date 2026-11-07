import { sql, type Kysely } from "kysely";

/**
 * Chat: course groups, team groups and private (direct) chats, laid out like
 * WhatsApp. The plan and its decisions: CHAT_ROOM_PLAN.md (§3 data model).
 *
 * - `chat_settings`: one row of platform rules (private chat policy,
 *   retention, limits).
 * - `chat_rooms`: a course group (one per course), a team group or a private
 *   chat. `last_seq` numbers messages without gaps; `last_event_seq` counts
 *   every change (new, edited, deleted, pinned, reacted) so a client can ask
 *   for "everything since N".
 * - `chat_members`: a person's own state in a room (read position, mute,
 *   archive, pin, helper). For course groups it is not the access list:
 *   course access decides who may read and post.
 * - `chat_messages`: keyed by (room_id, seq).
 * - `chat_reactions`, `chat_stars`, `chat_hidden_messages` ("delete for me").
 * - `chat_restrictions`: mutes, bans and "no private chats", per room or
 *   platform-wide (room_id null).
 * - `chat_user_blocks`, `chat_reports`, `chat_moderation_log`.
 *
 * Hot counters (`last_seq`, `last_event_seq`, `last_message_at`,
 * `last_read_seq`, `last_delivered_seq`) have no index, and the two
 * frequently updated tables keep 20 % free space per page, so their updates
 * are HOT updates (no index writes, little bloat).
 *
 * `chat_send` saves one message: it locks the room row, so sequence numbers
 * are gapless and a retried message (same client id) is returned instead of
 * stored twice — race-free, unlike a single-statement "check then insert".
 *
 * Adds `chat.moderate`, `chat.manage` and `chat.restrict_platform`
 * (positions 82–84 in the contracts list, the seed's id scheme).
 */
const chatPermissions = [
  {
    key: "chat.moderate",
    id: "00000000-0000-4000-b000-000000000082",
    roles: ["admin", "instructor", "teaching_assistant"],
  },
  {
    key: "chat.manage",
    id: "00000000-0000-4000-b000-000000000083",
    roles: ["admin"],
  },
  {
    key: "chat.restrict_platform",
    id: "00000000-0000-4000-b000-000000000084",
    roles: ["admin", "instructor"],
  },
] as const;

export async function up(database: Kysely<unknown>): Promise<void> {
  for (const permission of chatPermissions) {
    await sql`
      insert into permissions (id, permission_key, domain, description)
      values (
        ${permission.id}::uuid,
        ${permission.key},
        'chat',
        ${`Permission to perform ${permission.key}`}
      )
      on conflict do nothing
    `.execute(database);
    for (const role of permission.roles) {
      await sql`
        insert into role_permissions (role_id, permission_id, effect)
        select roles.id, permissions.id, 'allow'
        from roles
        join permissions on permissions.permission_key = ${permission.key}
        where roles.name = ${role}
        on conflict (role_id, permission_id) do update set effect = 'allow'
      `.execute(database);
    }
  }

  await sql`
    create table if not exists chat_settings (
      id smallint primary key default 1,
      direct_policy text not null default 'course_peers',
      course_retention_months integer not null default 12,
      max_direct_requests_per_day integer not null default 10,
      max_helpers_per_room integer not null default 10,
      updated_by uuid references users (id) on delete set null,
      updated_at timestamptz not null default current_timestamp,
      constraint chat_settings_single_row check (id = 1),
      constraint chat_settings_direct_policy_valid check (
        direct_policy in ('off', 'staff_only', 'course_peers')
      ),
      constraint chat_settings_retention_range check (
        course_retention_months between 1 and 120
      )
    )
  `.execute(database);
  await sql`insert into chat_settings (id) values (1) on conflict do nothing`.execute(
    database,
  );

  await sql`
    create table if not exists chat_rooms (
      id uuid primary key,
      kind text not null,
      course_id uuid references courses (id) on delete cascade,
      -- Private chats: "<smaller user id>:<larger user id>", one chat per pair.
      direct_key text unique,
      -- Private chats between learners start as a request.
      direct_status text,
      requested_by uuid references users (id) on delete set null,
      title text,
      description text,
      posting_policy text not null default 'everyone',
      slow_mode_seconds integer not null default 0,
      attachments_allowed boolean not null default true,
      direct_messages_allowed boolean not null default false,
      status text not null default 'active',
      last_seq bigint not null default 0,
      last_event_seq bigint not null default 0,
      last_message_at timestamptz,
      created_by uuid references users (id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint chat_rooms_kind_valid check (kind in ('course', 'team', 'direct')),
      constraint chat_rooms_course_shape check (
        (kind = 'course') = (course_id is not null)
      ),
      constraint chat_rooms_direct_shape check (
        (kind = 'direct') = (direct_key is not null)
      ),
      constraint chat_rooms_direct_status_valid check (
        direct_status is null or direct_status in ('requested', 'accepted', 'declined')
      ),
      constraint chat_rooms_posting_policy_valid check (
        posting_policy in ('everyone', 'staff_only')
      ),
      constraint chat_rooms_status_valid check (
        status in ('active', 'locked', 'archived')
      ),
      constraint chat_rooms_slow_mode_range check (
        slow_mode_seconds between 0 and 3600
      )
    ) with (fillfactor = 80)
  `.execute(database);
  await sql`
    create unique index if not exists idx_chat_rooms_course
      on chat_rooms (course_id) where kind = 'course'
  `.execute(database);
  await sql`
    create index if not exists idx_chat_rooms_kind on chat_rooms (kind)
  `.execute(database);

  await sql`
    create table if not exists chat_members (
      room_id uuid not null references chat_rooms (id) on delete cascade,
      user_id uuid not null references users (id) on delete cascade,
      room_role text not null default 'member',
      state text not null default 'active',
      last_read_seq bigint not null default 0,
      last_delivered_seq bigint not null default 0,
      notify_level text not null default 'all',
      archived_at timestamptz,
      pinned_at timestamptz,
      joined_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      primary key (room_id, user_id),
      constraint chat_members_role_valid check (
        room_role in ('owner', 'moderator', 'member')
      ),
      constraint chat_members_state_valid check (
        state in ('active', 'left', 'pending', 'hidden')
      ),
      constraint chat_members_notify_valid check (
        notify_level in ('all', 'mentions', 'none')
      )
    ) with (fillfactor = 80)
  `.execute(database);
  await sql`
    create index if not exists idx_chat_members_user on chat_members (user_id)
  `.execute(database);

  await sql`
    create table if not exists chat_messages (
      room_id uuid not null references chat_rooms (id) on delete cascade,
      seq bigint not null,
      id uuid not null unique,
      version_seq bigint not null,
      sender_id uuid references users (id) on delete set null,
      -- The sender's badge when the message was sent: admin, instructor,
      -- staff, helper or learner.
      sender_role text not null default 'learner',
      kind text not null default 'text',
      body text not null,
      reply_to_seq bigint,
      mentions uuid[] not null default '{}',
      mention_all boolean not null default false,
      attachments jsonb not null default '[]',
      reaction_counts jsonb not null default '{}',
      client_id uuid,
      pinned_at timestamptz,
      pinned_by uuid references users (id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      edited_at timestamptz,
      deleted_at timestamptz,
      deleted_by uuid references users (id) on delete set null,
      -- 'self' (the sender), 'admin' (a moderator) or 'purge' (retention).
      deleted_reason text,
      primary key (room_id, seq),
      constraint chat_messages_kind_valid check (kind in ('text', 'system')),
      constraint chat_messages_body_length check (octet_length(body) <= 6000),
      constraint chat_messages_deleted_reason_valid check (
        deleted_reason is null or deleted_reason in ('self', 'admin', 'purge')
      )
    )
  `.execute(database);
  await sql`
    create index if not exists idx_chat_messages_changes
      on chat_messages (room_id, version_seq)
  `.execute(database);
  // Retries (client id), slow mode and "one message before accepted".
  await sql`
    create unique index if not exists idx_chat_messages_client
      on chat_messages (room_id, sender_id, client_id)
      where client_id is not null
  `.execute(database);
  await sql`
    create index if not exists idx_chat_messages_sender
      on chat_messages (room_id, sender_id, seq desc)
  `.execute(database);
  await sql`
    create index if not exists idx_chat_messages_created
      on chat_messages (created_at)
  `.execute(database);
  await sql`
    create index if not exists idx_chat_messages_pinned
      on chat_messages (room_id) where pinned_at is not null
  `.execute(database);

  // Photos, videos, voice messages and documents. The browser uploads the
  // bytes straight to object storage (a presigned PUT); the API only signs,
  // checks the stored size/type, and redirects reads to a signed URL.
  await sql`
    create table if not exists chat_uploads (
      id uuid primary key,
      owner_id uuid not null references users (id) on delete cascade,
      room_id uuid not null references chat_rooms (id) on delete cascade,
      kind text not null,
      mime_type text not null,
      file_name text not null,
      size_bytes bigint not null,
      width integer,
      height integer,
      duration_ms integer,
      -- Voice messages: bar heights 0–100 drawn by the browser (display only).
      waveform jsonb,
      storage_key text not null,
      status text not null default 'pending',
      message_seq bigint,
      created_at timestamptz not null default current_timestamp,
      constraint chat_uploads_kind_valid check (kind in ('image', 'video', 'audio', 'file')),
      constraint chat_uploads_status_valid check (status in ('pending', 'ready', 'attached')),
      constraint chat_uploads_size_positive check (size_bytes > 0)
    )
  `.execute(database);
  await sql`
    create index if not exists idx_chat_uploads_owner
      on chat_uploads (owner_id, created_at)
  `.execute(database);
  await sql`
    create index if not exists idx_chat_uploads_message
      on chat_uploads (room_id, message_seq)
  `.execute(database);

  await sql`
    create table if not exists chat_reactions (
      room_id uuid not null,
      seq bigint not null,
      user_id uuid not null references users (id) on delete cascade,
      emoji text not null,
      created_at timestamptz not null default current_timestamp,
      primary key (room_id, seq, user_id),
      foreign key (room_id, seq) references chat_messages (room_id, seq) on delete cascade,
      constraint chat_reactions_emoji_length check (char_length(emoji) between 1 and 16)
    )
  `.execute(database);

  await sql`
    create table if not exists chat_stars (
      user_id uuid not null references users (id) on delete cascade,
      room_id uuid not null,
      seq bigint not null,
      created_at timestamptz not null default current_timestamp,
      primary key (user_id, room_id, seq),
      foreign key (room_id, seq) references chat_messages (room_id, seq) on delete cascade
    )
  `.execute(database);

  await sql`
    create table if not exists chat_hidden_messages (
      user_id uuid not null references users (id) on delete cascade,
      room_id uuid not null,
      seq bigint not null,
      created_at timestamptz not null default current_timestamp,
      primary key (user_id, room_id, seq),
      foreign key (room_id, seq) references chat_messages (room_id, seq) on delete cascade
    )
  `.execute(database);

  await sql`
    create table if not exists chat_restrictions (
      id uuid primary key,
      user_id uuid not null references users (id) on delete cascade,
      room_id uuid references chat_rooms (id) on delete cascade,
      type text not null,
      until timestamptz,
      reason text not null,
      note text,
      created_by uuid references users (id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      revoked_at timestamptz,
      revoked_by uuid references users (id) on delete set null,
      constraint chat_restrictions_type_valid check (
        type in ('mute', 'ban', 'no_direct')
      ),
      constraint chat_restrictions_reason_valid check (
        reason in ('spam', 'harassment', 'scam', 'inappropriate', 'other')
      )
    )
  `.execute(database);
  await sql`
    create index if not exists idx_chat_restrictions_user
      on chat_restrictions (user_id) where revoked_at is null
  `.execute(database);
  await sql`
    create index if not exists idx_chat_restrictions_platform
      on chat_restrictions (created_at desc) where room_id is null
  `.execute(database);

  await sql`
    create table if not exists chat_user_blocks (
      blocker_id uuid not null references users (id) on delete cascade,
      blocked_id uuid not null references users (id) on delete cascade,
      created_at timestamptz not null default current_timestamp,
      primary key (blocker_id, blocked_id),
      constraint chat_user_blocks_not_self check (blocker_id <> blocked_id)
    )
  `.execute(database);
  await sql`
    create index if not exists idx_chat_user_blocks_blocked
      on chat_user_blocks (blocked_id)
  `.execute(database);

  await sql`
    create table if not exists chat_reports (
      id uuid primary key,
      room_id uuid not null references chat_rooms (id) on delete cascade,
      seq bigint not null,
      reported_user_id uuid references users (id) on delete set null,
      reporter_id uuid references users (id) on delete set null,
      reason text not null,
      details text,
      -- The reported text and a little context, kept after the messages
      -- themselves are deleted or purged.
      snapshot jsonb not null,
      status text not null default 'open',
      handled_by uuid references users (id) on delete set null,
      handled_at timestamptz,
      created_at timestamptz not null default current_timestamp,
      constraint chat_reports_reason_valid check (
        reason in ('spam', 'harassment', 'scam', 'inappropriate', 'other')
      ),
      constraint chat_reports_status_valid check (
        status in ('open', 'actioned', 'dismissed')
      )
    )
  `.execute(database);
  await sql`
    create unique index if not exists idx_chat_reports_once
      on chat_reports (room_id, seq, reporter_id)
  `.execute(database);
  await sql`
    create index if not exists idx_chat_reports_queue
      on chat_reports (status, created_at desc)
  `.execute(database);

  await sql`
    create table if not exists chat_moderation_log (
      id uuid primary key,
      actor_id uuid references users (id) on delete set null,
      action text not null,
      room_id uuid references chat_rooms (id) on delete set null,
      target_user_id uuid references users (id) on delete set null,
      seq bigint,
      details jsonb not null default '{}',
      created_at timestamptz not null default current_timestamp
    )
  `.execute(database);
  await sql`
    create index if not exists idx_chat_moderation_log_created
      on chat_moderation_log (created_at desc)
  `.execute(database);
  await sql`
    create index if not exists idx_chat_moderation_log_room
      on chat_moderation_log (room_id, created_at desc)
  `.execute(database);

  // One message, saved in one round trip. Outcomes:
  //   sent | duplicate (same client id: the stored message is returned)
  //   room_missing | locked | slow_mode (wait_seconds) | repeated
  //   awaiting_accept (a private chat request already has its message)
  await sql`
    create or replace function chat_send(
      p_room uuid,
      p_id uuid,
      p_sender uuid,
      p_sender_role text,
      p_client uuid,
      p_kind text,
      p_body text,
      p_reply_to bigint,
      p_mentions uuid[],
      p_mention_all boolean,
      p_exempt_limits boolean,
      p_max_before_accept integer,
      p_attachments jsonb
    )
    returns table (
      outcome text,
      message_id uuid,
      message_seq bigint,
      message_event_seq bigint,
      message_created_at timestamptz,
      wait_seconds integer
    )
    language plpgsql
    as $fn$
    declare
      v_room chat_rooms%rowtype;
      v_existing chat_messages%rowtype;
      v_last_at timestamptz;
      v_count integer;
      v_reply bigint := p_reply_to;
    begin
      select * into v_room from chat_rooms where id = p_room for update;
      if not found then
        return query select 'room_missing'::text, null::uuid, null::bigint, null::bigint, null::timestamptz, null::integer;
        return;
      end if;

      if p_client is not null then
        select * into v_existing from chat_messages
          where room_id = p_room and sender_id = p_sender and client_id = p_client;
        if found then
          return query select 'duplicate'::text, v_existing.id, v_existing.seq,
            v_existing.version_seq, v_existing.created_at, null::integer;
          return;
        end if;
      end if;

      if v_room.status <> 'active' then
        return query select 'locked'::text, null::uuid, null::bigint, null::bigint, null::timestamptz, null::integer;
        return;
      end if;

      if not p_exempt_limits then
        if v_room.slow_mode_seconds > 0 then
          select created_at into v_last_at from chat_messages
            where room_id = p_room and sender_id = p_sender
            order by seq desc limit 1;
          if v_last_at is not null
             and v_last_at > now() - make_interval(secs => v_room.slow_mode_seconds) then
            return query select 'slow_mode'::text, null::uuid, null::bigint, null::bigint, null::timestamptz,
              greatest(1, ceil(extract(epoch from (v_last_at + make_interval(secs => v_room.slow_mode_seconds) - now())))::integer);
            return;
          end if;
        end if;

        select count(*) into v_count from (
          select body, created_at from chat_messages
            where room_id = p_room and sender_id = p_sender
            order by seq desc limit 5
        ) recent
        where recent.body = p_body and recent.created_at > now() - interval '1 minute';
        if v_count >= 2 then
          return query select 'repeated'::text, null::uuid, null::bigint, null::bigint, null::timestamptz, null::integer;
          return;
        end if;
      end if;

      if p_max_before_accept is not null then
        select count(*) into v_count from chat_messages
          where room_id = p_room and sender_id = p_sender;
        if v_count >= p_max_before_accept then
          return query select 'awaiting_accept'::text, null::uuid, null::bigint, null::bigint, null::timestamptz, null::integer;
          return;
        end if;
      end if;

      if v_reply is not null and not exists (
        select 1 from chat_messages where room_id = p_room and seq = v_reply
      ) then
        v_reply := null;
      end if;

      update chat_rooms
        set last_seq = last_seq + 1,
            last_event_seq = last_event_seq + 1,
            last_message_at = now()
        where id = p_room
        returning * into v_room;

      insert into chat_messages (
        room_id, seq, id, version_seq, sender_id, sender_role, kind, body,
        reply_to_seq, mentions, mention_all, client_id, attachments
      ) values (
        p_room, v_room.last_seq, p_id, v_room.last_event_seq, p_sender,
        p_sender_role, p_kind, p_body, v_reply, coalesce(p_mentions, '{}'),
        coalesce(p_mention_all, false), p_client, coalesce(p_attachments, '[]'::jsonb)
      );

      return query select 'sent'::text, p_id, v_room.last_seq,
        v_room.last_event_seq, now(), null::integer;
    end;
    $fn$
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop function if exists chat_send(uuid, uuid, uuid, text, uuid, text, text, bigint, uuid[], boolean, boolean, integer, jsonb)`.execute(
    database,
  );
  for (const table of [
    "chat_moderation_log",
    "chat_reports",
    "chat_user_blocks",
    "chat_restrictions",
    "chat_hidden_messages",
    "chat_stars",
    "chat_reactions",
    "chat_messages",
    "chat_uploads",
    "chat_members",
    "chat_rooms",
    "chat_settings",
  ]) {
    await sql`drop table if exists ${sql.table(table)}`.execute(database);
  }
  await sql`
    delete from permissions
    where permission_key in ('chat.moderate', 'chat.manage', 'chat.restrict_platform')
  `.execute(database);
}
