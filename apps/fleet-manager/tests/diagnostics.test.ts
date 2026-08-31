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
});
