import { workshopSessionState, type WorkshopHomeCard } from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";

import { createAccessService } from "../access/index.ts";
import * as repository from "./workshops.repository.ts";

/**
 * The workshop a learner's home points at: the next session they are
 * registered for, else the soonest open workshop they could still join
 * (never a course-only one, which they may not qualify for). Null when
 * there is nothing upcoming.
 */
export async function learnerHomeWorkshop(
  database: DatabaseExecutor,
  userId: string,
  now: Date,
): Promise<WorkshopHomeCard | null> {
  // A workshop of one of their courses counts as registered.
  const courseIds = [
    ...(await createAccessService().listAccessScopes(database, userId)).keys(),
  ];
  const registered = await repository.findNextRegisteredSession(
    database,
    userId,
    now,
    courseIds,
  );
  const row =
    registered ?? (await repository.findSoonestUpcomingSession(database, now));
  if (!row) return null;
  return {
    id: row.workshop_id,
    slug: row.slug,
    title: row.title,
    coverUrl: row.cover_url,
    registered: Boolean(registered),
    sessionId: row.session_id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    timeZone: row.time_zone,
    state: workshopSessionState(row.starts_at, row.ends_at, now),
    priceMinor: row.price_minor,
    currency: row.currency,
  };
}
