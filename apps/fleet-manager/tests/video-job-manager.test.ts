import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import { createJobManager } from "../src/core/video-job-manager.ts";
import { loadFleetManagerConfig } from "@veolms/config";

describe("Job Manager — queueJob insert values and duplicate protection", () => {
  it("passes qualities as a plain array and includes video_id", async () => {
    let insertedValues: Record<string, unknown> | undefined;

    const mockDb = {
      selectFrom: () => {
        const selectChain = () => ({
          where: () => ({
            executeTakeFirst: async () => undefined,
            where: () => ({
              orderBy: () => ({
                executeTakeFirst: async () => undefined,
              }),
            }),
          }),
        });
        return { selectAll: selectChain, select: selectChain };
      },
      insertInto: () => ({
        values: (v: Record<string, unknown>) => {
          insertedValues = v;
          return {
            returningAll: () => ({
              execute: async () => [v],
            }),
            execute: async () => [v],
          };
        },
      }),
    } as unknown as Kysely<Database>;

    const jobManager = createJobManager({
      db: mockDb,
      config: loadFleetManagerConfig(),
    });

    await jobManager.queueJob({
      videoId: "video-123",
      videoKey: "raw/video.mp4",
      outputPrefix: "out/",
      qualities: ["1080p", "720p"],
    });

    assert.deepEqual(insertedValues?.["qualities"], ["1080p", "720p"]);
    assert.equal(insertedValues?.["video_id"], "video-123");
  });

  it("returns existing job without inserting if jobId already exists in database", async () => {
    let insertCalled = false;
    const existingJob = {
      id: "job-existing-1",
      video_id: "video-123",
      status: "queued",
      video_key: "raw/video.mp4",
      output_prefix: "out/",
      qualities: ["1080p"],
    };

    const mockDb = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => existingJob,
          }),
        }),
      }),
      insertInto: () => {
        insertCalled = true;
        return {} as any;
      },
    } as unknown as Kysely<Database>;

    const jobManager = createJobManager({
      db: mockDb,
      config: loadFleetManagerConfig(),
    });

    const result = await jobManager.queueJob({
      jobId: "job-existing-1",
      videoId: "video-123",
      videoKey: "raw/video.mp4",
      outputPrefix: "out/",
      qualities: ["1080p"],
    });

    assert.equal(result.id, "job-existing-1");
    assert.equal(insertCalled, false);
  });

  it("does not fail a job if it has already been COMPLETED", async () => {
    let updateExecuted = false;
    const mockDb = {
      selectFrom: () => ({
        select: () => ({
          where: () => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: async () => ({
                  id: "job-1",
                  attempts: 1,
                  max_attempts: 3,
                  status: "completed",
                  worker_id: "worker-1",
                }),
              }),
              executeTakeFirst: async () => ({
                id: "job-1",
                attempts: 1,
                max_attempts: 3,
                status: "completed",
                worker_id: "worker-1",
              }),
            }),
            executeTakeFirst: async () => ({
              id: "job-1",
              attempts: 1,
              max_attempts: 3,
              status: "completed",
              worker_id: "worker-1",
            }),
          }),
        }),
      }),
      updateTable: () => ({
        set: () => ({
          where: () => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: async () => {
                  updateExecuted = true;
                  return { numUpdatedRows: 1n };
                },
              }),
              executeTakeFirst: async () => {
                updateExecuted = true;
                return { numUpdatedRows: 1n };
              },
            }),
            executeTakeFirst: async () => {
              updateExecuted = true;
              return { numUpdatedRows: 1n };
            },
          }),
        }),
      }),
    } as unknown as Kysely<Database>;

    const jobManager = createJobManager({
      db: mockDb,
      config: loadFleetManagerConfig(),
    });

    const result = await jobManager.markJobFailed(
      "job-1",
      "Worker timed out",
      "worker-1",
    );
    assert.equal(result, false);
    assert.equal(updateExecuted, false);
  });
});
