import { homePageHeroVideoSchema } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import { findVideoAsset } from "./home-hero-video.repository.ts";
import {
  findHomePageSettings,
  isMissingHomePageSettingsTable,
} from "./home-page.repository.ts";

/** How often the chosen video is looked at while it is processed. */
const POLL_INTERVAL_MS = 30_000;
/** A video still processing after this long is left to the next save. */
const WATCH_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export interface HeroVideoReadyWatch {
  /**
   * Follows the hero's chosen upload (and stops following any other) until
   * it is ready, then asks for the home page to be built again: the static
   * page shows the default lesson's picture until then. Null, or another
   * kind of hero video, stops the watch.
   */
  watch(mediaId: string | null): void;
  /** Picks the watch up again from the saved settings (after a restart). */
  resume(): Promise<void>;
  stop(): void;
}

const watches = new WeakMap<Kysely<Database>, HeroVideoReadyWatch>();

/** The watch of this database, shared by the routes and the background jobs. */
export function getHeroVideoReadyWatch(options: {
  database: Kysely<Database>;
  onReady: () => void;
  logger: FastifyBaseLogger;
}): HeroVideoReadyWatch {
  let watch = watches.get(options.database);
  if (!watch) {
    watch = createHeroVideoReadyWatch(options);
    watches.set(options.database, watch);
  }
  return watch;
}

export function createHeroVideoReadyWatch({
  database,
  onReady,
  logger,
  pollIntervalMs = POLL_INTERVAL_MS,
  timeoutMs = WATCH_TIMEOUT_MS,
}: {
  database: Kysely<Database>;
  onReady: () => void;
  logger: FastifyBaseLogger;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): HeroVideoReadyWatch {
  let current: {
    mediaId: string;
    until: number;
    /** It was seen not ready yet, so its becoming ready is a change. */
    wasPending: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null = null;
  const log = { feature: "home-hero-video" };

  function stop() {
    if (current?.timer) clearTimeout(current.timer);
    current = null;
  }

  function later(watched: NonNullable<typeof current>, delayMs: number) {
    watched.timer = setTimeout(() => void check(watched), delayMs);
    watched.timer.unref?.();
  }

  async function check(watched: NonNullable<typeof current>) {
    watched.timer = null;
    let status: string | null;
    try {
      const asset = await findVideoAsset(database, watched.mediaId);
      status = asset?.type === "video" ? asset.status : null;
    } catch (error) {
      logger.warn(
        { ...log, err: error, mediaId: watched.mediaId },
        "Could not read the hero video's status; trying again",
      );
      if (current === watched) later(watched, pollIntervalMs);
      return;
    }
    // Another video was chosen meanwhile.
    if (current !== watched) return;

    if (status === "ready") {
      stop();
      // Ready when it was chosen: the save that chose it refreshed the page.
      if (watched.wasPending) {
        logger.info(
          { ...log, mediaId: watched.mediaId },
          "The hero video is ready; refreshing the home page",
        );
        onReady();
      }
    } else if (status === null || status === "failed") {
      stop();
    } else if (Date.now() >= watched.until) {
      stop();
      logger.warn(
        { ...log, mediaId: watched.mediaId },
        "The hero video is still not ready; no longer waiting for it",
      );
    } else {
      watched.wasPending = true;
      later(watched, pollIntervalMs);
    }
  }

  function watch(mediaId: string | null) {
    if (mediaId === null) return stop();
    if (current?.mediaId === mediaId) return;
    stop();
    current = {
      mediaId,
      until: Date.now() + timeoutMs,
      wasPending: false,
      timer: null,
    };
    void check(current);
  }

  return {
    watch,

    // A video found ready here is taken as refreshed already: a restart
    // rebuilds nothing on its own.
    async resume() {
      let row: Awaited<ReturnType<typeof findHomePageSettings>>;
      try {
        row = await findHomePageSettings(database);
      } catch (error) {
        if (isMissingHomePageSettingsTable(error)) return;
        throw error;
      }
      const heroVideo = homePageHeroVideoSchema.safeParse(
        (row?.settings as { heroVideo?: unknown } | undefined)?.heroVideo,
      );
      if (heroVideo.success && heroVideo.data.source === "upload") {
        watch(heroVideo.data.mediaId);
      }
    },

    stop,
  };
}
