import type { RefObject, Dispatch, SetStateAction } from "react";
import type { LessonEditorDraft } from "../../curriculum";
import type {
  RefetchOptions,
  QueryObserverResult,
  UseMutationResult,
} from "@tanstack/react-query";
import type {
  CreateCourseSectionRequest,
  CreateCourseLessonRequest,
  UpdateCourseLessonRequest,
} from "@veolms/contracts";
import { clearVideoPlaybackBootstrapCache } from "../../../learning/videoPlaybackBootstrap";
import {
  readLessonEditorDraft,
  writeLessonEditorDraft,
  clearLessonEditorDraft,
} from "../lessonEditorDraft";
import {
  type CurriculumLessonItem,
  type CurriculumSectionItem,
  getLessonInitialState,
  isLessonDirty,
} from "../curriculumItems";
import type { PersistLessonOptions } from "../editorLocalTypes";
import type { ApiError } from "../../../lib/api-error";

export interface UseLessonHandlersArgs {
  currentCourseId: string | null;
  currentCourseIdRef: RefObject<string | null>;
  refetchEditor: (options?: RefetchOptions) => Promise<
    QueryObserverResult<
      {
        course: {
          id: string;
          slug: string;
          title: string;
          status: "draft" | "published" | "archived";
          creatorId: string | null;
          version: number;
          createdAt: string;
          updatedAt: string;
          shortDescription?: string | null | undefined;
          description?: string | null | undefined;
          difficulty?:
            "beginner" | "intermediate" | "advanced" | null | undefined;
          categoryId?: string | null | undefined;
          thumbnailMediaId?: string | null | undefined;
          thumbnailUrl?: string | null | undefined;
          thumbnailSrcSet?:
            { url: string; width: number; height: number }[] | undefined;
          trailerMediaId?: string | null | undefined;
          instructorAlias?: string | null | undefined;
          publishedAt?: string | null | undefined;
          totalSections?: number | undefined;
          totalLessons?: number | undefined;
          totalDurationSeconds?: number | undefined;
        };
        sections: {
          id: string;
          title: string;
          position: number;
          lessons?:
            | {
                id: string;
                title: string;
                contentType: "video" | "document" | "quiz";
                position: number;
                isPreview: boolean;
                isPublished: boolean;
                description?: string | null | undefined;
                contentMediaId?: string | null | undefined;
                durationSeconds?: number | undefined;
                resources?:
                  | {
                      id: string;
                      mediaAssetId: string;
                      title: string;
                      mediaAsset?:
                        | {
                            originalFilename: string;
                            mimeType: string;
                            sizeBytes: number;
                            status:
                              | "uploading"
                              | "processing"
                              | "failed"
                              | "uploaded"
                              | "ready";
                          }
                        | undefined;
                    }[]
                  | undefined;
              }[]
            | undefined;
        }[];
        accessRules?:
          | {
              id: string;
              accessType: "everyone" | "restricted";
              durationType: "lifetime" | "fixed_duration" | "custom_expiration";
              durationDays?: number | null | undefined;
            }
          | null
          | undefined;
        pricing?:
          | {
              id: string;
              pricingType: "free" | "paid";
              price: number;
              currency: string;
              salePrice?: number | null | undefined;
              showDiscountBadge?: boolean | undefined;
            }
          | null
          | undefined;
        settings?:
          | {
              id: string;
              allowQa: boolean;
              allowComments: boolean;
              allowDownloads: boolean;
              allowNotes: boolean;
              certificateEnabled: boolean;
              showInstructorName: boolean;
              language: string;
              estimatedDuration?: number | null | undefined;
            }
          | null
          | undefined;
        includes?:
          | {
              id: string;
              text: string;
              position: number;
              detail?: string | null | undefined;
              icon?: string | null | undefined;
              color?: string | null | undefined;
              kind?: "custom" | "video" | undefined;
            }[]
          | undefined;
      },
      ApiError
    >
  >;
  refetchPreview: (options?: RefetchOptions) => Promise<
    QueryObserverResult<
      {
        course: {
          id: string;
          slug: string;
          title: string;
          status: "draft" | "published" | "archived";
          creatorId: string | null;
          version: number;
          createdAt: string;
          updatedAt: string;
          shortDescription?: string | null | undefined;
          description?: string | null | undefined;
          difficulty?:
            "beginner" | "intermediate" | "advanced" | null | undefined;
          categoryId?: string | null | undefined;
          thumbnailMediaId?: string | null | undefined;
          thumbnailUrl?: string | null | undefined;
          thumbnailSrcSet?:
            { url: string; width: number; height: number }[] | undefined;
          trailerMediaId?: string | null | undefined;
          instructorAlias?: string | null | undefined;
          publishedAt?: string | null | undefined;
          totalSections?: number | undefined;
          totalLessons?: number | undefined;
          totalDurationSeconds?: number | undefined;
        };
        sections: {
          id: string;
          title: string;
          position: number;
          lessons?:
            | {
                id: string;
                title: string;
                contentType: "video" | "document" | "quiz";
                position: number;
                isPreview: boolean;
                isPublished: boolean;
                description?: string | null | undefined;
                contentMediaId?: string | null | undefined;
                durationSeconds?: number | undefined;
                resources?:
                  | {
                      id: string;
                      mediaAssetId: string;
                      title: string;
                      mediaAsset?:
                        | {
                            originalFilename: string;
                            mimeType: string;
                            sizeBytes: number;
                            status:
                              | "uploading"
                              | "processing"
                              | "failed"
                              | "uploaded"
                              | "ready";
                          }
                        | undefined;
                    }[]
                  | undefined;
              }[]
            | undefined;
        }[];
        accessRules?:
          | {
              id: string;
              accessType: "everyone" | "restricted";
              durationType: "lifetime" | "fixed_duration" | "custom_expiration";
              durationDays?: number | null | undefined;
            }
          | null
          | undefined;
        pricing?:
          | {
              id: string;
              pricingType: "free" | "paid";
              price: number;
              currency: string;
              salePrice?: number | null | undefined;
              showDiscountBadge?: boolean | undefined;
            }
          | null
          | undefined;
        settings?:
          | {
              id: string;
              allowQa: boolean;
              allowComments: boolean;
              allowDownloads: boolean;
              allowNotes: boolean;
              certificateEnabled: boolean;
              showInstructorName: boolean;
              language: string;
              estimatedDuration?: number | null | undefined;
            }
          | null
          | undefined;
        includes?:
          | {
              id: string;
              text: string;
              position: number;
              detail?: string | null | undefined;
              icon?: string | null | undefined;
              color?: string | null | undefined;
              kind?: "custom" | "video" | undefined;
            }[]
          | undefined;
      },
      ApiError
    >
  >;
  createCourseMutation: UseMutationResult<
    {
      id: string;
      slug: string;
      title: string;
      version: number;
      instructorAlias?: string | null | undefined;
    },
    ApiError,
    {
      title: string;
      shortDescription?: string | null | undefined;
      description?: string | null | undefined;
      categoryId?: string | null | undefined;
      difficulty?: "beginner" | "intermediate" | "advanced" | null | undefined;
      difficultyLevel?:
        "beginner" | "intermediate" | "advanced" | null | undefined;
      thumbnailMediaId?: string | null | undefined;
      trailerMediaId?: string | null | undefined;
      instructorAlias?: string | null | undefined;
    },
    unknown
  >;
  createSectionMutation: UseMutationResult<
    { id: string; title: string },
    ApiError,
    { courseId: string; payload: CreateCourseSectionRequest },
    unknown
  >;
  createLessonMutation: UseMutationResult<
    { id: string },
    ApiError,
    { courseId: string; sectionId: string; payload: CreateCourseLessonRequest },
    unknown
  >;
  updateLessonMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; lessonId: string; payload: UpdateCourseLessonRequest },
    unknown
  >;
  deleteLessonMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; lessonId: string },
    unknown
  >;
  creatingLessonSectionId: string | null;
  setCreatingLessonSectionId: Dispatch<SetStateAction<string | null>>;
  setSavingLessonId: Dispatch<SetStateAction<string | null>>;
  setDeletingLessonId: Dispatch<SetStateAction<string | null>>;
  sections: CurriculumSectionItem[];
  setSections: Dispatch<SetStateAction<CurriculumSectionItem[]>>;
  sectionsRef: RefObject<CurriculumSectionItem[]>;
  lessonTitleDraftsRef: RefObject<Map<string, string>>;
  inFlightLessonSavesRef: RefObject<Map<string, Promise<boolean>>>;
  isSavingAllDirtyLessonsRef: RefObject<boolean>;
  clearCurriculumItemStatus: (itemId: string) => void;
  markCurriculumItemSaved: (itemId: string) => void;
  markCurriculumItemFailed: (itemId: string) => void;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  setDeleteModalState: Dispatch<
    SetStateAction<{
      isOpen: boolean;
      title: string;
      message: string;
      onConfirm: () => void;
    }>
  >;
}

