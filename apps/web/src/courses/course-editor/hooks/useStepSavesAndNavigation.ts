import type { Dispatch, SetStateAction, RefObject } from "react";
import { coursesService } from "../../../services/courses";
import type {
  RefetchOptions,
  QueryObserverResult,
  UseMutationResult,
} from "@tanstack/react-query";
import type {
  UpdateCourseBasicsRequest,
  UpdateCourseSectionRequest,
  UpdateCourseAccessRuleRequest,
  UpdateCoursePricingRequest,
  CreateCourseIncludeRequest,
  UpdateCourseIncludeRequest,
} from "@veolms/contracts";
import {
  type BasicsFormState,
  normalizeBasicsState,
  isBasicsEqual,
} from "../basicsState";
import type { CurriculumSectionItem } from "../curriculumItems";
import {
  type CourseWizardStepId,
  WIZARD_STEPS,
  WIZARD_STEP_IDS,
  getAdjacentWizardSteps,
} from "../wizardSteps";
import type { BasicsFieldKey } from "../statusIndicators";
import {
  type AccessRulesFormState,
  normalizeAccessRulesState,
  isAccessRuleConfigEqual,
} from "../accessRulesState";
import {
  type PricingFormState,
  normalizePricingState,
  pricingFormFromServer,
  isPricingEqual,
  validatePricing,
  buildPricingPayload,
} from "../pricingState";
import type { ApiError } from "../../../lib/api-error";
import type { IncludeDraftItem } from "../editorLocalTypes";

