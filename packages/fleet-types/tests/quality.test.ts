import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_QUALITIES,
  getQualityProfile,
  isValidQualityLevel,
  QUALITY_PROFILES,
  VIDEO_QUALITY_LEVELS,
  videoQualityLevelSchema,
  type VideoQualityLevel,
} from "../src/quality.ts";

describe("Video Quality Profiles & Schema", () => {
  it("should validate all standard video quality levels", () => {
    for (const level of VIDEO_QUALITY_LEVELS) {
      assert.equal(isValidQualityLevel(level), true);
      const parsed = videoQualityLevelSchema.parse(level);
      assert.equal(parsed, level);
    }
  });

  it("should reject invalid quality strings", () => {
    assert.equal(isValidQualityLevel("100p"), false);
    assert.equal(isValidQualityLevel(""), false);
    assert.equal(isValidQualityLevel("4k"), false);
    assert.throws(() => videoQualityLevelSchema.parse("invalid_quality"));
  });

  it("should provide valid profiles for all defined quality levels", () => {
    for (const level of VIDEO_QUALITY_LEVELS) {
      const profile = getQualityProfile(level);
      assert.ok(profile);
      assert.equal(profile.name, level);
      assert.ok(profile.width > 0);
      assert.ok(profile.height > 0);
      assert.ok(profile.videoBitrateKbps > 0);
      assert.ok(profile.maxBitrateKbps >= profile.videoBitrateKbps);
      assert.ok(profile.audioBitrateKbps > 0);
      assert.ok(profile.segmentDurationSeconds > 0);
    }
  });

  it("should have correct default quality array", () => {
    assert.deepEqual(DEFAULT_QUALITIES, ["1080p", "720p", "480p", "360p"]);
  });

  it("should have strictly increasing resolutions", () => {
    const sortedLevels: VideoQualityLevel[] = [
      "144p",
      "240p",
      "360p",
      "480p",
      "720p",
      "1080p",
      "1440p",
      "2160p",
    ];

    for (let i = 0; i < sortedLevels.length - 1; i++) {
      const current = QUALITY_PROFILES[sortedLevels[i]];
      const next = QUALITY_PROFILES[sortedLevels[i + 1]];
      assert.ok(
        current.height < next.height,
        `Expected ${current.name} height (${current.height}) < ${next.name} height (${next.height})`,
      );
      assert.ok(
        current.videoBitrateKbps < next.videoBitrateKbps,
        `Expected ${current.name} bitrate (${current.videoBitrateKbps}) < ${next.name} bitrate (${next.videoBitrateKbps})`,
      );
    }
  });
});
