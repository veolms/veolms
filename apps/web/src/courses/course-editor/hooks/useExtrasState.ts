import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  CourseIncludeItem,
  CreateCourseIncludeRequest,
  ReorderCourseIncludesRequest,
} from "@veolms/contracts";
import type { CurriculumSectionItem } from "../curriculumItems";
import type { CourseWizardStepId } from "../wizardSteps";
import type { AccessRulesFormState } from "../accessRulesState";
import {
  type ExtrasFormState,
  initialExtrasState,
  isExtrasEqual,
  deriveSuggestedInclusions,
  isManualIncludesEqual,
} from "../extrasState";
import type { ExtrasState } from "../editorLocalTypes";
import type { ApiError } from "../../../lib/api-error";
import type { IncludeDraftItem } from "../editorLocalTypes";

export interface UseExtrasStateArgs {
  isBasicsDirty: boolean;
  isReorderingIncludes: boolean;
  createIncludeMutation: UseMutationResult<
    { id: string; text: string; position: number },
    ApiError,
    { courseId: string; payload: CreateCourseIncludeRequest },
    unknown
  >;
  reorderIncludesMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; payload: ReorderCourseIncludesRequest },
    unknown
  >;
  isSavingExtras: boolean;
  sections: CurriculumSectionItem[];
  isCurriculumDirty: boolean;
  accessRulesDraft: AccessRulesFormState;
  needsAccessRulesSave: boolean;
  isPricingDirty: boolean;
}

export interface UseExtrasStateResult {
  setServerExtras: Dispatch<SetStateAction<ExtrasFormState>>;
  serverIncludes: { id: string; text: string; position: number }[];
  setServerIncludes: Dispatch<
    SetStateAction<{ id: string; text: string; position: number }[]>
  >;
  manualIncludesDraft: IncludeDraftItem[];
  setManualIncludesDraft: Dispatch<SetStateAction<IncludeDraftItem[]>>;
  manualIncludesDraftRef: RefObject<IncludeDraftItem[]>;
  dragInitialIncludesStateRef: RefObject<{
    includeIds: string[];
    previousIncludes: Array<IncludeDraftItem>;
  } | null>;
  deletingIncludeIdsRef: RefObject<Set<string>>;
  deletingIncludeIds: Set<string>;
  setDeletingIncludeIds: Dispatch<SetStateAction<Set<string>>>;
  savingIncludeIdsRef: RefObject<Set<string>>;
  savingIncludeIds: Set<string>;
  setSavingIncludeIds: Dispatch<SetStateAction<Set<string>>>;
  isSavingCertificate: boolean;
  setIsSavingCertificate: Dispatch<SetStateAction<boolean>>;
  isSavingCertificateRef: RefObject<boolean>;
  extrasControlStatus: Record<string, "saved" | "failed" | null>;
  setExtrasSaveFailed: Dispatch<SetStateAction<boolean>>;
  triggerExtrasSavedBriefly: () => void;
  clearExtrasControlStatus: (controlKey: string) => void;
  markExtrasControlSaved: (controlKey: string) => void;
  markExtrasControlFailed: (controlKey: string) => void;
  getExtrasControlDisplayStatus: (
    controlKey: string,
  ) => "saving" | "saved" | "failed" | null;
  extrasOverallStatus: "saving" | "saved" | "failed" | null;
  extras: ExtrasState;
  setExtras: Dispatch<SetStateAction<ExtrasState>>;
  suggestedInclusions: string[];
  isManualIncludesDirty: boolean;
  isExtrasDirty: boolean;
  isExtrasDirtyRef: RefObject<boolean>;
  isStepDirty: (stepId: CourseWizardStepId) => boolean;
  hasUnsavedChanges: boolean;
}

