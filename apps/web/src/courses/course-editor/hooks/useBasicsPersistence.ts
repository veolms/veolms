import type { Dispatch, SetStateAction, RefObject } from "react";
import { categoryChangeToSend } from "../../basicsCategoryDraft";
import { basicsChangeToSend } from "../../basicsDraftChange";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  UpdateCourseBasicsRequest,
  CreateCourseSectionRequest,
  CreateCourseLessonRequest,
  UpdateCourseSettingsRequest,
} from "@veolms/contracts";
import { type BasicsFormState, normalizeBasicsState } from "../basicsState";
import type {
  CurriculumLessonItem,
  CurriculumSectionItem,
} from "../curriculumItems";
import type { BasicsFieldKey } from "../statusIndicators";
import type { ApiError } from "../../../lib/api-error";

export interface UseBasicsPersistenceArgs {
  setServerBasics: Dispatch<SetStateAction<BasicsFormState>>;
  setBasicsDraft: Dispatch<SetStateAction<BasicsFormState>>;
  serverBasicsRef: RefObject<BasicsFormState>;
  basicsDraftRef: RefObject<BasicsFormState>;
  setCourseTitle: (title: string) => void;
  setShortDescription: (shortDescription: string) => void;
  setCourseDescription: (description: string) => void;
  setInstructorAlias: (instructorAlias: string) => void;
  setShowInstructorName: (showInstructorName: boolean) => void;
  currentCourseId: string | null;
  setCurrentCourseId: Dispatch<SetStateAction<string | null>>;
  setCourseVersion: Dispatch<SetStateAction<number>>;
  courseVersionRef: RefObject<number>;
  currentCourseIdRef: RefObject<string | null>;
  basicsVersionRef: RefObject<number>;
  inFlightBasicsControlsRef: RefObject<Record<string, number>>;
  inFlightBasicsPromiseRef: RefObject<Promise<unknown> | null>;
  inFlightCourseCreationPromiseRef: RefObject<Promise<{
    id: string;
    version: number;
    title: string;
    instructorAlias?: string | null;
  }> | null>;
  cancelTitleCreationDebounce: () => void;
  markBasicsControlSaving: (controlKey: string, isSaving: boolean) => void;
  clearBasicsFieldStatus: (fieldKey: BasicsFieldKey) => void;
  markBasicsFieldSaved: (fieldKey: BasicsFieldKey) => void;
  markBasicsFieldFailed: (fieldKey: BasicsFieldKey) => void;
  setIsInitialCurriculumBootstrapInProgress: Dispatch<SetStateAction<boolean>>;
  isInitialCurriculumBootstrapInProgressRef: RefObject<boolean>;
  setShowTitleTooltip: Dispatch<SetStateAction<boolean>>;
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
  updateBasicsMutation: UseMutationResult<
    {
      id: string;
      slug: string;
      title: string;
      version: number;
      shortDescription?: string | null | undefined;
      description?: string | null | undefined;
      difficulty?: "beginner" | "intermediate" | "advanced" | null | undefined;
      categoryId?: string | null | undefined;
      instructorAlias?: string | null | undefined;
    },
    ApiError,
    { id: string; payload: UpdateCourseBasicsRequest },
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
  upsertSettingsMutation: UseMutationResult<
    {
      id: string;
      allowQa: boolean;
      allowComments: boolean;
      allowDownloads: boolean;
      allowNotes: boolean;
      certificateEnabled: boolean;
      showInstructorName: boolean;
      language: string;
      estimatedDuration?: number | null | undefined;
    },
    ApiError,
    { courseId: string; payload: UpdateCourseSettingsRequest },
    unknown
  >;
  setSections: Dispatch<SetStateAction<CurriculumSectionItem[]>>;
  sectionsRef: RefObject<CurriculumSectionItem[]>;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
}

