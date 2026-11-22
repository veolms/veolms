import type { RetryPolicy } from "./types.ts";

/** Defaults: 5 attempts, 100 → 200 → 400 → 800 ms (≈1.5 s worst-case before `unavailable`). */
export const DEFAULT_RETRY_POLICY: Readonly<RetryPolicy> = Object.freeze({
  maxAttempts: 5,
  initialDelayMs: 100,
  factor: 2,
  maxDelayMs: 2000,
});

function finiteOr(
  value: number | undefined,
  fallback: number,
  min: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, value)
    : fallback;
}

/** Fills in defaults and clamps invalid values. */
export function resolveRetryPolicy(
  partial?: Partial<RetryPolicy>,
): RetryPolicy {
  return {
    maxAttempts: Math.floor(
      finiteOr(partial?.maxAttempts, DEFAULT_RETRY_POLICY.maxAttempts, 1),
    ),
    initialDelayMs: finiteOr(
      partial?.initialDelayMs,
      DEFAULT_RETRY_POLICY.initialDelayMs,
      0,
    ),
    factor: finiteOr(partial?.factor, DEFAULT_RETRY_POLICY.factor, 1),
    maxDelayMs: finiteOr(
      partial?.maxDelayMs,
      DEFAULT_RETRY_POLICY.maxDelayMs,
      0,
    ),
  };
}

/** Delay to wait after the `failedAttempt`-th (1-based) failed attempt. */
export function computeRetryDelay(
  policy: RetryPolicy,
  failedAttempt: number,
): number {
  const raw =
    policy.initialDelayMs *
    Math.pow(policy.factor, Math.max(0, failedAttempt - 1));
  return Math.min(raw, policy.maxDelayMs);
}
