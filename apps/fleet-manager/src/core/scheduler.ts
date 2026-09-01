import type { FleetManagerConfig } from "@veolms/config";

export interface CalculateNextCheckOptions {
  estimatedDurationSec: number;
  progressPercent: number;
  lastCheckIntervalSec?: number;
}

export interface NextCheckResult {
  nextCheckAt: Date;
  checkIntervalSec: number;
}

export interface Scheduler {
  calculateNextCheck(options: CalculateNextCheckOptions): NextCheckResult;
}

export function calculateNextCheckInterval(options: {
  progressPercentage: number;
  estimatedDurationSeconds: number;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
}): number {
  const {
    progressPercentage,
    estimatedDurationSeconds,
    minIntervalSeconds,
    maxIntervalSeconds,
  } = options;

  if (progressPercentage >= 99.0) {
    return minIntervalSeconds;
  }

  const remainingPercent =
    (100 - Math.min(100, Math.max(0, progressPercentage))) / 100;
  const estimatedRemainingSec =
    Math.max(10, estimatedDurationSeconds) * remainingPercent;
  const targetInterval = Math.round(estimatedRemainingSec / 2);

  return Math.max(
    minIntervalSeconds,
    Math.min(maxIntervalSeconds, targetInterval),
  );
}

export function createScheduler(config: FleetManagerConfig): Scheduler {
  const minInterval = config.MIN_CHECK_INTERVAL_SECONDS;
  const maxInterval = config.MAX_CHECK_INTERVAL_SECONDS;

  return {
    calculateNextCheck(options: CalculateNextCheckOptions): NextCheckResult {
      const checkIntervalSec = calculateNextCheckInterval({
        progressPercentage: options.progressPercent,
        estimatedDurationSeconds: options.estimatedDurationSec,
        minIntervalSeconds: minInterval,
        maxIntervalSeconds: maxInterval,
      });

      return {
        nextCheckAt: new Date(Date.now() + checkIntervalSec * 1000),
        checkIntervalSec,
      };
    },
  };
}
