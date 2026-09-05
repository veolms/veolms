import { sql, type Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { FleetProvider } from "@veolms/fleet-types";
import type { FleetManagerConfig } from "@veolms/config";
import type { JobManager } from "./video-job-manager.ts";
import type { Scheduler } from "./scheduler.ts";
import type { WorkerManager } from "./worker-manager.ts";

export interface ReconcileResult {
  deadWorkersProcessed: number;
  zombieInstancesTerminated: number;
  verifiedCompletedJobs: number;
}

export interface Monitor {
  checkHeartbeatTimeouts(): Promise<number>;
  checkDueWorkers(): Promise<number>;
  checkOrphanedJobs(): Promise<number>;
  reconcileClusterState(): Promise<ReconcileResult>;
}

export function createMonitor(options: {
  provider: FleetProvider;
  db: Kysely<Database>;
  scheduler: Scheduler;
  jobManager: JobManager;
  workerManager: WorkerManager;
  config: FleetManagerConfig;
}): Monitor {
  const { provider, db, scheduler, jobManager, workerManager, config } =
    options;
  const timeoutMs = config.HEARTBEAT_TIMEOUT_SECONDS * 1000;

  return {
    async checkOrphanedJobs(): Promise<number> {
      const cutoff = new Date(Date.now() - timeoutMs);

      const orphanedJobs = await db
        .selectFrom("video_jobs")
        .select(["id", "video_key", "started_at"])
        .where("status", "in", ["provisioning", "processing"])
        .where("worker_id", "is", null)
        .where((eb) =>
          eb.or([
            eb("started_at", "<", cutoff),
            eb.and([
              eb("started_at", "is", null),
              eb("created_at", "<", cutoff),
            ]),
          ]),
        )
        .execute();

      for (const job of orphanedJobs) {
        console.warn(`Recovering orphaned processing job ${job.id}`);
        await jobManager.markJobFailed(
          job.id,
          `Recovered orphaned job: worker assignment timed out or was interrupted`,
        );
      }

      return orphanedJobs.length;
    },

    async checkHeartbeatTimeouts(): Promise<number> {
      const cutoff = new Date(Date.now() - timeoutMs);

      const staleWorkers = await db
        .selectFrom("workers")
        .select(["id", "job_id", "status", "last_heartbeat_at", "created_at"])
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

      for (const worker of staleWorkers) {
        console.warn(
          `Worker ${worker.id} missed heartbeat timeout (cutoff ${cutoff.toISOString()})`,
        );

        await workerManager.recordEvent(
          "heartbeat_timeout",
          worker.id,
          worker.job_id,
          {
            lastHeartbeatAt: worker.last_heartbeat_at?.toISOString() ?? null,
            timeoutSeconds: config.HEARTBEAT_TIMEOUT_SECONDS,
          },
        );

        // Mark worker FAILED
        await db
          .updateTable("workers")
          .set({
            status: "failed",
            updated_at: new Date(),
          })
          .where("id", "=", worker.id)
          .execute();

        // Mark associated job failed / retryable only if still assigned to this worker
        if (worker.job_id) {
          await jobManager.markJobFailed(
            worker.job_id,
            `Worker ${worker.id} missed heartbeat timeout (${config.HEARTBEAT_TIMEOUT_SECONDS}s)`,
            worker.id,
          );
        }

        // Terminate worker
        await workerManager.terminateWorker(worker.id);
      }

      return staleWorkers.length;
    },

    async checkDueWorkers(): Promise<number> {
      const now = new Date();

      const dueMonitoring = await db
        .selectFrom("worker_monitoring")
        .innerJoin("workers", "workers.id", "worker_monitoring.worker_id")
        .leftJoin("video_jobs", "video_jobs.id", "workers.job_id")
        .select([
          "worker_monitoring.worker_id",
          "worker_monitoring.estimated_duration_sec",
          "worker_monitoring.progress_percent",
          "worker_monitoring.monitoring_attempts",
          "worker_monitoring.check_interval_sec",
          "workers.status as worker_status",
          "workers.job_id",
          "video_jobs.status as job_status",
        ])
        .where("worker_monitoring.next_check_at", "<=", now)
        .where("workers.status", "not in", ["terminating", "terminated"])
        .execute();

      for (const item of dueMonitoring) {
        if (
          item.job_status === "completed" ||
          item.worker_status === "completed"
        ) {
          await workerManager.terminateWorker(item.worker_id);
          continue;
        }

        if (item.job_status === "failed" || item.worker_status === "failed") {
          await workerManager.terminateWorker(item.worker_id);
          continue;
        }

        // Recalculate next check time dynamically based on reported progress
        const nextCheck = scheduler.calculateNextCheck({
          estimatedDurationSec: item.estimated_duration_sec,
          progressPercent: item.progress_percent,
          lastCheckIntervalSec: item.check_interval_sec,
        });

        await db
          .updateTable("worker_monitoring")
          .set({
            next_check_at: nextCheck.nextCheckAt,
            last_check_at: now,
            check_interval_sec: nextCheck.checkIntervalSec,
            monitoring_attempts: item.monitoring_attempts + 1,
            updated_at: new Date(),
          })
          .where("worker_id", "=", item.worker_id)
          .execute();
      }

      return dueMonitoring.length;
    },

    async reconcileClusterState(): Promise<ReconcileResult> {
      let deadWorkersProcessed = 0;
      let zombieInstancesTerminated = 0;
      let verifiedCompletedJobs = 0;

      // 1. Two-way reconciliation with Cloud Provider instances if supported
      if (typeof provider.listActiveInstances === "function") {
        try {
          const cloudInstances = await provider.listActiveInstances();
          const cloudMap = new Map(
            cloudInstances.map((inst) => [inst.providerWorkerId, inst]),
          );

          const dbActiveWorkers = await db
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

          // Check DB active workers against cloud instances (Dead workers / Spot interruption)
          for (const worker of dbActiveWorkers) {
            if (
              worker.provider_worker_id &&
              worker.provider_worker_id !== "pending"
            ) {
              const cloudInst = cloudMap.get(worker.provider_worker_id);
              const isTerminatedInCloud =
                !cloudInst ||
                cloudInst.status === "terminated" ||
                cloudInst.status === "failed";

              // 30-second grace period for newly provisioned workers
              const ageMs = now - new Date(worker.created_at).getTime();
              if (isTerminatedInCloud && ageMs > 30000) {
                console.warn(
                  `[reconciliation] Worker ${worker.id} (${worker.provider_worker_id}) terminated unexpectedly in cloud provider (state: ${cloudInst?.status ?? "missing"}). Recovering job...`,
                );

                await workerManager.recordEvent(
                  "spot_interrupted",
                  worker.id,
                  worker.job_id,
                  {
                    providerWorkerId: worker.provider_worker_id,
                    cloudStatus: cloudInst?.status ?? "NOT_FOUND",
                  },
                );

                await db
                  .updateTable("workers")
                  .set({
                    status: "failed",
                    updated_at: new Date(),
                  })
                  .where("id", "=", worker.id)
                  .execute();

                if (worker.job_id) {
                  await jobManager.markJobFailed(
                    worker.job_id,
                    `Worker instance terminated unexpectedly in cloud provider (${cloudInst?.status ?? "missing"})`,
                    worker.id,
                  );
                }

                deadWorkersProcessed++;
              }
            }
          }

          // Check Cloud instances against DB active workers (Zombie instances)
          for (const cloudInst of cloudInstances) {
            if (cloudInst.status !== "terminated") {
              const matchingWorker = dbActiveWorkers.find(
                (w) =>
                  w.provider_worker_id === cloudInst.providerWorkerId ||
                  (cloudInst.workerId && w.id === cloudInst.workerId),
              );

              if (!matchingWorker) {
                // 3-minute grace period for fresh launches before terminating
                const launchAgeMs = cloudInst.launchTime
                  ? now - cloudInst.launchTime.getTime()
                  : 300000;

                if (launchAgeMs > 180000) {
                  console.warn(
                    `[reconciliation] Orphaned cloud instance ${cloudInst.providerWorkerId} detected without active DB worker record. Terminating...`,
                  );

                  try {
                    await provider.terminateWorker(cloudInst.providerWorkerId);
                    await workerManager.recordEvent(
                      "orphan_instance_terminated",
                      null,
                      null,
                      {
                        providerWorkerId: cloudInst.providerWorkerId,
                      },
                    );
                    zombieInstancesTerminated++;
                  } catch (termErr) {
                    console.error(
                      `[reconciliation] Failed to terminate orphan instance ${cloudInst.providerWorkerId}:`,
                      termErr,
                    );
                  }
                }
              }
            }
          }
        } catch (reconcileErr) {
          console.error(
            "[reconciliation] Error during cloud instance reconciliation:",
            reconcileErr,
          );
        }
      }

      // 2. Storage Output Verification on completed / 100% progress jobs
      if (typeof provider.verifyJobOutput === "function") {
        try {
          const completedJobs = await db
            .selectFrom("video_jobs")
            .selectAll()
            .where((eb) =>
              eb.or([
                eb("status", "=", "completed"),
                eb("progress_percent", ">=", 100),
              ]),
            )
            .where("worker_id", "is not", null)
            .execute();

          for (const job of completedJobs) {
            const verified = await provider.verifyJobOutput(job.output_prefix);
            if (verified) {
              if (job.status !== "completed") {
                await jobManager.markJobCompleted(job.id);
              }
              await workerManager.recordEvent(
                "job_output_verified",
                job.worker_id,
                job.id,
                {
                  outputPrefix: job.output_prefix,
                },
              );
              verifiedCompletedJobs++;
            } else if (job.status === "completed") {
              console.warn(
                `[reconciliation] Job ${job.id} marked completed but output verification failed for ${job.output_prefix}`,
              );
              await jobManager.markJobFailed(
                job.id,
                "Output verification failed: master.m3u8 missing or empty in storage",
                job.worker_id ?? undefined,
                { allowCompleted: true },
              );
              await workerManager.recordEvent(
                "job_output_verification_failed",
                job.worker_id,
                job.id,
                {
                  outputPrefix: job.output_prefix,
                },
              );
            }
          }
        } catch (verifyErr) {
          console.error(
            "[reconciliation] Error during output verification:",
            verifyErr,
          );
        }
      }

      return {
        deadWorkersProcessed,
        zombieInstancesTerminated,
        verifiedCompletedJobs,
      };
    },
  };
}
