import type { DatabaseExecutor } from "@veolms/database";

import * as repository from "./workshops.repository.ts";

/**
 * A workshop in a few words, for other modules that show it as a card (a
 * marketing email's workshop card): its title, page, summary, cover and
 * the start of its first session. Null when it is gone.
 */
export async function findWorkshopCard(
  database: DatabaseExecutor,
  workshopId: string,
): Promise<{
  title: string;
  slug: string;
  summary: string | null;
  coverUrl: string | null;
  startsAt: Date | null;
  timeZone: string | null;
  priceMinor: number | null;
  currency: string;
} | null> {
  const row = await repository.findWorkshopById(database, workshopId);
  if (!row) return null;
  const sessions = await repository.listSessions(database, workshopId);
  const first = [...sessions].sort(
    (a, b) => a.starts_at.getTime() - b.starts_at.getTime(),
  )[0];
  return {
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    coverUrl: row.cover_url,
    startsAt: first?.starts_at ?? null,
    timeZone: first?.time_zone ?? null,
    priceMinor: row.price_minor,
    currency: row.currency,
  };
}
