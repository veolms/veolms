import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompressionArgs,
  buildFfmpegHlsArgs,
  filterApplicableQualities,
  generateMasterPlaylist,
  resolveCompressionTarget,
} from "../src/ffmpeg-builder.ts";

describe("FFmpeg Dynamic HLS Command Builder", () => {
  it("should filter out qualities that exceed source video dimensions", () => {
    // 720p source
    const requested = ["1080p", "720p", "480p", "360p"] as const;
    const applicable = filterApplicableQualities(requested, 1280, 720);

    assert.deepEqual(applicable, ["720p", "480p", "360p"]);
  });

  it("should fallback to smallest quality if source is lower than all requested", () => {
    const requested = ["1080p", "720p"] as const;
    // 360p source
    const applicable = filterApplicableQualities(requested, 640, 360);

    assert.deepEqual(applicable, ["720p"]);
  });

  it("should build valid FFmpeg arguments for requested quality profiles", () => {
    const result = buildFfmpegHlsArgs({
      inputPath: "/tmp/source.mp4",
      outputDir: "/tmp/hls_out",
      qualities: ["1080p", "720p", "480p"],
      metadata: {
        durationSeconds: 120,
        width: 1920,
        height: 1080,
      },
      segmentDurationSeconds: 6,
    });

    assert.ok(result.args.includes("-i"));
    assert.ok(result.args.includes("/tmp/source.mp4"));
    assert.ok(result.args.includes("-progress"));
    assert.ok(result.args.includes("pipe:1"));
    assert.deepEqual(result.applicableQualities, ["1080p", "720p", "480p"]);

    assert.equal(result.variants.length, 3);
    assert.equal(result.variants[0].quality, "1080p");
    assert.equal(result.variants[0].width, 1920);
    assert.equal(result.variants[1].quality, "720p");
    assert.equal(result.variants[2].quality, "480p");
  });

  it("should generate a valid master HLS playlist with stream inf tags", () => {
    const master = generateMasterPlaylist([
      {
        quality: "1080p",
        relativePlaylistPath: "1080p/1080p.m3u8",
        bandwidth: 4628000,
        width: 1920,
        height: 1080,
      },
      {
        quality: "720p",
        relativePlaylistPath: "720p/720p.m3u8",
        bandwidth: 2528000,
        width: 1280,
        height: 720,
      },
    ]);

    assert.ok(master.startsWith("#EXTM3U\n#EXT-X-VERSION:3"));
    assert.ok(
      master.includes(
        "#EXT-X-STREAM-INF:BANDWIDTH=4628000,RESOLUTION=1920x1080",
      ),
    );
    assert.ok(master.includes("1080p/1080p.m3u8"));
    assert.ok(
      master.includes(
        "#EXT-X-STREAM-INF:BANDWIDTH=2528000,RESOLUTION=1280x720",
      ),
    );
    assert.ok(master.includes("720p/720p.m3u8"));
  });

  it("should handle portrait / vertical videos without falling back to low resolution", () => {
    // 1080x1920 portrait video
    const requested = ["1080p", "720p", "480p", "360p"] as const;
    const applicable = filterApplicableQualities(requested, 1080, 1920);

    assert.deepEqual(applicable, ["1080p", "720p", "480p", "360p"]);
  });

  it("should include GOP alignment, sc_threshold 0 and independent segments flags", () => {
    const result = buildFfmpegHlsArgs({
      inputPath: "/tmp/source.mp4",
      outputDir: "/tmp/hls_out",
      qualities: ["1080p"],
      metadata: {
        durationSeconds: 60,
        width: 1920,
        height: 1080,
      },
      segmentDurationSeconds: 6,
    });

    assert.ok(result.args.includes("-g"));
    assert.ok(result.args.includes("-keyint_min"));
    assert.ok(result.args.includes("-sc_threshold"));
    assert.ok(result.args.includes("0"));
    assert.ok(result.args.includes("-hls_flags"));
    assert.ok(result.args.includes("independent_segments"));
  });

  it("uses the probed frame rate for GOP alignment and ignores duplicate qualities", () => {
    const result = buildFfmpegHlsArgs({
      inputPath: "/tmp/source.mp4",
      outputDir: "/tmp/hls_out",
      qualities: ["720p", "720p", "480p"],
      metadata: {
        durationSeconds: 60,
        width: 1920,
        height: 1080,
        fps: 24,
      },
      segmentDurationSeconds: 6,
    });

    assert.deepEqual(result.applicableQualities, ["720p", "480p"]);
    assert.equal(result.variants.length, 2);
    assert.equal(result.args.filter((value) => value === "144").length, 4);
  });

  it("builds vertical/portrait resolution scale filter and variant metadata for portrait sources", () => {
    const result = buildFfmpegHlsArgs({
      inputPath: "/tmp/source.mp4",
      outputDir: "/tmp/hls_out",
      qualities: ["1080p"],
      metadata: {
        durationSeconds: 60,
        width: 1080,
        height: 1920,
        fps: 30,
      },
      segmentDurationSeconds: 6,
    });

    assert.equal(result.variants[0]?.width, 1080);
    assert.equal(result.variants[0]?.height, 1920);
    assert.ok(
      result.args.some((a) =>
        a.includes("scale=w=1080:h=1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920"),
      ),
    );
    assert.ok(
      result.masterPlaylistContent.includes("RESOLUTION=1080x1920"),
    );
  });
});

describe("Video Processing V2 — Compression Resolution Cap", () => {
  it("caps a 4K source down to the largest requested quality tier", () => {
    const target = resolveCompressionTarget(3840, 2160, [
      "720p",
      "480p",
      "360p",
    ]);

    assert.deepEqual(target, { width: 1280, height: 720 });
  });

  it("never upscales a source smaller than the requested quality", () => {
    // 480p source, job requests up to 720p — should stay null (no resize)
    const target = resolveCompressionTarget(854, 480, ["720p", "480p"]);

    assert.equal(target, null);
  });

  it("returns null when the source already fits the target exactly", () => {
    const target = resolveCompressionTarget(1280, 720, ["720p"]);

    assert.equal(target, null);
  });

  it("caps a portrait source preserving its orientation", () => {
    // 4K portrait source (2160x3840), job requests up to 720p
    const target = resolveCompressionTarget(2160, 3840, ["720p", "480p"]);

    assert.deepEqual(target, { width: 720, height: 1280 });
  });

  it("builds compression args with a scale filter when capping resolution", () => {
    const { args, targetResolution } = buildCompressionArgs({
      inputPath: "/tmp/source.mp4",
      outputPath: "/tmp/optimized.mp4",
      qualities: ["720p", "480p"],
      metadata: { durationSeconds: 72, width: 3840, height: 2160 },
      crf: 22,
    });

    assert.deepEqual(targetResolution, { width: 1280, height: 720 });
    assert.ok(args.includes("-vf"));
    assert.ok(args.some((a) => a.includes("scale=w=1280:h=720")));
    assert.ok(args.includes("-crf"));
    assert.ok(args.includes("22"));
    assert.ok(args.includes("/tmp/optimized.mp4"));
  });

  it("builds compression args without a scale filter when no cap is needed", () => {
    const { args, targetResolution } = buildCompressionArgs({
      inputPath: "/tmp/source.mp4",
      outputPath: "/tmp/optimized.mp4",
      qualities: ["720p"],
      metadata: { durationSeconds: 72, width: 1280, height: 720 },
      crf: 22,
    });

    assert.equal(targetResolution, null);
    assert.ok(!args.includes("-vf"));
    assert.ok(args.includes("-crf"));
  });
});
