import assert from "node:assert/strict";
import { test } from "node:test";

import { imageDimensions } from "./academy-logo.ts";

/** A PNG's signature and header: enough for its size. */
function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

/** A JPEG's first segments as an editor writes them: APP0, tables, frame. */
function jpegHeader(width: number, height: number, frameMarker = 0xc0): Buffer {
  const app0 = Buffer.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  // A Huffman table segment (C4) comes before the frame and must be skipped.
  const dht = Buffer.from([0xff, 0xc4, 0x00, 0x04, 0x00, 0x00]);
  const frame = Buffer.alloc(19);
  frame[0] = 0xff;
  frame[1] = frameMarker;
  frame.writeUInt16BE(17, 2);
  frame[4] = 8;
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, dht, frame]);
}

await test("a PNG's size is read from its header", () => {
  assert.deepEqual(imageDimensions(pngHeader(512, 256)), {
    width: 512,
    height: 256,
  });
});

await test("a JPEG's size is read from its frame, past the segments before it", () => {
  assert.deepEqual(imageDimensions(jpegHeader(640, 480)), {
    width: 640,
    height: 480,
  });
  // A progressive JPEG's frame (C2) reads the same way.
  assert.deepEqual(imageDimensions(jpegHeader(300, 300, 0xc2)), {
    width: 300,
    height: 300,
  });
});

await test("anything else, or a file cut short, has no size", () => {
  assert.equal(imageDimensions(Buffer.from("GIF89a")), null);
  assert.equal(imageDimensions(pngHeader(10, 10).subarray(0, 20)), null);
  assert.equal(imageDimensions(jpegHeader(10, 10).subarray(0, 24)), null);
});
