import { z } from "zod";
import { videoQualityLevelSchema, type VideoQualityLevel } from "./quality.ts";

export interface MonitoringState {
  workerId: string;
  nextCheckAt: Date;
  lastCheckAt: Date | null;
  estimatedDurationSec: number;
  progressPercent: number;
  lastProgressAt: Date | null;
  monitoringAttempts: number;
  checkIntervalSec: number;
  updatedAt: Date;
}

export interface ProgressUpdate {
  workerId: string;
  jobId: string;
  progressPercent: number;
  processedSeconds: number;
  totalDurationSeconds: number;
  fps: number;
  speed: number;
  currentQuality: VideoQualityLevel;
}

export const progressUpdateSchema = z.object({
  workerId: z.string().uuid(),
  jobId: z.string().uuid(),
  progressPercent: z.number().min(0).max(100),
  processedSeconds: z.number().min(0),
  totalDurationSeconds: z.number().min(0),
  fps: z.number().min(0),
  speed: z.number().min(0),
  currentQuality: videoQualityLevelSchema,
});

export interface MonitoringConfig {
  heartbeatTimeoutSeconds: number;
  minCheckIntervalSeconds: number;
  maxCheckIntervalSeconds: number;
  defaultCheckIntervalSeconds: number;
}

export const defaultMonitoringConfig: MonitoringConfig = {
  heartbeatTimeoutSeconds: 90,
  minCheckIntervalSeconds: 15,
  maxCheckIntervalSeconds: 300,
  defaultCheckIntervalSeconds: 30,
};
