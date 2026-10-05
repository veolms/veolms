import { useCallback, useState } from "react";
import { startFileDownload } from "../lib/save-file";
import { coursesService } from "../services/courses";

export type LessonResourceDownloadStatus = "downloading" | "done" | "failed";

export interface DownloadableLessonResource {
  id: string;
}

interface LessonResourceDownloadsOptions {
  /** Course slug or id the lesson belongs to. */
  courseKey: string;
  lessonNumber: number;
}

/**
 * Downloads lesson resources and reports where each one stands, so a row can
 * show that it is working, started or needs another try. The API decides
 * whether the learner may have the file and answers with a link; the browser
 * then downloads it on its own, so "done" means the download has started.
 */
export function useLessonResourceDownloads({
  courseKey,
  lessonNumber,
}: LessonResourceDownloadsOptions) {
  const [statuses, setStatuses] = useState<
    Readonly<Record<string, LessonResourceDownloadStatus>>
  >({});
  const [downloadingAll, setDownloadingAll] = useState(false);

  const download = useCallback(
    async (resource: DownloadableLessonResource) => {
      const setStatus = (status: LessonResourceDownloadStatus) =>
        setStatuses((current) => ({ ...current, [resource.id]: status }));

      setStatus("downloading");
      try {
        const link = await coursesService.getLessonResourceDownload(
          courseKey,
          lessonNumber,
          resource.id,
        );
        startFileDownload(link.url);
        setStatus("done");
        return true;
      } catch {
        setStatus("failed");
        return false;
      }
    },
    [courseKey, lessonNumber],
  );

  const downloadAll = useCallback(
    async (resources: readonly DownloadableLessonResource[]) => {
      setDownloadingAll(true);
      try {
        for (const resource of resources) await download(resource);
      } finally {
        setDownloadingAll(false);
      }
    },
    [download],
  );

  return { statuses, downloadingAll, download, downloadAll };
}
