import { useCallback, useState } from "react";
import { getApiError } from "../lib/api-error";
import { startFileDownload } from "../lib/save-file";
import { coursesService } from "../services/courses";

/**
 * "signInRequired" and "accessRequired" are the API's refusals: the files of
 * a lesson are for learners who have the course, even where the lesson
 * itself plays as a preview. Trying again does not help, so they are told
 * apart from "failed".
 */
export type LessonResourceDownloadStatus =
  "downloading" | "done" | "failed" | "signInRequired" | "accessRequired";

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
      } catch (error: unknown) {
        // Only the two refusals that mean "this is not yours yet"; any
        // other 403 (a two-factor step, say) is not an enrolment matter.
        const { status, code } = getApiError(error);
        setStatus(
          status === 401
            ? "signInRequired"
            : code === "COURSE_ACCESS_DENIED"
              ? "accessRequired"
              : "failed",
        );
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
