import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from "kysely";
import { createHeroVideoReadyWatch } from "./home-hero-video-ready.ts";

const VIDEO_A = "22222222-2222-4222-8222-222222222222";
const VIDEO_B = "33333333-3333-4333-8333-333333333333";

const silentLogger = {
  info() {},
  warn() {},
  error() {},
} as unknown as FastifyBaseLogger;

/**
 * A database whose videos have the statuses in `statuses`, which a test
 * changes as the video is processed, and whose saved settings choose
 * `heroVideo`. Nothing is written anywhere.
 */
function fakeDatabase(
  statuses: Map<string, string>,
  heroVideo: unknown = { source: "default" },
) {
  const connection: DatabaseConnection = {
    executeQuery: <R>(query: {
      sql: string;
      parameters: readonly unknown[];
    }) => {
      let row: unknown = null;
      if (query.sql.includes('from "media_assets"')) {
        const id = String(query.parameters[0]);
        const status = statuses.get(id);
        row = status && {
          id,
          type: "video",
          status,
          storage_key: null,
          duration_seconds: null,
          original_filename: null,
        };
      } else if (query.sql.includes('from "home_page_settings"')) {
        row = { settings: { heroVideo }, updated_at: new Date() };
      }
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

function watchFor(
  statuses: Map<string, string>,
  options: { heroVideo?: unknown; timeoutMs?: number } = {},
) {
  let refreshes = 0;
  const watch = createHeroVideoReadyWatch({
    database: fakeDatabase(statuses, options.heroVideo),
    onReady: () => {
      refreshes += 1;
    },
    logger: silentLogger,
    pollIntervalMs: 5,
    timeoutMs: options.timeoutMs ?? 60_000,
  });
  return { watch, refreshes: () => refreshes };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

void test("a video that finishes processing refreshes the home page once", async () => {
  const statuses = new Map([[VIDEO_A, "processing"]]);
  const { watch, refreshes } = watchFor(statuses);
  watch.watch(VIDEO_A);
  await wait(30);
  assert.equal(refreshes(), 0);
  statuses.set(VIDEO_A, "ready");
  await wait(30);
  assert.equal(refreshes(), 1);
  await wait(30);
  assert.equal(refreshes(), 1);
});

void test("a video ready when chosen needs no second refresh", async () => {
  const { watch, refreshes } = watchFor(new Map([[VIDEO_A, "ready"]]));
  watch.watch(VIDEO_A);
  await wait(30);
  assert.equal(refreshes(), 0);
});

void test("a video that fails, or is gone, is no longer watched", async () => {
  const statuses = new Map([[VIDEO_A, "processing"]]);
  const { watch, refreshes } = watchFor(statuses);
  watch.watch(VIDEO_A);
  await wait(20);
  statuses.set(VIDEO_A, "failed");
  await wait(20);
  statuses.set(VIDEO_A, "ready");
  await wait(30);
  assert.equal(refreshes(), 0);
});

void test("choosing another video, or none, stops watching the first", async () => {
  const statuses = new Map([
    [VIDEO_A, "processing"],
    [VIDEO_B, "processing"],
  ]);
  const { watch, refreshes } = watchFor(statuses);
  watch.watch(VIDEO_A);
  await wait(20);
  watch.watch(VIDEO_B);
  await wait(20);
  statuses.set(VIDEO_A, "ready");
  await wait(30);
  assert.equal(refreshes(), 0);
  statuses.set(VIDEO_B, "ready");
  await wait(30);
  assert.equal(refreshes(), 1);
  watch.watch(null);
});

void test("a video still processing after the time limit is left", async () => {
  const statuses = new Map([[VIDEO_A, "processing"]]);
  const { watch, refreshes } = watchFor(statuses, { timeoutMs: 15 });
  watch.watch(VIDEO_A);
  await wait(40);
  statuses.set(VIDEO_A, "ready");
  await wait(30);
  assert.equal(refreshes(), 0);
});

void test("after a restart the saved hero video is watched again", async () => {
  const statuses = new Map([[VIDEO_A, "processing"]]);
  const { watch, refreshes } = watchFor(statuses, {
    heroVideo: { source: "upload", mediaId: VIDEO_A, fileName: "clip.mp4" },
  });
  await watch.resume();
  await wait(20);
  statuses.set(VIDEO_A, "ready");
  await wait(30);
  assert.equal(refreshes(), 1);
});

void test("a restart with another kind of hero video watches nothing", async () => {
  const { watch, refreshes } = watchFor(new Map([[VIDEO_A, "processing"]]));
  await watch.resume();
  await wait(20);
  assert.equal(refreshes(), 0);
  watch.stop();
});
