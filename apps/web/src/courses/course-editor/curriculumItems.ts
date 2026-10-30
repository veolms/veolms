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
}

/**
 * Media details the lesson editor can show for an attached asset. The editor
 * payload only carries the asset ID and duration, so nothing else is implied.
 */
export const getLessonMediaInfo = (
  lesson: Pick<
    CurriculumLessonItem,
    "contentMediaId" | "contentType" | "durationSeconds"
  >,
): AttachedMediaInfo | null =>
  lesson.contentMediaId
    ? {
        id: lesson.contentMediaId,
        durationSeconds: lesson.durationSeconds || undefined,
        thumbnailUrl:
          lesson.contentType === "video"
            ? mediaService.getVideoThumbnailUrl(lesson.contentMediaId)
            : undefined,
      }
    : null;

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

export interface LessonDropTarget {
  sectionId: string;
  lessonId: string;
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
    isPrev !== initPrev
  );
};
