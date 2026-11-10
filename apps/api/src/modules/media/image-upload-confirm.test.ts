import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaService } from "./media.service.ts";

const MEDIA_ID = "7dd43825-4d70-48e4-af71-56b1cd2fc6db";
const OWNER_ID = "cde2df45-e73d-5746-85a0-7b2a58e84986";

/**
 * An uploaded picture (a course thumbnail or banner) is ready as soon as it
 * is in storage: the CDN Worker makes its sizes when they are first asked
 * for. Nothing processes `image_jobs` any more, so a picture left at
 * "processing" stayed there, and the course could not be published
 * ("Thumbnail media must be fully uploaded").
 */
void test("confirming an uploaded image makes it ready without queuing a job", async () => {
  const asset: Record<string, unknown> = {
    id: MEDIA_ID,
    owner_id: OWNER_ID,
    type: "image",
    status: "uploading",
    storage_key: `public/thumbnails/${MEDIA_ID}/original.png`,
    original_filename: "banner.png",
    mime_type: "image/png",
    size_bytes: 1000,
  };
  const inserted: string[] = [];
  const db = {
    selectFrom() {
      const query = {
        select: () => query,
        selectAll: () => query,
        leftJoin: () => query,
        innerJoin: () => query,
        where: () => query,
        limit: () => query,
        async executeTakeFirst() {
          return { ...asset };
        },
        async execute() {
          return [];
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
          if (table === "media_assets") Object.assign(asset, values);
        },
      };
      return query;
    },
    insertInto(table: string) {
      inserted.push(table);
      const query = {
        values: () => query,
        onConflict: () => query,
        async execute() {},
      };
      return query;
    },
  };
  const services = {
    config: {},
    storage: {
      headObject: async () => ({
        contentType: "image/png",
        contentLength: 1000,
      }),
    },
  };
  const service = createMediaService({
    database: db as never,
    services: services as never,
  });

  const result = await service.confirmUpload(MEDIA_ID, OWNER_ID, undefined, [
    "admin",
  ]);

  assert.equal(result.status, "ready");
  assert.equal(asset.status, "ready");
  assert.deepEqual(inserted, []);
});
