/**
 * Binary ZIP archive creation utilities for serverless bundles and worker artifacts.
 */

export function crc32(buf: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Minimal "store" (uncompressed) multi-entry ZIP writer.
 * Standard ZIP format compatible with AWS Lambda, zip/unzip CLI, and Node.js extractors.
 */
export function createZipFromBuffers(
  entries: readonly { name: string; content: Uint8Array }[],
): Uint8Array {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosDate =
    (((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate()) >>>
    0;
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5)) >>> 0;

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localSectionLength = 0;

  for (const { name, content } of entries) {
    const normalizedName = name.replace(/\\/g, "/");
    const fileBytes = encoder.encode(normalizedName);
    const fileCrc = crc32(content);
    const localHeaderOffset = localSectionLength;

    const localHeader = new Uint8Array(30 + fileBytes.length);
    const lhView = new DataView(localHeader.buffer);
    lhView.setUint32(0, 0x04034b50, true);
    lhView.setUint16(4, 20, true);
    lhView.setUint16(6, 0, true);
    lhView.setUint16(8, 0, true); // store (no compression)
    lhView.setUint16(10, dosTime, true);
    lhView.setUint16(12, dosDate, true);
    lhView.setUint32(14, fileCrc, true);
    lhView.setUint32(18, content.length, true);
    lhView.setUint32(22, content.length, true);
    lhView.setUint16(26, fileBytes.length, true);
    lhView.setUint16(28, 0, true);
    localHeader.set(fileBytes, 30);

    localParts.push(localHeader, content);
    localSectionLength += localHeader.length + content.length;

    const centralDir = new Uint8Array(46 + fileBytes.length);
    const cdView = new DataView(centralDir.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(8, 0, true);
    cdView.setUint16(10, 0, true);
    cdView.setUint16(12, dosTime, true);
    cdView.setUint16(14, dosDate, true);
    cdView.setUint32(16, fileCrc, true);
    cdView.setUint32(20, content.length, true);
    cdView.setUint32(24, content.length, true);
    cdView.setUint16(28, fileBytes.length, true);
    cdView.setUint16(30, 0, true);
    cdView.setUint16(32, 0, true);
    cdView.setUint16(34, 0, true);
    cdView.setUint16(36, 0, true);
    cdView.setUint32(38, 0, true);
    cdView.setUint32(42, localHeaderOffset, true);
    centralDir.set(fileBytes, 46);

    centralParts.push(centralDir);
  }

  const centralDirOffset = localSectionLength;
  const centralDirSize = centralParts.reduce((acc, p) => acc + p.length, 0);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralDirSize, true);
  eocdView.setUint32(16, centralDirOffset, true);
  eocdView.setUint16(20, 0, true);

  const totalLength = localSectionLength + centralDirSize + 22;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
