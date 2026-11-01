import assert from "node:assert/strict";
import { test } from "node:test";
import type { FastifyBaseLogger } from "fastify";
import type { Database } from "@veolms/database";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import type { AppServices } from "../../../services/index.ts";
import * as mediaRepo from "../media.repository.ts";
import { createYoutubeImportService } from "./youtube-import.service.ts";
import type { YoutubeImportTools } from "./youtube-import.tools.ts";

const MEDIA = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

/** A database that runs nothing and records the statements it is given. */
function recordingDatabase() {
  const statements: { sql: string; parameters: readonly unknown[] }[] = [];
  const database = new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      statements.push({
        sql: event.query.sql,
        parameters: event.query.parameters,
      });
    },
  });
  return { database, statements };
}

await test("a video's source is recorded once; a second source for it is ignored", async () => {
  const { database, statements } = recordingDatabase();
  await mediaRepo.insertMediaSource(database, {
    media_id: MEDIA,
    provider: "youtube",
    external_id: "dQw4w9WgXcQ",
    source_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "A title",
    channel: null,
    recorded_via: "cli",
  });
  assert.equal(statements.length, 1);
  assert.match(statements[0]!.sql, /^insert into "media_sources"/);
  assert.match(statements[0]!.sql, /on conflict \("media_id"\) do nothing$/);
  assert.deepEqual(statements[0]!.parameters, [
    MEDIA,
    "youtube",
    "dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "A title",
    null,
    "cli",
  ]);
});

await test("the title and channel are filled in without replacing ones already set", async () => {
  const { database, statements } = recordingDatabase();
  await mediaRepo.fillMediaSourceDetails(database, MEDIA, {
    title: "From YouTube",
    channel: "A channel",
  });
  assert.equal(
    statements[0]?.sql,
    'update "media_sources" set "title" = coalesce("title", $1), "channel" = coalesce("channel", $2) where "media_id" = $3',
  );
  assert.deepEqual(statements[0]?.parameters, [
    "From YouTube",
    "A channel",
    MEDIA,
  ]);
});

await test("starting an import records the video's YouTube link with its media", async () => {
  const { database, statements } = recordingDatabase();
  const service = createYoutubeImportService({
    database,
    services: {
      config: { YOUTUBE_IMPORT_ENABLED: true },
    } as unknown as AppServices,
    tools: {} as YoutubeImportTools,
  });
  const logger = { info: () => undefined } as unknown as FastifyBaseLogger;

  const { mediaId } = await service.startImport(
    { url: "https://youtu.be/dQw4w9WgXcQ?si=abc", rightsConfirmed: true },
    { id: USER },
    logger,
  );

  const tables = statements.map(
    (statement) => /^insert into "(\w+)"/.exec(statement.sql)?.[1],
  );
  assert.deepEqual(tables, [
    "media_assets",
    "youtube_import_jobs",
    "media_sources",
  ]);
  const source = statements[2]!;
  assert.deepEqual(source.parameters, [
    mediaId,
    "youtube",
    "dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    null,
    null,
    "import",
  ]);
});
