import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crc32, createZipFromBuffers } from "../src/zip.ts";

describe("ZIP Generation & CRC32", () => {
  it("computes standard CRC32 checksum correctly", () => {
    const encoder = new TextEncoder();
    const data = encoder.encode("123456789");
    // Standard CRC32 of "123456789" is 0xcbf43926 (3421780262)
    assert.equal(crc32(data), 0xcbf43926);
  });

  it("creates a valid ZIP buffer with multiple entries", () => {
    const encoder = new TextEncoder();
    const entries = [
      { name: "index.js", content: encoder.encode("console.log('hello');") },
      { name: "package.json", content: encoder.encode('{"name":"test"}') },
    ];
    const zipBytes = createZipFromBuffers(entries);
    assert.ok(zipBytes instanceof Uint8Array);
    assert.ok(zipBytes.length > 50);

    // First 4 bytes must be local file header signature 0x04034b50 (PK\x03\x04)
    assert.equal(zipBytes[0], 0x50);
    assert.equal(zipBytes[1], 0x4b);
    assert.equal(zipBytes[2], 0x03);
    assert.equal(zipBytes[3], 0x04);
  });

  it("normalizes Windows backslashes to forward slashes in entry paths", () => {
    const encoder = new TextEncoder();
    const entries = [
      {
        name: "subfolder\\nested\\file.txt",
        content: encoder.encode("content"),
      },
    ];
    const zipBytes = createZipFromBuffers(entries);
    const text = new TextDecoder().decode(zipBytes);
    assert.ok(text.includes("subfolder/nested/file.txt"));
    assert.ok(!text.includes("subfolder\\nested\\file.txt"));
  });
});
