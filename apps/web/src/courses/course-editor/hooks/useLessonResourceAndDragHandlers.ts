import type { Dispatch, SetStateAction, RefObject } from "react";
import type { NavigateFunction } from "react-router";
import type { LessonResourceItem } from "../../lesson-resources/LessonResourceManager";
import { getCourseEditorPath } from "../../courseEditorRouting";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  CourseEditorDataResponse,
  CreateLessonResourceRequest,
  LessonResource,
  ReorderLessonsRequest,
} from "@veolms/contracts";
import {
  type CurriculumLessonItem,
  type CurriculumSectionItem,
  type DraggedLessonState,
  type LessonDropTarget,
  isLessonDirty,
} from "../curriculumItems";
import { setCustomDragImage, lessonGhostHtml } from "../dragGhosts";
import type { PersistLessonOptions } from "../editorLocalTypes";
import type { ApiError } from "../../../lib/api-error";

export interface UseLessonResourceAndDragHandlersArgs {
  navigate: NavigateFunction;
  activeEditId: string | null;
  currentCourseId: string | null;
  courseVersion: number;
  setCourseVersion: Dispatch<SetStateAction<number>>;
  isEditing: boolean;
  createLessonResourceMutation: UseMutationResult<
    {
      id: string;
      mediaAssetId: string;
      title: string;
      mediaAsset?:
        | {
            originalFilename: string;
            mimeType: string;
            sizeBytes: number;
            status:
              "uploading" | "processing" | "failed" | "uploaded" | "ready";
          }
        | undefined;
    },
    ApiError,
    {
      courseId: string;
      lessonId: string;
      payload: CreateLessonResourceRequest;
    },
    unknown
  >;
  deleteLessonResourceMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; resourceId: string },
    unknown
  >;
  reorderLessonsMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; sectionId: string; payload: ReorderLessonsRequest },
    { previousEditorData?: CourseEditorDataResponse }
  >;
  savingLessonId: string | null;
  deletingLessonId: string | null;
  reorderingLessonsSectionId: string | null;
  setReorderingLessonsSectionId: Dispatch<SetStateAction<string | null>>;
  sections: CurriculumSectionItem[];
  setSections: Dispatch<SetStateAction<CurriculumSectionItem[]>>;
  sectionsRef: RefObject<CurriculumSectionItem[]>;
  sectionScrollDelayRef: RefObject<number>;
  isCollapsingSectionRef: RefObject<boolean>;
  isSavingAllDirtyLessonsRef: RefObject<boolean>;
  dragInitialLessonStateRef: RefObject<{
    sectionId: string;
    lessonIds: string[];
    previousLessons: CurriculumLessonItem[];
  } | null>;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  setDraggedLessonState: Dispatch<SetStateAction<DraggedLessonState | null>>;
  draggedLessonStateRef: RefObject<DraggedLessonState | null>;
  setLessonDropTarget: Dispatch<SetStateAction<LessonDropTarget | null>>;
  lessonDropTargetRef: RefObject<LessonDropTarget | null>;
  setDragEnabledLessonId: Dispatch<SetStateAction<string | null>>;
  persistLesson: (
    sectionId: string,
    lessonId: string,
    options?: PersistLessonOptions,
  ) => Promise<boolean>;
}

export interface UseLessonResourceAndDragHandlersResult {
  navigateToCurriculumFocus: (
    sectionId?: string | null,
    lessonId?: string | null,
  ) => void;
  handleToggleSectionExpand: (sectionId: string) => Promise<void>;
  handleCreateLessonResource: (
    lessonId: string,
    payload: CreateLessonResourceRequest,
  ) => Promise<LessonResource>;
  handleLessonResourceAdded: (
    sectionId: string,
    lessonId: string,
    resource: LessonResourceItem,
  ) => void;
  handleDeleteLessonResource: (resourceId: string) => Promise<void>;
  handleLessonResourceRemoved: (
    sectionId: string,
    lessonId: string,
    resource: LessonResourceItem,
  ) => void;
  handleLessonDragStart: (
    e: React.DragEvent,
    sectionId: string,
    lessonIndex: number,
    lesson: CurriculumLessonItem,
  ) => void;
  handleLessonDragOver: (
    e: React.DragEvent,
    targetSectionId: string,
    targetLessonId: string,
  ) => void;
  handleLessonDragEnd: () => Promise<void>;
}

