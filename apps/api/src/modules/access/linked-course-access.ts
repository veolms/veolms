import { sql } from "kysely";
import type { Executor } from "./access.repository.ts";

/**
 * Access to linked courses (`course_links`): whoever holds a course also
 * holds every course linked to it, without an order of its own.
 *
 * That access is written as an ordinary grant and enrolment, so every read
 * path (My Courses, the player, discussions, notifications) sees it with no
 * change, marked with source `linked_course` and no order. It is never
 * edited piecemeal: `syncLinkedCourseAccess` works out, for some learners,
 * which linked courses they should hold right now and brings their rows in
 * line. It runs after anything that can change a learner's access (an order
 * paid, refunded or withdrawn, a manual grant, revoke or restore) and for
 * every affected learner when a link is added or removed.
 *
 * The rules:
 * - A learner holds linked course L when they have live access to some
 *   course P linking L that did not itself come from a link (one level, so
 *   links cannot chain or loop).
 * - A row for L the learner got another way (bought it, a bundle, free
 *   enrolment, a manual grant) is left alone while it is live. A lapsed
 *   one (refunded, expired) is taken over by the link.
 * - The link's access lasts as long as the longest parent: lifetime when
 *   any parent is lifetime.
 * - When no parent is left, the link's rows are marked `expired`, not
 *   `revoked`. `revoked` on a linked row means staff took it away, and a
 *   later sync does not hand it back; "Restore" does.
 */

const SYNC_CHUNK_SIZE = 1000;

/** Live access to a course, not itself given by a link. */
const parentGrantIsLive = sql`(
  p.status = 'active'
  and p.source <> 'linked_course'
  and (p.valid_until is null or p.valid_until > now())
)`;

/** For each learner, the linked courses they should hold and until when. */
function desiredLinkedAccess(userIds: string[]) {
  return sql`
    select
      p.user_id,
      cl.linked_course_id as course_id,
      case
        when bool_or(p.valid_until is null) then null
        else max(p.valid_until)
      end as valid_until
    from access_grants p
    join course_links cl on cl.course_id = p.course_id
    join courses lc on lc.id = cl.linked_course_id and lc.deleted_at is null
    where p.user_id = any(${userIds}::uuid[])
      and ${parentGrantIsLive}
    group by p.user_id, cl.linked_course_id
  `;
}

async function syncChunk(database: Executor, userIds: string[]) {
  await sql`
    with desired as (${desiredLinkedAccess(userIds)})
    insert into access_grants
      (id, user_id, course_id, order_id, status, source,
       valid_from, valid_until, created_at, updated_at)
    select gen_random_uuid(), d.user_id, d.course_id, null, 'active',
      'linked_course', now(), d.valid_until, now(), now()
    from desired d
    on conflict (user_id, course_id) do update set
      order_id = null,
      status = 'active',
      source = 'linked_course',
      valid_from = case
        when access_grants.source = 'linked_course'
          and access_grants.status = 'active'
          then access_grants.valid_from
        else excluded.valid_from
      end,
      valid_until = excluded.valid_until,
      updated_at = now()
    where (
      access_grants.source = 'linked_course'
      and access_grants.status <> 'revoked'
      and (access_grants.status <> 'active'
           or access_grants.valid_until is distinct from excluded.valid_until)
    ) or (
      access_grants.source <> 'linked_course'
      and (access_grants.status <> 'active'
           or (access_grants.valid_until is not null
               and access_grants.valid_until <= now()))
    )
  `.execute(database);

  await sql`
    with desired as (${desiredLinkedAccess(userIds)})
    insert into enrollments
      (id, user_id, course_id, order_id, status, source,
       access_starts_at, access_expires_at, created_at, updated_at)
    select gen_random_uuid(), d.user_id, d.course_id, null, 'active',
      'linked_course', now(), d.valid_until, now(), now()
    from desired d
    on conflict (user_id, course_id) do update set
      order_id = null,
      status = 'active',
      source = 'linked_course',
      access_starts_at = case
        when enrollments.source = 'linked_course'
          and enrollments.status = 'active'
          then enrollments.access_starts_at
        else excluded.access_starts_at
      end,
      access_expires_at = excluded.access_expires_at,
      updated_at = now()
    where (
      enrollments.source = 'linked_course'
      and enrollments.status <> 'revoked'
      and (enrollments.status <> 'active'
           or enrollments.access_expires_at
                is distinct from excluded.access_expires_at)
    ) or (
      enrollments.source <> 'linked_course'
      and (enrollments.status <> 'active'
           or (enrollments.access_expires_at is not null
               and enrollments.access_expires_at <= now()))
    )
  `.execute(database);

  // Linked rows no parent backs any more.
  await sql`
    update access_grants g
      set status = 'expired', updated_at = now()
    where g.user_id = any(${userIds}::uuid[])
      and g.source = 'linked_course'
      and g.status = 'active'
      and not exists (
        select 1
        from access_grants p
        join course_links cl on cl.course_id = p.course_id
        where p.user_id = g.user_id
          and cl.linked_course_id = g.course_id
          and ${parentGrantIsLive}
      )
  `.execute(database);

  await sql`
    update enrollments e
      set status = 'expired', updated_at = now()
    where e.user_id = any(${userIds}::uuid[])
      and e.source = 'linked_course'
      and e.status = 'active'
      and not exists (
        select 1
        from access_grants p
        join course_links cl on cl.course_id = p.course_id
        where p.user_id = e.user_id
          and cl.linked_course_id = e.course_id
          and ${parentGrantIsLive}
      )
  `.execute(database);
}

/** Brings these learners' linked-course access in line with their courses. */
export async function syncLinkedCourseAccess(
  database: Executor,
  userIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(userIds)];
  for (let i = 0; i < unique.length; i += SYNC_CHUNK_SIZE) {
    await syncChunk(database, unique.slice(i, i + SYNC_CHUNK_SIZE));
  }
}

/**
 * Learners whose linked access may change when `courseId` gains or loses a
 * link to `linkedCourseId`: everyone with a row for the course (live or
 * not, the sync decides), and everyone holding the linked course through a
 * link.
 */
export async function listUserIdsAffectedByLink(
  database: Executor,
  courseId: string,
  linkedCourseId: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("access_grants")
    .select("user_id")
    .where((eb) =>
      eb.or([
        eb.and([
          eb("course_id", "=", courseId),
          eb("source", "<>", "linked_course"),
        ]),
        eb.and([
          eb("course_id", "=", linkedCourseId),
          eb("source", "=", "linked_course"),
        ]),
      ]),
    )
    .distinct()
    .execute();
  return rows.map((row) => row.user_id);
}
