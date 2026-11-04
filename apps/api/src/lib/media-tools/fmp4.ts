import fsp from "node:fs/promises";
import path from "node:path";

// The master playlist's CODECS attribute, read from what ffmpeg actually
// wrote rather than guessed from the encode settings: Safari picks a
// rendition by it and iOS wants every rendition identified up front. H.264
// is "avc1." + the profile, constraint and level bytes of the init
// segment's avcC box.
export async function readAvc1CodecString(
  initSegmentPath: string,
): Promise<string | null> {
  const bytes = await fsp.readFile(initSegmentPath);
  const at = bytes.indexOf("avcC", 0, "latin1");
  // Box type, then AVCDecoderConfigurationRecord version 1.
  if (at === -1 || bytes[at + 4] !== 1) return null;
  const hex = (b: number | undefined) => (b ?? 0).toString(16).padStart(2, "0");
  return `avc1.${hex(bytes[at + 5])}${hex(bytes[at + 6])}${hex(bytes[at + 7])}`;
}

/** A local path as ffmpeg takes it on every platform (forward slashes). */
export function toFfmpegPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
