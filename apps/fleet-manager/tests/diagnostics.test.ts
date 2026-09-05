import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Database } from "@veolms/database";
import { getFleetHealthSummary } from "../src/diagnostics/diagnostics.ts";

describe("Fleet Manager Diagnostics and Health Metrics", () => {
  it("should calculate fleet health summary correctly from query results", async () => {
    const mockDb = {
      selectFrom(table: string) {
        if (table === "video_jobs") {
          return {
            select() {
              return {
                async execute() {
                  return [
                    { status: "queued" },
                    { status: "queued" },
                    { status: "processing" },
                    { status: "completed" },
                    { status: "failed" },
                  ];
                },
              };
            },
          };
        }
        if (table === "workers") {
          return {
            selectAll() {
              return {
                where() {
                  return {
                    async execute() {
                      const now = Date.now();
                      return [
                        {
                          id: "w1",
                          status: "processing",
                          created_at: new Date(now - 10000),
                          last_heartbeat_at: new Date(now - 5000),
                        },
                        {
                          id: "w2",
                          status: "processing",
                          created_at: new Date(now - 200000),
                          last_heartbeat_at: new Date(now - 120000), // > 90s ago -> stalled
                        },
                      ];
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const summary = await getFleetHealthSummary(
      mockDb as unknown as Database,
      90000,
    );

    assert.equal(summary.queuedJobsCount, 2);
    assert.equal(summary.processingJobsCount, 1);
    assert.equal(summary.completedJobsCount, 1);
    assert.equal(summary.failedJobsCount, 1);
    assert.equal(summary.activeWorkersCount, 2);
    assert.equal(summary.stalledWorkersCount, 1);
  });

  it("prunes zombie workers and recovers their assigned active jobs", async () => {
    let workerStatusUpdated = "";
    let jobStatusUpdated = "";
    let jobErrorMessage = "";
    let terminatedProviderId = "";

    const jobUpdateFilters: { col: string; op: string; val: any }[] = [];

    const mockDb = {
      selectFrom(table: string) {
        if (table === "workers") {
          return {
            selectAll() {
              return {
                where() {
                  return {
                    where() {
                      return {
                        async execute() {
                          return [
                            {
                              id: "w-stalled-1",
                              provider: "local",
                              provider_worker_id: "proc-1234",
                              status: "processing",
                              job_id: "job-stalled-1",
                              last_heartbeat_at: new Date(Date.now() - 200000),
                            },
                          ];
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "video_jobs") {
          return {
            select() {
              return {
                where() {
                  return {
                    where() {
                      return {
                        async executeTakeFirst() {
                          return {
                            id: "job-stalled-1",
                            attempts: 0,
                            max_attempts: 3,
                            status: "processing",
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
      updateTable(table: string) {
        return {
          set(values: any) {
            const chain: any = {
              where(col: string, op: string, val: any) {
                if (table === "video_jobs") {
                  jobUpdateFilters.push({ col, op, val });
                }
                return chain;
              },
              async execute() {
                if (table === "workers") {
                  workerStatusUpdated = values.status;
                }
                if (table === "video_jobs") {
                  jobStatusUpdated = values.status;
                  jobErrorMessage = values.error_message;
                }
              },
            };
            return chain;
          },
        };
      },
    };

    const mockProvider = {
      terminateWorker: async (id: string) => {
        terminatedProviderId = id;
      },
    } as any;

    const { pruneZombieWorkers } = await import(
      "../src/diagnostics/diagnostics.ts"
    );
    const pruned = await pruneZombieWorkers(
      mockDb as any,
      mockProvider,
      90000,
    );

    assert.deepEqual(pruned, ["w-stalled-1"]);
    assert.equal(workerStatusUpdated, "terminated");
    assert.equal(terminatedProviderId, "proc-1234");
    assert.equal(jobStatusUpdated, "queued"); // attempts: 0 < max_attempts: 3 -> re-queued
    assert.ok(jobErrorMessage.includes("stalled"));
    assert.deepEqual(jobUpdateFilters, [
      { col: "id", op: "=", val: "job-stalled-1" },
      { col: "status", op: "in", val: ["provisioning", "processing"] },
      { col: "worker_id", op: "=", val: "w-stalled-1" },
    ]);
  });

  it("prevents stale updates from recovering a job when worker_id or active status does not match", async () => {
    let jobUpdated = false;

    const currentJobState = {
      id: "job-stalled-1",
      worker_id: "w-reassigned-99", // Reassigned to a different worker
      status: "processing",
      attempts: 1,
    };

    const mockDb = {
      selectFrom(table: string) {
        if (table === "workers") {
          return {
            selectAll() {
              return {
                where() {
                  return {
                    where() {
                      return {
                        async execute() {
                          return [
                            {
                              id: "w-stalled-1",
                              provider: "local",
                              provider_worker_id: "proc-1234",
                              status: "processing",
                              job_id: "job-stalled-1",
                              last_heartbeat_at: new Date(Date.now() - 200000),
                            },
                          ];
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "video_jobs") {
          return {
            select() {
              return {
                where() {
                  return {
                    where() {
                      return {
                        async executeTakeFirst() {
                          return {
                            id: "job-stalled-1",
                            attempts: 0,
                            max_attempts: 3,
                            status: "processing",
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
      updateTable(table: string) {
        return {
          set(values: any) {
            const filters: { col: string; op: string; val: any }[] = [];
            const chain: any = {
              where(col: string, op: string, val: any) {
                filters.push({ col, op, val });
                return chain;
              },
              async execute() {
                if (table === "video_jobs") {
                  // Simulate conditional update matching current state
                  const matches = filters.every(({ col, op, val }) => {
                    const currentVal = (currentJobState as any)[col];
                    if (op === "=") return currentVal === val;
                    if (op === "in") return Array.isArray(val) && val.includes(currentVal);
                    return false;
                  });
                  if (matches) {
                    jobUpdated = true;
                    Object.assign(currentJobState, values);
                  }
                }
              },
            };
            return chain;
          },
        };
      },
    };

    const mockProvider = {
      terminateWorker: async () => {},
    } as any;

    const { pruneZombieWorkers } = await import(
      "../src/diagnostics/diagnostics.ts"
    );
    await pruneZombieWorkers(mockDb as any, mockProvider, 90000);

    // Job should NOT have been updated because current worker_id is w-reassigned-99, not w-stalled-1
    assert.equal(jobUpdated, false);
    assert.equal(currentJobState.worker_id, "w-reassigned-99");
  });
});
