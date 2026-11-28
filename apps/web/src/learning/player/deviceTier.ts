/**
 * What kind of device the lesson plays on, as far as the browser says: a
 * laptop with 4 GB of memory, or a phone with two cores, cannot carry what
 * a desktop can. The player keeps less video in memory on it, lets
 * automatic quality go no higher than 720p, prepares no second video out
 * of sight, and leaves the ambient glow off (each of those is a choice the
 * learner can still make). Chromium reports `deviceMemory` in whole
 * gigabytes up to 8 and `hardwareConcurrency` everywhere; a browser that
 * reports neither is taken for an ordinary one.
 *
 * Brave makes both up so that sites cannot tell devices apart: a 16 GB,
 * 16-core PC read as 4 GB and 7 cores (Brave 1.100, 28 Nov 2026), and every
 * Brave computer played the lean way (720p at most, a short buffer). There
 * the figures are left out: a computer plays the ordinary way, and a phone
 * the lean way, the safer guess for one.
 */

export interface DeviceTier {
  /** Memory or cores low enough to play the lean way (see above). */
  lowMemory: boolean;
  /** Gigabytes of memory the browser reports (Chromium only), or null. */
  deviceMemoryGb: number | null;
  /** Logical processor cores the browser reports, or null. */
  cpuCores: number | null;
}

const LOW_MEMORY_GB = 4;
const LOW_CORE_COUNT = 2;

let tier: DeviceTier | null = null;

export function readDeviceTier(): DeviceTier {
  if (tier) return tier;
  const nav =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { deviceMemory?: number });
  if (nav && "brave" in nav) {
    tier = {
      lowMemory: /android/iu.test(nav.userAgent),
      deviceMemoryGb: null,
      cpuCores: null,
    };
    return tier;
  }
  const deviceMemoryGb =
    typeof nav?.deviceMemory === "number" && Number.isFinite(nav.deviceMemory)
      ? nav.deviceMemory
      : null;
  const cpuCores =
    typeof nav?.hardwareConcurrency === "number" &&
    Number.isFinite(nav.hardwareConcurrency) &&
    nav.hardwareConcurrency > 0
      ? nav.hardwareConcurrency
      : null;
  tier = {
    lowMemory:
      (deviceMemoryGb !== null && deviceMemoryGb <= LOW_MEMORY_GB) ||
      (cpuCores !== null && cpuCores <= LOW_CORE_COUNT),
    deviceMemoryGb,
    cpuCores,
  };
  return tier;
}

export function isLowMemoryDevice(): boolean {
  return readDeviceTier().lowMemory;
}

/** For tests: reads the browser again on the next call. */
export function resetDeviceTierForTests(): void {
  tier = null;
}
