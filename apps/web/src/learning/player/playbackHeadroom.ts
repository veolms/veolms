import { getShakaMeasuredBandwidth } from "@veolms/video-player/shaka-preload";

import { readDeviceTier } from "./deviceTier";

/** Below this (megabits per second) the lesson on screen needs the whole link. */
const MIN_SPARE_LINK_MBPS = 5;
/**
 * At or below this many cores a second video pipeline costs the one on
 * screen: an older i3 or Ryzen laptop (4 threads) or a budget phone decoding
 * without a graphics card.
 */
const MAX_LEAN_CPU_CORES = 4;

interface ConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
}

/**
 * Whether the device can run a second, hidden player (its own decoder and
 * memory) beside the lesson on screen: not one short of memory, nor one with
 * 4 cores or fewer. The link does not decide this: what the second player
 * plays was preloaded anyway, and it makes the switch to the next lesson
 * instant, which a slow link needs most (tested: without it a lesson
 * change on a dipping 4G link stalled 9 s instead of 3 s).
 */
export function canAffordSecondPlayer(): boolean {
  const tier = readDeviceTier();
  if (tier.lowMemory) return false;
  return !(tier.cpuCores !== null && tier.cpuCores <= MAX_LEAN_CPU_CORES);
}

/**
 * Whether this device and connection have room for a guess: a lesson
 * preloaded because the pointer rests on it in the course content list (on
 * a computer that happens all the time, mostly for lessons never opened).
 * It downloads segments beside the lesson on screen. (The next lesson,
 * preloaded in this one's last minute, is not a guess and comes when this
 * one's remainder is already buffered; it is left to Data Saver alone.)
 *
 * Learners' stalls came mostly from links under 2 Mbps and from 4-core,
 * 8 GB laptops and 4 GB phones (production's incident log, 13-15 Nov),
 * where that work took bandwidth and processor from the video being
 * watched. On those it is not done; the lesson on screen gets everything.
 *
 * No: Data Saver on, a connection the browser rates below 4G or measures
 * under 5 Mbps, the player's own last measurement under 5 Mbps, a
 * low-memory device, or 4 cores or fewer.
 */
export function canAffordSpeculativePlayback(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: ConnectionInfo })
    .connection;
  if (connection?.saveData === true) return false;
  if (
    typeof connection?.effectiveType === "string" &&
    connection.effectiveType !== "4g"
  ) {
    return false;
  }
  if (
    typeof connection?.downlink === "number" &&
    connection.downlink > 0 &&
    connection.downlink < MIN_SPARE_LINK_MBPS
  ) {
    return false;
  }
  const measured = getShakaMeasuredBandwidth();
  if (measured !== null && measured < MIN_SPARE_LINK_MBPS * 1_000_000) {
    return false;
  }
  return canAffordSecondPlayer();
}
