import fs from "node:fs/promises";
import type {
  MediaImportPackager,
  MediaImportPackageInput,
  MediaImportPackageResult,
} from "@veolms/services";

/**
 * Core's default: publish the downloaded MPEG-TS HLS ladder as it is, the
 * same output the `import:youtube` CLI's direct-HLS path uploads. The
 * folder is moved, not copied, so the import needs no second copy on disk.
 */
export const clearHlsPackager: MediaImportPackager = {
  name: "clear-hls",
  async package(
    input: MediaImportPackageInput,
  ): Promise<MediaImportPackageResult> {
    input.onProgress(0, "Preparing the HLS streams");
    await fs.rm(input.workDir, { recursive: true, force: true });
    await fs.rename(input.hlsDir, input.workDir);
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
