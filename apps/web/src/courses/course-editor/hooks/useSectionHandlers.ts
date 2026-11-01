import {
  useState,
  useRef,
  useMemo,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  CourseEditorDataResponse,
  CreateCourseSectionRequest,
  UpdateCourseSectionRequest,
  ReorderSectionsRequest,
} from "@veolms/contracts";
import type {
  CurriculumSectionItem,
  DraggedLessonState,
  LessonDropTarget,
} from "../curriculumItems";
import { setCustomDragImage, sectionGhostHtml } from "../dragGhosts";
import type { ApiError } from "../../../lib/api-error";

export interface UseSectionHandlersArgs {
  mountedLessonEditorIds: string[];
  currentCourseId: string | null;
  courseVersion: number;
  setCourseVersion: Dispatch<SetStateAction<number>>;
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
  updateSectionMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    {
      courseId: string;
      sectionId: string;
      payload: UpdateCourseSectionRequest;
    },
    unknown
  >;
  deleteSectionMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; sectionId: string },
    unknown
  >;
  reorderSectionsMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; payload: ReorderSectionsRequest },
    { previousEditorData?: CourseEditorDataResponse }
  >;
  isCreatingSection: boolean;
  setIsCreatingSection: Dispatch<SetStateAction<boolean>>;
  isReorderingSections: boolean;
  setIsReorderingSections: Dispatch<SetStateAction<boolean>>;
  setUpdatingSectionId: Dispatch<SetStateAction<string | null>>;
  updatingSectionId: string | null;
  deletingSectionId: string | null;
  setDeletingSectionId: Dispatch<SetStateAction<string | null>>;
  sections: CurriculumSectionItem[];
  setSections: Dispatch<SetStateAction<CurriculumSectionItem[]>>;
  sectionsRef: RefObject<CurriculumSectionItem[]>;
  pendingAddedSectionScrollRef: RefObject<string | null>;
  dragInitialSectionsStateRef: RefObject<{
    sectionIds: string[];
    previousSections: CurriculumSectionItem[];
  } | null>;
  clearCurriculumItemStatus: (itemId: string) => void;
  markCurriculumItemSaved: (itemId: string) => void;
  markCurriculumItemFailed: (itemId: string) => void;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
}

export interface UseSectionHandlersResult {
  draggedSectionIndex: number | null;
  dragEnabledSectionId: string | null;
  setDragEnabledSectionId: Dispatch<SetStateAction<string | null>>;
  draggedLessonState: DraggedLessonState | null;
  setDraggedLessonState: Dispatch<SetStateAction<DraggedLessonState | null>>;
  pinnedVirtualizedLessonIds: Set<string>;
  draggedLessonStateRef: RefObject<DraggedLessonState | null>;
  lessonDropTarget: LessonDropTarget | null;
  setLessonDropTarget: Dispatch<SetStateAction<LessonDropTarget | null>>;
  lessonDropTargetRef: RefObject<LessonDropTarget | null>;
  dragEnabledLessonId: string | null;
  setDragEnabledLessonId: Dispatch<SetStateAction<string | null>>;
  deleteModalState: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  };
  setDeleteModalState: Dispatch<
    SetStateAction<{
      isOpen: boolean;
      title: string;
      message: string;
      onConfirm: () => void;
    }>
  >;
  handleAddSection: () => Promise<void>;
  handleStartEditSectionTitle: (sectionId: string) => void;
  handleSaveSectionTitle: (
    sectionId: string,
    newTitle: string,
  ) => Promise<void>;
  handleDeleteSection: (sectionId: string) => void;
  handleSectionDragStart: (
    e: React.DragEvent,
    index: number,
    section: CurriculumSectionItem,
  ) => void;
  handleSectionDragOver: (e: React.DragEvent, index: number) => void;
  handleSectionDragEnd: () => Promise<void>;
}

