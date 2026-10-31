import { sql } from "kysely";
import { toMajorUnits } from "../shared/currency.ts";
import type { Executor } from "../shared/repository.types.ts";

/** The live courses an unlisted course opens (part of), for checkout. */
export async function listCoursesOpenedBy(
  database: Executor,
  unlistedCourseId: string,
) {
  return await database
    .selectFrom("course_links as cl")
    .innerJoin("courses as c", "c.id", "cl.linked_course_id")
    .select(["c.id", "c.title"])
    .where("cl.course_id", "=", unlistedCourseId)
    .where("c.deleted_at", "is", null)
    .execute();
}

/**
 * A course the learner holds only part of: an unlisted course they hold
 * links it with only some of its sections open (see "Partial access").
 * Buying the whole course is an upgrade, and what they paid for those
 * parts comes off its price.
 */
export interface PartialHolding {
  /** What the learner paid for the parts, in major units of `currency`. */
  credit: number;
  currency: string | null;
  /** The parts' titles: "Core Concepts Edition". */
  fromTitles: string[];
}

/**
 * The courses the learner holds only part of, each with what they paid for
 * the parts that give it to them. Only paid orders count: a part they were
 * given, or whose order was refunded in any measure, brings no credit.
 */
export async function listPartialHoldings(
  database: Executor,
  userId: string,
): Promise<Map<string, PartialHolding>> {
  const { rows } = await sql<{
    course_id: string;
    part_id: string;
    part_title: string;
    paid_minor: string | null;
    currency: string | null;
  }>`
    select
      g.course_id,
      part.id as part_id,
      part.title as part_title,
      paid.amount as paid_minor,
      paid.currency
    from access_grants g
    join course_links cl
      on cl.linked_course_id = g.course_id and cl.section_ids is not null
    join access_grants pg
      on pg.course_id = cl.course_id and pg.user_id = g.user_id
    join courses part on part.id = cl.course_id
    left join lateral (
      select sum(oi.final_amount) as amount, min(o.currency) as currency
      from order_items oi
      join orders o on o.id = oi.order_id
      where oi.course_id = part.id
        and o.user_id = g.user_id
        and o.status = 'paid'
    ) paid on true
    where g.user_id = ${userId}
      and g.source = 'linked_course'
      and g.section_ids is not null
      and g.status = 'active'
      and (g.valid_until is null or g.valid_until > now())
      and pg.source <> 'linked_course'
      and pg.status = 'active'
      and (pg.valid_until is null or pg.valid_until > now())
  `.execute(database);

  const holdings = new Map<string, PartialHolding>();
  const currenciesByCourse = new Map<string, Set<string>>();
  for (const row of rows) {
    const holding = holdings.get(row.course_id) ?? {
      credit: 0,
      currency: null,
      fromTitles: [],
    };
    if (!holding.fromTitles.includes(row.part_title)) {
      holding.fromTitles.push(row.part_title);
    }
    const paidMinor = Number(row.paid_minor ?? 0);
    if (paidMinor > 0 && row.currency) {
      const currencies = currenciesByCourse.get(row.course_id) ?? new Set();
      currencies.add(row.currency);
      currenciesByCourse.set(row.course_id, currencies);
      holding.currency = row.currency;
      holding.credit += Math.floor(toMajorUnits(paidMinor, row.currency));
    }
    holdings.set(row.course_id, holding);
  }
  // Parts paid in different currencies have no one sum: none counts.
  for (const [courseId, currencies] of currenciesByCourse) {
    if (currencies.size > 1) {
      holdings.set(courseId, {
        ...holdings.get(courseId)!,
        credit: 0,
        currency: null,
      });
    }
  }
  return holdings;
}
