import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FfmpegProgressParser,
  type FfmpegProgressData,
} from "../src/progress.ts";

describe("FFmpeg Real-time Progress Parser", () => {
  it("should parse stdout lines and compute progress percentage", () => {
    const emitted: FfmpegProgressData[] = [];
    const parser = new FfmpegProgressParser({
      totalDurationSeconds: 100,
      throttleIntervalMs: 0,
      onProgress: (data) => {
        emitted.push(data);
      },
    });

    const mockOutput = [
      "frame=120",
      "fps=29.97",
      "speed=1.5x",
      "out_time_us=50000000",
      "progress=continue",
    ].join("\n");

    parser.parseChunk(mockOutput);

    const latest = parser.getLatest();
    assert.equal(latest.processedSeconds, 50);
    assert.equal(latest.progressPercent, 50);
    assert.equal(latest.fps, 29.97);
    assert.equal(latest.speed, 1.5);
    assert.equal(latest.frame, 120);
    assert.equal(emitted.length, 1);
  });

  it("should mark completion on progress=end", () => {
    let completed = false;
    const parser = new FfmpegProgressParser({
      totalDurationSeconds: 60,
      throttleIntervalMs: 0,
      onProgress: (data) => {
        if (data.isComplete) {
          completed = true;
        }
      },
    });

    parser.parseChunk("out_time_us=60000000\nprogress=end\n");

    assert.equal(completed, true);
  });

  it("preserves progress records split across stdout chunks", () => {
    const parser = new FfmpegProgressParser({
      totalDurationSeconds: 100,
      throttleIntervalMs: 0,
    });

    parser.parseChunk("out_time_us=250");
    parser.parseChunk("00000\nprogress=continue\n");

    assert.equal(parser.getLatest().processedSeconds, 25);
    assert.equal(parser.getLatest().progressPercent, 25);
  });
});