export interface UseLessonHandlersResult {
  handleAddLesson: (sectionId: string) => Promise<void>;
  handleDeleteLesson: (sectionId: string, lessonId: string) => void;
  handleUpdateLesson: (
    sectionId: string,
    lessonId: string,
    updates: Partial<CurriculumLessonItem>,
  ) => void;
  handleCancelLessonDraft: (
    sectionId: string,
    lessonId: string,
    draft: LessonEditorDraft,
  ) => void;
  persistLesson: (
    sectionId: string,
    lessonId: string,
    options?: PersistLessonOptions,
  ) => Promise<boolean>;
  handleLessonFieldBlur: (sectionId: string, lessonId: string) => Promise<void>;
  handleStartEditLessonTitle: (sectionId: string, lessonId: string) => void;
  handleCancelEditLessonTitle: (sectionId: string, lessonId: string) => void;
  handleLessonTitleBlur: (sectionId: string, lessonId: string) => Promise<void>;
  handleCancelLessonDescriptionEdit: (
    sectionId: string,
    lessonId: string,
  ) => void;
  handleLessonDiscreteChange: (
    sectionId: string,
    lessonId: string,
    updates: Partial<CurriculumLessonItem>,
  ) => Promise<boolean>;
  handleLessonMediaAttached: (
    sectionId: string,
    lessonId: string,
    mediaAssetId: string,
  ) => Promise<boolean>;
  handleLessonProcessingComplete: () => Promise<void>;
  saveAllDirtyLessons: (explicitCourseId?: string | null) => Promise<boolean>;
  handleToggleLessonExpand: (
    sectionId: string,
    lessonId: string,
    nextExpanded?: boolean,
  ) => Promise<boolean>;
}

