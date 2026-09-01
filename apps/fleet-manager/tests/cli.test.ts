import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs } from "../src/cli.ts";

describe("Fleet Manager CLI Argument Parser", () => {
  it("should parse command and flags correctly with --key=value", () => {
    const parsed = parseCliArgs([
      "queue",
      "video123.mp4",
      "--prefix=courses/xyz/",
      "--qualities=1080p,720p",
    ]);

    assert.equal(parsed.command, "queue");
    assert.deepEqual(parsed.positional, ["video123.mp4"]);
    assert.equal(parsed.flags["prefix"], "courses/xyz/");
    assert.equal(parsed.flags["qualities"], "1080p,720p");
  });

  it("should parse command and flags correctly with space separated --key value", () => {
    const parsed = parseCliArgs([
      "queue",
      "video456.mp4",
      "--prefix",
      "courses/abc/",
      "--qualities",
      "480p,360p",
    ]);

    assert.equal(parsed.command, "queue");
    assert.deepEqual(parsed.positional, ["video456.mp4"]);
    assert.equal(parsed.flags["prefix"], "courses/abc/");
    assert.equal(parsed.flags["qualities"], "480p,360p");
  });

  it("should parse boolean flags correctly", () => {
    const parsed = parseCliArgs(["status", "job-123", "--verbose"]);

    assert.equal(parsed.command, "status");
    assert.deepEqual(parsed.positional, ["job-123"]);
    assert.equal(parsed.flags["verbose"], true);
  });

  it("should parse --provider flag correctly", () => {
    const parsed = parseCliArgs(["prune", "--provider=aws"]);

    assert.equal(parsed.command, "prune");
    assert.equal(parsed.flags["provider"], "aws");
  });
});
