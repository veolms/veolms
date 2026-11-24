/// <reference types="node" />
/**
 * Two frames of one segment at the same presentation time. The patterns are
 * production's of 24 Nov 2026: TypeScript-course lessons 1, 2 and 28 give
 * the first P-frame of every segment a composition offset of 0, so it lands
 * on the keyframe's time, and Safari 27 then decodes nothing (the keyframe
 * is replaced in its track buffer). Lesson 3 is packaged correctly.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { repairDuplicateCompositionTimes } from "../fmp4-composition-repair";

const SYNC = 0x00000000;
const NON_SYNC = 0x00010000;

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  let offset = 8;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u32(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, i) => view.setUint32(i * 4, value >>> 0));
  return out;
}

/**
 * A video segment shaped like the packager's: tfhd default duration, trun
 * with size, flags and offset per sample. Given one duration per sample (as
 * 23.976 fps lessons are packaged), the trun carries them and tfhd has none.
 */
function segment(
  duration: number | number[],
  offsets: number[],
  base = 0,
  version = 0,
): Uint8Array {
  const perSample = Array.isArray(duration);
  const tfhd = perSample
    ? box("tfhd", u32(0x020002, 1, 1))
    : box("tfhd", u32(0x02000a, 1, 1, duration));
  const tfdt = box("tfdt", u32(0, base));
  const rows: number[] = [];
  offsets.forEach((cto, i) => {
    if (perSample) rows.push(duration[i]!);
    rows.push(1000, i === 0 ? SYNC : NON_SYNC, cto);
  });
  const trun = box(
    "trun",
    u32((version << 24) | (perSample ? 0x000f01 : 0x000e01), offsets.length, 0),
    u32(...rows),
  );
  const traf = box("traf", tfhd, tfdt, trun);
  const moof = box("moof", box("mfhd", u32(0, 1)), traf);
  return new Uint8Array([
    ...box("styp", u32(0x6d736468, 0)),
    ...moof,
    ...box("mdat", new Uint8Array(16)),
  ]);
}

function offsetsOf(data: Uint8Array): number[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const at = data.findIndex(
    (_, i) => String.fromCharCode(...data.subarray(i, i + 4)) === "trun",
  );
  const perSample = (view.getUint32(at + 4) & 0x100) !== 0;
  const row = perSample ? 16 : 12;
  const count = view.getUint32(at + 8);
  const out: number[] = [];
  let p = at + 16;
  for (let i = 0; i < count; i += 1) {
    out.push(view.getUint32(p + row - 4));
    p += row;
  }
  return out;
}

function presentationTimes(
  duration: number | number[],
  offsets: number[],
  base = 0,
): number[] {
  const decode = decodeTimes(duration, offsets.length, base);
  return offsets.map((cto, i) => decode[i]! + cto);
}

/** Decode time of every sample and, last, of the end of the run. */
function decodeTimes(
  duration: number | number[],
  count: number,
  base = 0,
): number[] {
  const out = [base];
  for (let i = 0; i < count; i += 1) {
    out.push(out[i]! + (Array.isArray(duration) ? duration[i]! : duration));
  }
  return out;
}

/**
 * Lesson 7's first 360p segment (23.976 fps, 90 kHz): 150 frames lasting
 * 3753, 3754, 3754, 3754 ticks over and over; a P-frame every 6 frames shown
 * after the 5 B-frames that follow it, the last P after 4. As packaged the
 * first P has offset 0, so it lands on the keyframe's time.
 */
const LESSON7_DURATIONS = Array.from({ length: 150 }, (_, i) =>
  i % 4 === 0 ? 3753 : 3754,
);

function lesson7Offsets(firstP: "packaged" | "correct"): number[] {
  const decode = decodeTimes(LESSON7_DURATIONS, 150);
  return LESSON7_DURATIONS.map((duration, i) => {
    if (i === 0) return duration;
    if ((i - 1) % 6 !== 0) return 0;
    if (i === 1 && firstP === "packaged") return 0;
    return decode[Math.min(i + 6, 150)]! - decode[i]!;
  });
}

/**
 * A 6 s segment at 30 fps as packaged (lesson 28 and lesson 3, in frames):
 * I +1, P +4 with three B-frames at +0 after each, the last P +3. Lesson 28
 * has 0 instead of 4 on the first P.
 */
function thirtyFpsOffsets(firstP: number, frames = 180): number[] {
  const out = [3000, firstP * 3000];
  for (let i = 2; i < frames; i += 1) {
    if (i === frames - 3) out.push(3 * 3000);
    else out.push((i - 1) % 4 === 0 ? 4 * 3000 : 0);
  }
  return out;
}

const lesson28Offsets = (frames = 180) => thirtyFpsOffsets(0, frames);

/** Lesson 2's first 1080p segment (50 fps, 1800 ticks a frame), offsets in frames. */
const LESSON2_P_FRAMES: Record<number, number> = {
  0: 1,
  6: 5,
  11: 5,
  16: 5,
  21: 5,
  26: 5,
  31: 5,
  36: 5,
  41: 5,
  46: 5,
  51: 5,
  56: 5,
  61: 5,
  66: 5,
  71: 5,
  76: 5,
  81: 5,
  86: 5,
  91: 5,
  96: 5,
  101: 5,
  106: 5,
  111: 5,
  116: 5,
  121: 5,
  126: 5,
  131: 5,
  136: 5,
  141: 5,
  146: 4,
  150: 5,
  155: 5,
  160: 5,
  165: 5,
  170: 5,
  175: 5,
  180: 5,
  185: 5,
  190: 5,
  195: 5,
  200: 5,
  205: 4,
  209: 4,
  213: 5,
  218: 5,
  223: 5,
  228: 5,
  233: 5,
  238: 5,
  243: 5,
  248: 5,
  253: 4,
  257: 4,
  261: 5,
  266: 4,
};

