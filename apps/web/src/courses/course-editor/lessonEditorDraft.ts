import type { LessonEditorDraft, StudioLessonContentType } from "../curriculum";

const LESSON_EDITOR_DRAFT_STORAGE_PREFIX = "veolms:lesson-editor-draft:";
const LESSON_EDITOR_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredLessonEditorDraft extends LessonEditorDraft {
  description: string;
  contentMediaId: string | null;
  savedAt: number;
}

function getLessonEditorDraftStorageKey(
  courseId: string | null,
  lessonId: string,
): string {
  return `${LESSON_EDITOR_DRAFT_STORAGE_PREFIX}${courseId || "new-course"}:${lessonId}`;
}

function isStudioLessonContentType(
  value: unknown,
): value is StudioLessonContentType {
  return (
    value === "video" ||
    value === "audio" ||
    value === "image" ||
    value === "document" ||
    value === "quiz"
  );
}

export function readLessonEditorDraft(
  courseId: string | null,
  lessonId: string,
): StoredLessonEditorDraft | null {
  if (typeof window === "undefined") return null;

  const storageKey = getLessonEditorDraftStorageKey(courseId, lessonId);
  try {
    const rawDraft = window.localStorage.getItem(storageKey);
    if (!rawDraft) return null;

    const parsed = JSON.parse(rawDraft) as Partial<StoredLessonEditorDraft>;
    if (
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > LESSON_EDITOR_DRAFT_TTL_MS ||
      typeof parsed.title !== "string" ||
      !isStudioLessonContentType(parsed.contentType)
    ) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return {
      title: parsed.title,
      description:
        typeof parsed.description === "string" ? parsed.description : "",
      contentType: parsed.contentType,
      contentMediaId:
        typeof parsed.contentMediaId === "string"
          ? parsed.contentMediaId
          : null,
      isPublished: parsed.isPublished !== false,
      isPreview: parsed.isPreview === true,
      savedAt: parsed.savedAt,
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

export function writeLessonEditorDraft(
  courseId: string | null,
  lessonId: string,
  draft: Omit<StoredLessonEditorDraft, "savedAt">,
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getLessonEditorDraftStorageKey(courseId, lessonId),
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    // Local draft persistence is best-effort and must not block editing.
  }
}

export function clearLessonEditorDraft(
  courseId: string | null,
  lessonId: string,
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(
      getLessonEditorDraftStorageKey(courseId, lessonId),
    );
  } catch {
    // Ignore storage cleanup failures; the saved lesson is already persisted.
  }
}
