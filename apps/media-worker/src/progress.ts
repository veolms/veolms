export interface FfmpegProgressData {
  outTimeUs: number;
  processedSeconds: number;
  progressPercent: number;
  fps: number;
  speed: number;
  frame: number;
  isComplete: boolean;
}

export interface ProgressTrackerOptions {
  totalDurationSeconds: number;
  throttleIntervalMs?: number;
  onProgress?: (data: FfmpegProgressData) => Promise<void> | void;
}

export class FfmpegProgressParser {
  private readonly totalDurationSeconds: number;
  private readonly throttleIntervalMs: number;
  private readonly onProgress?: (
    data: FfmpegProgressData,
  ) => Promise<void> | void;

  private currentOutTimeUs = 0;
  private currentFps = 0;
  private currentSpeed = 0;
  private currentFrame = 0;
  private lastEmitTimestamp = 0;
  private latestProgressData: FfmpegProgressData | null = null;
  private pendingText = "";

  constructor(options: ProgressTrackerOptions) {
    this.totalDurationSeconds = Math.max(1, options.totalDurationSeconds);
    this.throttleIntervalMs = options.throttleIntervalMs ?? 5000;
    this.onProgress = options.onProgress;
  }

  public parseChunk(chunk: string | Buffer): void {
    const text = this.pendingText + chunk.toString();
    const lines = text.split(/\r?\n/);
    const trailingLine = lines.pop() ?? "";

    // FFmpeg normally terminates every record with a newline, but a final
    // `progress=...` record may arrive at the end of a stream chunk without
    // one. It is safe to emit that complete delimiter record immediately;
    // every other trailing fragment is retained for the next chunk.
    if (
      trailingLine === "progress=continue" ||
      trailingLine === "progress=end"
    ) {
      lines.push(trailingLine);
      this.pendingText = "";
    } else {
      this.pendingText = trailingLine;
    }

    for (const line of lines) {
      this.parseLine(line.trim());
    }
  }

  public parseLine(line: string): void {
    if (!line || !line.includes("=")) {
      return;
    }

    const parts = line.split("=", 2);
    const rawKey = parts[0];
    const rawValue = parts[1];
    if (!rawKey || !rawValue) {
      return;
    }

    const key = rawKey.trim();
    const value = rawValue.trim();

    switch (key) {
      case "out_time_us": {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.currentOutTimeUs = parsed;
        }
        break;
      }
      case "fps": {
        const parsed = parseFloat(value);
        if (Number.isFinite(parsed)) {
          this.currentFps = parsed;
        }
        break;
      }
      case "speed": {
        const numeric = value.replace("x", "").trim();
        const parsed = parseFloat(numeric);
        if (Number.isFinite(parsed)) {
          this.currentSpeed = parsed;
        }
        break;
      }
      case "frame": {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          this.currentFrame = parsed;
        }
        break;
      }
      case "progress": {
        const isEnd = value === "end";
        this.emitProgress(isEnd);
        break;
      }
    }
  }

  public getLatest(): FfmpegProgressData {
    if (this.latestProgressData?.isComplete) {
      return { ...this.latestProgressData };
    }

    const processedSeconds = this.currentOutTimeUs / 1_000_000;
    const progressPercent = Math.min(
      99.9,
      Math.max(0, (processedSeconds / this.totalDurationSeconds) * 100),
    );

    return {
      outTimeUs: this.currentOutTimeUs,
      processedSeconds,
      progressPercent,
      fps: this.currentFps,
      speed: this.currentSpeed,
      frame: this.currentFrame,
      isComplete: false,
    };
  }

  private emitProgress(isComplete: boolean): void {
    const now = Date.now();
    const processedSeconds = isComplete
      ? this.totalDurationSeconds
      : this.currentOutTimeUs / 1_000_000;

    const progressPercent = isComplete
      ? 100.0
      : Math.min(
          99.9,
          Math.max(0, (processedSeconds / this.totalDurationSeconds) * 100),
        );

    const data: FfmpegProgressData = {
      outTimeUs: this.currentOutTimeUs,
      processedSeconds,
      progressPercent,
      fps: this.currentFps,
      speed: this.currentSpeed,
      frame: this.currentFrame,
      isComplete,
    };

    this.latestProgressData = data;

    if (isComplete || now - this.lastEmitTimestamp >= this.throttleIntervalMs) {
      this.lastEmitTimestamp = now;
      if (this.onProgress) {
        try {
          const result = this.onProgress(data);
          if (result && typeof result.catch === "function") {
            result.catch((err) => {
              console.error("Error in progress callback:", err);
            });
          }
        } catch (err) {
          console.error("Synchronous error in progress callback:", err);
        }
      }
    }
  }
}
