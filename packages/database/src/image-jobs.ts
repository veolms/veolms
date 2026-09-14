import { sql, type Kysely, type Selectable } from "kysely";
import type { Database, ImageJobTable, Json } from "./schema.ts";

export async function enqueueImageJob(db: Kysely<Database>, values: { id: string; media_id: string }): Promise<void> {
  await db.insertInto("image_jobs").values({ ...values, status: "queued", attempts: 0 }).onConflict((oc) => oc.column("media_id").doUpdateSet({ status: "queued", error_message: null, completed_at: null, updated_at: new Date() })).execute();
}

export async function claimNextQueuedImageJob(db: Kysely<Database>): Promise<Selectable<ImageJobTable> | null> {
  return await db.transaction().execute(async (trx) => {
    const job = await trx.selectFrom("image_jobs").selectAll().where("status", "=", "queued").orderBy("created_at", "asc").limit(1).forUpdate().skipLocked().executeTakeFirst();
    if (!job) return null;
    await trx.updateTable("image_jobs").set({ status: "processing", attempts: sql<number>`attempts + 1`, started_at: new Date(), updated_at: new Date() }).where("id", "=", job.id).execute();
    await trx.updateTable("media_assets").set({ status: "processing", updated_at: new Date() }).where("id", "=", job.media_id).execute();
    return { ...job, status: "processing", attempts: job.attempts + 1 };
  });
}

export async function completeImageJob(db: Kysely<Database>, jobId: string, mediaId: string, metadata: Json): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("media_assets").set({ status: "ready", metadata, updated_at: new Date() }).where("id", "=", mediaId).execute();
    await trx.updateTable("image_jobs").set({ status: "completed", completed_at: new Date(), updated_at: new Date() }).where("id", "=", jobId).execute();
  });
}

export async function failImageJob(db: Kysely<Database>, jobId: string, mediaId: string, errorMessage: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("media_assets").set({ status: "failed", updated_at: new Date() }).where("id", "=", mediaId).execute();
    await trx.updateTable("image_jobs").set({ status: "failed", error_message: errorMessage.slice(0, 2000), updated_at: new Date() }).where("id", "=", jobId).execute();
  });
}

export async function retryImageJob(db: Kysely<Database>, mediaId: string): Promise<void> {
  await db.updateTable("image_jobs").set({ status: "queued", error_message: null, updated_at: new Date() }).where("media_id", "=", mediaId).execute();
  await db.updateTable("media_assets").set({ status: "uploaded", updated_at: new Date() }).where("id", "=", mediaId).execute();
}
