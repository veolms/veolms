import type { Architecture, WorkerSpec } from "@veolms/fleet-types";

/**
 * NOTE on why this is a candidate list, not AWS's attribute-based
 * instance selection (RunInstances' `InstanceRequirements` +
 * `AllowedInstanceTypes`): that API only exists on `CreateFleet` /
 * `RequestSpotFleet` (via a Launch Template), not on plain
 * `RunInstancesCommand` — the AWS SDK's `RunInstancesRequest` type has no
 * `InstanceRequirements` field at all. Adopting it here would mean
 * introducing and maintaining an EC2 Launch Template resource plus new
 * `ec2:CreateFleet`/`ec2:CreateLaunchTemplate*` IAM permissions, a much
 * larger change than this feature's actual goal — not depending on one
 * hardcoded instance type per size bucket. A same-size candidate list
 * tried in order on `RunInstances`, falling through only on a
 * capacity-class error, achieves that with the existing `RunInstances`
 * IAM surface and no new AWS resource types.
 */
export interface InstanceProfile {
  readonly instanceCandidates: readonly string[];
  readonly cpu: number;
  readonly memoryMb: number;
  readonly architecture: Architecture;
  readonly isArm: boolean;
}

// Compute-optimized Graviton families only — c7g preferred (broadest
// current availability/price-performance), c8g and c6g as same-size
// fallbacks when the preferred type lacks Spot/On-Demand capacity.
// Deliberately excludes burstable t4g: ffmpeg holds CPU continuously
// through a transcode, and burstable credits would throttle mid-job.
//
// Graviton uniquely offers a `.medium` (1 vCPU/2GB) size, giving ARM64 a
// true NANO tier that x86 compute-optimized families don't have (see
// X86_64_INSTANCE_PROFILES below).
//
// `c8g` (Graviton4) is a newer family with narrower regional availability
// as of 2026 — verify with:
//   aws ec2 describe-instance-type-offerings --region <region> \
//     --filters Name=instance-type,Values=c8g.*
// before relying on it in a region this hasn't been checked against.
export const ARM64_INSTANCE_PROFILES: readonly InstanceProfile[] = [
  {
    instanceCandidates: ["c7g.medium", "c8g.medium", "c6g.medium"],
    cpu: 1,
    memoryMb: 2048,
    architecture: "arm64",
    isArm: true,
  },
  {
    instanceCandidates: ["c7g.large", "c8g.large", "c6g.large"],
    cpu: 2,
    memoryMb: 4096,
    architecture: "arm64",
    isArm: true,
  },
  {
    instanceCandidates: ["c7g.xlarge", "c8g.xlarge", "c6g.xlarge"],
    cpu: 4,
    memoryMb: 8192,
    architecture: "arm64",
    isArm: true,
  },
  {
    instanceCandidates: ["c7g.2xlarge", "c8g.2xlarge", "c6g.2xlarge"],
    cpu: 8,
    memoryMb: 16384,
    architecture: "arm64",
    isArm: true,
  },
  {
    instanceCandidates: ["c7g.4xlarge", "c8g.4xlarge", "c6g.4xlarge"],
    cpu: 16,
    memoryMb: 32768,
    architecture: "arm64",
    isArm: true,
  },
  {
    instanceCandidates: ["c7g.8xlarge", "c8g.8xlarge", "c6g.8xlarge"],
    cpu: 32,
    memoryMb: 65536,
    architecture: "arm64",
    isArm: true,
  },
];

// x86 compute-optimized families (c6i preferred, c5/c7i as same-size
// fallbacks). No burstable t3 for the same reason as ARM64 above. x86
// compute-optimized families have no `.medium` size — `.large` (2 vCPU/
// 4GB) is the smallest, so a NANO-tier request resolves to the same
// candidates as MICRO here (not a bug — there's no smaller real instance).
export const X86_64_INSTANCE_PROFILES: readonly InstanceProfile[] = [
  {
    instanceCandidates: ["c6i.large", "c5.large", "c7i.large"],
    cpu: 2,
    memoryMb: 4096,
    architecture: "x86_64",
    isArm: false,
  },
  {
    instanceCandidates: ["c6i.xlarge", "c5.xlarge", "c7i.xlarge"],
    cpu: 4,
    memoryMb: 8192,
    architecture: "x86_64",
    isArm: false,
  },
  {
    instanceCandidates: ["c6i.2xlarge", "c5.2xlarge", "c7i.2xlarge"],
    cpu: 8,
    memoryMb: 16384,
    architecture: "x86_64",
    isArm: false,
  },
  {
    instanceCandidates: ["c6i.4xlarge", "c5.4xlarge", "c7i.4xlarge"],
    cpu: 16,
    memoryMb: 32768,
    architecture: "x86_64",
    isArm: false,
  },
  {
    instanceCandidates: ["c6i.8xlarge", "c5.8xlarge", "c7i.8xlarge"],
    cpu: 32,
    memoryMb: 65536,
    architecture: "x86_64",
    isArm: false,
  },
];

/**
 * Resolves the ordered list of same-size instance-type candidates for a
 * worker spec (most-preferred first). `createWorker` tries each in turn,
 * moving to the next only on a capacity-class RunInstances error, instead
 * of hardcoding one exact type per size bucket and failing outright if
 * that one type has no Spot/On-Demand capacity in the target AZ.
 */
export function selectOptimalInstanceType(spec: WorkerSpec): readonly string[] {
  const isArm = spec.architecture === "arm64";
  const profiles = isArm ? ARM64_INSTANCE_PROFILES : X86_64_INSTANCE_PROFILES;

  // Find the smallest tier meeting or exceeding CPU and memory requirements
  const matched = profiles.find(
    (profile) => profile.cpu >= spec.cpu && profile.memoryMb >= spec.memoryMb,
  );

  if (matched) {
    return matched.instanceCandidates;
  }

  // Fallback to highest available tier's candidates. This under-provisions
  // the job relative to its own stated requirements, so log it — silently
  // returning the largest tier would otherwise leave no trace of why a
  // job later runs slowly or gets OOM-killed.
  const fallback = profiles[profiles.length - 1];
  const fallbackCandidates = fallback
    ? fallback.instanceCandidates
    : isArm
      ? ["c7g.xlarge"]
      : ["c6i.xlarge"];
  console.warn(
    `[fleet-provider-aws] No ${isArm ? "arm64" : "x86_64"} instance profile meets the requested ${spec.cpu} vCPU / ${spec.memoryMb}MB — falling back to the largest available (${fallbackCandidates.join(", ")}), which may not satisfy the job's requirements.`,
  );
  return fallbackCandidates;
}

/**
 * Intersects a tier's candidate list with an operator-configured
 * EC2_ALLOWED_INSTANCE_TYPES allow-list, if one is set. Falls back to the
 * unfiltered candidate list if the intersection would otherwise be empty
 * (a misconfigured allow-list should never make a job unprovisionable).
 */
export function filterAllowedInstanceTypes(
  candidates: readonly string[],
  allowedInstanceTypes?: readonly string[],
): readonly string[] {
  if (!allowedInstanceTypes || allowedInstanceTypes.length === 0) {
    return candidates;
  }
  const allowSet = new Set(allowedInstanceTypes);
  const filtered = candidates.filter((candidate) => allowSet.has(candidate));
  return filtered.length > 0 ? filtered : candidates;
}
