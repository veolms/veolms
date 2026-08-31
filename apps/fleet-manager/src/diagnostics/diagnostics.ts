import type { Kysely, Selectable } from "kysely";
import type { Database, VideoJobTable } from "@veolms/database";
import type {
  FleetEvent,
  FleetProvider,
  ProviderType,
  WorkerHandle,
  WorkerStatus,
} from "@veolms/fleet-types";

export interface JobDiagnostics {
  readonly job: Selectable<VideoJobTable>;
  readonly worker: WorkerHandle | null;
  readonly events: readonly FleetEvent[];
  readonly progressHistory: readonly {
    readonly progressPercent: number;
    readonly checkIntervalSec: number;
    readonly nextCheckAt: Date;
    readonly lastCheckAt: Date | null;
    readonly updatedAt: Date;
  }[];
}

export interface FleetHealthSummary {
  readonly queuedJobsCount: number;
  readonly processingJobsCount: number;
  readonly completedJobsCount: number;
  readonly failedJobsCount: number;
  readonly activeWorkersCount: number;
  readonly stalledWorkersCount: number;
}

export async function getJobDiagnostics(
  db: Kysely<Database>,
  jobId: string,
): Promise<JobDiagnostics | null> {
  const job = await db
    .selectFrom("video_jobs")
    .selectAll()
    .where("id", "=", jobId)
    .executeTakeFirst();

  if (!job) {
    return null;
  }

  let worker: WorkerHandle | null = null;
  if (job.worker_id) {
    const workerRow = await db
      .selectFrom("workers")
      .selectAll()
      .where("id", "=", job.worker_id)
      .executeTakeFirst();

    if (workerRow) {
      worker = {
        id: workerRow.id,
        providerWorkerId: workerRow.provider_worker_id,
        provider: workerRow.provider as ProviderType,
        status: workerRow.status as WorkerStatus,
        privateIp: null,
        publicIp: null,
        createdAt: new Date(workerRow.created_at),
      };
    }
  }

  const eventRows = await db
    .selectFrom("worker_events")
    .selectAll()
    .where("job_id", "=", jobId)
    .orderBy("created_at", "asc")
    .execute();

  const events: FleetEvent[] = eventRows.map((e) => ({
    id: e.id,
    workerId: e.worker_id,
    jobId: e.job_id,
    event: e.event,
    metadata:
      typeof e.metadata === "string"
        ? JSON.parse(e.metadata)
        : (e.metadata ?? {}),
    createdAt: new Date(e.created_at),
  }));

  let progressHistory: {
    progressPercent: number;
    checkIntervalSec: number;
    nextCheckAt: Date;
    lastCheckAt: Date | null;
    updatedAt: Date;
  }[] = [];

  if (job.worker_id) {
    const monitorRows = await db
      .selectFrom("worker_monitoring")
      .selectAll()
      .where("worker_id", "=", job.worker_id)
      .orderBy("updated_at", "asc")
      .execute();

    progressHistory = monitorRows.map((m) => ({
      progressPercent: Number(m.progress_percent),
      checkIntervalSec: m.check_interval_sec,
      nextCheckAt: new Date(m.next_check_at),
      lastCheckAt: m.last_check_at ? new Date(m.last_check_at) : null,
      updatedAt: new Date(m.updated_at),
    }));
  }

  return {
    job,
    worker,
    events,
    progressHistory,
  };
}

export async function getFleetHealthSummary(
  db: Kysely<Database>,
  heartbeatTimeoutMs: number = 90000,
): Promise<FleetHealthSummary> {
  const jobs = await db.selectFrom("video_jobs").select(["status"]).execute();

  const queuedJobsCount = jobs.filter((j) => j.status === "queued").length;
  const processingJobsCount = jobs.filter(
    (j) => j.status === "processing" || j.status === "provisioning",
  ).length;
  const completedJobsCount = jobs.filter(
    (j) => j.status === "completed",
  ).length;
  const failedJobsCount = jobs.filter((j) => j.status === "failed").length;

  const workers = await db
    .selectFrom("workers")
    .selectAll()
    .where("status", "in", [
      "pending",
      "provisioning",
      "starting",
      "ready",
      "processing",
    ])
    .execute();

  const now = Date.now();
  let stalledWorkersCount = 0;

  for (const w of workers) {
    if (!w.last_heartbeat_at) {
      if (now - new Date(w.created_at).getTime() > heartbeatTimeoutMs) {
        stalledWorkersCount++;
      }
    } else {
      if (now - new Date(w.last_heartbeat_at).getTime() > heartbeatTimeoutMs) {
        stalledWorkersCount++;
      }
    }
  }

  return {
    queuedJobsCount,
    processingJobsCount,
    completedJobsCount,
    failedJobsCount,
    activeWorkersCount: workers.length,
    stalledWorkersCount,
  };
}

export async function pruneZombieWorkers(
  db: Kysely<Database>,
  provider: FleetProvider,
  heartbeatTimeoutMs: number = 90000,
): Promise<readonly string[]> {
  const cutoff = new Date(Date.now() - heartbeatTimeoutMs);

  const stalledWorkers = await db
    .selectFrom("workers")
    .selectAll()
    .where("status", "in", [
      "pending",
      "provisioning",
      "starting",
      "ready",
      "processing",
    ])
    .where((eb) =>
      eb.or([
        eb("last_heartbeat_at", "<", cutoff),
        eb.and([
          eb("last_heartbeat_at", "is", null),
          eb("created_at", "<", cutoff),
        ]),
      ]),
    )
    .execute();

  const prunedIds: string[] = [];

  for (const worker of stalledWorkers) {
    await db
      .updateTable("workers")
      .set({ status: "terminating" })
      .where("id", "=", worker.id)
      .execute();

    if (worker.provider_worker_id && worker.provider_worker_id !== "pending") {
      try {
        await provider.terminateWorker(worker.provider_worker_id);
      } catch (err) {
        console.error(
          `Failed to terminate provider worker ${worker.provider_worker_id}:`,
          err,
        );
      }
    }

    await db
      .updateTable("workers")
      .set({
        status: "terminated",
        terminated_at: new Date(),
        updated_at: new Date(),
      })
      .where("id", "=", worker.id)
      .execute();

    prunedIds.push(worker.id);
  }

  return prunedIds;
}
