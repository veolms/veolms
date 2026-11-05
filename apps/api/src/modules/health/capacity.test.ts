import assert from "node:assert/strict";
import { test } from "node:test";

import {
  capacityThresholds,
  nextCapacityState,
  type CapacitySample,
  type CapacityState,
} from "@veolms/api-core";

const limits = capacityThresholds({
  CAPACITY_CPU_FULL_PERCENT: 80,
  CAPACITY_CPU_ROOM_PERCENT: 65,
  CAPACITY_MEMORY_FULL_PERCENT: 85,
  CAPACITY_MEMORY_ROOM_PERCENT: 75,
});
const room: CapacityState = { full: false, reason: null };
const quiet: CapacitySample = {
  cpuPercent: 30,
  memoryPercent: 40,
  eventLoopDelayMs: 10,
  poolsOverloaded: false,
  draining: false,
};

await test("a quiet server has room", () => {
  assert.deepEqual(nextCapacityState(room, quiet, limits), room);
});

await test("it is full from 80% CPU, 85% memory or a 200 ms late event loop", () => {
  assert.deepEqual(
    nextCapacityState(room, { ...quiet, cpuPercent: 80 }, limits),
    {
      full: true,
      reason: "cpu",
    },
  );
  assert.equal(
    nextCapacityState(room, { ...quiet, cpuPercent: 79 }, limits).full,
    false,
  );
  assert.equal(
    nextCapacityState(room, { ...quiet, memoryPercent: 85 }, limits).reason,
    "memory",
  );
  assert.equal(
    nextCapacityState(room, { ...quiet, eventLoopDelayMs: 250 }, limits).reason,
    "event loop",
  );
});

await test("a full server has room again only below the lower levels", () => {
  const full = nextCapacityState(room, { ...quiet, cpuPercent: 90 }, limits);
  // Between the levels it stays full: no flipping around 80%.
  assert.equal(
    nextCapacityState(full, { ...quiet, cpuPercent: 75 }, limits).full,
    true,
  );
  assert.equal(
    nextCapacityState(full, { ...quiet, cpuPercent: 65 }, limits).full,
    true,
  );
  assert.deepEqual(
    nextCapacityState(full, { ...quiet, cpuPercent: 64 }, limits),
    room,
  );
  // Every signal must be back under its room level.
  assert.equal(
    nextCapacityState(
      full,
      { ...quiet, cpuPercent: 50, memoryPercent: 80 },
      limits,
    ).reason,
    "memory",
  );
});

await test("draining or a database pool with a queue is full at once", () => {
  assert.deepEqual(
    nextCapacityState(room, { ...quiet, draining: true }, limits),
    {
      full: true,
      reason: "draining",
    },
  );
  assert.equal(
    nextCapacityState(room, { ...quiet, poolsOverloaded: true }, limits).reason,
    "database pool",
  );
  const drained = nextCapacityState(room, { ...quiet, draining: true }, limits);
  assert.deepEqual(nextCapacityState(drained, quiet, limits), room);
});

await test("room levels are always below full levels", () => {
  const odd = capacityThresholds({
    CAPACITY_CPU_FULL_PERCENT: 70,
    CAPACITY_CPU_ROOM_PERCENT: 90,
    CAPACITY_MEMORY_FULL_PERCENT: 80,
    CAPACITY_MEMORY_ROOM_PERCENT: 80,
  });
  assert.equal(odd.cpuRoomPercent, 65);
  assert.equal(odd.memoryRoomPercent, 75);
});
