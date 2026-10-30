import assert from "node:assert/strict";
import { test } from "node:test";
import type { HomePageHeroVideo } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from "kysely";
import { createHomeHeroVideoService } from "./home-hero-video.service.ts";

const UPLOAD = "22222222-2222-4222-8222-222222222222";
const DEFAULT_LESSON = {
  course_id: "11111111-1111-4111-8111-111111111111",
  lesson_id: "33333333-3333-4333-8333-333333333333",
  lesson_title: "Welcome",
  is_preview: true,
  section_title: "Start",
  media_id: "44444444-4444-4444-8444-444444444444",
  media_type: "video",
  media_status: "ready",
  media_storage_key: "videos/default",
  duration_seconds: 60,
};

/**
 * A database that answers the upload lookup with `upload` and every lesson
 * lookup with the default lesson. Nothing is written anywhere.
 */
function fakeDatabase(upload: { status: string; type?: string } | null) {
  const connection: DatabaseConnection = {
    executeQuery: <R>(query: { sql: string }) => {
      const row = query.sql.includes('from "media_assets"')
        ? upload && {
            id: UPLOAD,
            type: upload.type ?? "video",
            status: upload.status,
            storage_key: "videos/upload",
            duration_seconds: 30,
            original_filename: "clip.mp4",
          }
        : query.sql.includes('from "course_lessons"')
          ? DEFAULT_LESSON
          : null;
      return Promise.resolve({ rows: row ? [row] : [] } as QueryResult<R>);
    },
    streamQuery: async function* () {
      throw new Error("not streamed");
    },
  };
  const driver: Driver = {
    init: () => Promise.resolve(),
    acquireConnection: () => Promise.resolve(connection),
    beginTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
    releaseConnection: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  };
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

function heroVideoService(upload: Parameters<typeof fakeDatabase>[0]) {
  const played: { mediaId: string; mediaKey: string }[] = [];
  const service = createHomeHeroVideoService({
    database: fakeDatabase(upload),
    mediaService: {
      getVideoAssetPlayback: async (media, details) => {
        played.push({ mediaId: media.id, mediaKey: details.mediaKey });
        return { mediaKey: details.mediaKey, manifestUrl: "https://cdn/m" };
      },
      getVideoAssetPlaybackToken: async () => {
        throw new Error("not used");
      },
    },
    storage: { getCdnObjectUrl: (key) => `https://cdn/${key}` },
  });
  return { service, played };
}

const uploaded: HomePageHeroVideo = {
  source: "upload",
  mediaId: UPLOAD,
  fileName: "clip.mp4",
};

void test("a ready upload plays on the laptop, behind its captured frame", async () => {
  const { service, played } = heroVideoService({ status: "ready" });
  assert.deepEqual(await service.resolvePoster(uploaded), {
    url: `https://cdn/public/thumbnails/${UPLOAD}/original.webp`,
  });
  await service.getPlayback(uploaded);
  assert.deepEqual(played, [
    { mediaId: UPLOAD, mediaKey: `home-hero-${UPLOAD}` },
  ]);
});

for (const status of ["uploading", "processing", "failed"]) {
  void test(`an upload that is ${status} leaves the default lesson playing`, async () => {
    const { service, played } = heroVideoService({ status });
    assert.deepEqual(await service.resolvePoster(uploaded), {
      courseId: DEFAULT_LESSON.course_id,
    });
    await service.getPlayback(uploaded);
    assert.deepEqual(played, [
      {
        mediaId: DEFAULT_LESSON.media_id,
        mediaKey: `home-hero-lesson-${DEFAULT_LESSON.lesson_id}`,
      },
    ]);
  });
}

void test("an upload can be chosen while it is still being processed", async () => {
  const { service } = heroVideoService({ status: "processing" });
  await service.assertSelectable(uploaded);
});

void test("a missing upload, or one that is not a video, cannot be chosen", async () => {
  for (const upload of [null, { status: "ready", type: "image" }]) {
    const { service } = heroVideoService(upload);
    await assert.rejects(service.assertSelectable(uploaded), {
      code: "HERO_VIDEO_INVALID",
    });
  }
});
