import type { LessonContent, LessonContentKind } from "@veolms/contracts";
import type { LessonResourceItem } from "../lesson-resources/LessonResourceManager";
import type { AttachedMediaInfo } from "../curriculum";
import { mediaService } from "../../services/media";

interface LessonSnapshot {
  title: string;
  description: string;
  contentType: "video" | "document" | "quiz" | "audio" | "image";
  contentMediaId?: string | null;
  isPublished?: boolean;
  isPreview?: boolean;
  /** The document's text as saved. */
  readingBody?: string;
}

export interface CurriculumLessonItem {
  id: string;
  title: string;
  isEditingTitle?: boolean;
  contentTypeSelected?: boolean;
  pendingContentType?: "video" | "document" | "quiz" | "audio" | "image";
  description: string;
  contentType: "video" | "document" | "quiz" | "audio" | "image";
  contentMediaId?: string | null;
  durationSeconds?: number;
  isExpanded: boolean;
  isPublished?: boolean;
  isPreview?: boolean;
  isPendingCreation?: boolean;
  initialState?: LessonSnapshot;
  resources: LessonResourceItem[];
  /**
   * What each kind holds, as the server last said (files are saved as
   * soon as they are uploaded). `contentType` is the kind learners will be
   * shown once the lesson is saved.
   */
  contents?: LessonContent[];
  /** The document's text being written (saved with the lesson). */
  readingBody?: string;
}

/** One kind's content of a lesson, if it holds any. */
export const findLessonContent = (
  lesson: Pick<CurriculumLessonItem, "contents">,
  kind: string,
): LessonContent | undefined =>
  lesson.contents?.find((content) => content.contentType === kind);

/**
 * The document's text as saved: its document's, or, for a reading lesson
 * written before kinds existed, its description.
 */
export const getSavedReadingBody = (lesson: {
  contentType: string;
  contentMediaId?: string | null;
  description?: string | null;
  contents?: LessonContent[];
}): string => {
  const body = findLessonContent(lesson, "document")?.body;
  if (body) return body;
  return lesson.contentType === "document" && !lesson.contentMediaId
    ? (lesson.description ?? "")
    : "";
};

/** The kinds that hold something, for the content type cards. */
export const getFilledContentTypes = (
  lesson: Pick<CurriculumLessonItem, "contents" | "readingBody">,
): Set<LessonContentKind> => {
  const filled = new Set<LessonContentKind>();
  for (const content of lesson.contents ?? []) {
    if (content.mediaId || content.body?.trim()) {
      filled.add(content.contentType);
    }
  }
  if (lesson.readingBody?.trim()) filled.add("document");
  return filled;
};

/**
 * Media details the lesson editor can show for an attached asset. The editor
 * payload only carries the asset ID and duration, so nothing else is implied.
 */
export const getLessonMediaInfo = (
  lesson: Pick<
    CurriculumLessonItem,
    | "contentMediaId"
    | "contentType"
    | "durationSeconds"
    | "contents"
    | "initialState"
  >,
): AttachedMediaInfo | null => {
  // The kind being edited may not be the one saved: its own file shows.
  const content = findLessonContent(lesson, lesson.contentType);
  const savedKind = lesson.initialState?.contentType ?? lesson.contentType;
  const mediaId =
    content?.mediaId ??
    (lesson.contents === undefined || savedKind === lesson.contentType
      ? lesson.contentMediaId
      : null) ??
    null;
  if (!mediaId) return null;
  const media = content?.mediaId === mediaId ? content.media : null;
  return {
    id: mediaId,
    name: media?.originalFilename,
    sizeBytes: media?.sizeBytes || undefined,
    mimeType: media?.mimeType,
    durationSeconds:
      media?.durationSeconds ||
      (mediaId === lesson.contentMediaId
        ? lesson.durationSeconds
        : undefined) ||
      undefined,
    thumbnailUrl:
      lesson.contentType === "video"
        ? mediaService.getVideoThumbnailUrl(mediaId)
        : undefined,
  };
};

/**
 * The playback API numbers lessons by their order across the whole course
 * (sections by position, then lessons by position). Lessons that are not
 * saved yet do not exist server-side and are not counted.
 */
export const getCourseWideLessonNumber = (
  curriculumSections: readonly CurriculumSectionItem[],
  lessonId: string,
): number | undefined => {
  let lessonNumber = 0;
  for (const section of curriculumSections) {
    for (const lesson of section.lessons) {
      if (lesson.isPendingCreation) continue;
      lessonNumber += 1;
      if (lesson.id === lessonId) return lessonNumber;
    }
  }
  return undefined;
};

export interface CurriculumSectionItem {
  id: string;
  title: string;
  isExpanded: boolean;
  isEditingTitle?: boolean;
  isPendingCreation?: boolean;
  lessons: CurriculumLessonItem[];
}

export interface DraggedLessonState {
  sectionId: string;
  lessonId: string;
}

/**
 * Where a dragged lesson would land: next to a lesson, or (`lessonId` null)
 * at the end of a section, which may be another, empty or collapsed one.
 */
export interface LessonDropTarget {
  sectionId: string;
  lessonId: string | null;
  position: "before" | "after";
}

export const getLessonInitialState = (
  les: CurriculumLessonItem,
): LessonSnapshot => {
  return (
    les.initialState || {
      title: les.title,
      description: les.description || "",
      contentType: les.contentType,
      contentMediaId: les.contentMediaId ?? null,
      isPublished: les.isPublished !== undefined ? les.isPublished : true,
      isPreview: les.isPreview !== undefined ? les.isPreview : false,
      readingBody: les.readingBody ?? "",
    }
  );
};

export const isLessonDirty = (les: CurriculumLessonItem): boolean => {
  const init = getLessonInitialState(les);
  const isPub = les.isPublished !== undefined ? les.isPublished : true;
  const isPrev = les.isPreview !== undefined ? les.isPreview : false;
  const initPub = init.isPublished !== undefined ? init.isPublished : true;
  const initPrev = init.isPreview !== undefined ? init.isPreview : false;

  return (
    les.title.trim() !== init.title.trim() ||
    (les.description || "") !== (init.description || "") ||
    les.contentType !== init.contentType ||
    (les.contentMediaId ?? null) !== (init.contentMediaId ?? null) ||
    isPub !== initPub ||
    isPrev !== initPrev ||
    (les.readingBody ?? "") !== (init.readingBody ?? les.readingBody ?? "")
  );
};
