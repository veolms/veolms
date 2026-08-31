import { sql, type Kysely, type Selectable } from "kysely";
import type { Database } from "../schema.ts";
import type { VideoJobTable } from "../schema/fleet.schema.ts";

/**
 * Atomically claims the oldest QUEUED job and marks it PROCESSING.
 * `FOR UPDATE SKIP LOCKED` lets multiple callers (the fleet-manager daemon
 * and any number of media-workers polling for their next job) race against
 * this query concurrently without ever double-claiming the same row. When a
 * worker ID is supplied, the claim and worker assignment happen in the same
 * transaction and only jobs that fit that worker's recorded capabilities are
 * considered.
 */
export async function claimNextQueuedVideoJob(
  db: Kysely<Database>,
  workerId?: string,
): Promise<Selectable<VideoJobTable> | null> {
  return await db.transaction().execute(async (trx) => {
    const worker = workerId
      ? await trx
          .selectFrom("workers")
          .select(["id", "cpu", "memory_mb", "storage_gb", "architecture"])
          .where("id", "=", workerId)
          .where("status", "=", "ready")
          .forUpdate()
          .executeTakeFirst()
      : null;

    // A caller that supplied a worker may only claim work while it remains
    // READY. Locking the row also prevents a monitor from terminating it in
    // the small interval between claim and assignment.
    if (workerId && !worker) {
      return null;
    }

    let query = trx
      .selectFrom("video_jobs")
      .selectAll()
      .where("status", "=", "queued")
      .orderBy("created_at", "asc");

    if (worker) {
      // Prefer the tier estimateJobHardware() already resolved (and
      // persisted as hardware_profile) at queue time — it accounts for
      // probed source metadata (resolution/fps/codec), not just requested
      // output qualities. Each CASE-on-hardware_profile is wrapped in a
      // COALESCE against the exact legacy qualities-only heuristic, kept
      // only as a fallback for rows queued before this column existed
      // (hardware_profile IS NULL).
      query = query
        .where(
          sql<boolean>`
            COALESCE(
              CASE hardware_profile
                WHEN 'nano' THEN 1
                WHEN 'micro' THEN 2
                WHEN 'small' THEN 4
                WHEN 'medium' THEN 8
                WHEN 'large' THEN 16
              END,
              CASE
                WHEN qualities @> ARRAY['2160p'] THEN 8
                WHEN qualities @> ARRAY['1440p'] OR cardinality(qualities) >= 5 THEN 4
                ELSE 2
              END
            ) <= ${worker.cpu}
          `,
        )
        .where(
          sql<boolean>`
            COALESCE(
              CASE hardware_profile
                WHEN 'nano' THEN 2048
                WHEN 'micro' THEN 4096
                WHEN 'small' THEN 8192
                WHEN 'medium' THEN 16384
                WHEN 'large' THEN 32768
              END,
              CASE
                WHEN qualities @> ARRAY['2160p'] THEN 16384
                WHEN qualities @> ARRAY['1440p'] OR cardinality(qualities) >= 5 THEN 8192
                ELSE 4096
              END
            ) <= ${worker.memory_mb}
          `,
        )
        .where(
          sql<boolean>`
            COALESCE(
              CASE hardware_profile
                WHEN 'nano' THEN 20
                WHEN 'micro' THEN 30
                WHEN 'small' THEN 50
                WHEN 'medium' THEN 80
                WHEN 'large' THEN 130
              END,
              CASE
                WHEN qualities @> ARRAY['2160p'] THEN 80
                WHEN qualities @> ARRAY['1440p'] OR cardinality(qualities) >= 5 THEN 50
                ELSE 30
              END
            ) <= ${worker.storage_gb}
          `,
        )
        .where(sql<boolean>`${worker.architecture} in ('arm64', 'x86_64')`);
    }

    const row = await query
      .limit(1)
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    await trx
      .updateTable("video_jobs")
      .set({
        status: "provisioning",
        ...(worker ? { worker_id: worker.id } : {}),
        started_at: new Date(),
        updated_at: new Date(),
      })
      .where("id", "=", row.id)
      .execute();

    if (worker) {
      await trx
        .updateTable("workers")
        .set({
          status: "processing",
          job_id: row.id,
          updated_at: new Date(),
        })
        .where("id", "=", worker.id)
        .execute();
    }

    return row;
  });
}
