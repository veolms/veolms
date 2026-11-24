/**
 * Repairs one packaging fault in fragmented MP4 video segments: two samples
 * of a fragment with the same presentation time.
 *
 * Some lessons (the TypeScript course's among them) were packaged with the
 * first P-frame of every segment given a composition offset of 0 instead of
 * the offset every later P-frame has. That frame then shares its
 * presentation time with the segment's keyframe, and one display slot of the
 * segment is left empty. Chrome and Safari before 27 play it anyway. Safari 27
 * (iOS and macOS) follows the MSE overlap rule: the later frame replaces the
 * keyframe in the track buffer, every other frame of the segment depends on
 * that keyframe, and nothing is ever decoded: the video stays black with the
 * buffer full (`readyState` 1, no frames) while the audio may play.
 *
 * The `trun` box is never encrypted and the fix keeps every size, so it is
 * done on the segment response, before Shaka decrypts (on Apple Shaka
 * decrypts ClearKey content itself) and appends it.
 *
 * A fragment is changed only when the fault is unambiguous. The display slots
 * of a correctly packaged run are its decode times, shifted by the reorder
 * delay. That holds with equal frame durations (25, 30, 50 fps) and with the
 * uneven ones of 23.976 fps, where frames last 3753 or 3754 ticks. The
 * fragment must have exactly one pair of samples sharing a presentation time,
 * every presentation time on a slot, and exactly one slot free. The later
 * sample of the pair (the one not marked as a sync sample) is moved to that
 * slot, which is where the stream's own picture order puts it.
 */

const TRUN_DATA_OFFSET = 0x1;
const TRUN_FIRST_SAMPLE_FLAGS = 0x4;
const TRUN_SAMPLE_DURATION = 0x100;
const TRUN_SAMPLE_SIZE = 0x200;
const TRUN_SAMPLE_FLAGS = 0x400;
const TRUN_SAMPLE_CTO = 0x800;

const TFHD_BASE_DATA_OFFSET = 0x1;
const TFHD_SAMPLE_DESCRIPTION_INDEX = 0x2;
const TFHD_DEFAULT_SAMPLE_DURATION = 0x8;
const TFHD_DEFAULT_SAMPLE_SIZE = 0x10;
const TFHD_DEFAULT_SAMPLE_FLAGS = 0x20;

/** `sample_is_non_sync_sample` in ISO/IEC 14496-12 sample flags. */
const SAMPLE_IS_NON_SYNC = 0x10000;

/** How many frames the first presentation time may sit off the first decode time. */
const MAX_REORDER_DELAY = 16;

interface Box {
  type: string;
  start: number;
  end: number;
}

function* childBoxes(
  view: DataView,
  start: number,
  end: number,
): Generator<Box> {
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return;
      const high = view.getUint32(offset + 8);
      const low = view.getUint32(offset + 12);
      size = high * 2 ** 32 + low;
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) return;
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    yield { type, start: offset + header, end: offset + size };
    offset += size;
  }
}

interface TrackDefaults {
  duration: number | null;
  flags: number | null;
}

function readTfhd(view: DataView, box: Box): TrackDefaults | null {
  if (box.end - box.start < 8) return null;
  const flags = view.getUint32(box.start) & 0xffffff;
  let p = box.start + 8;
  if (flags & TFHD_BASE_DATA_OFFSET) p += 8;
  if (flags & TFHD_SAMPLE_DESCRIPTION_INDEX) p += 4;
  let duration: number | null = null;
  if (flags & TFHD_DEFAULT_SAMPLE_DURATION) {
    if (p + 4 > box.end) return null;
    duration = view.getUint32(p);
    p += 4;
  }
  if (flags & TFHD_DEFAULT_SAMPLE_SIZE) p += 4;
  let defaultFlags: number | null = null;
  if (flags & TFHD_DEFAULT_SAMPLE_FLAGS) {
    if (p + 4 > box.end) return null;
    defaultFlags = view.getUint32(p);
  }
  return { duration, flags: defaultFlags };
}