describe("repairing two frames at one presentation time", () => {
  it("moves lesson 28's first P-frame to the free slot, as its picture order has it", () => {
    const offsets = lesson28Offsets();
    const data = segment(3000, offsets, 540000);
    const before = presentationTimes(3000, offsets, 540000);
    assert.equal(new Set(before).size, 179, "one duplicate before");

    assert.equal(repairDuplicateCompositionTimes(data), 1);

    const after = offsetsOf(data);
    assert.equal(after[1], 12000, "same offset as every other P-frame");
    assert.deepEqual(after.slice(2), offsets.slice(2), "nothing else moves");
    const times = presentationTimes(3000, after, 540000);
    assert.equal(new Set(times).size, 180, "every frame at its own time");
    assert.deepEqual(
      [...times].sort((a, b) => a - b),
      Array.from({ length: 180 }, (_, i) => 543000 + i * 3000),
      "one frame per slot, none outside the segment",
    );
  });

  it("repairs lesson 2's 50 fps segment the same way (first P gets +5 frames)", () => {
    const offsets = Array.from(
      { length: 270 },
      (_, i) => (LESSON2_P_FRAMES[i] ?? 0) * 1800,
    );
    const data = segment(1800, offsets);
    assert.equal(repairDuplicateCompositionTimes(data), 1);
    assert.equal(offsetsOf(data)[1], 5 * 1800);
    assert.equal(new Set(presentationTimes(1800, offsetsOf(data))).size, 270);
  });

  it("repairs lesson 7's 23.976 fps segment, whose frames are not all one length", () => {
    const offsets = lesson7Offsets("packaged");
    // As production has them: P-frames at +22522 and +22523, the last at +18769.
    assert.deepEqual(
      [offsets[7], offsets[13], offsets[145]],
      [22522, 22523, 18769],
    );
    const data = segment(LESSON7_DURATIONS, offsets, 0);
    assert.equal(
      new Set(presentationTimes(LESSON7_DURATIONS, offsets)).size,
      149,
      "one duplicate before",
    );

    assert.equal(repairDuplicateCompositionTimes(data), 1);

    const after = offsetsOf(data);
    assert.equal(after[1], 22523, "shown after the 5 B-frames that follow it");
    assert.deepEqual(after.slice(2), offsets.slice(2), "nothing else moves");
    assert.deepEqual(
      presentationTimes(LESSON7_DURATIONS, after).sort((a, b) => a - b),
      decodeTimes(LESSON7_DURATIONS, 150).slice(1),
      "one frame per slot, none outside the segment",
    );
  });

  it("leaves a correctly packaged 23.976 fps segment alone", () => {
    const data = segment(LESSON7_DURATIONS, lesson7Offsets("correct"));
    const copy = data.slice();
    assert.equal(repairDuplicateCompositionTimes(data), 0);
    assert.deepEqual(data, copy);
  });

  it("leaves a correctly packaged segment (lesson 3) alone", () => {
    const offsets = thirtyFpsOffsets(4);
    const data = segment(3000, offsets);
    const copy = data.slice();
    assert.equal(repairDuplicateCompositionTimes(data), 0);
    assert.deepEqual(data, copy);
  });

  it("does not guess when more than one pair collides", () => {
    const offsets = lesson28Offsets();
    offsets[6] = 3000; // frame 6 now also lands on frame 7's time
    const data = segment(3000, offsets);
    const copy = data.slice();
    assert.equal(repairDuplicateCompositionTimes(data), 0);
    assert.deepEqual(data, copy);
  });

  it("works on a view into a larger buffer", () => {
    const inner = segment(3000, lesson28Offsets(60));
    assert.equal(
      new Set(presentationTimes(3000, lesson28Offsets(60))).size,
      59,
    );
    const outer = new Uint8Array(inner.length + 32);
    outer.set(inner, 16);
    const view = outer.subarray(16, 16 + inner.length);
    assert.equal(repairDuplicateCompositionTimes(view), 1);
    assert.equal(offsetsOf(view)[1], 12000);
  });

  it("ignores what is not a fragmented MP4 media segment", () => {
    assert.equal(repairDuplicateCompositionTimes(new Uint8Array(0)), 0);
    assert.equal(
      repairDuplicateCompositionTimes(
        new Uint8Array([
          0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
        ]),
      ),
      0,
    );
    const init = box("ftyp", u32(0x69736f6d, 0));
    assert.equal(
      repairDuplicateCompositionTimes(
        new Uint8Array([...init, ...box("moov", new Uint8Array(8))]),
      ),
      0,
    );
    // Audio: no composition offsets in the run.
    const audioTrun = box("trun", u32(0x000201, 3, 0), u32(371, 372, 373));
    const audio = box(
      "moof",
      box("traf", box("tfhd", u32(0x02002a, 1, 1024, 0)), audioTrun),
    );
    assert.equal(repairDuplicateCompositionTimes(audio), 0);
    // Truncated box sizes must not throw.
    const broken = segment(3000, lesson28Offsets()).slice(0, 60);
    assert.equal(repairDuplicateCompositionTimes(broken), 0);
  });
});
