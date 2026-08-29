import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import * as mediaRepo from "./media.repository.ts";

export interface MediaStorageObject {
  mediaId: string;
  storageKey: string;
  deleteMode: "object" | "prefix";
}

export interface MediaRetentionServiceOptions {
  database: Kysely<Database>;
}

/**
 * Media-owned persistence operations used by another domain's retention
 * workflow. The caller decides which assets are safe to purge; this service
 * owns locking, storage-key resolution, and media-row deletion.
 */
export function createMediaRetentionService({
  database,
}: MediaRetentionServiceOptions) {
  async function getMediaAssetsForDeletion(
    mediaIds: string[],
    databaseExecutor: Kysely<Database> = database,
  ) {
    return await mediaRepo.findMediaAssetsByIds(
      databaseExecutor,
      mediaIds,
      undefined,
      true,
    );
  }

  async function getStorageObjectsForMedia(
    mediaIds: string[],
    databaseExecutor: Kysely<Database> = database,
  ): Promise<MediaStorageObject[]> {
    const media = await mediaRepo.findMediaAssetsByIds(
      databaseExecutor,
      mediaIds,
    );
    const videoIds = media
      .filter((asset) => asset.type === "video")
      .map((asset) => asset.id);
    const outputs = await mediaRepo.findVideoOutputsByVideoIds(
      databaseExecutor,
      videoIds,
    );

    const objects: MediaStorageObject[] = media.map((asset) => ({
      mediaId: asset.id,
      storageKey: asset.storage_key,
      deleteMode: "object",
    }));

    for (const output of outputs) {
      const separator = output.master_playlist_path.lastIndexOf("/");
      objects.push({
        mediaId: output.video_id,
        storageKey:
          separator >= 0
            ? output.master_playlist_path.slice(0, separator + 1)
            : output.master_playlist_path,
        deleteMode: separator >= 0 ? "prefix" : "object",
      });
    }

    return objects;
  }

  async function deleteMediaAssets(
    mediaIds: string[],
    databaseExecutor: Kysely<Database> = database,
  ) {
    await mediaRepo.deleteMediaAssets(databaseExecutor, mediaIds);
  }

  return {
    getMediaAssetsForDeletion,
    getStorageObjectsForMedia,
    deleteMediaAssets,
  };
}

export type MediaRetentionService = ReturnType<
  typeof createMediaRetentionService
>;
