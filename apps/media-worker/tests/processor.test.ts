import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { FleetEventType } from "@veolms/fleet-types";
import { loadMediaWorkerConfig } from "@veolms/config";
import {
  buildMasterPlaylistStorageKey,
  executeTranscodeJob,
  extractVideoExtension,
} from "../src/processor.ts";
import type { MediaWorkerContext } from "../src/worker.ts";

describe("extractVideoExtension", () => {
  it("extracts the extension from a plain S3 key", () => {
    assert.equal(extractVideoExtension("raw/video.mp4"), "mp4");
  });

  it("extracts the extension from an HTTP(S) URL with a query string", () => {
    assert.equal(
      extractVideoExtension("https://cdn.example.com/course-01.mov?token=abc"),
      "mov",
    );
  });

  it("lowercases the extension", () => {
    assert.equal(extractVideoExtension("raw/clip.MKV"), "mkv");
  });

  it("falls back to mp4 when there is no extension", () => {
    assert.equal(extractVideoExtension("raw/video-without-extension"), "mp4");
  });

  it("ignores a URL fragment when extracting the extension", () => {
    assert.equal(
      extractVideoExtension("https://cdn.example.com/clip.webm#t=10"),
      "webm",
    );
  });
});

describe("buildMasterPlaylistStorageKey", () => {
  it("stores the master playlist as a portable output key", () => {
    assert.equal(
      buildMasterPlaylistStorageKey("output/course-1/"),
      "output/course-1/master.m3u8",
    );
  });

  it("normalizes empty or slash-only prefixes", () => {
    assert.equal(buildMasterPlaylistStorageKey("///"), "master.m3u8");
  });
});

const WORKER_ID = "worker-1";
const JOB_ID = "job-1";

// Baseline estimateJobHardware() output for a small 720p-only job:
// 2 vCPU / 4096MB / 30GB — comfortably within the "large" mock worker below.
const STANDARD_QUALITIES = ["720p"];
// 2160p pushes the estimate to 8 vCPU / 16384MB / 80GB, which exceeds the
// "small" mock worker used by the capacity-rejection test.
const OVERSIZED_QUALITIES = ["2160p"];

function makeChain(
  onTerminal: () => unknown,
  onSet?: (payload: unknown) => void,
): any {
  const chain: any = {};
  for (const m of [
    "select",
    "selectAll",
    "where",
    "orderBy",
    "limit",
    "forUpdate",
    "skipLocked",
    "values",
  ]) {
    chain[m] = () => chain;
  }
  chain.set = (payload: unknown) => {
    onSet?.(payload);
    return chain;
  };
  chain.execute = async () => onTerminal();
  chain.executeTakeFirst = async () => onTerminal();
  return chain;
}

/**
 * Builds a fake db that lets executeTranscodeJob's claim transaction and
 * (optionally) its retry/attempt-limit failure transaction run for real,
 * while short-circuiting before any real fs/ffmpeg/S3 work by making the
 * worker_monitoring update throw right after a successful claim — the
 * earliest point after ownership is established but before any I/O.
 */
function buildFakeDb(options: {
  jobRow: Record<string, unknown>;
  workerRow: Record<string, unknown> | undefined;
  workerMonitoringThrows?: boolean;
  jobsSetCalls: unknown[];
  workersSetCalls: unknown[];
}): Kysely<Database> {
  const {
    jobRow,
    workerRow,
    workerMonitoringThrows,
    jobsSetCalls,
    workersSetCalls,
  } = options;

  function makeTrx() {
    return {
      selectFrom(table: string) {
        if (table === "workers") return makeChain(() => workerRow);
        throw new Error(`trx: unexpected selectFrom table ${table}`);
      },
      updateTable(table: string) {
        if (table === "video_jobs") {
          return makeChain(
            () => ({ numUpdatedRows: 1n }),
            (payload) => jobsSetCalls.push(payload),
          );
        }
        if (table === "workers") {
          return makeChain(
            () => undefined,
            (payload) => workersSetCalls.push(payload),
          );
        }
        throw new Error(`trx: unexpected updateTable ${table}`);
      },
    };
  }

  return {
    selectFrom(table: string) {
      if (table === "video_jobs") return makeChain(() => jobRow);
      if (table === "media_assets") return makeChain(() => undefined);
      throw new Error(`db: unexpected selectFrom ${table}`);
    },
    updateTable(table: string) {
      if (table === "worker_monitoring") {
        return makeChain(() => {
          if (workerMonitoringThrows) {
            throw new Error("worker_monitoring update failed (simulated)");
          }
          return undefined;
        });
      }
      throw new Error(`db: unexpected top-level updateTable ${table}`);
    },
    transaction() {
      return {
        execute: async (cb: (trx: unknown) => Promise<unknown>) =>
          cb(makeTrx()),
      };
    },
  } as unknown as Kysely<Database>;
}