export interface UseStepSavesAndNavigationArgs {
  activeStep: CourseWizardStepId;
  setActiveStep: Dispatch<SetStateAction<CourseWizardStepId>>;
  pendingWizardNavigationRef: RefObject<CourseWizardStepId | null>;
  setMountedTabs: Dispatch<SetStateAction<Set<CourseWizardStepId>>>;
  navigateToStepRef: RefObject<
    (destination: CourseWizardStepId) => Promise<void>
  >;
  setServerBasics: Dispatch<SetStateAction<BasicsFormState>>;
  setBasicsDraft: Dispatch<SetStateAction<BasicsFormState>>;
  isBasicsDirty: boolean;
  serverBasicsRef: RefObject<BasicsFormState>;
  basicsDraftRef: RefObject<BasicsFormState>;
  currentCourseId: string | null;
  setCurrentCourseId: Dispatch<SetStateAction<string | null>>;
  setCourseVersion: Dispatch<SetStateAction<number>>;
  courseVersionRef: RefObject<number>;
  currentCourseIdRef: RefObject<string | null>;
  inFlightBasicsPromiseRef: RefObject<Promise<unknown> | null>;
  cancelTitleCreationDebounce: () => void;
  setBasicsSaveFailed: Dispatch<SetStateAction<boolean>>;
  triggerBasicsSavedBriefly: () => void;
  markBasicsFieldSaved: (fieldKey: BasicsFieldKey) => void;
  isDownstreamUnlocked: boolean;
  titleInputRef: RefObject<HTMLInputElement | null>;
  setShowTitleTooltip: Dispatch<SetStateAction<boolean>>;
  isValidating: boolean;
  refetchValidation: (options?: RefetchOptions) => Promise<
    QueryObserverResult<
      {
        canPublish: boolean;
        sections: {
          basics: { valid: boolean; errors: string[] };
          curriculum: { valid: boolean; errors: string[] };
          accessRules: { valid: boolean; errors: string[] };
          pricing: { valid: boolean; errors: string[] };
          extras: { valid: boolean; errors: string[] };
        };
        errors: { message: string }[];
      },
      ApiError
    >
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
  upsertAccessRulesMutation: UseMutationResult<
    {
      id: string;
      accessType: "everyone" | "restricted";
      durationType: "lifetime" | "fixed_duration" | "custom_expiration";
      durationDays?: number | null | undefined;
    },
    ApiError,
    { courseId: string; payload: UpdateCourseAccessRuleRequest },
    unknown
  >;
  upsertPricingMutation: UseMutationResult<
    {
      id: string;
      pricingType: "free" | "paid";
      price: number;
      currency: string;
      salePrice?: number | null | undefined;
      showDiscountBadge?: boolean | undefined;
      linkedOnly?: boolean | undefined;
    },
    ApiError,
    { courseId: string; payload: UpdateCoursePricingRequest },
    unknown
  >;
  createIncludeMutation: UseMutationResult<
    { id: string; text: string; position: number },
    ApiError,
    { courseId: string; payload: CreateCourseIncludeRequest },
    unknown
  >;
  updateIncludeMutation: UseMutationResult<
    { id: string; text: string; position: number },
    ApiError,
    {
      courseId: string;
      includeId: string;
      payload: UpdateCourseIncludeRequest;
    },
    unknown
  >;
  deleteIncludeMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; includeId: string },
    unknown
  >;
  publishCourseMutation: UseMutationResult<
    {
      id: string;
      slug: string;
      status: "draft" | "published" | "archived";
      version: number;
    },
    ApiError,
    string,
    unknown
  >;
  unpublishCourseMutation: UseMutationResult<
    {
      id: string;
      slug: string;
      status: "draft" | "published" | "archived";
      version: number;
    },
    ApiError,
    string,
    unknown
  >;
  actionLoading: "publish" | "draft" | "save" | "unpublish" | "validate" | null;
  setActionLoading: Dispatch<
    SetStateAction<
      "publish" | "draft" | "save" | "unpublish" | "validate" | null
    >
  >;
  saveActionInFlightRef: RefObject<boolean>;
  setIsSavingBasics: Dispatch<SetStateAction<boolean>>;
  setIsSavingCurriculum: Dispatch<SetStateAction<boolean>>;
  setIsSavingAccessRules: Dispatch<SetStateAction<boolean>>;
  setIsSavingPricing: Dispatch<SetStateAction<boolean>>;
  setIsSavingExtras: Dispatch<SetStateAction<boolean>>;
  setIsSavingPublish: Dispatch<SetStateAction<boolean>>;
  sections: CurriculumSectionItem[];
  setSections: Dispatch<SetStateAction<CurriculumSectionItem[]>>;
  isSavingAllDirtyLessonsRef: RefObject<boolean>;
  setCurriculumSaveFailed: Dispatch<SetStateAction<boolean>>;
  triggerCurriculumSavedBriefly: () => void;
  markCurriculumItemSaved: (itemId: string) => void;
  setAccessRulesExists: Dispatch<SetStateAction<boolean>>;
  serverAccessRules: AccessRulesFormState;
  setServerAccessRules: Dispatch<SetStateAction<AccessRulesFormState>>;
  setAccessRulesDraft: Dispatch<SetStateAction<AccessRulesFormState>>;
  accessRulesDraftRef: RefObject<AccessRulesFormState>;
  needsAccessRulesSave: boolean;
  setAccessRulesSaveFailed: Dispatch<SetStateAction<boolean>>;
  triggerAccessRulesSavedBriefly: () => void;
  setServerPricing: Dispatch<SetStateAction<PricingFormState>>;
  serverPricingRef: RefObject<PricingFormState>;
  setPricingDraft: Dispatch<SetStateAction<PricingFormState>>;
  pricingDraftRef: RefObject<PricingFormState>;
  isPricingDirty: boolean;
  setPricingValidationError: Dispatch<SetStateAction<string | null>>;
  setPricingSaveFailed: Dispatch<SetStateAction<boolean>>;
  triggerPricingSavedBriefly: () => void;
  isPublished: boolean;
  setIsPublished: Dispatch<SetStateAction<boolean>>;
  setIsUnpublishModalOpen: Dispatch<SetStateAction<boolean>>;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  setPublishValidationError: Dispatch<SetStateAction<string | null>>;
  setPublishSaveFailed: Dispatch<SetStateAction<boolean>>;
  triggerPublishSavedBriefly: () => void;
  serverIncludes: { id: string; text: string; position: number }[];
  setServerIncludes: Dispatch<
    SetStateAction<{ id: string; text: string; position: number }[]>
  >;
  manualIncludesDraft: IncludeDraftItem[];
  setManualIncludesDraft: Dispatch<SetStateAction<IncludeDraftItem[]>>;
  setExtrasSaveFailed: Dispatch<SetStateAction<boolean>>;
  triggerExtrasSavedBriefly: () => void;
  isManualIncludesDirty: boolean;
  isExtrasDirty: boolean;
  isStepDirty: (stepId: CourseWizardStepId) => boolean;
  flushFixedDurationPersistence: () => Promise<void>;
  saveAllDirtyLessons: (explicitCourseId?: string | null) => Promise<boolean>;
  ensureCourseDraftForPricing: (
    explicitCourseId?: string | null,
  ) => Promise<string>;
  flushPricingPersistence: () => Promise<void>;
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
  flushBasicsPersistence: () => Promise<boolean>;
}

