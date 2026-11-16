import {
  MARKETING_AUTOMATIONS,
  type MarketingAutomationKey,
  type MarketingAutomationSettings,
} from "@veolms/contracts";
import { sql, type RawBuilder } from "kysely";

import { activeEnrollment, canReceiveMarketing } from "./marketing-audience.ts";

/**
 * The six ready automations (creator-features/34 §2), as SQL.
 *
 * `qualifying` lists the people an automation should email now or later:
 * `(user_id, email, course_id, due_at)`. Only what happened after the
 * automation was switched on counts, and a person is queued once per
 * automation ever (the queue's key), so running it again adds only the
 * newcomers. `stillQualifies` is asked again just before a queued email
 * goes out: someone who started the course, learned again, renewed or
 * paid meanwhile is skipped.
 */

export interface QualifyingRow {
  user_id: string;
  email: string;
  course_id: string | null;
  due_at: Date;
}

/** Nothing older than the longest wait is looked at again. */
const LOOK_BACK_DAYS = 200;

function hoursOf(
  key: MarketingAutomationKey,
  settings: MarketingAutomationSettings,
) {
  const meta = MARKETING_AUTOMATIONS[key];
  return meta.unit === "days" ? settings.wait * 24 : settings.wait;
}

function courseFilter(
  column: string,
  courseId: string | null,
): RawBuilder<unknown> {
  return courseId ? sql`and ${sql.ref(column)} = ${courseId}` : sql``;
}

export function qualifyingQuery(
  key: MarketingAutomationKey,
  settings: MarketingAutomationSettings,
  enabledAt: Date,
): RawBuilder<QualifyingRow> {
  const wait = sql`make_interval(hours => ${hoursOf(key, settings)})`;
  const since = sql`greatest(${enabledAt}::timestamptz, now() - make_interval(days => ${LOOK_BACK_DAYS}))`;

  switch (key) {
    case "welcome":
      return sql<QualifyingRow>`
        select u.id as user_id, u.email, null::uuid as course_id, u.created_at + ${wait} as due_at
        from users u
        where ${canReceiveMarketing}
          and u.created_at >= ${since}
          and not exists (
            select 1 from user_roles ur join roles r on r.id = ur.role_id
            where ur.user_id = u.id and r.name <> 'student'
          )
      `;
    case "purchase_thanks":
      // A paid enrollment; the first one counts.
      return sql<QualifyingRow>`
        select distinct on (u.id)
          u.id as user_id, u.email, e.course_id, e.created_at + ${wait} as due_at
        from enrollments e
        join users u on u.id = e.user_id
        join orders o on o.id = e.order_id and o.total_amount > 0
        where ${canReceiveMarketing}
          and e.created_at >= ${since}
          ${courseFilter("e.course_id", settings.courseId)}
        order by u.id, e.created_at
      `;
    case "start_nudge":
      return sql<QualifyingRow>`
        select distinct on (u.id)
          u.id as user_id, u.email, e.course_id, now() as due_at
        from enrollments e
        join users u on u.id = e.user_id
        where ${canReceiveMarketing}
          and ${activeEnrollment("e")}
          and e.created_at + ${wait} <= now()
          and e.created_at + ${wait} >= ${since}
          ${courseFilter("e.course_id", settings.courseId)}
          and not exists (
            select 1 from learning_progress lp
            where lp.user_id = e.user_id and lp.course_id = e.course_id
          )
        order by u.id, e.created_at
      `;
    case "win_back":
      // Learned at some point, then nothing for the whole wait.
      return sql<QualifyingRow>`
        select u.id as user_id, u.email, null::uuid as course_id, now() as due_at
        from (
          select a.user_id, max(a.activity_date) as last_day
          from learning_daily_activity a
          group by a.user_id
        ) last
        join users u on u.id = last.user_id
        where ${canReceiveMarketing}
          and last.last_day + ${settings.wait}::int <= current_date
          and (last.last_day + ${settings.wait}::int)::timestamptz >= ${since}
          and exists (
            select 1 from enrollments e where e.user_id = u.id and ${activeEnrollment("e")}
          )
      `;
    case "access_ending":
      return sql<QualifyingRow>`
        select distinct on (u.id)
          u.id as user_id, u.email, e.course_id, now() as due_at
        from enrollments e
        join users u on u.id = e.user_id
        where ${canReceiveMarketing}
          and e.status = 'active'
          and e.access_expires_at > now()
          and e.access_expires_at - ${wait} <= now()
          and e.access_expires_at - ${wait} >= ${since}
          ${courseFilter("e.course_id", settings.courseId)}
        order by u.id, e.access_expires_at
      `;
    case "checkout_reminder":
      // A course checkout that was not paid, and the course still not theirs.
      return sql<QualifyingRow>`
        select distinct on (u.id)
          u.id as user_id, u.email, oi.course_id, now() as due_at
        from orders o
        join order_items oi on oi.order_id = o.id and oi.course_id is not null
        join users u on u.id = o.user_id
        where ${canReceiveMarketing}
          and o.status in ('pending', 'payment_failed', 'cancelled', 'expired')
          and o.created_at + ${wait} <= now()
          and o.created_at + ${wait} >= ${since}
          ${courseFilter("oi.course_id", settings.courseId)}
          and not exists (
            select 1 from enrollments e
            where e.user_id = u.id and e.course_id = oi.course_id and ${activeEnrollment("e")}
          )
        order by u.id, o.created_at desc
      `;
  }
}

/** Whether a queued automation email should still go out. */
export function stillQualifiesQuery(
  key: MarketingAutomationKey,
  settings: MarketingAutomationSettings,
  userId: string,
  courseId: string | null,
): RawBuilder<{ ok: boolean }> | null {
  switch (key) {
    case "welcome":
    case "purchase_thanks":
      return null;
    case "start_nudge":
      return sql<{ ok: boolean }>`select not exists (
        select 1 from learning_progress lp
        where lp.user_id = ${userId} and lp.course_id = ${courseId}
      ) as ok`;
    case "win_back":
      return sql<{ ok: boolean }>`select not exists (
        select 1 from learning_daily_activity a
        where a.user_id = ${userId} and a.activity_date > current_date - ${settings.wait}::int
      ) as ok`;
    case "access_ending":
      return sql<{ ok: boolean }>`select exists (
        select 1 from enrollments e
        where e.user_id = ${userId} and e.course_id = ${courseId}
          and e.status = 'active' and e.access_expires_at > now()
          and e.access_expires_at <= now() + make_interval(days => ${settings.wait})
      ) as ok`;
    case "checkout_reminder":
      return sql<{ ok: boolean }>`select not exists (
        select 1 from enrollments e
        where e.user_id = ${userId} and e.course_id = ${courseId}
          and ${activeEnrollment("e")}
      ) as ok`;
  }
}
