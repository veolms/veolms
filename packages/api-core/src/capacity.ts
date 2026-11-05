import { existsSync, readFileSync } from "node:fs";
import { cpus, freemem, totalmem } from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";

import {
  getDatabasePoolMetrics,
  isDatabaseBossUnreachable,
} from "@veolms/database";
import type { FastifyInstance } from "fastify";

/**
 * Whether this server has room for more requests, for the proxy in front of
 * it (GET /v1/ready/capacity, asked about once a second). A server that says
 * it is full keeps serving what it has; the proxy sends new requests to the
 * next server with room.
 *
 * Full means any of: the whole machine's CPU over CAPACITY_CPU_FULL_PERCENT
 * (5 s average, Postgres included, so it is the same answer from every API
 * process on the machine), memory in use over CAPACITY_MEMORY_FULL_PERCENT,
 * the event loop late by more than 200 ms, more requests waiting for a
 * database connection than a pool holds, or the drain file present. It has
 * room again only when everything is back under the lower "room" levels, so
 * it does not flip on and off around one value.
 */
export interface CapacityThresholds {
  cpuFullPercent: number;
  cpuRoomPercent: number;
  memoryFullPercent: number;
  memoryRoomPercent: number;
  eventLoopFullMs: number;
  eventLoopRoomMs: number;
}

export interface CapacitySample {
  cpuPercent: number;
  memoryPercent: number;
  eventLoopDelayMs: number;
  poolsOverloaded: boolean;
  draining: boolean;
  /**
   * This server has not reached the database's boss for 5 s: cut off, or a
   * takeover is running. Its users are better served by a server that can.
   */
  bossUnreachable?: boolean;
}

export interface CapacityState {
  full: boolean;
  /** Why the server is full; null when it has room. */
  reason: string | null;
}

export interface CapacityReport extends CapacitySample, CapacityState {}

/** The next state from the last one and a new sample (hysteresis). */
export function nextCapacityState(
  previous: CapacityState,
  sample: CapacitySample,
  limits: CapacityThresholds,
): CapacityState {
  if (sample.draining) return { full: true, reason: "draining" };
  if (sample.poolsOverloaded) return { full: true, reason: "database pool" };
  if (sample.bossUnreachable) {
    return { full: true, reason: "database boss unreachable" };
  }
  if (!previous.full) {
    if (sample.cpuPercent >= limits.cpuFullPercent) {
      return { full: true, reason: "cpu" };
    }
    if (sample.memoryPercent >= limits.memoryFullPercent) {
      return { full: true, reason: "memory" };
    }
    if (sample.eventLoopDelayMs >= limits.eventLoopFullMs) {
      return { full: true, reason: "event loop" };
    }
    return { full: false, reason: null };
  }
  const stillFull =
    sample.cpuPercent >= limits.cpuRoomPercent
      ? "cpu"
      : sample.memoryPercent >= limits.memoryRoomPercent
        ? "memory"
        : sample.eventLoopDelayMs >= limits.eventLoopRoomMs
          ? "event loop"
          : null;
  return stillFull
    ? { full: true, reason: stillFull }
    : { full: false, reason: null };
}

/** Room levels below full ones, whatever was configured. */
export function capacityThresholds(config: {
  CAPACITY_CPU_FULL_PERCENT: number;
  CAPACITY_CPU_ROOM_PERCENT: number;
  CAPACITY_MEMORY_FULL_PERCENT: number;
  CAPACITY_MEMORY_ROOM_PERCENT: number;
}): CapacityThresholds {
  const cpuFull = config.CAPACITY_CPU_FULL_PERCENT;
  const memoryFull = config.CAPACITY_MEMORY_FULL_PERCENT;
  return {
    cpuFullPercent: cpuFull,
    cpuRoomPercent: Math.min(config.CAPACITY_CPU_ROOM_PERCENT, cpuFull - 5),
    memoryFullPercent: memoryFull,
    memoryRoomPercent: Math.min(
      config.CAPACITY_MEMORY_ROOM_PERCENT,
      memoryFull - 5,
    ),
    eventLoopFullMs: 200,
    eventLoopRoomMs: 100,
  };
}

interface CpuTimes {
  idle: number;
  total: number;
}

function readCpuTimes(): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

/**
 * Memory in use, in percent. On Linux from MemAvailable, which counts the
 * page cache as free (it is given back on demand); elsewhere from the free
 * memory the OS reports.
 */
function readMemoryPercent(): number {
  try {
    const info = readFileSync("/proc/meminfo", "utf8");
    const total = /^MemTotal:\s+(\d+)/m.exec(info)?.[1];
    const available = /^MemAvailable:\s+(\d+)/m.exec(info)?.[1];
    if (total && available) {
      return 100 * (1 - Number(available) / Number(total));
    }
  } catch {
    // Not Linux.
  }
  return 100 * (1 - freemem() / totalmem());
}

const SAMPLE_INTERVAL_MS = 1_000;
const CPU_WINDOW_SAMPLES = 5;

let report: CapacityReport = {
  cpuPercent: 0,
  memoryPercent: 0,
  eventLoopDelayMs: 0,
  poolsOverloaded: false,
  draining: false,
  full: false,
  reason: null,
};

/** The latest capacity report (room until the monitor has run). */
export function getCapacity(): CapacityReport {
  return report;
}

export function registerCapacityMonitor(
  app: FastifyInstance,
  options: { thresholds: CapacityThresholds; drainFile?: string },
): void {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const window: CpuTimes[] = [readCpuTimes()];
  let state: CapacityState = { full: false, reason: null };

  const timer = setInterval(() => {
    window.push(readCpuTimes());
    if (window.length > CPU_WINDOW_SAMPLES + 1) window.shift();
    const first = window[0];
    const last = window[window.length - 1];
    const totalDelta = last && first ? last.total - first.total : 0;
    const idleDelta = last && first ? last.idle - first.idle : 0;
    const sample: CapacitySample = {
      cpuPercent: totalDelta > 0 ? 100 * (1 - idleDelta / totalDelta) : 0,
      memoryPercent: readMemoryPercent(),
      eventLoopDelayMs: delay.percentile(99) / 1e6,
      poolsOverloaded: getDatabasePoolMetrics().some(
        (pool) => pool.waiting > pool.max,
      ),
      draining: options.drainFile ? existsSync(options.drainFile) : false,
      bossUnreachable: isDatabaseBossUnreachable(),
    };
    delay.reset();
    const next = nextCapacityState(state, sample, options.thresholds);
    if (next.full !== state.full) {
      app.log.warn(
        {
          cpuPercent: Math.round(sample.cpuPercent),
          memoryPercent: Math.round(sample.memoryPercent),
          eventLoopDelayMs: Math.round(sample.eventLoopDelayMs),
          reason: next.reason,
        },
        next.full
          ? "Server is full: new requests go to other servers"
          : "Server has room again",
      );
    }
    state = next;
    report = { ...sample, ...next };
  }, SAMPLE_INTERVAL_MS);
  timer.unref();

  app.addHook("onClose", async () => {
    clearInterval(timer);
    delay.disable();
  });
}
