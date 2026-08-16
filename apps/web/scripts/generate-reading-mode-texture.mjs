import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const BASE_SIZE = 256;
const SEED = 0x5e0a17;
const OUTPUT_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../public/assets",
);
const VARIANTS = [
  { scale: 1, suffix: "" },
  { scale: 2, suffix: "@2x" },
  { scale: 3, suffix: "@3x" },
];

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function blurWrapped(source, radius, size) {
  const horizontal = new Float64Array(source.length);
  const output = new Float64Array(source.length);
  const width = radius * 2 + 1;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const wrappedX = (x + offset + size) % size;
        sum += source[y * size + wrappedX];
      }
      horizontal[y * size + x] = sum / width;
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const wrappedY = (y + offset + size) % size;
        sum += horizontal[wrappedY * size + x];
      }
      output[y * size + x] = sum / width;
    }
  }

  return output;
}

function generatePixels(size, seed) {
  const random = mulberry32(seed);
  const fine = Float64Array.from(
    { length: size * size },
    () => random() * 2 - 1,
  );
  const micro = blurWrapped(fine, 1, size);
  const combined = Float64Array.from(
    fine,
    (value, index) => value * 1.08 + micro[index] * 0.12,
  );
  const mean =
    combined.reduce((sum, value) => sum + value, 0) / combined.length;
  const pixels = Uint8Array.from(combined, (value) =>
    Math.round(Math.min(186, Math.max(70, 128 + (value - mean) * 49))),
  );
  const averageLuminance =
    pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  if (Math.abs(averageLuminance - 128) > 0.5) {
    throw new Error(`Texture luminance drifted to ${averageLuminance}`);
  }
  return { pixels, averageLuminance };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createPng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 0;

  const scanlines = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size + 1);
    scanlines[rowStart] = 0;
    scanlines.set(pixels.subarray(y * size, (y + 1) * size), rowStart + 1);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
for (const { scale, suffix } of VARIANTS) {
  const size = BASE_SIZE * scale;
  const { pixels, averageLuminance } = generatePixels(
    size,
    SEED ^ (scale * 0x9e3779b9),
  );
  const png = createPng(size, pixels);
  const outputPath = resolve(
    OUTPUT_DIRECTORY,
    `reading-mode-grain${suffix}.png`,
  );
  writeFileSync(outputPath, png);
  console.log(
    `Generated ${outputPath} (${png.length} bytes, ${size}x${size}, seed ${SEED}, mean ${averageLuminance.toFixed(3)})`,
  );
}
