import type { MarketingAudience, MarketingSegment } from "@veolms/contracts";
import { sql, type RawBuilder } from "kysely";

/**
 * Who a marketing email goes to, as SQL (creator-features/34 §2).
 *
 * Every audience is "people who can get marketing email" — an account that
 * is not deleted, has an address, is not on the bounce list and has not
 * turned marketing off — narrowed by one ready segment and, optionally,
 * without the buyers of some courses. The result is `(user_id, email)`,
 * once per person, so it can be counted or copied into the send queue.
 */

/** A student: the student role in either role system, or any enrollment. */
const studentIds = sql`(
  select ur.user_id from user_roles ur join roles r on r.id = ur.role_id where r.name = 'student'
  union
  select ra.user_id from role_assignments ra join roles r on r.id = ra.role_id where r.name = 'student'
  union
  select e.user_id from enrollments e
)`;

/** Course access that is on now. */
export const activeEnrollment = (alias: string) =>
  sql.raw(
    `${alias}.status = 'active' and (${alias}.access_expires_at is null or ${alias}.access_expires_at > now())`,
  );

/** Can get marketing email at all (also checked again when it is sent). */
export const canReceiveMarketing = sql`
  u.is_deleted = false
  and u.email is not null
  and not exists (
    select 1 from email_suppressions s where s.email = lower(u.email)
  )
  and not exists (
    select 1 from notification_preferences p
    where p.user_id = u.id
      and p.notification_type = 'marketing.email'
      and p.channel = 'email'
      and p.enabled = false
  )
`;

function uuidArray(ids: readonly string[]): RawBuilder<unknown> {
  return sql`${sql.val(ids)}::uuid[]`;
}

function segmentCondition(segment: MarketingSegment): RawBuilder<unknown> {
  switch (segment.type) {
    case "all":
      return sql`u.id in ${studentIds}`;
    case "bought":
      return sql`exists (
        select 1 from enrollments e
        where e.user_id = u.id and e.course_id = any(${uuidArray(segment.courseIds)})
          and ${activeEnrollment("e")}
      )`;
    case "not_bought":
      return sql`u.id in ${studentIds} and not exists (
        select 1 from enrollments e
        where e.user_id = u.id and e.course_id = any(${uuidArray(segment.courseIds)})
          and ${activeEnrollment("e")}
      )`;
    case "workshop": {
      const attendance =
        segment.attendance === "attended"
          ? sql`and cardinality(wr.joined_session_ids) > 0`
          : segment.attendance === "missed"
            ? sql`and cardinality(wr.joined_session_ids) = 0`
            : sql``;
      return sql`exists (
        select 1 from workshop_registrations wr
        where wr.user_id = u.id and wr.workshop_id = ${segment.workshopId}
          and wr.cancelled_at is null ${attendance}
      )`;
    }
    case "new":
      return sql`u.id in ${studentIds}
        and u.created_at >= now() - make_interval(days => ${segment.days})`;
    case "inactive":
      // Has had a course for the whole period and learned nothing in it.
      return sql`exists (
          select 1 from enrollments e
          where e.user_id = u.id and ${activeEnrollment("e")}
            and e.created_at <= now() - make_interval(days => ${segment.days})
        )
        and not exists (
          select 1 from learning_daily_activity a
          where a.user_id = u.id
            and a.activity_date >= current_date - ${segment.days}::int
        )`;
    case "not_started": {
      const courses = segment.courseIds.length
        ? sql`and e.course_id = any(${uuidArray(segment.courseIds)})`
        : sql``;
      return sql`exists (
        select 1 from enrollments e
        where e.user_id = u.id and ${activeEnrollment("e")} ${courses}
          and not exists (
            select 1 from learning_progress lp
            where lp.user_id = e.user_id and lp.course_id = e.course_id
          )
      )`;
    }
    case "not_opened":
      return sql`exists (
        select 1 from marketing_email_recipients mr
        where mr.email_id = ${segment.emailId} and mr.user_id = u.id
          and mr.status = 'sent' and mr.opened_at is null and mr.clicked_at is null
      )`;
  }
}

/** `select u.id as user_id, u.email ...` for the audience. */
export function audienceQuery(audience: MarketingAudience): RawBuilder<{
  user_id: string;
  email: string;
}> {
  const exclude = audience.excludeCourseIds.length
    ? sql`and not exists (
        select 1 from enrollments x
        where x.user_id = u.id and x.course_id = any(${uuidArray(audience.excludeCourseIds)})
          and ${activeEnrollment("x")}
      )`
    : sql``;
  return sql<{ user_id: string; email: string }>`
    select u.id as user_id, u.email as email
    from users u
    where ${canReceiveMarketing}
      and ${segmentCondition(audience.segment)}
      ${exclude}
  `;
}