export interface UseBasicsPersistenceResult {
  executeSerializedBasicsMetaMutation: (
    controlKey:
      "title" | "shortDescription" | "courseDescription" | "instructorAlias",
    targetVersion: number,
    previousSnapshot: BasicsFormState,
  ) => Promise<
    | {
        id: string;
        slug: string;
        title: string;
        version: number;
        shortDescription?: string | null | undefined;
        description?: string | null | undefined;
        difficulty?:
          "beginner" | "intermediate" | "advanced" | null | undefined;
        categoryId?: string | null | undefined;
        instructorAlias?: string | null | undefined;
      }
    | undefined
  >;
  ensureCourseCreated: (
    title: string,
    instructorAlias: string | null,
  ) => Promise<{
    id: string;
    version: number;
    title: string;
    instructorAlias?: string | null;
  }>;
  persistBasicsField: (
    fieldKey:
      "title" | "shortDescription" | "courseDescription" | "instructorAlias",
  ) => Promise<
    | {
        id: string;
        version: number;
        title: string;
        instructorAlias?: string | null;
      }
    | undefined
  >;
  handleShowInstructorNameChange: (nextValue: boolean) => Promise<void>;
}

export function useBasicsPersistence({
  setServerBasics,
  setBasicsDraft,
  serverBasicsRef,
  basicsDraftRef,
  setCourseTitle,
  setShortDescription,
  setCourseDescription,
  setInstructorAlias,
  setShowInstructorName,
  currentCourseId,
  setCurrentCourseId,
  setCourseVersion,
  courseVersionRef,
  currentCourseIdRef,
  basicsVersionRef,
  inFlightBasicsControlsRef,
  inFlightBasicsPromiseRef,
  inFlightCourseCreationPromiseRef,
  cancelTitleCreationDebounce,
  markBasicsControlSaving,
  clearBasicsFieldStatus,
  markBasicsFieldSaved,
  markBasicsFieldFailed,
  setIsInitialCurriculumBootstrapInProgress,
  isInitialCurriculumBootstrapInProgressRef,
  setShowTitleTooltip,
  createCourseMutation,
  updateBasicsMutation,
  createSectionMutation,
  createLessonMutation,
  upsertSettingsMutation,
  setSections,
  sectionsRef,
  setToastMessage,
}: UseBasicsPersistenceArgs): UseBasicsPersistenceResult {
  const executeSerializedBasicsMetaMutation = async (
    controlKey:
      "title" | "shortDescription" | "courseDescription" | "instructorAlias",
    targetVersion: number,
    previousSnapshot: BasicsFormState,
  ) => {
    const priorPromise = inFlightBasicsPromiseRef.current;

    const run = async () => {
      if (priorPromise) {
        try {
          await priorPromise;
        } catch {
          // Allow subsequent queued requests to proceed even if previous failed
        }
      }

      // If a newer version was triggered while waiting in queue, abort obsolete execution
      if (basicsVersionRef.current !== targetVersion) {
        return;
      }

      // CRITICAL: Read LATEST draft values and LATEST courseVersion at actual execution time!
      const latestDraft = basicsDraftRef.current;
      const currentVersion = courseVersionRef.current;

      const trimmedTitle = latestDraft.title.trim();
      if (!trimmedTitle) {
        return;
      }

      const targetCourseId = currentCourseIdRef.current || currentCourseId;
      if (!targetCourseId) {
        return;
      }

      const payload = {
        title: trimmedTitle,
        shortDescription: latestDraft.shortDescription.trim() || null,
        description: latestDraft.description.trim() || null,
        // Only a category the creator changed is sent; see the helper.
        ...categoryChangeToSend(
          latestDraft.categoryId,
          serverBasicsRef.current.categoryId,
        ),
        // The level likewise: it used to go out on every save, `null` when
        // the draft held none, which now removes the stored level.
        ...basicsChangeToSend(
          "difficulty",
          latestDraft.difficulty,
          serverBasicsRef.current.difficulty,
        ),
        instructorAlias: latestDraft.instructorAlias.trim() || null,
        version: currentVersion,
      };

      const updated = await updateBasicsMutation.mutateAsync({
        id: targetCourseId,
        payload,
      });

      // Stale-response protection: Only update baseline if we are still at targetVersion
      if (basicsVersionRef.current === targetVersion) {
        setCourseVersion(updated.version);
        courseVersionRef.current = updated.version;

        const newBaseline: BasicsFormState = normalizeBasicsState({
          title: updated.title,
          shortDescription: updated.shortDescription || "",
          description: updated.description || "",
          categoryId: updated.categoryId || "",
          difficulty:
            (updated.difficulty as BasicsFormState["difficulty"]) || "",
          language: serverBasicsRef.current.language,
          instructorAlias: updated.instructorAlias || "",
          showInstructorName: serverBasicsRef.current.showInstructorName,
        });
        setServerBasics(newBaseline);
        serverBasicsRef.current = newBaseline;
      }
      return updated;
    };

    const execute = async () => {
      try {
        const result = await run();
        if (result && basicsVersionRef.current === targetVersion) {
          if (
            controlKey === "title" ||
            controlKey === "shortDescription" ||
            controlKey === "courseDescription" ||
            controlKey === "instructorAlias"
          ) {
            markBasicsFieldSaved(controlKey);
          }
        }
        return result;
      } catch (err: unknown) {
        // Rollback only if no newer edit has superseded this one
        if (basicsVersionRef.current === targetVersion) {
          if (
            controlKey === "title" ||
            controlKey === "shortDescription" ||
            controlKey === "courseDescription" ||
            controlKey === "instructorAlias"
          ) {
            markBasicsFieldFailed(controlKey);
          }
          if (controlKey === "title") {
            setCourseTitle(previousSnapshot.title);
          } else if (controlKey === "shortDescription") {
            setShortDescription(previousSnapshot.shortDescription);
          } else if (controlKey === "courseDescription") {
            setCourseDescription(previousSnapshot.description);
          } else if (controlKey === "instructorAlias") {
            setInstructorAlias(previousSnapshot.instructorAlias);
          }
          const errorMsg =
            err instanceof Error
              ? err.message
              : "Failed to save course basics changes. Reverting to last saved state.";
          setToastMessage(errorMsg);
        }
        throw err;
      } finally {
        inFlightBasicsControlsRef.current[controlKey] = Math.max(
          0,
          (inFlightBasicsControlsRef.current[controlKey] || 1) - 1,
        );
        if (inFlightBasicsControlsRef.current[controlKey] === 0) {
          markBasicsControlSaving(controlKey, false);
        }
        if (basicsVersionRef.current === targetVersion) {
          inFlightBasicsPromiseRef.current = null;
        }
      }
    };

    const promise = execute();
    inFlightBasicsPromiseRef.current = promise;
    return await promise;
  };

  /**
   * Ensures a brand-new course has been created exactly once.
   *
   * Invariant:
   *   - If a creation request is already in flight, the caller JOINS that
   *     shared promise — no second POST /courses is issued.
   *   - If no creation is in flight, one is started and its promise is
   *     registered synchronously (before the first await) so every subsequent
   *     concurrent caller will find it and join rather than fork.
   *   - currentCourseIdRef.current is updated immediately on success so every
   *     caller that awaited the shared promise can read the confirmed ID.
   *   - The promise is cleared in finally so a failed attempt can be retried.
   */
  const ensureCourseCreated = async (
    title: string,
    instructorAlias: string | null,
  ): Promise<{
    id: string;
    version: number;
    title: string;
    instructorAlias?: string | null;
  }> => {
    // Cancel any pending title creation debounce since creation is now starting/joining.
    cancelTitleCreationDebounce();

    // If course already exists, return it.
    if (currentCourseIdRef.current) {
      return {
        id: currentCourseIdRef.current,
        version: courseVersionRef.current,
        title: serverBasicsRef.current.title || title,
        instructorAlias:
          serverBasicsRef.current.instructorAlias || instructorAlias,
      };
    }

    // Join an existing in-flight creation rather than starting a new one.
    if (inFlightCourseCreationPromiseRef.current) {
      return await inFlightCourseCreationPromiseRef.current;
    }

    // Register the promise SYNCHRONOUSLY before the first await so any
    // concurrent caller that checks immediately after this line will find it.
    const promise = (async () => {
      isInitialCurriculumBootstrapInProgressRef.current = true;
      setIsInitialCurriculumBootstrapInProgress(true);

      const created = await createCourseMutation.mutateAsync({
        title,
        instructorAlias,
      });

      // Write the confirmed ID to the ref immediately so all awaiting callers
      // can use it as soon as the shared promise resolves.
      currentCourseIdRef.current = created.id;
      if (typeof window !== "undefined") {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get("edit") !== created.id) {
          currentUrl.searchParams.set("edit", created.id);
          currentUrl.searchParams.delete("courseId");
          window.history.replaceState(
            window.history.state,
            "",
            currentUrl.toString(),
          );
        }
      }

      // Prebuild initial section ("Introduction") and initial lesson ("New Lesson 1")
      try {
        const createdSection = await createSectionMutation.mutateAsync({
          courseId: created.id,
          payload: { title: "Introduction" },
        });

        const createdLesson = await createLessonMutation.mutateAsync({
          courseId: created.id,
          sectionId: createdSection.id,
          payload: {
            title: "New Lesson 1",
            contentType: "video",
            description: "",
          },
        });

        const prebuiltLesson: CurriculumLessonItem = {
          id: createdLesson.id,
          title: "New Lesson 1",
          description: "",
          contentType: "video",
          contentTypeSelected: true,
          isExpanded: true,
          isPublished: true,
          isPreview: false,
          contentMediaId: null,
          isPendingCreation: false,
          initialState: {
            title: "New Lesson 1",
            description: "",
            contentType: "video",
            contentMediaId: null,
            isPublished: true,
            isPreview: false,
          },
          resources: [],
        };

        const prebuiltSection: CurriculumSectionItem = {
          id: createdSection.id,
          title: createdSection.title || "Introduction",
          isEditingTitle: false,
          isExpanded: true,
          isPendingCreation: false,
          lessons: [prebuiltLesson],
        };

        setSections([prebuiltSection]);
        sectionsRef.current = [prebuiltSection];
      } catch (bootstrapErr: unknown) {
        const errorMsg =
          bootstrapErr instanceof Error
            ? bootstrapErr.message
            : "Course created, but default section setup could not be completed.";
        setToastMessage(errorMsg);
      }

      return created;
    })();

    inFlightCourseCreationPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      isInitialCurriculumBootstrapInProgressRef.current = false;
      setIsInitialCurriculumBootstrapInProgress(false);
      // Clear regardless of success/failure so a failed attempt can be retried.
      inFlightCourseCreationPromiseRef.current = null;
    }
  };

  const persistBasicsField = async (
    fieldKey:
      "title" | "shortDescription" | "courseDescription" | "instructorAlias",
  ) => {
    const currentDraft = basicsDraftRef.current;
    const baseline = serverBasicsRef.current;

    if (fieldKey === "title") {
      const trimmed = currentDraft.title.trim();
      if (!currentCourseIdRef.current && !currentCourseId) {
        // Creation gate: do not call the API for an empty title.
        if (!trimmed) {
          return;
        }
        markBasicsControlSaving("title", true);
        try {
          // ensureCourseCreated guarantees at most one POST /courses even when
          // multiple callers (blur, tab-switch, flush, preview) race here.
          const created = await ensureCourseCreated(
            trimmed,
            currentDraft.instructorAlias.trim() || null,
          );
          // currentCourseIdRef.current is already set inside ensureCourseCreated.
          setCurrentCourseId(created.id);
          setCourseVersion(created.version);
          courseVersionRef.current = created.version;
          setShowTitleTooltip(false);

          const newBaseline: BasicsFormState = normalizeBasicsState({
            ...baseline,
            title: created.title,
            instructorAlias: created.instructorAlias || "",
          });
          setServerBasics(newBaseline);
          serverBasicsRef.current = newBaseline;

          // Check if title was edited while creation was in flight
          const latestTitle = basicsDraftRef.current.title.trim();
          if (latestTitle && latestTitle !== created.title) {
            // User modified title while creation was in flight.
            // Preserve user's latest draft in local state:
            setBasicsDraft((prev) => ({
              ...prev,
              instructorAlias: created.instructorAlias ?? prev.instructorAlias,
            }));
            basicsDraftRef.current = {
              ...basicsDraftRef.current,
              instructorAlias:
                created.instructorAlias ??
                basicsDraftRef.current.instructorAlias,
            };
            // Now that currentCourseId is established, persist the latest title
            // through the EXISTING COURSE update path (executeSerializedBasicsMetaMutation).
            void persistBasicsField("title");
          } else {
            // CRITICAL: Preserve existing local draft fields! Do NOT reset other draft fields
            setBasicsDraft((prev) => ({
              ...prev,
              title: created.title,
              instructorAlias: created.instructorAlias ?? prev.instructorAlias,
            }));
            basicsDraftRef.current = {
              ...basicsDraftRef.current,
              title: created.title,
              instructorAlias:
                created.instructorAlias ??
                basicsDraftRef.current.instructorAlias,
            };
            markBasicsFieldSaved("title");
          }
          return created;
        } catch (err: unknown) {
          markBasicsFieldFailed("title");
          const errorMsg =
            err instanceof Error
              ? err.message
              : "Failed to create course. Please try again.";
          setToastMessage(errorMsg);
        } finally {
          markBasicsControlSaving("title", false);
        }
        return;
      }

      // Course already exists
      if (!trimmed) {
        setCourseTitle(baseline.title);
        setToastMessage("Course title cannot be empty.");
        return;
      }
      if (trimmed === baseline.title) {
        return;
      }
    } else {
      let targetCourseId = currentCourseIdRef.current || currentCourseId;
      if (!targetCourseId) {
        if (inFlightBasicsPromiseRef.current) {
          await inFlightBasicsPromiseRef.current;
        } else if (basicsDraftRef.current.title.trim()) {
          await persistBasicsField("title");
        }
        targetCourseId = currentCourseIdRef.current || currentCourseId;
      }
      if (!targetCourseId) {
        return;
      }
      if (fieldKey === "shortDescription") {
        if (
          currentDraft.shortDescription.trim() ===
          baseline.shortDescription.trim()
        ) {
          return;
        }
      } else if (fieldKey === "courseDescription") {
        if (currentDraft.description.trim() === baseline.description.trim()) {
          return;
        }
      } else if (fieldKey === "instructorAlias") {
        if (
          currentDraft.instructorAlias.trim() ===
          baseline.instructorAlias.trim()
        ) {
          return;
        }
      }
    }

    const version = ++basicsVersionRef.current;
    markBasicsControlSaving(fieldKey, true);
    inFlightBasicsControlsRef.current[fieldKey] =
      (inFlightBasicsControlsRef.current[fieldKey] || 0) + 1;
    const previousSnapshot = { ...serverBasicsRef.current };

    return await executeSerializedBasicsMetaMutation(
      fieldKey,
      version,
      previousSnapshot,
    );
  };

  const handleShowInstructorNameChange = async (nextValue: boolean) => {
    let targetCourseId = currentCourseIdRef.current || currentCourseId;
    if (!targetCourseId) {
      if (inFlightBasicsPromiseRef.current) {
        await inFlightBasicsPromiseRef.current;
      } else if (basicsDraftRef.current.title.trim()) {
        await persistBasicsField("title");
      }
      targetCourseId = currentCourseIdRef.current || currentCourseId;
    }
    if (!targetCourseId) return;

    const previousValue = serverBasicsRef.current.showInstructorName;
    const version = ++basicsVersionRef.current;

    // 1. Optimistic UI update
    setShowInstructorName(nextValue);
    clearBasicsFieldStatus("showInstructorName");
    markBasicsControlSaving("showInstructorName", true);
    inFlightBasicsControlsRef.current.showInstructorName =
      (inFlightBasicsControlsRef.current.showInstructorName || 0) + 1;

    try {
      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          showInstructorName: nextValue,
          language: basicsDraftRef.current.language || "en",
        },
      });

      if (basicsVersionRef.current === version) {
        const confirmedShow =
          res.showInstructorName !== undefined
            ? res.showInstructorName
            : nextValue;
        const newBaseline: BasicsFormState = {
          ...serverBasicsRef.current,
          showInstructorName: confirmedShow,
        };
        setServerBasics(newBaseline);
        serverBasicsRef.current = newBaseline;
        markBasicsFieldSaved("showInstructorName");
      }
    } catch (err: unknown) {
      if (basicsVersionRef.current === version) {
        setShowInstructorName(previousValue);
        markBasicsFieldFailed("showInstructorName");
        const errorMsg =
          err instanceof Error
            ? err.message
            : "Failed to update instructor name visibility.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightBasicsControlsRef.current.showInstructorName = Math.max(
        0,
        (inFlightBasicsControlsRef.current.showInstructorName || 1) - 1,
      );
      if (inFlightBasicsControlsRef.current.showInstructorName === 0) {
        markBasicsControlSaving("showInstructorName", false);
      }
    }
  };
  return {
    executeSerializedBasicsMetaMutation,
    ensureCourseCreated,
    persistBasicsField,
    handleShowInstructorNameChange,
  };
}
