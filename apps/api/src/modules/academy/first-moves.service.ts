import { signInHandoffProvider } from "@veolms/config";
import { type FirstMovesResponse } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { createPlatformSettingsService } from "../platform/index.ts";

/**
 * A new academy's "first five moves" on the admin home. Each one is read
 * from what the academy already has, so it ticks itself: a logo or a
 * colour, its own payment account, a course, a paid order. Only sharing
 * the link leaves no trace of its own, so pressing Share or Copy link
 * there is remembered.
 */
export function createFirstMovesService({
  database,
}: {
  database: Kysely<Database>;
}) {
  const platformSettings = createPlatformSettingsService({ database });

  async function getFirstMoves(): Promise<FirstMovesResponse> {
    const [academy, settings, gateway, course, paidOrder] = await Promise.all([
      database
        .selectFrom("academy")
        .select(["logo_url", "link_shared_at"])
        .executeTakeFirst(),
      platformSettings.getSettings(),
      database
        .selectFrom("creator_payment_configs")
        .select("id")
        .where("is_active", "=", true)
        .limit(1)
        .executeTakeFirst(),
      database
        .selectFrom("courses")
        .select("id")
        .where("deleted_at", "is", null)
        .limit(1)
        .executeTakeFirst(),
      database
        .selectFrom("orders")
        .select("id")
        .where("status", "=", "paid")
        .limit(1)
        .executeTakeFirst(),
    ]);
    const { branding } = settings.settings;
    const hasLogo = Boolean(
      academy?.logo_url ||
      branding.logoLightUrl ||
      branding.logoDarkUrl ||
      branding.iconUrl,
    );
    return {
      moves: {
        // The academy's logo (its colour is for Appearance, not a first move).
        look: hasLogo,
        payments: Boolean(gateway),
        course: Boolean(course),
        testPurchase: Boolean(paidOrder),
        share: Boolean(academy?.link_shared_at),
      },
      // Only a deployment that hands creators over from its sign-up stage
      // launched the academy there.
      launchReplay: signInHandoffProvider() !== null,
    };
  }

  async function markLinkShared(): Promise<FirstMovesResponse> {
    await database
      .updateTable("academy")
      .set({ link_shared_at: new Date() })
      .where("link_shared_at", "is", null)
      .execute();
    return await getFirstMoves();
  }

  return { getFirstMoves, markLinkShared };
}
