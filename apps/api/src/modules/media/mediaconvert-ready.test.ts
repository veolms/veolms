import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createMediaService } from "./media.service.ts";

void test("READY publishes output without completion and later events preserve it", async () => {
  const job = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    video_id: "550e8400-e29b-41d4-a716-446655440001",
    status: "processing",
    output_prefix: "protected/test",
  };
  const asset: Record<string, unknown> = { status: "processing" };
  const outputs: Array<Record<string, unknown>> = [];
  const db = {
    selectFrom(table: string) {
      const query = {
        select: () => query,
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        forUpdate: () => query,
        async executeTakeFirst() {
          if (table === "video_jobs") return { ...job };
          if (table === "video_outputs") return outputs.at(-1);
          return undefined;
        },
      };
      return query;
    },
    updateTable(table: string) {
      let values: Record<string, unknown> = {};
      const query = {
        set(value: Record<string, unknown>) {
          values = value;
          return query;
        },
        where: () => query,
        async execute() {
          if (table === "video_jobs") {
            if (typeof values.status === "string") job.status = values.status;
          } else if (table === "media_assets") Object.assign(asset, values);
          else if (table === "video_outputs")
            Object.assign(outputs.at(-1)!, values);
        },
      };
      return query;
    },
    insertInto(table: string) {
      let value: Record<string, unknown>;
      const query = {
        values(v: Record<string, unknown>) {
          value = v;
          return query;
        },
        async execute() {
          if (table === "video_outputs") outputs.push(value);
        },
      };
      return query;
    },
  };
  Object.assign(db, {
    transaction: () => ({
      execute: async (fn: (trx: typeof db) => Promise<unknown>) => fn(db),
    }),
  });
  const services = {
    config: { MEDIACONVERT_WEBHOOK_SECRET: "secret" },
    storage: {
      getCdnObjectUrl: (key: string) => `https://cdn.test/${key}`,
      isCdnPublicKey: () => true,
    },
  };
  const service = createMediaService({
    database: db as never,
    services: services as never,
  });
  async function deliver(status: string) {
    const body = {
      detail: {
        status,
        jobId: job.id,
        videoId: job.video_id,
        masterPlaylistPath: "s3://bucket/protected/test/video.mpd",
        jobPercentComplete: 40,
      },
    };
    const rawBody = JSON.stringify(body);
    const signature = `sha256=${createHmac("sha256", "secret").update(rawBody).digest("hex")}`;
    return service.handleMediaConvertWebhook({
      headers: { "x-fleet-signature": signature },
      rawBody,
      body,
    });
  }
  assert.equal((await deliver("READY")).status, "ready");
  assert.equal(job.status, "ready");
  assert.equal(asset.status, "ready");
  assert.equal(outputs.length, 1);
  assert.equal(
    outputs[0]?.master_playlist_path,
    `protected/test/video.mpd?v=${job.id}-1`,
  );
  assert.equal((await deliver("READY")).status, "ready");
  assert.equal(outputs.length, 1);
  assert.equal(
    outputs[0]?.master_playlist_path,
    `protected/test/video.mpd?v=${job.id}-2`,
  );
  const playback = await service.getVideoAssetPlayback(
    {
      id: job.video_id,
      type: "video",
      status: "ready",
      storageKey: "protected/test",
      durationSeconds: null,
    },
    { mediaKey: "test" },
  );
  assert.equal(
    playback.manifestUrl,
    `https://cdn.test/protected/test/video.mpd?v=${job.id}-2`,
  );
  await deliver("PROGRESSING");
  assert.equal(job.status, "ready");
  assert.equal((await deliver("COMPLETE")).status, "completed");
  assert.equal(job.status, "completed");
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0]?.master_playlist_path, "protected/test/video.mpd");
  const completedPlayback = await service.getVideoAssetPlayback(
    {
      id: job.video_id,
      type: "video",
      status: "ready",
      storageKey: "protected/test",
      durationSeconds: null,
    },
    { mediaKey: "test" },
  );
  assert.equal(
    completedPlayback.manifestUrl,
    "https://cdn.test/protected/test/video.mpd",
  );
  await deliver("READY");
  assert.equal(job.status, "completed");
  job.status = "processing";
  job.id = "550e8400-e29b-41d4-a716-446655440002";
  await deliver("READY");
  assert.equal(outputs.length, 2);
  assert.equal(
    outputs.at(-1)?.master_playlist_path,
    `protected/test/video.mpd?v=${job.id}-1`,
  );
});