export interface UseStepSavesAndNavigationResult {
  navigateToStep: (destination: CourseWizardStepId) => Promise<void>;
  previousStepId: CourseWizardStepId | null | undefined;
  nextStepId: CourseWizardStepId | null | undefined;
  handleValidateCourseAction: () => Promise<void>;
  handleFinalPublishCourse: () => Promise<void>;
  handleConfirmUnpublishCourse: () => Promise<void>;
}

export function useStepSavesAndNavigation({
  activeStep,
  setActiveStep,
  pendingWizardNavigationRef,
  setMountedTabs,
  navigateToStepRef,
  setServerBasics,
  setBasicsDraft,
  isBasicsDirty,
  serverBasicsRef,
  basicsDraftRef,
  currentCourseId,
  setCurrentCourseId,
  setCourseVersion,
  courseVersionRef,
  currentCourseIdRef,
  inFlightBasicsPromiseRef,
  cancelTitleCreationDebounce,
  setBasicsSaveFailed,
  triggerBasicsSavedBriefly,
  markBasicsFieldSaved,
  isDownstreamUnlocked,
  titleInputRef,
  setShowTitleTooltip,
  isValidating,
  refetchValidation,
  updateBasicsMutation,
  updateSectionMutation,
  upsertAccessRulesMutation,
  upsertPricingMutation,
  createIncludeMutation,
  updateIncludeMutation,
  deleteIncludeMutation,
  publishCourseMutation,
  unpublishCourseMutation,
  actionLoading,
  setActionLoading,
  saveActionInFlightRef,
  setIsSavingBasics,
  setIsSavingCurriculum,
  setIsSavingAccessRules,
  setIsSavingPricing,
  setIsSavingExtras,
  setIsSavingPublish,
  sections,
  setSections,
  isSavingAllDirtyLessonsRef,
  setCurriculumSaveFailed,
  triggerCurriculumSavedBriefly,
  markCurriculumItemSaved,
  setAccessRulesExists,
  serverAccessRules,
  setServerAccessRules,
  setAccessRulesDraft,
  accessRulesDraftRef,
  needsAccessRulesSave,
  setAccessRulesSaveFailed,
  triggerAccessRulesSavedBriefly,
  setServerPricing,
  serverPricingRef,
  setPricingDraft,
  pricingDraftRef,
  isPricingDirty,
  setPricingValidationError,
  setPricingSaveFailed,
  triggerPricingSavedBriefly,
  isPublished,
  setIsPublished,
  setIsUnpublishModalOpen,
  setToastMessage,
  setPublishValidationError,
  setPublishSaveFailed,
  triggerPublishSavedBriefly,
  serverIncludes,
  setServerIncludes,
  manualIncludesDraft,
  setManualIncludesDraft,
  setExtrasSaveFailed,
  triggerExtrasSavedBriefly,
  isManualIncludesDirty,
  isExtrasDirty,
  isStepDirty,
  flushFixedDurationPersistence,
  saveAllDirtyLessons,
  ensureCourseDraftForPricing,
  flushPricingPersistence,
  ensureCourseCreated,
  persistBasicsField,
  flushBasicsPersistence,
}: UseStepSavesAndNavigationArgs): UseStepSavesAndNavigationResult {
  const saveBasicsStep = async (explicitCourseId?: string | null) => {
    const targetCourseId = explicitCourseId || currentCourseId;
    if (
      targetCourseId &&
      isBasicsEqual(basicsDraftRef.current, serverBasicsRef.current)
    ) {
      return serverBasicsRef.current;
    }

    if (!basicsDraftRef.current.title.trim()) {
      throw new Error("Please enter a course title.");
    }
    setIsSavingBasics(true);
    try {
      if (!targetCourseId) {
        // Use the shared creation helper so concurrent callers (e.g. onBlur
        // and saveBasicsStep both firing while courseId is still null) join the
        // same POST /courses rather than issuing duplicate requests.
        const created = await ensureCourseCreated(
          basicsDraftRef.current.title.trim(),
          basicsDraftRef.current.instructorAlias.trim() || null,
        );
        // currentCourseIdRef.current is already set inside ensureCourseCreated.
        setCurrentCourseId(created.id);
        setCourseVersion(created.version);
        courseVersionRef.current = created.version;

        const newBaseline: BasicsFormState = normalizeBasicsState({
          ...serverBasicsRef.current,
          title: created.title,
          instructorAlias: created.instructorAlias || "",
        });
        setServerBasics(newBaseline);
        serverBasicsRef.current = newBaseline;

        const latestTitle = basicsDraftRef.current.title.trim();
        if (latestTitle && latestTitle !== created.title) {
          setBasicsDraft((prev) => ({
            ...prev,
            instructorAlias: created.instructorAlias ?? prev.instructorAlias,
          }));
          basicsDraftRef.current = {
            ...basicsDraftRef.current,
            instructorAlias:
              created.instructorAlias ?? basicsDraftRef.current.instructorAlias,
          };
          void persistBasicsField("title");
        } else {
          setBasicsDraft((prev) => ({
            ...prev,
            title: created.title,
            instructorAlias: created.instructorAlias ?? prev.instructorAlias,
          }));
          basicsDraftRef.current = {
            ...basicsDraftRef.current,
            title: created.title,
            instructorAlias:
              created.instructorAlias ?? basicsDraftRef.current.instructorAlias,
          };
        }

        if (
          basicsDraftRef.current.shortDescription.trim() ||
          basicsDraftRef.current.description.trim() ||
          basicsDraftRef.current.categoryId ||
          basicsDraftRef.current.difficulty
        ) {
          const updated = await updateBasicsMutation.mutateAsync({
            id: created.id,
            payload: {
              title: created.title,
              shortDescription:
                basicsDraftRef.current.shortDescription.trim() || null,
              description: basicsDraftRef.current.description.trim() || null,
              categoryId: basicsDraftRef.current.categoryId || null,
              difficulty: basicsDraftRef.current.difficulty || null,
              instructorAlias:
                basicsDraftRef.current.instructorAlias.trim() || null,
              version: created.version,
            },
          });
          setCourseVersion(updated.version);
          courseVersionRef.current = updated.version;
          const updatedBaseline = normalizeBasicsState({
            ...newBaseline,
            shortDescription: updated.shortDescription || "",
            description: updated.description || "",
            categoryId: updated.categoryId || "",
            difficulty:
              (updated.difficulty as BasicsFormState["difficulty"]) || "",
          });
          setServerBasics(updatedBaseline);
          serverBasicsRef.current = updatedBaseline;
        }
        markBasicsFieldSaved("title");
        setBasicsSaveFailed(false);
        triggerBasicsSavedBriefly();
        return created;
      } else {
        const ok = await flushBasicsPersistence();
        if (!ok) {
          setBasicsSaveFailed(true);
        } else {
          setBasicsSaveFailed(false);
          triggerBasicsSavedBriefly();
        }
        return serverBasicsRef.current;
      }
    } catch (err) {
      setBasicsSaveFailed(true);
      throw err;
    } finally {
      setIsSavingBasics(false);
    }
  };

  const saveCurriculumStep = async (explicitCourseId?: string | null) => {
    setIsSavingCurriculum(true);
    setCurriculumSaveFailed(false);
    try {
      let targetCourseId = explicitCourseId || currentCourseId;
      if (!targetCourseId) {
        throw new Error("Please enter a course title on the Basics tab first.");
      }

      // 1. Save any pending section title edits
      const editingSections = sections.filter(
        (s) =>
          s.isEditingTitle &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            s.id,
          ),
      );
      if (editingSections.length > 0) {
        await Promise.all(
          editingSections.map(async (sec) => {
            const trimmed = sec.title.trim();
            if (trimmed) {
              await updateSectionMutation.mutateAsync({
                courseId: targetCourseId,
                sectionId: sec.id,
                payload: { title: trimmed },
              });
              setSections((prev) =>
                prev.map((s) =>
                  s.id === sec.id ? { ...s, isEditingTitle: false } : s,
                ),
              );
              markCurriculumItemSaved(sec.id);
            }
          }),
        );
      }

      // 2. Save all dirty lessons across all sections
      const allSaved = await saveAllDirtyLessons(targetCourseId);
      if (!allSaved) {
        throw new Error("Failed to save some lessons in curriculum.");
      }

      triggerCurriculumSavedBriefly();
      return true;
    } catch (err) {
      setCurriculumSaveFailed(true);
      throw err;
    } finally {
      setIsSavingCurriculum(false);
    }
  };

  const saveAccessRulesStep = async (explicitCourseId?: string | null) => {
    await flushFixedDurationPersistence();

    const currentDraft = accessRulesDraftRef.current;
    if (!currentDraft.durationMode) {
      throw new Error("Please select an access duration option.");
    }
    setIsSavingAccessRules(true);
    try {
      let targetCourseId = explicitCourseId || currentCourseId;
      if (!targetCourseId) {
        throw new Error("Please enter a course title on the Basics tab first.");
      }

      let durationDays: number | null = null;
      if (accessRulesDraftRef.current.durationMode === "fixed") {
        const val = Math.max(
          1,
          accessRulesDraftRef.current.fixedDurationValue || 1,
        );
        const unitMultiplier =
          accessRulesDraftRef.current.fixedDurationUnit === "Years"
            ? 365
            : accessRulesDraftRef.current.fixedDurationUnit === "Months"
              ? 30
              : accessRulesDraftRef.current.fixedDurationUnit === "Weeks"
                ? 7
                : 1;
        durationDays = val * unitMultiplier;
      }

      const isRulesConfigDirty = !isAccessRuleConfigEqual(
        accessRulesDraftRef.current,
        serverAccessRules,
      );

      let accessRuleRes: any = null;

      if (isRulesConfigDirty) {
        accessRuleRes = await upsertAccessRulesMutation.mutateAsync({
          courseId: targetCourseId,
          payload: {
            accessType: accessRulesDraftRef.current.accessType || "everyone",
            durationType:
              accessRulesDraftRef.current.durationMode === "fixed"
                ? "fixed_duration"
                : "lifetime",
            durationDays:
              accessRulesDraftRef.current.durationMode === "fixed"
                ? durationDays
                : null,
          },
        });
      }

      const isFixed = accessRuleRes
        ? accessRuleRes.durationType === "fixed_duration"
        : serverAccessRules.durationMode === "fixed";

      const newBaseline: AccessRulesFormState = normalizeAccessRulesState({
        accessType: accessRulesDraftRef.current.accessType || "everyone",
        durationMode: isFixed ? "fixed" : "lifetime",
        fixedDurationValue: accessRulesDraftRef.current.fixedDurationValue,
        fixedDurationUnit: accessRulesDraftRef.current.fixedDurationUnit,
        enableQA: accessRulesDraftRef.current.enableQA,
        enableComments: accessRulesDraftRef.current.enableComments,
        enableDownloads: accessRulesDraftRef.current.enableDownloads,
        enableNotes: accessRulesDraftRef.current.enableNotes,
      });

      setAccessRulesExists(true);
      setServerAccessRules(newBaseline);
      setAccessRulesDraft(newBaseline);
      setAccessRulesSaveFailed(false);
      triggerAccessRulesSavedBriefly();
      return { accessRule: accessRuleRes };
    } catch (err) {
      setAccessRulesSaveFailed(true);
      throw err;
    } finally {
      setIsSavingAccessRules(false);
    }
  };

  const savePricingStep = async (explicitCourseId?: string | null) => {
    await flushPricingPersistence();

    // If already saved and clean, do not fire redundant duplicate mutation
    const isDirty = !isPricingEqual(
      pricingDraftRef.current,
      serverPricingRef.current,
    );
    if (!isDirty) {
      return { ...serverPricingRef.current };
    }

    const validation = validatePricing(pricingDraftRef.current);
    if (!validation.isValid) {
      setPricingValidationError(validation.error);
      setToastMessage(validation.error || "Please fix pricing errors.");
      throw new Error(validation.error || "Validation failed");
    }
    setPricingValidationError(null);

    setIsSavingPricing(true);
    try {
      const targetCourseId =
        await ensureCourseDraftForPricing(explicitCourseId);
      const payload = buildPricingPayload(pricingDraftRef.current);
      const res = await upsertPricingMutation.mutateAsync({
        courseId: targetCourseId,
        payload,
      });
      const newBaseline: PricingFormState = pricingFormFromServer(res);

      setServerPricing(newBaseline);
      serverPricingRef.current = newBaseline;
      setPricingDraft(newBaseline);
      pricingDraftRef.current = newBaseline;
      setPricingSaveFailed(false);
      triggerPricingSavedBriefly();
      return res;
    } catch (err) {
      setPricingSaveFailed(true);
      throw err;
    } finally {
      setIsSavingPricing(false);
    }
  };

  const saveExtrasStep = async (explicitCourseId?: string | null) => {
    setIsSavingExtras(true);
    try {
      let targetCourseId = explicitCourseId || currentCourseId;
      if (!targetCourseId) {
        throw new Error("Please enter a course title on the Basics tab first.");
      }

      // Sync manual includes if dirty
      if (isManualIncludesDirty) {
        // Delete removed items
        const deleted = serverIncludes.filter(
          (s) => !manualIncludesDraft.some((m) => m.id === s.id),
        );
        if (deleted.length > 0) {
          await Promise.all(
            deleted.map((d) =>
              deleteIncludeMutation.mutateAsync({
                courseId: targetCourseId!,
                includeId: d.id,
              }),
            ),
          );
        }

        // Update items with changed text
        const updated = manualIncludesDraft.filter((m) => {
          const existing = serverIncludes.find((s) => s.id === m.id);
          return existing && existing.text.trim() !== m.text.trim();
        });
        if (updated.length > 0) {
          await Promise.all(
            updated.map((u) =>
              updateIncludeMutation.mutateAsync({
                courseId: targetCourseId!,
                includeId: u.id,
                payload: { text: u.text.trim() },
              }),
            ),
          );
        }

        // Create new items (client-generated IDs)
        const newItems = manualIncludesDraft.filter(
          (m) => !serverIncludes.some((s) => s.id === m.id),
        );
        for (const n of newItems) {
          if (n.text.trim()) {
            await createIncludeMutation.mutateAsync({
              courseId: targetCourseId!,
              payload: { text: n.text.trim() },
            });
          }
        }

        // Refetch latest includes list from server
        const listRes = await coursesService.listIncludes(targetCourseId!);
        setServerIncludes(listRes.items);
        setManualIncludesDraft(
          listRes.items.map((inc) => ({
            id: inc.id,
            text: inc.text,
            detail: inc.detail,
            icon: inc.icon,
            color: inc.color,
            kind: inc.kind,
          })),
        );
      }

      setExtrasSaveFailed(false);
      triggerExtrasSavedBriefly();
      return { success: true };
    } catch (err) {
      setExtrasSaveFailed(true);
      throw err;
    } finally {
      setIsSavingExtras(false);
    }
  };

  const savePublishStep = async (explicitCourseId?: string | null) => {
    setIsSavingPublish(true);
    setPublishSaveFailed(false);
    try {
      await reconcileDirtyState();
      triggerPublishSavedBriefly();
      return true;
    } catch (err) {
      setPublishSaveFailed(true);
      throw err;
    } finally {
      setIsSavingPublish(false);
    }
  };

  const saveCurrentStep = async () => {
    if (activeStep === "basics") {
      return await saveBasicsStep();
    } else if (activeStep === "curriculum") {
      return await saveCurriculumStep();
    } else if (activeStep === "access-rules") {
      return await saveAccessRulesStep();
    } else if (activeStep === "pricing") {
      return await savePricingStep();
    } else if (activeStep === "extras") {
      return await saveExtrasStep();
    } else if (activeStep === "publish") {
      return await savePublishStep();
    }
  };

  const navigateToStep = async (destination: CourseWizardStepId) => {
    cancelTitleCreationDebounce();
    if (
      actionLoading !== null ||
      saveActionInFlightRef.current ||
      isSavingAllDirtyLessonsRef.current
    ) {
      return;
    }
    if (destination === activeStep) {
      return;
    }

    const leavingStep = activeStep;

    if (
      leavingStep === "basics" &&
      !currentCourseIdRef.current &&
      !currentCourseId
    ) {
      const flushed = await flushBasicsPersistence();
      if (!flushed) {
        setShowTitleTooltip(true);
        titleInputRef.current?.focus();
        setToastMessage("Add a course title to continue.");
        return;
      }
    }

    if (
      !currentCourseIdRef.current &&
      !isDownstreamUnlocked &&
      destination !== "basics"
    ) {
      setShowTitleTooltip(true);
      titleInputRef.current?.focus();
      setToastMessage("Add a course title to continue.");
      return;
    }

    if (saveActionInFlightRef.current) return;
    saveActionInFlightRef.current = true;

    const wasDirty = isStepDirty(leavingStep);

    // Prepare and activate the destination before persisting the previous
    // step. This keeps the tab and panel responsive while draft persistence
    // continues in the background.
    setMountedTabs((current) => {
      const next = getAdjacentWizardSteps(destination);
      next.add(leavingStep);
      const hasSameTabs =
        next.size === current.size && [...next].every((id) => current.has(id));
      return hasSameTabs ? current : next;
    });
    pendingWizardNavigationRef.current = destination;
    setActiveStep(destination);

    const persistPreviousStep = async () => {
      if (wasDirty) setActionLoading("save");

      try {
        if (leavingStep === "basics") {
          await flushBasicsPersistence();
        } else if (leavingStep === "access-rules") {
          await flushFixedDurationPersistence();
        } else if (leavingStep === "pricing") {
          await flushPricingPersistence();
        }

        if (!wasDirty) return;

        if (leavingStep === "curriculum") {
          await saveCurriculumStep();
        } else {
          await saveCurrentStep();
        }
      } catch (err: unknown) {
        const stepLabel =
          WIZARD_STEPS.find((s) => s.id === leavingStep)?.label || leavingStep;
        setToastMessage(
          `Failed to save ${stepLabel}. Your changes are kept locally.`,
        );
      } finally {
        setActionLoading(null);
        saveActionInFlightRef.current = false;
      }
    };

    if (
      wasDirty ||
      leavingStep === "basics" ||
      leavingStep === "access-rules" ||
      leavingStep === "pricing"
    ) {
      await persistPreviousStep();
    } else {
      saveActionInFlightRef.current = false;
    }
  };

  navigateToStepRef.current = navigateToStep;

  const currentStepIndex = WIZARD_STEP_IDS.indexOf(activeStep);
  const previousStepId =
    currentStepIndex > 0 ? WIZARD_STEP_IDS[currentStepIndex - 1] : null;
  const nextStepId =
    currentStepIndex < WIZARD_STEP_IDS.length - 1
      ? WIZARD_STEP_IDS[currentStepIndex + 1]
      : null;

  const reconcileDirtyState = async (explicitCourseId?: string | null) => {
    let targetCourseId = explicitCourseId || currentCourseId;

    if (inFlightBasicsPromiseRef.current) {
      await inFlightBasicsPromiseRef.current;
    }
    if (activeStep === "basics") {
      await flushBasicsPersistence();
    }

    // 1. If basics is dirty or course has not been created yet, save basics first
    if (!targetCourseId || isBasicsDirty) {
      const createdOrUpdated = await saveBasicsStep(targetCourseId);
      if (
        createdOrUpdated &&
        typeof createdOrUpdated === "object" &&
        "id" in createdOrUpdated
      ) {
        targetCourseId = (createdOrUpdated as { id: string }).id;
      } else if (!targetCourseId) {
        targetCourseId = currentCourseId;
      }
    }

    if (!targetCourseId) {
      throw new Error("Cannot validate course without a valid course ID.");
    }

    // 2. Save only the other dirty / unpersisted server-backed pages
    const pendingSaves: Promise<unknown>[] = [];
    if (activeStep === "access-rules") {
      await flushFixedDurationPersistence();
    }
    if (activeStep === "pricing") {
      await flushPricingPersistence();
    }
    if (needsAccessRulesSave) {
      pendingSaves.push(saveAccessRulesStep(targetCourseId));
    }
    if (isPricingDirty) {
      pendingSaves.push(savePricingStep(targetCourseId));
    }
    if (isExtrasDirty) {
      pendingSaves.push(saveExtrasStep(targetCourseId));
    }

    if (pendingSaves.length > 0) {
      await Promise.all(pendingSaves);
    }

    return targetCourseId;
  };

  const handleValidateCourseAction = async () => {
    if (actionLoading || isValidating || saveActionInFlightRef.current) return;
    saveActionInFlightRef.current = true;
    setActionLoading("validate");
    try {
      await reconcileDirtyState();

      // Trigger server validation API
      const res = await refetchValidation();
      if (res.data?.canPublish) {
        setToastMessage("Course is valid and ready to publish!");
      } else {
        const errorCount = res.data?.errors?.length ?? 0;
        setToastMessage(
          errorCount > 0
            ? `Found ${errorCount} issue${errorCount > 1 ? "s" : ""} to fix before publishing.`
            : "Please fix incomplete sections before publishing.",
        );
      }
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message ||
        "Failed to save changes or validate course.";
      setToastMessage(errorMsg);
    } finally {
      setActionLoading(null);
      saveActionInFlightRef.current = false;
    }
  };

  const handleFinalPublishCourse = async () => {
    if (actionLoading || isValidating || saveActionInFlightRef.current) return;
    saveActionInFlightRef.current = true;
    setActionLoading("publish");
    setPublishValidationError(null);

    try {
      // 1. Flush any uncommitted dirty server-backed form state
      const targetCourseId = await reconcileDirtyState();

      // 2. Re-validate to ensure server state is 100% compliant
      const validationRes = await refetchValidation();
      const validationData = validationRes.data;

      if (!validationData || !validationData.canPublish) {
        const errorMsg =
          validationData?.errors?.[0]?.message ||
          "Course failed validation checks. Please review highlighted steps.";
        setPublishValidationError(errorMsg);
        setToastMessage(errorMsg);
        return;
      }

      // 3. Trigger publish API mutation
      const publishedCourse =
        await publishCourseMutation.mutateAsync(targetCourseId);

      // 4. Synchronize server-returned state & version
      setIsPublished(publishedCourse.status === "published");
      setCourseVersion(publishedCourse.version);

      setToastMessage(
        isPublished
          ? "Course updated and published successfully!"
          : "Course published successfully!",
      );
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message ||
        "Failed to publish course. Please resolve issues and try again.";
      setPublishValidationError(errorMsg);
      setToastMessage(errorMsg);
    } finally {
      setActionLoading(null);
      saveActionInFlightRef.current = false;
    }
  };

  const handleConfirmUnpublishCourse = async () => {
    if (!currentCourseId || actionLoading || saveActionInFlightRef.current)
      return;
    saveActionInFlightRef.current = true;
    setActionLoading("unpublish");
    try {
      const draftCourse =
        await unpublishCourseMutation.mutateAsync(currentCourseId);
      setIsPublished(draftCourse.status === "published");
      setCourseVersion(draftCourse.version);
      setToastMessage("Course unpublished and returned to draft.");
      setIsUnpublishModalOpen(false);
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message || "Failed to unpublish course.";
      setToastMessage(errorMsg);
    } finally {
      setActionLoading(null);
      saveActionInFlightRef.current = false;
    }
  };
  return {
    navigateToStep,
    previousStepId,
    nextStepId,
    handleValidateCourseAction,
    handleFinalPublishCourse,
    handleConfirmUnpublishCourse,
  };
}