export function useExtrasState({
  isBasicsDirty,
  isReorderingIncludes,
  createIncludeMutation,
  reorderIncludesMutation,
  isSavingExtras,
  sections,
  isCurriculumDirty,
  accessRulesDraft,
  needsAccessRulesSave,
  isPricingDirty,
}: UseExtrasStateArgs): UseExtrasStateResult {
  // Extras Step server-confirmed and draft states
  const [serverExtras, setServerExtras] =
    useState<ExtrasFormState>(initialExtrasState);
  const [serverIncludes, setServerIncludes] = useState<CourseIncludeItem[]>([]);
  const [manualIncludesDraft, setManualIncludesDraft] = useState<
    Array<IncludeDraftItem>
  >([]);
  const manualIncludesDraftRef = useRef(manualIncludesDraft);
  manualIncludesDraftRef.current = manualIncludesDraft;
  const dragInitialIncludesStateRef = useRef<{
    includeIds: string[];
    previousIncludes: Array<IncludeDraftItem>;
  } | null>(null);
  const deletingIncludeIdsRef = useRef<Set<string>>(new Set());
  const [deletingIncludeIds, setDeletingIncludeIds] = useState<Set<string>>(
    new Set(),
  );
  const savingIncludeIdsRef = useRef<Set<string>>(new Set());
  const [savingIncludeIds, setSavingIncludeIds] = useState<Set<string>>(
    new Set(),
  );
  const [isSavingCertificate, setIsSavingCertificate] = useState(false);
  const isSavingCertificateRef = useRef(false);

  const [extrasControlStatus, setExtrasControlStatus] = useState<
    Record<string, "saved" | "failed" | null>
  >({});
  const extrasControlTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const [extrasSaveFailed, setExtrasSaveFailed] = useState(false);
  const [showExtrasSavedBriefly, setShowExtrasSavedBriefly] = useState(false);
  const extrasSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const triggerExtrasSavedBriefly = () => {
    if (extrasSavedBrieflyTimerRef.current) {
      clearTimeout(extrasSavedBrieflyTimerRef.current);
    }
    setShowExtrasSavedBriefly(true);
    extrasSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowExtrasSavedBriefly(false);
      extrasSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    // The record is only ever mutated, never replaced: timers added after
    // this point are in it when the cleanup runs.
    const extrasControlTimers = extrasControlTimersRef.current;
    return () => {
      Object.values(extrasControlTimers).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (extrasSavedBrieflyTimerRef.current) {
        clearTimeout(extrasSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const clearExtrasControlStatus = (controlKey: string) => {
    if (extrasControlTimersRef.current[controlKey]) {
      clearTimeout(extrasControlTimersRef.current[controlKey]);
      delete extrasControlTimersRef.current[controlKey];
    }
    setExtrasControlStatus((prev) => {
      if (!prev[controlKey]) return prev;
      const next = { ...prev };
      delete next[controlKey];
      return next;
    });
    setExtrasSaveFailed(false);
    if (extrasSavedBrieflyTimerRef.current) {
      clearTimeout(extrasSavedBrieflyTimerRef.current);
      extrasSavedBrieflyTimerRef.current = null;
    }
    setShowExtrasSavedBriefly(false);
  };

  const markExtrasControlSaved = (controlKey: string) => {
    if (extrasControlTimersRef.current[controlKey]) {
      clearTimeout(extrasControlTimersRef.current[controlKey]);
      delete extrasControlTimersRef.current[controlKey];
    }
    setExtrasControlStatus((prev) => ({ ...prev, [controlKey]: "saved" }));
    setExtrasSaveFailed(false);
    triggerExtrasSavedBriefly();

    extrasControlTimersRef.current[controlKey] = setTimeout(() => {
      setExtrasControlStatus((prev) => {
        if (prev[controlKey] !== "saved") return prev;
        const next = { ...prev };
        delete next[controlKey];
        return next;
      });
      delete extrasControlTimersRef.current[controlKey];
    }, 1500);
  };

  const markExtrasControlFailed = (controlKey: string) => {
    if (extrasControlTimersRef.current[controlKey]) {
      clearTimeout(extrasControlTimersRef.current[controlKey]);
      delete extrasControlTimersRef.current[controlKey];
    }
    setExtrasControlStatus((prev) => ({ ...prev, [controlKey]: "failed" }));
    setExtrasSaveFailed(true);
    if (extrasSavedBrieflyTimerRef.current) {
      clearTimeout(extrasSavedBrieflyTimerRef.current);
      extrasSavedBrieflyTimerRef.current = null;
    }
    setShowExtrasSavedBriefly(false);
  };

  const getExtrasControlDisplayStatus = (
    controlKey: string,
  ): "saving" | "saved" | "failed" | null => {
    if (controlKey === "enableCertificate") {
      if (isSavingCertificate) return "saving";
      return extrasControlStatus["enableCertificate"] ?? null;
    }
    if (controlKey === "inclusions") {
      if (
        isReorderingIncludes ||
        reorderIncludesMutation.isPending ||
        savingIncludeIds.size > 0 ||
        deletingIncludeIds.size > 0 ||
        createIncludeMutation.isPending ||
        manualIncludesDraft.some((m) => m.isPendingCreation)
      ) {
        return "saving";
      }
      return extrasControlStatus["inclusions"] ?? null;
    }
    // Specific inclusion ID:
    if (
      savingIncludeIds.has(controlKey) ||
      deletingIncludeIds.has(controlKey) ||
      manualIncludesDraft.some(
        (m) => m.id === controlKey && m.isPendingCreation,
      )
    ) {
      return "saving";
    }
    return extrasControlStatus[controlKey] ?? null;
  };

  const isAnyExtrasSaving =
    isSavingExtras ||
    isSavingCertificate ||
    savingIncludeIds.size > 0 ||
    deletingIncludeIds.size > 0 ||
    isReorderingIncludes ||
    reorderIncludesMutation.isPending ||
    createIncludeMutation.isPending ||
    manualIncludesDraft.some((m) => m.isPendingCreation);

  const hasExtrasControlFailed =
    extrasSaveFailed ||
    Object.values(extrasControlStatus).some((status) => status === "failed");

  const extrasOverallStatus = useMemo(():
    "saving" | "failed" | "saved" | null => {
    if (isAnyExtrasSaving) return "saving";
    if (hasExtrasControlFailed) return "failed";
    if (showExtrasSavedBriefly) return "saved";
    return null;
  }, [isAnyExtrasSaving, hasExtrasControlFailed, showExtrasSavedBriefly]);

  const [extras, setExtras] = useState<ExtrasState>({
    inclusions: [],
    enableCertificate: false,
    certificateTemplate: "purple-certificate",
    issuanceType: "percentage",
    minCompletionPercentage: 95,
    customRuleText: "Complete all quizzes with > 80% score",
    autoEmailCertificate: true,
  });

  const suggestedInclusions = useMemo<string[]>(() => {
    const hasPreviewLessons = sections.some((s) =>
      s.lessons.some((l) => l.isPreview),
    );
    return deriveSuggestedInclusions({
      durationMode: accessRulesDraft.durationMode,
      fixedDurationValue: accessRulesDraft.fixedDurationValue,
      fixedDurationUnit: accessRulesDraft.fixedDurationUnit,
      enableCertificate: extras.enableCertificate,
      enableDownloads: accessRulesDraft.enableDownloads,
      hasPreviewLessons,
      currentDraft: manualIncludesDraft,
    });
  }, [
    accessRulesDraft.durationMode,
    accessRulesDraft.fixedDurationValue,
    accessRulesDraft.fixedDurationUnit,
    accessRulesDraft.enableDownloads,
    extras.enableCertificate,
    sections,
    manualIncludesDraft,
  ]);

  const isManualIncludesDirty = useMemo(
    () => !isManualIncludesEqual(manualIncludesDraft, serverIncludes),
    [manualIncludesDraft, serverIncludes],
  );

  const isExtrasDirty = useMemo(
    () =>
      !isExtrasEqual(
        { enableCertificate: extras.enableCertificate },
        serverExtras,
      ) || isManualIncludesDirty,
    [extras.enableCertificate, serverExtras, isManualIncludesDirty],
  );
  const isExtrasDirtyRef = useRef(isExtrasDirty);
  isExtrasDirtyRef.current = isExtrasDirty;

  const isStepDirty = (stepId: CourseWizardStepId): boolean => {
    if (stepId === "basics") return isBasicsDirty;
    if (stepId === "curriculum") return isCurriculumDirty;
    if (stepId === "access-rules") return needsAccessRulesSave;
    if (stepId === "pricing") return isPricingDirty;
    if (stepId === "extras") return isExtrasDirty;
    return false;
  };

  const hasUnsavedChanges =
    isBasicsDirty ||
    isCurriculumDirty ||
    needsAccessRulesSave ||
    isPricingDirty ||
    isExtrasDirty;
  return {
    setServerExtras,
    serverIncludes,
    setServerIncludes,
    manualIncludesDraft,
    setManualIncludesDraft,
    manualIncludesDraftRef,
    dragInitialIncludesStateRef,
    deletingIncludeIdsRef,
    deletingIncludeIds,
    setDeletingIncludeIds,
    savingIncludeIdsRef,
    savingIncludeIds,
    setSavingIncludeIds,
    isSavingCertificate,
    setIsSavingCertificate,
    isSavingCertificateRef,
    extrasControlStatus,
    setExtrasSaveFailed,
    triggerExtrasSavedBriefly,
    clearExtrasControlStatus,
    markExtrasControlSaved,
    markExtrasControlFailed,
    getExtrasControlDisplayStatus,
    extrasOverallStatus,
    extras,
    setExtras,
    suggestedInclusions,
    isManualIncludesDirty,
    isExtrasDirty,
    isExtrasDirtyRef,
    isStepDirty,
    hasUnsavedChanges,
  };
}
