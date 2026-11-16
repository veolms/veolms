import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { config } from "../../config.ts";
import { parseMailbox, workshopInvite } from "./workshop-calendar.ts";
import * as repository from "./workshops.repository.ts";

export interface WorkshopInviteBuilder {
  /**
   * The invitation for one learner, built when the email goes out (so a
   * retried email carries the workshop as it is then). Null when the
   * workshop or its sessions are gone.
   */
  build(input: {
    workshopId: string;
    method: "REQUEST" | "CANCEL";
    attendeeEmail: string;
  }): Promise<{ method: "REQUEST" | "CANCEL"; content: string } | null>;
}

export function createWorkshopInviteBuilder({
  database,
  from,
}: {
  database: Kysely<Database>;
  /** The sender, also the invitation's organizer (replies go there). */
  from: string;
}): WorkshopInviteBuilder {
  return {
    async build({ workshopId, method, attendeeEmail }) {
      const workshop = await repository.findWorkshopById(database, workshopId);
      if (!workshop) return null;
      const sessions = await repository.listSessions(database, workshopId);
      if (sessions.length === 0) return null;
      const pageUrl = new URL(
        `/workshops/${workshop.slug}`,
        config.WEB_URL,
      ).toString();
      const content = workshopInvite({
        method,
        title: workshop.title,
        summary: workshop.summary,
        pageUrl,
        uidDomain: new URL(config.WEB_URL).hostname,
        organizer: parseMailbox(from),
        attendeeEmail,
        // Every save moves updated_at forward, so the number only rises.
        sequence: Math.floor(new Date(workshop.updated_at).getTime() / 1000),
        now: new Date(),
        sessions: sessions.map((session) => ({
          id: session.id,
          title: session.title,
          startsAt: session.starts_at,
          endsAt: session.ends_at,
        })),
      });
      return { method, content };
    },
  };
}