export function useLessonResourceAndDragHandlers({
  navigate,
  activeEditId,
  currentCourseId,
  courseVersion,
  setCourseVersion,
  isEditing,
  createLessonResourceMutation,
  deleteLessonResourceMutation,
  reorderLessonsMutation,
  savingLessonId,
  deletingLessonId,
  reorderingLessonsSectionId,
  setReorderingLessonsSectionId,
  sections,
  setSections,
  sectionsRef,
  sectionScrollDelayRef,
  isCollapsingSectionRef,
  isSavingAllDirtyLessonsRef,
  dragInitialLessonStateRef,
  setToastMessage,
  setDraggedLessonState,
  draggedLessonStateRef,
  setLessonDropTarget,
  lessonDropTargetRef,
  setDragEnabledLessonId,
  persistLesson,
}: UseLessonResourceAndDragHandlersArgs): UseLessonResourceAndDragHandlersResult {
  const navigateToCurriculumFocus = (
    sectionId?: string | null,
    lessonId?: string | null,
  ) => {
    void navigate(
      getCourseEditorPath({
        mode: isEditing ? "edit" : "create",
        courseId: activeEditId,
        step: "curriculum",
        sectionId,
        lessonId,
      }),
    );
  };

  const handleToggleSectionExpand = async (sectionId: string) => {
    const currentSections = sectionsRef.current || sections;
    const sec = currentSections.find((s) => s.id === sectionId);
    if (!sec) return;

    // 1. When the section is being EXPANDED:
    if (!sec.isExpanded) {
      if (
        isCollapsingSectionRef.current ||
        isSavingAllDirtyLessonsRef.current
      ) {
        return;
      }

      const sectionsToCollapse = currentSections.filter(
        (section) => section.id !== sectionId && section.isExpanded,
      );
      const targetIndex = currentSections.findIndex(
        (section) => section.id === sectionId,
      );
      sectionScrollDelayRef.current = currentSections
        .slice(0, targetIndex)
        .some((section) => section.isExpanded)
        ? 300
        : 0;
      const dirtyLessons = sectionsToCollapse.flatMap((section) =>
        section.lessons
          .filter(
            (lesson) => isLessonDirty(lesson) && !lesson.isPendingCreation,
          )
          .map((lesson) => ({ sectionId: section.id, lesson })),
      );

      if (dirtyLessons.length > 0) {
        isCollapsingSectionRef.current = true;
        let allSuccessful = true;
        try {
          for (const { sectionId: dirtySectionId, lesson } of dirtyLessons) {
            const success = await persistLesson(dirtySectionId, lesson.id, {
              collapseOnSuccess: true,
            });
            if (!success) {
              allSuccessful = false;
              break;
            }
          }
        } finally {
          isCollapsingSectionRef.current = false;
        }
        if (!allSuccessful) return;
      }

      setSections((prev) => {
        const next = prev.map((section) =>
          section.id === sectionId
            ? { ...section, isExpanded: true }
            : section.isExpanded
              ? { ...section, isExpanded: false }
              : section,
        );
        sectionsRef.current = next;
        return next;
      });
      navigateToCurriculumFocus(sectionId);
      return;
    }

    // 2. When the section is being COLLAPSED:
    // Find dirty lessons in that section
    const dirtyLessons = sec.lessons.filter(
      (l) => isLessonDirty(l) && !l.isPendingCreation,
    );

    // No dirty lessons? Collapse immediately
    if (dirtyLessons.length === 0) {
      setSections((prev) => {
        const next = prev.map((s) =>
          s.id === sectionId ? { ...s, isExpanded: false } : s,
        );
        sectionsRef.current = next;
        return next;
      });
      navigateToCurriculumFocus();
      return;
    }

    // Guard against re-entrancy if already collapsing or saving
    if (isCollapsingSectionRef.current || isSavingAllDirtyLessonsRef.current) {
      return;
    }

    // Dirty lessons? Save dirty lesson(s)
    isCollapsingSectionRef.current = true;
    let allSuccessful = true;
    try {
      for (const lesson of dirtyLessons) {
        const success = await persistLesson(sectionId, lesson.id, {
          collapseOnSuccess: true,
        });
        if (!success) {
          allSuccessful = false;
          break;
        }
      }
    } finally {
      isCollapsingSectionRef.current = false;
    }

    // All saves successful?
    // Yes -> Collapse section
    // No  -> Keep section expanded
    if (allSuccessful) {
      setSections((prev) => {
        const next = prev.map((s) =>
          s.id === sectionId ? { ...s, isExpanded: false } : s,
        );
        sectionsRef.current = next;
        return next;
      });
      navigateToCurriculumFocus();
    }
  };

  const handleCreateLessonResource = async (
    lessonId: string,
    payload: CreateLessonResourceRequest,
  ): Promise<LessonResource> => {
    if (!currentCourseId) {
      throw new Error("Save the course before adding lesson resources.");
    }
    return await createLessonResourceMutation.mutateAsync({
      courseId: currentCourseId,
      lessonId,
      payload,
    });
  };

  const handleLessonResourceAdded = (
    sectionId: string,
    lessonId: string,
    resource: LessonResourceItem,
  ) => {
    setSections((prev) => {
      const next = prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) => {
            if (l.id !== lessonId) return l;
            if (l.resources.some((existing) => existing.id === resource.id)) {
              return l;
            }
            return {
              ...l,
              resources: [...l.resources, resource],
            };
          }),
        };
      });
      sectionsRef.current = next;
      return next;
    });
  };

  const handleDeleteLessonResource = async (
    resourceId: string,
  ): Promise<void> => {
    if (!currentCourseId) {
      throw new Error("Save the course before removing lesson resources.");
    }
    await deleteLessonResourceMutation.mutateAsync({
      courseId: currentCourseId,
      resourceId,
    });
  };

  const handleLessonResourceRemoved = (
    sectionId: string,
    lessonId: string,
    resource: LessonResourceItem,
  ) => {
    setSections((prev) => {
      const next = prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lessons: sec.lessons.map((l) => {
            if (l.id !== lessonId) return l;
            return {
              ...l,
              resources: l.resources.filter((r) => r.id !== resource.id),
            };
          }),
        };
      });
      sectionsRef.current = next;
      return next;
    });
  };

  // Lesson Drag and Drop handlers
  const handleLessonDragStart = (
    e: React.DragEvent,
    sectionId: string,
    lessonIndex: number,
    lesson: CurriculumLessonItem,
  ) => {
    if (
      reorderingLessonsSectionId ||
      reorderLessonsMutation.isPending ||
      savingLessonId ||
      deletingLessonId
    ) {
      e.preventDefault();
      return;
    }
    const currentSec = sectionsRef.current.find((s) => s.id === sectionId);
    const nextDraggedLessonState = { sectionId, lessonId: lesson.id };
    dragInitialLessonStateRef.current = {
      sectionId,
      lessonIds: currentSec ? currentSec.lessons.map((l) => l.id) : [],
      previousLessons: currentSec ? structuredClone(currentSec.lessons) : [],
    };
    draggedLessonStateRef.current = nextDraggedLessonState;
    setDraggedLessonState(nextDraggedLessonState);
    lessonDropTargetRef.current = null;
    setLessonDropTarget(null);
    setCustomDragImage(
      e,
      e.currentTarget as HTMLElement,
      lessonGhostHtml(
        lesson.title,
        lessonIndex,
        lesson.pendingContentType || lesson.contentType,
      ),
    );
    e.stopPropagation();
  };

  const handleLessonDragOver = (
    e: React.DragEvent,
    targetSectionId: string,
    targetLessonId: string,
  ) => {
    const draggedLesson = draggedLessonStateRef.current;
    if (!draggedLesson || targetSectionId !== draggedLesson.sectionId) return;
    e.preventDefault();
    e.stopPropagation();
    if (targetLessonId === draggedLesson.lessonId) {
      lessonDropTargetRef.current = null;
      setLessonDropTarget(null);
      return;
    }

    const targetRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const position =
      e.clientY < targetRect.top + targetRect.height / 2 ? "before" : "after";
    const nextDropTarget = {
      sectionId: targetSectionId,
      lessonId: targetLessonId,
      position,
    } satisfies LessonDropTarget;
    lessonDropTargetRef.current = nextDropTarget;
    setLessonDropTarget(nextDropTarget);
  };

  const handleLessonDragEnd = async () => {
    const initial = dragInitialLessonStateRef.current;
    const draggedLesson = draggedLessonStateRef.current;
    const dropTarget = lessonDropTargetRef.current;
    setDraggedLessonState(null);
    setDragEnabledLessonId(null);
    draggedLessonStateRef.current = null;
    lessonDropTargetRef.current = null;
    setLessonDropTarget(null);
    dragInitialLessonStateRef.current = null;

    if (
      !initial ||
      !draggedLesson ||
      !dropTarget ||
      dropTarget.sectionId !== initial.sectionId
    ) {
      return;
    }

    const currentSec = sectionsRef.current.find(
      (s) => s.id === initial.sectionId,
    );
    if (!currentSec) return;

    const sourceIndex = currentSec.lessons.findIndex(
      (lesson) => lesson.id === draggedLesson.lessonId,
    );
    const targetIndex = currentSec.lessons.findIndex(
      (lesson) => lesson.id === dropTarget.lessonId,
    );
    if (sourceIndex < 0 || targetIndex < 0) return;

    let insertionIndex =
      targetIndex + (dropTarget.position === "after" ? 1 : 0);
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    if (sourceIndex === insertionIndex) return;

    const nextLessons = [...currentSec.lessons];
    const [movedLesson] = nextLessons.splice(sourceIndex, 1);
    if (!movedLesson) return;
    nextLessons.splice(insertionIndex, 0, movedLesson);

    const nextSections = sectionsRef.current.map((section) =>
      section.id === initial.sectionId
        ? { ...section, lessons: nextLessons }
        : section,
    );
    sectionsRef.current = nextSections;
    setSections(nextSections);

    const currentLessonIds = nextLessons.map((l) => l.id);
    const initialLessonIds = initial.lessonIds;

    const orderChanged =
      initialLessonIds.length === currentLessonIds.length &&
      initialLessonIds.some((id, idx) => id !== currentLessonIds[idx]);

    if (!orderChanged) return;

    if (
      currentCourseId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        initial.sectionId,
      )
    ) {
      const allValidUuids = currentLessonIds.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ),
      );

      if (allValidUuids) {
        setReorderingLessonsSectionId(initial.sectionId);
        try {
          await reorderLessonsMutation.mutateAsync({
            courseId: currentCourseId,
            sectionId: initial.sectionId,
            payload: {
              orderedLessonIds: currentLessonIds,
              version: courseVersion || 1,
            },
          });
          setCourseVersion((prev) => prev + 1);
        } catch (err: unknown) {
          // Rollback to previous order on failure
          setSections((prev) =>
            prev.map((s) => {
              if (s.id !== initial.sectionId) return s;
              return {
                ...s,
                lessons: initial.previousLessons,
              };
            }),
          );
          const errorMsg =
            (err as { message?: string })?.message ||
            "Failed to save lesson order. Restored previous order.";
          setToastMessage(errorMsg);
        } finally {
          setReorderingLessonsSectionId(null);
        }
      }
    }
  };
  return {
    navigateToCurriculumFocus,
    handleToggleSectionExpand,
    handleCreateLessonResource,
    handleLessonResourceAdded,
    handleDeleteLessonResource,
    handleLessonResourceRemoved,
    handleLessonDragStart,
    handleLessonDragOver,
    handleLessonDragEnd,
  };
}
