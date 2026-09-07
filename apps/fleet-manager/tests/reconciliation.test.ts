import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFleetManager } from "../src/core/fleet-manager.ts";
import type { FleetProvider, WorkerHandle } from "@veolms/fleet-types";
import type { FleetManagerConfig } from "@veolms/config";

describe("Fleet Manager — State Reconciliation & Dynamic Scheduling", () => {
  const baseConfig: FleetManagerConfig = {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    PROVIDER: "AWS",
    POLL_INTERVAL_MS: 2000,
    HEARTBEAT_TIMEOUT_SECONDS: 90,
    MIN_CHECK_INTERVAL_SECONDS: 15,
    MAX_CHECK_INTERVAL_SECONDS: 300,
    DEFAULT_CHECK_INTERVAL_SECONDS: 30,
    MAX_RETRIES: 3,
    MAX_WORKERS: 8,
  };

  it("recovers spot-interrupted / prematurely terminated workers and re-queues the job", async () => {
    let workerUpdatedStatus = "";
    let jobUpdatedStatus = "";
    let recordedEvents: string[] = [];

    // Mock Database
    const mockDb = {
      selectFrom: (table: string) => {
        if (table === "workers") {
          return {
            selectAll: () => ({
              where: (col: string, op: string, val: string[]) => ({
                execute: async () => [
                  {
                    id: "w-spot-1",
                    provider: "aws",
                    provider_worker_id: "i-spot123",
                    status: "processing",
                    job_id: "job-100",
                    created_at: new Date(Date.now() - 60000), // 60s ago (past 30s grace)
                    last_heartbeat_at: new Date(),
                  },
                ],
              }),
            }),
          };
        }
        if (table === "video_jobs") {
          return {
            select: () => ({
              where: () => ({
                where: () => ({
                  where: () => ({
                    executeTakeFirst: async () => ({
                      id: "job-100",
                      attempts: 0,
                      max_attempts: 3,
                      status: "processing",
                      worker_id: "w-spot-1",
                    }),
                  }),
                }),
              }),
            }),
            selectAll: () => ({
              where: () => ({
                where: () => ({
                  execute: async () => [],
                }),
              }),
            }),
          };
        }
        return {
          selectAll: () => ({
            where: () => ({
              execute: async () => [],
            }),
          }),
        };
      },
      updateTable: (table: string) => ({
        set: (values: any) => ({
          where: (col: string, op: string, val: any) => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: async () => {
                  if (table === "video_jobs") {
                    jobUpdatedStatus = values.status;
                  }
                  return { numUpdatedRows: 1n };
                },
              }),
            }),
            execute: async () => {
              if (table === "workers") {
                workerUpdatedStatus = values.status;
              }
              if (table === "video_jobs") {
                jobUpdatedStatus = values.status;
              }
              return [{ numUpdatedRows: 1n }];
            },
          }),
        }),
      }),
      insertInto: (table: string) => ({
        values: (data: any) => ({
          execute: async () => {
            if (table === "worker_events") {
              recordedEvents.push(data.event);
            }
          },
        }),
      }),
    } as any;

    const terminatedInstances: string[] = [];
    const mockProvider: FleetProvider = {
      name: "aws",
      createWorker: async () => ({}) as WorkerHandle,
      getWorker: async () => null,
      getWorkerStatus: async () => "terminated",
      terminateWorker: async (id) => {
        terminatedInstances.push(id);
      },
      healthCheck: async () => ({ healthy: true, state: "ready" }),
      listActiveInstances: async () => [
        // i-spot123 has terminated in AWS
        {
          providerWorkerId: "i-spot123",
          status: "terminated",
          launchTime: new Date(Date.now() - 60000),
          workerId: "w-spot-1",
        },
      ],
    };

    const fleet = createFleetManager({
      provider: mockProvider,
      db: mockDb,
      config: baseConfig,
    });

    const reconcileResult = await fleet.monitor.reconcileClusterState();

    assert.equal(reconcileResult.deadWorkersProcessed, 1);
    assert.equal(workerUpdatedStatus, "failed");
    assert.equal(jobUpdatedStatus, "queued"); // Re-queued since attempts < max_attempts
    assert.ok(recordedEvents.includes("spot_interrupted"));
  });

  it("detects and terminates orphaned cloud instances not associated with active DB workers", async () => {
    const terminatedZombieInstances: string[] = [];
    const recordedEvents: string[] = [];

    const mockDb = {
      selectFrom: (table: string) => {
        if (table === "workers") {
          return {
            selectAll: () => ({
              where: () => ({
                execute: async () => [
                  // Only worker-1 is active in DB
                  {
                    id: "w-valid-1",
                    provider_worker_id: "i-valid123",
                    status: "processing",
                    created_at: new Date(),
                  },
                ],
              }),
            }),
          };
        }
        return {
          selectAll: () => ({
            where: () => ({
              where: () => ({
                execute: async () => [],
              }),
            }),
          }),
        };
      },
      insertInto: (table: string) => ({
        values: (data: any) => ({
          execute: async () => {
            if (table === "worker_events") {
              recordedEvents.push(data.event);
            }
          },
        }),
      }),
    } as any;

    const mockProvider: FleetProvider = {
      name: "aws",
      createWorker: async () => ({}) as WorkerHandle,
      getWorker: async () => null,
      getWorkerStatus: async () => "processing",
      terminateWorker: async (id) => {
        terminatedZombieInstances.push(id);
      },
      healthCheck: async () => ({ healthy: true, state: "processing" }),
      listActiveInstances: async () => [
        {
          providerWorkerId: "i-valid123",
          status: "processing",
          launchTime: new Date(Date.now() - 60000),
          workerId: "w-valid-1",
        },
        {
          // Zombie instance: running in AWS, but not in DB
          providerWorkerId: "i-zombie999",
          status: "processing",
          launchTime: new Date(Date.now() - 300000), // 5 min ago (> 3 min grace)
          workerId: "w-deleted-or-completed",
        },
      ],
    };

    const fleet = createFleetManager({
      provider: mockProvider,
      db: mockDb,
      config: baseConfig,
    });

    const reconcileResult = await fleet.monitor.reconcileClusterState();

    assert.equal(reconcileResult.zombieInstancesTerminated, 1);
    assert.deepEqual(terminatedZombieInstances, ["i-zombie999"]);
    assert.ok(recordedEvents.includes("orphan_instance_terminated"));
  });

  it("synchronizes EventBridge wakeup schedule to the earliest next_check_at across active workers", async () => {
    let scheduledWakeupTarget: Date | null = null;
    let cancelledWakeup = false;

    const expectedEarliest = new Date(Date.now() + 45000);

    const mockDb = {
      selectFrom: () => ({
        innerJoin: () => ({
          select: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                earliestCheck: expectedEarliest,
              }),
            }),
          }),
        }),
      }),
    } as any;

    const mockProvider: FleetProvider = {
      name: "aws",
      createWorker: async () => ({}) as WorkerHandle,
      getWorker: async () => null,
      getWorkerStatus: async () => "processing",
      terminateWorker: async () => {},
      healthCheck: async () => ({ healthy: true, state: "processing" }),
      scheduleNextWakeup: async (target) => {
        scheduledWakeupTarget = target;
      },
      cancelWakeup: async () => {
        cancelledWakeup = true;
      },
    };

    const fleet = createFleetManager({
      provider: mockProvider,
      db: mockDb,
      config: baseConfig,
    });

    const scheduledDate = await fleet.syncWakeupSchedule();

    assert.equal(scheduledDate?.toISOString(), expectedEarliest.toISOString());
    assert.equal(
      scheduledWakeupTarget?.toISOString(),
      expectedEarliest.toISOString(),
    );
    assert.equal(cancelledWakeup, false);
  });

  it("cancels EventBridge wakeup schedule when no active workers remain", async () => {
    let cancelledWakeup = false;

    const mockDb = {
      selectFrom: () => ({
        innerJoin: () => ({
          select: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                earliestCheck: null, // No active workers due
              }),
            }),
          }),
        }),
      }),
    } as any;

    const mockProvider: FleetProvider = {
      name: "aws",
      createWorker: async () => ({}) as WorkerHandle,
      getWorker: async () => null,
      getWorkerStatus: async () => "processing",
      terminateWorker: async () => {},
      healthCheck: async () => ({ healthy: true, state: "processing" }),
      scheduleNextWakeup: async () => {},
      cancelWakeup: async () => {
        cancelledWakeup = true;
      },
    };

    const fleet = createFleetManager({
      provider: mockProvider,
      db: mockDb,
      config: baseConfig,
    });

    const scheduledDate = await fleet.syncWakeupSchedule();

    assert.equal(scheduledDate, null);
    assert.equal(cancelledWakeup, true);
  });

  it("only verifies jobs in processing status with 100% progress and avoids infinite verification on completed jobs", async () => {
    let queriedJobStatusFilter = "";
    let verifiedJobPrefix = "";
    let jobMarkedCompleted = false;

    const mockDb = {
      selectFrom: (table: string) => {
        const createChain = (rows: any[] = []) => {
          const chain: any = {
            select: () => chain,
            selectAll: () => chain,
            innerJoin: () => chain,
            leftJoin: () => chain,
            where: () => chain,
            execute: async () => rows,
            executeTakeFirst: async () => rows[0] ?? null,
          };
          return chain;
        };

        if (table === "video_jobs") {
          return {
            selectAll: () => ({
              where: (col: string, _op: string, val: any) => {
                if (col === "status") queriedJobStatusFilter = val;
                return {
                  where: () => ({
                    where: () => ({
                      execute: async () => [
                        {
                          id: "job-done-1",
                          status: "processing",
                          progress_percent: 100,
                          worker_id: "w-1",
                          output_prefix: "courses/c1/hls/",
                        },
                      ],
                    }),
                  }),
                };
              },
            }),
            select: () => createChain([]),
          };
        }
        return createChain([]);
      },
      updateTable: (table: string) => ({
        set: (values: any) => {
          const chain: any = {
            where: () => chain,
            execute: async () => {
              if (table === "video_jobs" && values.status === "completed") {
                jobMarkedCompleted = true;
              }
              return { numUpdatedRows: 1n };
            },
            executeTakeFirst: async () => {
              if (table === "video_jobs" && values.status === "completed") {
                jobMarkedCompleted = true;
              }
              return { numUpdatedRows: 1n };
            },
          };
          return chain;
        },
      }),
      insertInto: () => ({
        values: () => ({
          execute: async () => {},
        }),
      }),
    } as any;

    const mockProvider: FleetProvider = {
      name: "aws",
      createWorker: async () => ({}) as WorkerHandle,
      getWorker: async () => null,
      getWorkerStatus: async () => "ready",
      terminateWorker: async () => {},
      healthCheck: async () => ({ healthy: true, state: "ready" }),
      verifyJobOutput: async (prefix: string) => {
        verifiedJobPrefix = prefix;
        return true;
      },
    };

    const fleet = createFleetManager({
      provider: mockProvider,
      db: mockDb,
      config: baseConfig,
    });

    const result = await fleet.runMonitoringCycle();

    assert.equal(queriedJobStatusFilter, "processing");
    assert.equal(verifiedJobPrefix, "courses/c1/hls/");
    assert.equal(jobMarkedCompleted, true);
    assert.equal(result.reconcileResult.verifiedCompletedJobs, 1);
  });

  it("does not overwrite a job that was failed and requeued during overlapping storage I/O verification", async () => {
    let currentJobState: any = {
      id: "job-overlap-1",
      status: "processing",
      progress_percent: 100,
      worker_id: "w-old",
      output_prefix: "courses/overlap/hls/",
      attempts: 0,
    };
    const recordedEvents: string[] = [];

    const mockDb = {
      selectFrom: (table: string) => {
        const createChain = (rows: any[] = []) => {
          const chain: any = {
            select: () => chain,
            selectAll: () => chain,
            innerJoin: () => chain,
            leftJoin: () => chain,
            where: () => chain,
            execute: async () => rows,
            executeTakeFirst: async () => rows[0] ?? null,
          };
          return chain;
        };

        if (table === "video_jobs") {
          return {
            selectAll: () => ({
              where: () => ({
                where: () => ({
                  where: () => ({
                    execute: async () => [
                      { ...currentJobState },
                    ],
                  }),
                }),
              }),
            }),
            select: () => createChain([]),
          };
        }
        return createChain([]);
      },
      updateTable: (table: string) => ({
        set: (values: any) => {
          const filters: { col: string; val: any }[] = [];
          const chain: any = {
            where: (col: string, _op: string, val: any) => {
              filters.push({ col, val });
              return chain;
            },
            execute: async () => chain.executeTakeFirst(),
            executeTakeFirst: async () => {
              if (table === "video_jobs") {
                const matches = filters.every(({ col, val }) => {
                  return currentJobState[col] === val;
                });
                if (matches) {
                  Object.assign(currentJobState, values);
                  return { numUpdatedRows: 1n };
                }
                return { numUpdatedRows: 0n };
              }
              return { numUpdatedRows: 1n };
            },
          };
          return chain;
        },
      }),
      insertInto: () => ({
        values: (event: any) => ({
          execute: async () => {
            recordedEvents.push(event.event_type);
          },
        }),
      }),
    } as any;

    const mockProvider: FleetProvider = {
      name: "aws",
      createWorker: async () => ({}) as WorkerHandle,
      getWorker: async () => null,
      getWorkerStatus: async () => "ready",
      terminateWorker: async () => {},
      healthCheck: async () => ({ healthy: true, state: "ready" }),
      verifyJobOutput: async () => {
        // Simulate overlapping reconciliation: job failed & requeued during storage I/O
        currentJobState.status = "queued";
        currentJobState.worker_id = null;
        currentJobState.attempts = 1;
        return true;
      },
    };

    const fleet = createFleetManager({
      provider: mockProvider,
      db: mockDb,
      config: baseConfig,
    });

    const result = await fleet.runMonitoringCycle();

    // Newer requeued attempt must NOT be overwritten
    assert.equal(currentJobState.status, "queued");
    assert.equal(currentJobState.worker_id, null);
    assert.equal(currentJobState.attempts, 1);
    // Verified completed jobs must not increment when conditional update fails
    assert.equal(result.reconcileResult.verifiedCompletedJobs, 0);
    // Event must not be recorded
    assert.equal(recordedEvents.includes("job_output_verified"), false);
  });
});
