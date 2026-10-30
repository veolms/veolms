import fs from "node:fs/promises";
import path from "node:path";
import type {
  MediaImportPackager,
  MediaImportPackageInput,
  MediaImportPackageResult,
} from "@veolms/services";
import {
  readAvc1CodecString,
  toFfmpegPath,
} from "../../../lib/media-tools/fmp4.ts";
import {
  DOWNLOAD_PROCESS_TIMEOUT_MS,
  runProcess,
} from "../../../lib/media-tools/process.ts";
import { parseMasterPlaylist } from "./source/hls.ts";

/**
 * Core's default: publish the downloaded HLS ladder in the clear, each
 * rendition's MPEG-TS segments stream-copied into fragmented MP4 (an
 * `init.mp4` and `.m4s` segments, nothing re-encoded), as the
 * `import:youtube` CLI writes it.
 *
 * Not the TS as downloaded: YouTube's renditions differ in H.264 profile
 * (Main at the low qualities, High at 1080p), and the player rebuilds its
 * media source when a quality switch changes the profile. With TS, which it
 * transmuxes in JavaScript, that rebuild never filled again, so playback
 * stopped for good at the first switch up, some 20 s in. fMP4 switches
 * cleanly, and Safari plays it without transmuxing.
 */
export const clearHlsPackager: MediaImportPackager = {
  name: "clear-hls",
  async package(
    input: MediaImportPackageInput,
  ): Promise<MediaImportPackageResult> {
    input.onProgress(0, "Preparing the HLS streams");
    const masterPath = path.join(input.hlsDir, "master.m3u8");
    const masterText = await fs.readFile(masterPath, "utf8");
    const master = parseMasterPlaylist(masterText, masterPath);
    const playlists = [
      ...new Set([
        ...master.variants.map((variant) => variant.url),
        ...master.audioTracks.map((track) => track.url),
      ]),
    ];
    // The source's own segment length, so every rendition is cut at the
    // same keyframes as before and they stay aligned with each other.
    const segmentSeconds = Math.max(
      1,
      Math.round(input.ladder.variants[0]?.segments[0]?.duration ?? 6),
    );
    const ffmpeg = await input.resolveFfmpeg();
    const videoCodecs = new Map<string, string | null>();

    await fs.rm(input.workDir, { recursive: true, force: true });
    for (const [index, playlist] of playlists.entries()) {
      const target = path.join(
        input.workDir,
        path.relative(input.hlsDir, playlist),
      );
      const targetDir = path.dirname(target);
      await fs.mkdir(targetDir, { recursive: true });
      const result = await runProcess(
        ffmpeg,
        [
          "-y",
          "-i",
          toFfmpegPath(playlist),
          "-c",
          "copy",
          // TS carries AAC in ADTS frames; MP4 wants them without.
          "-bsf:a",
          "aac_adtstoasc",
          "-f",
          "hls",
          "-hls_segment_type",
          "fmp4",
          "-hls_time",
          String(segmentSeconds),
          "-hls_playlist_type",
          "vod",
          "-hls_flags",
          "independent_segments",
          "-hls_fmp4_init_filename",
          "init.mp4",
          // ffmpeg writes the init segment next to the playlist only when it
          // can split the playlist path on "/": with Windows backslashes it
          // lands in the working directory instead.
          "-hls_segment_filename",
          toFfmpegPath(path.join(targetDir, "segment_%06d.m4s")),
          toFfmpegPath(target),
        ],
        { timeoutMs: DOWNLOAD_PROCESS_TIMEOUT_MS, signal: input.signal },
      );
      if (result.aborted) throw new Error("The import was cancelled.");
      if (result.code !== 0) {
        throw new Error(
          `ffmpeg fMP4 remux failed: ${result.stderr.trim().slice(-800)}`,
        );
      }
      videoCodecs.set(
        playlist,
        await readAvc1CodecString(path.join(targetDir, "init.mp4")),
      );
      input.onProgress(
        (index + 1) / playlists.length,
        "Preparing the HLS streams",
      );
    }

    // The same master, at the playlist version that allows #EXT-X-MAP, and
    // with each variant's H.264 codec as written to its init segment.
    let output = masterText.replace(/#EXT-X-VERSION:\d+/, "#EXT-X-VERSION:7");
    for (const variant of master.variants) {
      const videoCodec = videoCodecs.get(variant.url);
      if (!videoCodec || !variant.codecs) continue;
      const codecs = variant.codecs
        .split(",")
        .map((codec) => (codec.trim().startsWith("avc1") ? videoCodec : codec))
        .join(",");
      output = output.replace(
        variant.attributesLine,
        variant.attributesLine.replace(/CODECS="[^"]*"/, `CODECS="${codecs}"`),
      );
    }
    await fs.writeFile(path.join(input.workDir, "master.m3u8"), output, "utf8");

    const reference = input.ladder.variants[0]?.segments ?? [];
    input.onProgress(1, "HLS streams ready");
    return {
      manifestPath: "master.m3u8",
      qualities: input.ladder.variants.map((variant) => variant.quality),
      durationSeconds: Math.round(
        reference.reduce((sum, segment) => sum + segment.duration, 0),
      ),
    };
  },
};