/** Repairs one `traf`; returns how many samples it changed (0 or 1). */
function repairTraf(
  view: DataView,
  traf: Box,
  defaultDuration: number | null,
): number {
  let defaults: TrackDefaults = { duration: defaultDuration, flags: null };
  let trun: Box | null = null;
  for (const child of childBoxes(view, traf.start, traf.end)) {
    if (child.type === "tfhd") {
      const tfhd = readTfhd(view, child);
      if (!tfhd) return 0;
      defaults = {
        duration: tfhd.duration ?? defaultDuration,
        flags: tfhd.flags,
      };
    } else if (child.type === "trun") {
      // More than one run per fragment is not what this repair is for.
      if (trun) return 0;
      trun = child;
    }
  }
  if (!trun || trun.end - trun.start < 8) return 0;

  const version = view.getUint8(trun.start);
  const flags = view.getUint32(trun.start) & 0xffffff;
  if (!(flags & TRUN_SAMPLE_CTO)) return 0;
  const count = view.getUint32(trun.start + 4);
  let p = trun.start + 8;
  if (flags & TRUN_DATA_OFFSET) p += 4;
  let firstSampleFlags: number | null = null;
  if (flags & TRUN_FIRST_SAMPLE_FLAGS) {
    firstSampleFlags = view.getUint32(p);
    p += 4;
  }
  const entrySize =
    (flags & TRUN_SAMPLE_DURATION ? 4 : 0) +
    (flags & TRUN_SAMPLE_SIZE ? 4 : 0) +
    (flags & TRUN_SAMPLE_FLAGS ? 4 : 0) +
    4;
  if (count < 3 || p + count * entrySize > trun.end) return 0;

  const decode: number[] = [];
  const presentation: number[] = [];
  const ctoOffsets: number[] = [];
  const nonSync: boolean[] = [];
  let dts = 0;
  let firstDuration = 0;
  let lastDuration = 0;
  for (let index = 0; index < count; index += 1) {
    let sampleDuration = defaults.duration;
    if (flags & TRUN_SAMPLE_DURATION) {
      sampleDuration = view.getUint32(p);
      p += 4;
    }
    if (flags & TRUN_SAMPLE_SIZE) p += 4;
    let sampleFlags =
      index === 0 && firstSampleFlags !== null
        ? firstSampleFlags
        : defaults.flags;
    if (flags & TRUN_SAMPLE_FLAGS) {
      sampleFlags = view.getUint32(p);
      p += 4;
    }
    const cto = version === 0 ? view.getUint32(p) : view.getInt32(p);
    ctoOffsets.push(p);
    p += 4;
    if (!sampleDuration) return 0;
    if (index === 0) firstDuration = sampleDuration;
    lastDuration = sampleDuration;
    decode.push(dts);
    presentation.push(dts + cto);
    nonSync.push(
      sampleFlags !== null && (sampleFlags & SAMPLE_IS_NON_SYNC) !== 0,
    );
    dts += sampleDuration;
  }
  const end = dts;
  // The decode timeline, continued past either end of the run at the
  // duration of the frame there.
  const slotAt = (k: number): number =>
    k < 0
      ? k * firstDuration
      : k < count
        ? decode[k]!
        : end + (k - count) * lastDuration;

  const firstAt = new Map<number, number>();
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index < count; index += 1) {
    const time = presentation[index]!;
    const earlier = firstAt.get(time);
    if (earlier === undefined) firstAt.set(time, index);
    else pairs.push([earlier, index]);
  }
  if (pairs.length !== 1) return 0;

  // The slots start where the earliest frame is shown: the decode time that
  // many frames along (the reorder delay).
  const low = Math.min(...presentation);
  let shift: number | null = null;
  for (let k = -MAX_REORDER_DELAY; k <= MAX_REORDER_DELAY; k += 1) {
    if (slotAt(k) === low) {
      shift = k;
      break;
    }
  }
  if (shift === null) return 0;
  const slots = new Set<number>();
  const missing: number[] = [];
  for (let k = shift; k < shift + count; k += 1) {
    const time = slotAt(k);
    slots.add(time);
    if (!firstAt.has(time)) missing.push(time);
  }
  // Every frame must sit on a slot for the free one to be the duplicate's own.
  if (missing.length !== 1) return 0;
  if (presentation.some((time) => !slots.has(time))) return 0;

  const [first, second] = pairs[0]!;
  const moved = nonSync[second] || !nonSync[first] ? second : first;
  const offset = missing[0]! - decode[moved]!;
  if (version === 0 && offset < 0) return 0;
  if (offset > 0x7fffffff || offset < -0x80000000) return 0;
  if (version === 0) view.setUint32(ctoOffsets[moved]!, offset);
  else view.setInt32(ctoOffsets[moved]!, offset);
  return 1;
}

/**
 * Repairs every fragment of an fMP4 media segment in place; returns how many
 * samples were moved. Anything that is not a well-formed fragmented MP4 media
 * segment (an init segment, a TS segment, a text segment) is left untouched.
 */
export function repairDuplicateCompositionTimes(
  data: ArrayBuffer | ArrayBufferView,
  defaultSampleDuration: number | null = null,
): number {
  const view =
    data instanceof ArrayBuffer
      ? new DataView(data)
      : new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.byteLength < 16) return 0;
  let repaired = 0;
  try {
    for (const box of childBoxes(view, 0, view.byteLength)) {
      if (box.type !== "moof") continue;
      for (const traf of childBoxes(view, box.start, box.end)) {
        if (traf.type === "traf") {
          repaired += repairTraf(view, traf, defaultSampleDuration);
        }
      }
    }
  } catch {
    // A malformed segment is appended as it came.
    return repaired;
  }
  return repaired;
}