export function useSectionHandlers({
  mountedLessonEditorIds,
  currentCourseId,
  courseVersion,
  setCourseVersion,
  createCourseMutation,
  createSectionMutation,
  updateSectionMutation,
  deleteSectionMutation,
  reorderSectionsMutation,
  isCreatingSection,
  setIsCreatingSection,
  isReorderingSections,
  setIsReorderingSections,
  setUpdatingSectionId,
  updatingSectionId,
  deletingSectionId,
  setDeletingSectionId,
  sections,
  setSections,
  sectionsRef,
  pendingAddedSectionScrollRef,
  dragInitialSectionsStateRef,
  clearCurriculumItemStatus,
  markCurriculumItemSaved,
  markCurriculumItemFailed,
  setToastMessage,
}: UseSectionHandlersArgs): UseSectionHandlersResult {
  // Drag and Drop state for Sections & Lessons
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(
    null,
  );
  const [dragEnabledSectionId, setDragEnabledSectionId] = useState<
    string | null
  >(null);

  const [draggedLessonState, setDraggedLessonState] =
    useState<DraggedLessonState | null>(null);
  const pinnedVirtualizedLessonIds = useMemo(
    () =>
      new Set([
        ...mountedLessonEditorIds,
        ...(draggedLessonState ? [draggedLessonState.lessonId] : []),
      ]),
    [draggedLessonState, mountedLessonEditorIds],
  );
  const draggedLessonStateRef = useRef<DraggedLessonState | null>(null);
  const [lessonDropTarget, setLessonDropTarget] =
    useState<LessonDropTarget | null>(null);
  const lessonDropTargetRef = useRef<LessonDropTarget | null>(null);
  const [dragEnabledLessonId, setDragEnabledLessonId] = useState<string | null>(
    null,
  );

  // Reusable Delete Confirmation Modal state
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Section actions
  const handleAddSection = async () => {
    if (
      isCreatingSection ||
      createSectionMutation.isPending ||
      createCourseMutation.isPending
    )
      return;

    const tempSectionId = `temp-sec-${Date.now()}`;
    const newSectionTitle = "Title";
    const optimisticSection: CurriculumSectionItem = {
      id: tempSectionId,
      title: newSectionTitle,
      isExpanded: true,
      isEditingTitle: false,
      isPendingCreation: true,
      lessons: [],
    };

    // Show temporary section immediately
    pendingAddedSectionScrollRef.current = tempSectionId;
    setSections((prev) => [...prev, optimisticSection]);
    setIsCreatingSection(true);

    let targetCourseId = currentCourseId;
    if (!targetCourseId) {
      pendingAddedSectionScrollRef.current = null;
      setSections((prev) => prev.filter((s) => s.id !== tempSectionId));
      setToastMessage("Please enter a course title on the Basics tab first.");
      setIsCreatingSection(false);
      return;
    }

    try {
      const createdSection = await createSectionMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          title: newSectionTitle,
        },
      });

      // Replace temporary ID with real backend UUID
      if (pendingAddedSectionScrollRef.current === tempSectionId) {
        pendingAddedSectionScrollRef.current = createdSection.id;
      }
      setSections((prev) => {
        const hasServerSection = prev.some((s) => s.id === createdSection.id);
        if (hasServerSection) {
          return prev
            .filter((s) => s.id !== tempSectionId)
            .map((s) =>
              s.id === createdSection.id
                ? { ...s, isPendingCreation: false }
                : s,
            );
        }
        return prev.map((s) =>
          s.id === tempSectionId
            ? {
                ...s,
                id: createdSection.id,
                title: createdSection.title,
                isPendingCreation: false,
              }
            : s,
        );
      });
    } catch (err: unknown) {
      // Rollback temporary section on failure
      if (pendingAddedSectionScrollRef.current === tempSectionId) {
        pendingAddedSectionScrollRef.current = null;
      }
      setSections((prev) => prev.filter((s) => s.id !== tempSectionId));
      const errorMsg =
        (err as { message?: string })?.message || "Failed to create section.";
      setToastMessage(errorMsg);
    } finally {
      setIsCreatingSection(false);
    }
  };

  const handleStartEditSectionTitle = (sectionId: string) => {
    clearCurriculumItemStatus(sectionId);
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, isEditingTitle: true } : s,
      ),
    );
  };

  const handleSaveSectionTitle = async (
    sectionId: string,
    newTitle: string,
  ) => {
    const trimmedTitle = newTitle.trim();
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;

    if (!trimmedTitle || trimmedTitle === sec.title) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId ? { ...s, isEditingTitle: false } : s,
        ),
      );
      return;
    }

    if (currentCourseId) {
      setUpdatingSectionId(sectionId);
      try {
        await updateSectionMutation.mutateAsync({
          courseId: currentCourseId,
          sectionId,
          payload: { title: trimmedTitle },
        });
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId
              ? { ...s, title: trimmedTitle, isEditingTitle: false }
              : s,
          ),
        );
        markCurriculumItemSaved(sectionId);
      } catch (err: unknown) {
        const errorMsg =
          (err as { message?: string })?.message ||
          "Failed to update section title.";
        setToastMessage(errorMsg);
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, isEditingTitle: false } : s,
          ),
        );
        markCurriculumItemFailed(sectionId);
      } finally {
        setUpdatingSectionId(null);
      }
    } else {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, title: trimmedTitle, isEditingTitle: false }
            : s,
        ),
      );
    }
  };

  const handleDeleteSection = (sectionId: string) => {
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;
    setDeleteModalState({
      isOpen: true,
      title: `Delete "${sec.title}"?`,
      message: `Are you sure you want to delete "${sec.title}" and its ${sec.lessons.length} lessons? This action cannot be undone.`,
      onConfirm: async () => {
        if (currentCourseId) {
          setDeletingSectionId(sectionId);
          try {
            await deleteSectionMutation.mutateAsync({
              courseId: currentCourseId,
              sectionId,
            });
            setSections((prev) => prev.filter((s) => s.id !== sectionId));
            setToastMessage(`Section "${sec.title}" deleted.`);
          } catch (err: unknown) {
            const errorMsg =
              (err as { message?: string })?.message ||
              "Failed to delete section.";
            setToastMessage(errorMsg);
          } finally {
            setDeletingSectionId(null);
          }
        } else {
          setSections((prev) => prev.filter((s) => s.id !== sectionId));
        }
      },
    });
  };

  // Section Drag and Drop handlers
  const handleSectionDragStart = (
    e: React.DragEvent,
    index: number,
    section: CurriculumSectionItem,
  ) => {
    if (
      isReorderingSections ||
      reorderSectionsMutation.isPending ||
      updatingSectionId ||
      deletingSectionId
    ) {
      e.preventDefault();
      return;
    }
    dragInitialSectionsStateRef.current = {
      sectionIds: sectionsRef.current.map((s) => s.id),
      previousSections: structuredClone(sectionsRef.current),
    };
    setDraggedSectionIndex(index);
    setCustomDragImage(
      e,
      e.currentTarget as HTMLElement,
      sectionGhostHtml(section.title, index, section.lessons.length),
    );
  };

  const handleSectionDragOver = (e: React.DragEvent, index: number) => {
    if (draggedLessonStateRef.current) return;
    e.preventDefault();
    if (draggedSectionIndex === null || draggedSectionIndex === index) return;
    setSections((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(draggedSectionIndex, 1);
      if (moved) {
        copy.splice(index, 0, moved);
      }
      return copy;
    });
    setDraggedSectionIndex(index);
  };

  const handleSectionDragEnd = async () => {
    const initial = dragInitialSectionsStateRef.current;
    setDraggedSectionIndex(null);
    setDragEnabledSectionId(null);
    dragInitialSectionsStateRef.current = null;

    if (!initial) return;

    const initialIds = initial.sectionIds;
    const currentSections = sectionsRef.current;
    const currentIds = currentSections.map((s) => s.id);

    // Check if order actually changed
    const orderChanged =
      initialIds.length === currentIds.length &&
      initialIds.some((id, idx) => id !== currentIds[idx]);

    if (!orderChanged) return;

    if (currentCourseId) {
      // Validate that all IDs are valid UUIDs (persisted sections)
      const allValidUuids = currentIds.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ),
      );

      if (allValidUuids) {
        setIsReorderingSections(true);
        try {
          await reorderSectionsMutation.mutateAsync({
            courseId: currentCourseId,
            payload: {
              orderedSectionIds: currentIds,
              version: courseVersion || 1,
            },
          });
          setCourseVersion((prev) => prev + 1);
        } catch (err: unknown) {
          // Rollback to previous sections order on failure
          setSections(initial.previousSections);
          const errorMsg =
            (err as { message?: string })?.message ||
            "Failed to save section order. Restored previous order.";
          setToastMessage(errorMsg);
        } finally {
          setIsReorderingSections(false);
        }
      }
    }
  };
  return {
    draggedSectionIndex,
    dragEnabledSectionId,
    setDragEnabledSectionId,
    draggedLessonState,
    setDraggedLessonState,
    pinnedVirtualizedLessonIds,
    draggedLessonStateRef,
    lessonDropTarget,
    setLessonDropTarget,
    lessonDropTargetRef,
    dragEnabledLessonId,
    setDragEnabledLessonId,
    deleteModalState,
    setDeleteModalState,
    handleAddSection,
    handleStartEditSectionTitle,
    handleSaveSectionTitle,
    handleDeleteSection,
    handleSectionDragStart,
    handleSectionDragOver,
    handleSectionDragEnd,
  };
}