export function useLessonHandlers({
  currentCourseId,
  currentCourseIdRef,
  refetchEditor,
  refetchPreview,
  createCourseMutation,
  createSectionMutation,
  createLessonMutation,
  updateLessonMutation,
  deleteLessonMutation,
  creatingLessonSectionId,
  setCreatingLessonSectionId,
  setSavingLessonId,
  setDeletingLessonId,
  sections,
  setSections,
  sectionsRef,
  lessonTitleDraftsRef,
  inFlightLessonSavesRef,
  isSavingAllDirtyLessonsRef,
  clearCurriculumItemStatus,
  markCurriculumItemSaved,
  markCurriculumItemFailed,
  setToastMessage,
  setDeleteModalState,
}: UseLessonHandlersArgs): UseLessonHandlersResult {
  // Lesson actions
  const handleAddLesson = async (sectionId: string) => {
    if (
      creatingLessonSectionId ||
      createLessonMutation.isPending ||
      createCourseMutation.isPending ||
      createSectionMutation.isPending
    ) {
      return;
    }

    const sec = sections.find((s) => s.id === sectionId);
    if (!sec || sec.isPendingCreation) return;

    const tempLessonId = `temp-les-${Date.now()}`;
    const newLessonTitle = `New Lesson ${sec.lessons.length + 1}`;
    const optimisticLesson: CurriculumLessonItem = {
      id: tempLessonId,
      title: newLessonTitle,
      description: "",
      contentType: "video" as const,
      contentTypeSelected: true,
      isExpanded: true,
      isPublished: true,
      isPreview: false,
      contentMediaId: null,
      isPendingCreation: true,
      initialState: {
        title: newLessonTitle,
        description: "",
        contentType: "video",
        isPublished: true,
        isPreview: false,
      },
      resources: [],
    };

    // Show temporary lesson immediately
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          lessons: [
            ...s.lessons.map((l) => ({ ...l, isExpanded: false })),
            optimisticLesson,
          ],
        };
      }),
    );
    setCreatingLessonSectionId(sectionId);
    let targetCourseId = currentCourseId;

    if (!targetCourseId) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                lessons: s.lessons.filter((l) => l.id !== tempLessonId),
              }
            : s,
        ),
      );
      setToastMessage("Please enter a course title on the Basics tab first.");
      setCreatingLessonSectionId(null);
      return;
    }

    let targetSectionId = sectionId;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        targetSectionId,
      )
    ) {
      try {
        const createdSection = await createSectionMutation.mutateAsync({
          courseId: targetCourseId,
          payload: { title: sec.title },
        });
        targetSectionId = createdSection.id;
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, id: targetSectionId } : s,
          ),
        );
      } catch (err: unknown) {
        // Rollback temporary lesson
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  lessons: s.lessons.filter((l) => l.id !== tempLessonId),
                }
              : s,
          ),
        );
        const errorMsg =
          (err as { message?: string })?.message ||
          "Failed to create section on server.";
        setToastMessage(errorMsg);
        setCreatingLessonSectionId(null);
        return;
      }
    }

    try {
      const createdLesson = await createLessonMutation.mutateAsync({
        courseId: targetCourseId,
        sectionId: targetSectionId,
        payload: {
          title: newLessonTitle,
          contentType: "video",
          description: "",
        },
      });

      // Replace temporary ID with real backend UUID
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== targetSectionId && s.id !== sectionId) return s;
          const hasServerLesson = s.lessons.some(
            (l) => l.id === createdLesson.id,
          );
          if (hasServerLesson) {
            return {
              ...s,
              id: targetSectionId,
              lessons: s.lessons
                .filter((l) => l.id !== tempLessonId)
                .map((l) =>
                  l.id === createdLesson.id
                    ? { ...l, isPendingCreation: false }
                    : l,
                ),
            };
          }
          return {
            ...s,
            id: targetSectionId,
            lessons: s.lessons.map((l) =>
              l.id === tempLessonId
                ? {
                    ...l,
                    id: createdLesson.id,
                    isPendingCreation: false,
                    initialState: l.initialState || {
                      title: l.title,
                      description: l.description || "",
                      contentType: l.contentType,
                      contentMediaId: l.contentMediaId ?? null,
                      isPublished:
                        l.isPublished !== undefined ? l.isPublished : true,
                      isPreview:
                        l.isPreview !== undefined ? l.isPreview : false,
                    },
                  }
                : l,
            ),
          };
        }),
      );
    } catch (err: unknown) {
      // Rollback temporary lesson on failure
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== targetSectionId && s.id !== sectionId) return s;
          return {
            ...s,
            lessons: s.lessons.filter((l) => l.id !== tempLessonId),
          };
        }),
      );
      const errorMsg =
        (err as { message?: string })?.message || "Failed to create lesson.";
      setToastMessage(errorMsg);
    } finally {
      setCreatingLessonSectionId(null);
    }
  };

  const handleDeleteLesson = (sectionId: string, lessonId: string) => {
    const sec = sections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les) return;

    setDeleteModalState({
      isOpen: true,
      title: `Delete "${les.title}"?`,
      message: `Are you sure you want to delete lesson "${les.title}"? This action cannot be undone.`,
      onConfirm: async () => {
        if (
          currentCourseId &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            lessonId,
          )
        ) {
          setDeletingLessonId(lessonId);
          try {
            await deleteLessonMutation.mutateAsync({
              courseId: currentCourseId,
              lessonId,
            });
            setSections((prev) =>
              prev.map((s) => {
                if (s.id !== sectionId) return s;
                return {
                  ...s,
                  lessons: s.lessons.filter((l) => l.id !== lessonId),
                };
              }),
            );
            setToastMessage(`Lesson "${les.title}" deleted.`);
          } catch (err: unknown) {
            const errorMsg =
              (err as { message?: string })?.message ||
              "Failed to delete lesson.";
            setToastMessage(errorMsg);
          } finally {
            setDeletingLessonId(null);
          }
        } else {
          setSections((prev) =>
            prev.map((s) => {
              if (s.id !== sectionId) return s;
              return {
                ...s,
                lessons: s.lessons.filter((l) => l.id !== lessonId),
              };
            }),
          );
        }
      },
    });
  };

  const handleUpdateLesson = (
    sectionId: string,
    lessonId: string,
    updates: Partial<CurriculumLessonItem>,
  ) => {
    clearCurriculumItemStatus(lessonId);
    const currentSections = sectionsRef.current || sections;
    const nextSections = currentSections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        lessons: sec.lessons.map((l) =>
          l.id === lessonId ? { ...l, ...updates } : l,
        ),
      };
    });
    sectionsRef.current = nextSections;
    setSections(nextSections);
  };

  const handleCancelLessonDraft = (
    sectionId: string,
    lessonId: string,
    draft: LessonEditorDraft,
  ) => {
    const currentSections = sectionsRef.current || sections;
    const currentLesson = currentSections
      .find((section) => section.id === sectionId)
      ?.lessons.find((lesson) => lesson.id === lessonId);
    if (!currentLesson) return;

    writeLessonEditorDraft(currentCourseId, lessonId, {
      title: draft.title,
      description: currentLesson.description || "",
      contentType: draft.contentType,
      contentMediaId: currentLesson.contentMediaId ?? null,
      isPublished: draft.isPublished,
      isPreview: draft.isPreview,
    });

    handleUpdateLesson(sectionId, lessonId, {
      title: draft.title,
      contentType: draft.contentType,
      contentMediaId: currentLesson.contentMediaId ?? null,
      isPublished: draft.isPublished,
      isPreview: draft.isPreview,
    });
  };

  const persistLesson = async (
    sectionId: string,
    lessonId: string,
    options?: PersistLessonOptions,
  ): Promise<boolean> => {
    // If a save is already in-flight for this lesson, await it, then persist any subsequent edits
    const existingSave = inFlightLessonSavesRef.current.get(lessonId);
    if (existingSave) {
      await existingSave;
      return persistLesson(sectionId, lessonId, options);
    }

    const savePromise = (async () => {
      // 1. Find the freshest lesson draft
      const currentSections = sectionsRef.current || sections;
      const sec = currentSections.find((s) => s.id === sectionId);
      const les = sec?.lessons.find((l) => l.id === lessonId);
      if (!les || les.isPendingCreation) return false;

      // 2. Check whether it is dirty
      if (!isLessonDirty(les)) {
        clearLessonEditorDraft(currentCourseId, lessonId);
        return true;
      }

      // 3. Validate existing lesson title rules
      const trimmedTitle = les.title.trim();
      if (!trimmedTitle) {
        setToastMessage("Lesson title cannot be empty.");
        return false;
      }

      const isPublishedVal =
        les.isPublished !== undefined ? les.isPublished : true;
      const isPreviewVal = les.isPreview !== undefined ? les.isPreview : false;

      // 4. Snapshot the exact payload being persisted
      const persistedSnapshot = {
        title: trimmedTitle,
        description: les.description || "",
        contentType: (les.contentType === "audio"
          ? "video"
          : les.contentType === "image"
            ? "document"
            : les.contentType) as "video" | "document" | "quiz",
        contentMediaId: les.contentMediaId ?? null,
        durationSeconds: les.durationSeconds,
        isPublished: isPublishedVal,
        isPreview: isPreviewVal,
      };

      // Only what changed is sent: the API asks for a permission per field
      // (details, content, publishing), so an untouched field must not ask
      // for one the editor may not hold.
      const init = getLessonInitialState(les);
      const changes: UpdateCourseLessonRequest = {};
      if (trimmedTitle !== init.title.trim()) changes.title = trimmedTitle;
      if (persistedSnapshot.description !== (init.description || "")) {
        changes.description = persistedSnapshot.description;
      }
      if (les.contentType !== init.contentType) {
        changes.contentType = persistedSnapshot.contentType;
      }
      if (persistedSnapshot.contentMediaId !== (init.contentMediaId ?? null)) {
        changes.contentMediaId = persistedSnapshot.contentMediaId;
      }
      if (isPublishedVal !== (init.isPublished ?? true)) {
        changes.isPublished = isPublishedVal;
      }
      if (isPreviewVal !== (init.isPreview ?? false)) {
        changes.isPreview = isPreviewVal;
      }

      const targetCourseId = options?.explicitCourseId || currentCourseId;

      if (
        targetCourseId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          lessonId,
        )
      ) {
        setSavingLessonId(lessonId);
        try {
          await updateLessonMutation.mutateAsync({
            courseId: targetCourseId,
            lessonId,
            payload: changes,
          });

          setSections((prev) => {
            const next = prev.map((s) => {
              if (s.id !== sectionId) return s;
              return {
                ...s,
                lessons: s.lessons.map((l) => {
                  if (l.id !== lessonId) return l;
                  return {
                    ...l,
                    isExpanded: options?.collapseOnSuccess
                      ? false
                      : l.isExpanded,
                    initialState: {
                      ...persistedSnapshot,
                    },
                  };
                }),
              };
            });
            sectionsRef.current = next;
            return next;
          });

          markCurriculumItemSaved(lessonId);
          clearLessonEditorDraft(targetCourseId, lessonId);
          return true;
        } catch (err: unknown) {
          const errorMsg =
            (err as { message?: string })?.message ||
            "Failed to update lesson.";
          setToastMessage(errorMsg);
          markCurriculumItemFailed(lessonId);
          return false;
        } finally {
          setSavingLessonId(null);
        }
      } else {
        setSections((prev) => {
          const next = prev.map((s) => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              lessons: s.lessons.map((l) => {
                if (l.id !== lessonId) return l;
                return {
                  ...l,
                  isExpanded: options?.collapseOnSuccess ? false : l.isExpanded,
                  initialState: {
                    ...persistedSnapshot,
                  },
                };
              }),
            };
          });
          sectionsRef.current = next;
          return next;
        });
        clearLessonEditorDraft(targetCourseId, lessonId);
        return true;
      }
    })();

    inFlightLessonSavesRef.current.set(lessonId, savePromise);
    savePromise.finally(() => {
      inFlightLessonSavesRef.current.delete(lessonId);
    });

    return savePromise;
  };

  const handleSaveLesson = async (
    sectionId: string,
    lessonId: string,
  ): Promise<boolean> => {
    return await persistLesson(sectionId, lessonId, {
      collapseOnSuccess: true,
      showCleanToast: true,
    });
  };

  const handleLessonFieldBlur = async (sectionId: string, lessonId: string) => {
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les || les.isPendingCreation) return;
    if (!isLessonDirty(les)) return;

    await persistLesson(sectionId, lessonId, {
      collapseOnSuccess: false,
    });
  };

  const handleStartEditLessonTitle = (sectionId: string, lessonId: string) => {
    const currentSections = sectionsRef.current || sections;
    const lesson = currentSections
      .find((section) => section.id === sectionId)
      ?.lessons.find((item) => item.id === lessonId);
    if (!lesson || lesson.isPendingCreation) return;

    lessonTitleDraftsRef.current.set(lessonId, lesson.title);
    clearCurriculumItemStatus(lessonId);
    setSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              lessons: section.lessons.map((item) =>
                item.id === lessonId ? { ...item, isEditingTitle: true } : item,
              ),
            },
      ),
    );
  };

  const handleCancelEditLessonTitle = (sectionId: string, lessonId: string) => {
    const originalTitle = lessonTitleDraftsRef.current.get(lessonId);
    lessonTitleDraftsRef.current.delete(lessonId);
    setSections((prev) => {
      const next = prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              lessons: section.lessons.map((lesson) =>
                lesson.id === lessonId
                  ? {
                      ...lesson,
                      ...(originalTitle !== undefined
                        ? { title: originalTitle }
                        : {}),
                      isEditingTitle: false,
                    }
                  : lesson,
              ),
            },
      );
      sectionsRef.current = next;
      return next;
    });
  };

  const handleLessonTitleBlur = async (sectionId: string, lessonId: string) => {
    lessonTitleDraftsRef.current.delete(lessonId);
    await handleLessonFieldBlur(sectionId, lessonId);
    setSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              lessons: section.lessons.map((lesson) =>
                lesson.id === lessonId
                  ? { ...lesson, isEditingTitle: false }
                  : lesson,
              ),
            },
      ),
    );
  };

  const handleCancelLessonDescriptionEdit = (
    sectionId: string,
    lessonId: string,
  ) => {
    const currentSections = sectionsRef.current || sections;
    const lesson = currentSections
      .find((section) => section.id === sectionId)
      ?.lessons.find((item) => item.id === lessonId);
    if (!lesson) return;

    handleUpdateLesson(sectionId, lessonId, {
      description: lesson.initialState?.description || "",
    });
  };

  const handleLessonDiscreteChange = async (
    sectionId: string,
    lessonId: string,
    updates: Partial<CurriculumLessonItem>,
  ): Promise<boolean> => {
    const isContentTypeChange = Boolean(updates.contentType);
    handleUpdateLesson(sectionId, lessonId, updates);
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les || les.isPendingCreation) return false;
    if (!isLessonDirty(les)) {
      if (isContentTypeChange) {
        handleUpdateLesson(sectionId, lessonId, {
          contentTypeSelected: true,
          pendingContentType: undefined,
        });
      }
      return true;
    }

    const persisted = await persistLesson(sectionId, lessonId, {
      collapseOnSuccess: false,
    });
    if (persisted && isContentTypeChange) {
      handleUpdateLesson(sectionId, lessonId, {
        contentTypeSelected: true,
        pendingContentType: undefined,
      });
    }
    return persisted;
  };

  const handleLessonMediaAttached = async (
    sectionId: string,
    lessonId: string,
    mediaAssetId: string,
  ): Promise<boolean> => {
    const currentSections = sectionsRef.current || sections;
    const lesson = currentSections
      .find((section) => section.id === sectionId)
      ?.lessons.find((item) => item.id === lessonId);
    if (!lesson) return false;

    const courseId = currentCourseIdRef.current || currentCourseId;
    const isPersistedLesson =
      !lesson.isPendingCreation &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        lessonId,
      );
    if (!courseId || !isPersistedLesson) {
      // Unsaved lessons carry the media ID in their creation payload.
      handleUpdateLesson(sectionId, lessonId, { contentMediaId: mediaAssetId });
      return true;
    }

    // Persist the binding before exposing it to the editor. The media
    // workspace requests playback for the lesson as soon as it sees the new
    // media ID, and that request fails until the API lesson references it.
    try {
      await updateLessonMutation.mutateAsync({
        courseId,
        lessonId,
        payload: { contentMediaId: mediaAssetId },
      });
    } catch (err: unknown) {
      setToastMessage(
        (err as { message?: string })?.message ||
          "The video could not be attached to this lesson.",
      );
      return false;
    }

    clearVideoPlaybackBootstrapCache();
    // A cancelled editor leaves a local draft that wins over server data on
    // the next editor refresh. Keep its media in sync so the draft cannot
    // restore the replaced video.
    const storedDraft = readLessonEditorDraft(courseId, lessonId);
    if (storedDraft) {
      const { savedAt: _savedAt, ...draft } = storedDraft;
      writeLessonEditorDraft(courseId, lessonId, {
        ...draft,
        contentMediaId: mediaAssetId,
      });
    }
    const latestLesson = (sectionsRef.current || sections)
      .find((section) => section.id === sectionId)
      ?.lessons.find((item) => item.id === lessonId);
    handleUpdateLesson(sectionId, lessonId, {
      contentMediaId: mediaAssetId,
      ...(latestLesson?.initialState
        ? {
            initialState: {
              ...latestLesson.initialState,
              contentMediaId: mediaAssetId,
            },
          }
        : {}),
    });
    return true;
  };

  const handleLessonProcessingComplete = async (): Promise<void> => {
    if (!currentCourseIdRef.current) return;

    // The media stream is the source of truth for the terminal state. Once it
    // reports completion, refresh the derived editor/preview data so
    // duration and readiness are reflected everywhere without polling.
    await Promise.allSettled([refetchEditor(), refetchPreview()]);
  };

  const saveAllDirtyLessons = async (
    explicitCourseId?: string | null,
  ): Promise<boolean> => {
    if (isSavingAllDirtyLessonsRef.current) return false;
    isSavingAllDirtyLessonsRef.current = true;
    try {
      const currentSections = sectionsRef.current || sections;
      const dirtyLessons: Array<{ sectionId: string; lessonId: string }> = [];
      for (const sec of currentSections) {
        for (const les of sec.lessons) {
          if (isLessonDirty(les) && !les.isPendingCreation) {
            dirtyLessons.push({ sectionId: sec.id, lessonId: les.id });
          }
        }
      }

      if (dirtyLessons.length === 0) {
        return true;
      }

      const results = await Promise.all(
        dirtyLessons.map(({ sectionId, lessonId }) =>
          persistLesson(sectionId, lessonId, {
            collapseOnSuccess: false,
            explicitCourseId,
          }),
        ),
      );

      return results.every(Boolean);
    } finally {
      isSavingAllDirtyLessonsRef.current = false;
    }
  };

  const handleToggleLessonExpand = async (
    sectionId: string,
    lessonId: string,
    nextExpanded = true,
  ): Promise<boolean> => {
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    const les = sec?.lessons.find((l) => l.id === lessonId);
    if (!les) return false;

    if (!nextExpanded && isLessonDirty(les)) {
      return await handleSaveLesson(sectionId, lessonId);
    }

    return true;
  };
  return {
    handleAddLesson,
    handleDeleteLesson,
    handleUpdateLesson,
    handleCancelLessonDraft,
    persistLesson,
    handleLessonFieldBlur,
    handleStartEditLessonTitle,
    handleCancelEditLessonTitle,
    handleLessonTitleBlur,
    handleCancelLessonDescriptionEdit,
    handleLessonDiscreteChange,
    handleLessonMediaAttached,
    handleLessonProcessingComplete,
    saveAllDirtyLessons,
    handleToggleLessonExpand,
  };
}