function buildCtx(
  db: Kysely<Database>,
  recordedEvents: Array<{
    event: FleetEventType;
    jobId?: string | null;
    metadata?: Readonly<Record<string, unknown>>;
  }>,
): MediaWorkerContext {
  return {
    workerId: WORKER_ID,
    db,
    config: loadMediaWorkerConfig({
      WORKER_ID: "11111111-1111-4111-8111-111111111111",
    }),
    stopHeartbeat: async () => undefined,
    recordEvent: async (event, jobId, metadata) => {
      recordedEvents.push({ event, jobId, metadata });
    },
  };
}

describe("executeTranscodeJob — claim and retry logic", () => {
  it("rejects claiming a job whose hardware requirements exceed the worker's recorded capacity", async () => {
    const jobsSetCalls: unknown[] = [];
    const workersSetCalls: unknown[] = [];
    const recordedEvents: Array<{ event: FleetEventType }> = [];

    const db = buildFakeDb({
      jobRow: {
        id: JOB_ID,
        status: "queued",
        worker_id: null,
        video_key: "raw/video.mp4",
        output_prefix: "out/job-1",
        video_size: 0,
        qualities: OVERSIZED_QUALITIES,
        attempts: 0,
        max_attempts: 3,
        started_at: null,
      },
      // Worker's actual capacity is well below what the job requires.
      workerRow: {
        id: WORKER_ID,
        cpu: 1,
        memory_mb: 1024,
        storage_gb: 10,
        architecture: "arm64",
      },
      jobsSetCalls,
      workersSetCalls,
    });

    const ctx = buildCtx(db, recordedEvents);

    await assert.rejects(
      () => executeTranscodeJob(ctx, JOB_ID),
      /does not meet/,
    );

    // The job was never actually claimed or touched, and no failure/retry
    // bookkeeping ran, since the mismatch is caught before ownership.
    assert.equal(jobsSetCalls.length, 0);
    assert.equal(workersSetCalls.length, 0);
    assert.equal(recordedEvents.length, 0);
  });

  it("requeues a failed job for retry when attempts remain below max_attempts", async () => {
    const jobsSetCalls: any[] = [];
    const workersSetCalls: any[] = [];
    const recordedEvents: Array<{
      event: FleetEventType;
      jobId?: string | null;
      metadata?: Readonly<Record<string, unknown>>;
    }> = [];

    const db = buildFakeDb({
      jobRow: {
        id: JOB_ID,
        status: "queued",
        worker_id: null,
        video_key: "raw/video.mp4",
        output_prefix: "out/job-1",
        video_size: 0,
        qualities: STANDARD_QUALITIES,
        attempts: 0,
        max_attempts: 3,
        started_at: null,
      },
      workerRow: {
        id: WORKER_ID,
        cpu: 8,
        memory_mb: 16384,
        storage_gb: 200,
        architecture: "arm64",
      },
      workerMonitoringThrows: true,
      jobsSetCalls,
      workersSetCalls,
    });

    const ctx = buildCtx(db, recordedEvents);

    await assert.rejects(
      () => executeTranscodeJob(ctx, JOB_ID),
      /worker_monitoring update failed/,
    );

    // First set() call is the claim; second is the failure/retry update.
    assert.equal(jobsSetCalls.length, 2);
    assert.equal(jobsSetCalls[1].status, "queued");
    assert.equal(jobsSetCalls[1].attempts, 1);
    assert.equal(jobsSetCalls[1].worker_id, null);
    assert.equal(jobsSetCalls[1].failed_at, null);

    assert.equal(workersSetCalls.length, 2);
    assert.equal(workersSetCalls[1].status, "ready");
    assert.equal(workersSetCalls[1].job_id, null);

    const jobFailedEvent = recordedEvents.find((e) => e.event === "job_failed");
    assert.ok(jobFailedEvent, "JOB_FAILED event should be recorded");
    assert.equal(jobFailedEvent?.metadata?.["willRetry"], true);
    assert.equal(jobFailedEvent?.metadata?.["attempts"], 1);
  });

  it("marks a job FAILED once max_attempts is reached", async () => {
    const jobsSetCalls: any[] = [];
    const workersSetCalls: any[] = [];
    const recordedEvents: Array<{
      event: FleetEventType;
      jobId?: string | null;
      metadata?: Readonly<Record<string, unknown>>;
    }> = [];

    const db = buildFakeDb({
      jobRow: {
        id: JOB_ID,
        status: "queued",
        worker_id: null,
        video_key: "raw/video.mp4",
        output_prefix: "out/job-1",
        video_size: 0,
        qualities: STANDARD_QUALITIES,
        attempts: 2,
        max_attempts: 3,
        started_at: null,
      },
      workerRow: {
        id: WORKER_ID,
        cpu: 8,
        memory_mb: 16384,
        storage_gb: 200,
        architecture: "arm64",
      },
      workerMonitoringThrows: true,
      jobsSetCalls,
      workersSetCalls,
    });

    const ctx = buildCtx(db, recordedEvents);

    await assert.rejects(() => executeTranscodeJob(ctx, JOB_ID));

    assert.equal(jobsSetCalls.length, 2);
    assert.equal(jobsSetCalls[1].status, "failed");
    assert.equal(jobsSetCalls[1].attempts, 3);
    assert.ok(jobsSetCalls[1].failed_at instanceof Date);

    assert.equal(workersSetCalls.length, 2);
    assert.equal(workersSetCalls[1].status, "failed");

    const jobFailedEvent = recordedEvents.find((e) => e.event === "job_failed");
    assert.equal(jobFailedEvent?.metadata?.["willRetry"], false);
  });

  it("successfully claims a job on an x86_64 worker", async () => {
    const jobsSetCalls: any[] = [];
    const workersSetCalls: any[] = [];
    const recordedEvents: Array<{
      event: FleetEventType;
      jobId?: string | null;
      metadata?: Readonly<Record<string, unknown>>;
    }> = [];

    const db = buildFakeDb({
      jobRow: {
        id: JOB_ID,
        status: "queued",
        worker_id: null,
        video_key: "raw/video.mp4",
        output_prefix: "out/job-1",
        video_size: 0,
        qualities: STANDARD_QUALITIES,
        attempts: 0,
        max_attempts: 3,
        started_at: null,
      },
      workerRow: {
        id: WORKER_ID,
        cpu: 4,
        memory_mb: 8192,
        storage_gb: 50,
        architecture: "x86_64",
      },
      workerMonitoringThrows: true,
      jobsSetCalls,
      workersSetCalls,
    });

    const ctx = buildCtx(db, recordedEvents);

    // It passes the hardware and architecture check, claims ownership, and then throws on worker_monitoring
    await assert.rejects(
      () => executeTranscodeJob(ctx, JOB_ID),
      /worker_monitoring update failed/,
    );

    assert.equal(jobsSetCalls.length, 2);
    assert.equal(jobsSetCalls[0].status, "provisioning");
    assert.equal(jobsSetCalls[0].worker_id, WORKER_ID);
  });

  it("rejects claiming a job when the worker has an unsupported architecture", async () => {
    const jobsSetCalls: unknown[] = [];
    const workersSetCalls: unknown[] = [];
    const recordedEvents: Array<{ event: FleetEventType }> = [];

    const db = buildFakeDb({
      jobRow: {
        id: JOB_ID,
        status: "queued",
        worker_id: null,
        video_key: "raw/video.mp4",
        output_prefix: "out/job-1",
        video_size: 0,
        qualities: STANDARD_QUALITIES,
        attempts: 0,
        max_attempts: 3,
        started_at: null,
      },
      workerRow: {
        id: WORKER_ID,
        cpu: 4,
        memory_mb: 8192,
        storage_gb: 50,
        architecture: "mips" as any,
      },
      jobsSetCalls,
      workersSetCalls,
    });

    const ctx = buildCtx(db, recordedEvents);

    await assert.rejects(
      () => executeTranscodeJob(ctx, JOB_ID),
      /does not meet/,
    );

    assert.equal(jobsSetCalls.length, 0);
  });
});
