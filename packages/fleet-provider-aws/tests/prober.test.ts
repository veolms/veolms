import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { probeVideoMetadata } from "../src/prober.ts";

describe("AWS ffprobe Video Metadata Prober", () => {
  it("should extract metadata correctly from ffprobe JSON stdout", async () => {
    // Create a temporary mock ffprobe executable that returns valid JSON
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ffprobe-test-"));
    const mockFfprobePath = path.join(tempDir, "mock-ffprobe.sh");

    const sampleFfprobeOutput = {
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          width: 1920,
          height: 1080,
          r_frame_rate: "30/1",
          avg_frame_rate: "30/1",
          duration: "120.5",
          bit_rate: "4500000",
        },
        {
          codec_type: "audio",
          codec_name: "aac",
          bit_rate: "128000",
        },
      ],
      format: {
        format_name: "mov,mp4,m4a,3gp,3g2,mj2",
        duration: "120.5",
        size: "67781250",
        bit_rate: "4628000",
      },
    };

    fs.writeFileSync(
      mockFfprobePath,
      `#!/bin/sh\necho '${JSON.stringify(sampleFfprobeOutput)}'\n`,
      { mode: 0o755 },
    );

    try {
      const metadata = await probeVideoMetadata(
        "https://example.com/test.mp4",
        {
          ffprobePath: mockFfprobePath,
        },
      );

      assert.equal(metadata.width, 1920);
      assert.equal(metadata.height, 1080);
      assert.equal(metadata.durationSeconds, 120.5);
      assert.equal(metadata.codec, "h264");
      assert.equal(metadata.fps, 30);
      assert.equal(metadata.bitrate, 4628000);
      assert.equal(metadata.format, "mov,mp4,m4a,3gp,3g2,mj2");
      assert.equal(metadata.rawStreams?.length, 2);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should calculate fractional fps correctly", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ffprobe-fps-test-"));
    const mockFfprobePath = path.join(tempDir, "mock-ffprobe.sh");

    const sampleFfprobeOutput = {
      streams: [
        {
          codec_type: "video",
          codec_name: "hevc",
          width: 3840,
          height: 2160,
          r_frame_rate: "24000/1001", // 23.98 fps
          avg_frame_rate: "24000/1001",
        },
      ],
      format: {
        duration: "45.0",
      },
    };

    fs.writeFileSync(
      mockFfprobePath,
      `#!/bin/sh\necho '${JSON.stringify(sampleFfprobeOutput)}'\n`,
      { mode: 0o755 },
    );

    try {
      const metadata = await probeVideoMetadata("/tmp/video.mov", {
        ffprobePath: mockFfprobePath,
      });

      assert.equal(metadata.width, 3840);
      assert.equal(metadata.height, 2160);
      assert.equal(metadata.fps, 23.98);
      assert.equal(metadata.codec, "hevc");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should throw descriptive error when ffprobe command fails", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ffprobe-err-test-"));
    const mockFfprobePath = path.join(tempDir, "mock-ffprobe.sh");

    fs.writeFileSync(
      mockFfprobePath,
      `#!/bin/sh\necho 'Invalid data found when processing input' >&2\nexit 1\n`,
      { mode: 0o755 },
    );

    try {
      await assert.rejects(
        async () => {
          await probeVideoMetadata("/tmp/corrupt.mp4", {
            ffprobePath: mockFfprobePath,
          });
        },
        (err: Error) => {
          assert.match(err.message, /ffprobe failed for "\/tmp\/corrupt\.mp4"/);
          return true;
        },
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
