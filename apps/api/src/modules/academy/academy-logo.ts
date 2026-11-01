import { inflateSync } from "node:zlib";
import type { AcademyLogoContentType } from "@veolms/contracts";
import type { S3StorageService } from "@veolms/storage";

/**
 * Where an uploaded academy logo is kept. Each upload has its own key and is
 * never overwritten or deleted, so a logo in an email already sent keeps
 * showing after it is replaced.
 *
 * public/academy/logo/{uploadId}.{png|jpg}
 */
const LOGO_PREFIX = "public/academy/logo/";
const LOGO_KEY_PATTERN =
  /(public\/academy\/logo\/[0-9a-f-]{36}\.(?:png|jpg))(?:[?#].*)?$/;

export function academyLogoKey(
  uploadId: string,
  contentType: AcademyLogoContentType,
): string {
  return `${LOGO_PREFIX}${uploadId}.${contentType === "image/png" ? "png" : "jpg"}`;
}

/** The storage key of a logo uploaded here, or null for any other address. */
export function academyLogoKeyFromUrl(
  url: string | null | undefined,
): string | null {
  return url?.match(LOGO_KEY_PATTERN)?.[1] ?? null;
}

/**
 * The logo's public address, absolute: mail apps cannot follow a relative
 * one. A storage set up with a relative CDN path ("/cdn") is served by the
 * web app, so the address is completed with the web app's origin.
 */
export function academyLogoUrl(
  storage: S3StorageService,
  key: string,
  webUrl: string,
): string | null {
  const url = storage.getPublicObjectUrl(key);
  if (!url) return null;
  return url.startsWith("/") ? new URL(url, webUrl).toString() : url;
}

/**
 * The whole stored logo; null when it is missing or larger than `maxBytes`.
 */
export async function readLogo(
  storage: S3StorageService,
  key: string,
  maxBytes: number,
): Promise<Buffer | null> {
  const object = await storage.getObject(key);
  if (!object) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of object.body) {
    size += chunk.length;
    if (size > maxBytes) {
      object.body.destroy();
      return null;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Wider or taller than any logo; bounds the memory a check can take. */
const LOGO_MAX_SIDE = 4096;

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Channels per pixel for each PNG colour type, and the bit depths it allows. */
const PNG_COLOUR_TYPES: Record<number, { channels: number; depths: number[] }> =
  {
    0: { channels: 1, depths: [1, 2, 4, 8, 16] },
    2: { channels: 3, depths: [8, 16] },
    3: { channels: 1, depths: [1, 2, 4, 8] },
    4: { channels: 2, depths: [8, 16] },
    6: { channels: 4, depths: [8, 16] },
  };

/**
 * A PNG pdfkit can draw without failing. pdfkit unpacks the image rows after
 * the page is drawn, in a callback where a damaged file throws outside any
 * caller and takes the API process down. So the whole image is unpacked and
 * every row checked here first, where a failure is only a false.
 *
 * Interlaced PNGs are refused: logos are rarely saved that way, and their
 * rows cannot be checked this simply.
 */
export function isDrawablePng(bytes: Buffer): boolean {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return false;
  }
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return false;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const depth = bytes[24]!;
  const colourType = bytes[25]!;
  const interlace = bytes[28]!;
  const colour = PNG_COLOUR_TYPES[colourType];
  if (
    !colour ||
    !colour.depths.includes(depth) ||
    interlace !== 0 ||
    width === 0 ||
    height === 0 ||
    width > LOGO_MAX_SIDE ||
    height > LOGO_MAX_SIDE
  ) {
    return false;
  }

  const data: Buffer[] = [];
  let offset = 8;
  let ended = false;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const end = offset + 8 + length;
    if (end + 4 > bytes.length) return false;
    if (type === "IDAT") data.push(bytes.subarray(offset + 8, end));
    if (type === "IEND") {
      ended = true;
      break;
    }
    offset = end + 4;
  }
  if (!ended || data.length === 0) return false;

  // Each row: one filter byte, then the row's pixels.
  const rowBytes = Math.ceil((width * colour.channels * depth) / 8);
  const expected = height * (rowBytes + 1);
  let pixels: Buffer;
  try {
    // Bounded, so a small file cannot unpack into gigabytes.
    pixels = inflateSync(Buffer.concat(data), { maxOutputLength: expected });
  } catch {
    return false;
  }
  if (pixels.length !== expected) return false;
  for (let row = 0; row < height; row += 1) {
    // Filter types are 0–4; anything else is what crashes pdfkit.
    if (pixels[row * (rowBytes + 1)]! > 4) return false;
  }
  return true;
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** A PNG or JPEG the invoice PDF can draw. */
export function isDrawableLogo(bytes: Buffer): boolean {
  return isDrawablePng(bytes) || isJpeg(bytes);
}
