import { sql, type Kysely } from "kysely";

/**
 * Private chats accepted by replying (instead of the Accept button) left the
 * person who replied as a "pending" member: no pushes reached them for that
 * chat and they were missing from Message info. The reply now makes them
 * active; this repairs the chats accepted that way before.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    update chat_members cm
    set state = 'active', updated_at = now()
    from chat_rooms r
    where r.id = cm.room_id
      and r.kind = 'direct'
      and r.direct_status = 'accepted'
      and cm.state = 'pending'
  `.execute(database);
}

export async function down(): Promise<void> {
  // Nothing to undo: "pending" in an accepted chat was the bug.
}
