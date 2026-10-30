import type { RefObject, Dispatch, SetStateAction } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  UpdateCourseAccessRuleRequest,
  UpdateCourseSettingsRequest,
} from "@veolms/contracts";
import type { AccessRulesControlKey } from "../statusIndicators";
import type {
  AccessType,
  AccessDurationMode,
  DurationUnit,
  AccessRulesFormState,
} from "../accessRulesState";
import type { ApiError } from "../../../lib/api-error";

export interface UseAccessRulesHandlersArgs {
  currentCourseId: string | null;
  currentCourseIdRef: RefObject<string | null>;
  inFlightBasicsPromiseRef: RefObject<Promise<unknown> | null>;
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
  setAccessRulesExists: Dispatch<SetStateAction<boolean>>;
  serverAccessRules: AccessRulesFormState;
  setServerAccessRules: Dispatch<SetStateAction<AccessRulesFormState>>;
  accessRulesDraftRef: RefObject<AccessRulesFormState>;
  setAccessRules: Dispatch<SetStateAction<AccessRulesFormState>>;
  accessControlVersionsRef: RefObject<{
    accessType: number;
    durationMode: number;
    fixedDuration: number;
    enableQA: number;
    enableComments: number;
    enableDownloads: number;
    enableNotes: number;
  }>;
  inFlightAccessControlsRef: RefObject<Record<string, number>>;
  fixedDurationDebounceTimerRef: RefObject<NodeJS.Timeout | null>;
  inFlightDurationPromiseRef: RefObject<Promise<unknown> | null>;
  markAccessControlSaving: (controlKey: string, isSaving: boolean) => void;
  clearAccessControlStatus: (controlKey: AccessRulesControlKey) => void;
  markAccessControlSaved: (controlKey: AccessRulesControlKey) => void;
  markAccessControlFailed: (controlKey: AccessRulesControlKey) => void;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
}

export interface UseAccessRulesHandlersResult {
  handleAccessTypeChange: (type: AccessType) => Promise<void>;
  handleDurationModeChange: (mode: AccessDurationMode) => Promise<void>;
  flushFixedDurationPersistence: () => Promise<void>;
  handleFixedDurationValueChange: (val: number) => void;
  handleFixedDurationUnitChange: (unit: DurationUnit) => void;
  handleToggleQA: () => Promise<void>;
  handleToggleComments: () => Promise<void>;
  handleToggleNotes: () => Promise<void>;
}

export function useAccessRulesHandlers({
  currentCourseId,
  currentCourseIdRef,
  inFlightBasicsPromiseRef,
  upsertAccessRulesMutation,
  upsertSettingsMutation,
  setAccessRulesExists,
  serverAccessRules,
  setServerAccessRules,
  accessRulesDraftRef,
  setAccessRules,
  accessControlVersionsRef,
  inFlightAccessControlsRef,
  fixedDurationDebounceTimerRef,
  inFlightDurationPromiseRef,
  markAccessControlSaving,
  clearAccessControlStatus,
  markAccessControlSaved,
  markAccessControlFailed,
  setToastMessage,
}: UseAccessRulesHandlersArgs): UseAccessRulesHandlersResult {
  const ensureCourseDraftForAccessRules = async (): Promise<string> => {
    let id = currentCourseIdRef.current || currentCourseId;
    if (id) return id;
    if (inFlightBasicsPromiseRef.current) {
      await inFlightBasicsPromiseRef.current;
      id = currentCourseIdRef.current || currentCourseId;
      if (id) return id;
    }
    throw new Error(
      "Course draft must be created before configuring access rules. Please enter a course title first.",
    );
  };

  // Access Rules State Handlers (Immediate Persistence)
  const handleAccessTypeChange = async (type: AccessType) => {
    if (type === "restricted") return; // Restricted is disabled/coming soon
    if (accessRulesDraftRef.current.accessType === type) return;

    clearAccessControlStatus("accessType");
    const previousValue = accessRulesDraftRef.current.accessType;
    const version = ++accessControlVersionsRef.current.accessType;

    // 1. Optimistic update
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      accessType: type,
    };
    setAccessRules((prev) => ({ ...prev, accessType: type }));
    inFlightAccessControlsRef.current.accessType =
      (inFlightAccessControlsRef.current.accessType || 0) + 1;
    markAccessControlSaving("accessType", true);

    try {
      const targetCourseId = await ensureCourseDraftForAccessRules();

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

      await upsertAccessRulesMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          accessType: type,
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

      if (accessControlVersionsRef.current.accessType === version) {
        setAccessRulesExists(true);
        setServerAccessRules((prev) => ({
          ...prev,
          accessType: type,
        }));
        markAccessControlSaved("accessType");
      }
    } catch (err: unknown) {
      if (accessControlVersionsRef.current.accessType === version) {
        markAccessControlFailed("accessType");
        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          accessType: previousValue,
        };
        setAccessRules((prev) => ({
          ...prev,
          accessType: previousValue,
        }));
        const errorMsg =
          (err as { message?: string })?.message ||
          "Failed to update access type.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightAccessControlsRef.current.accessType = Math.max(
        0,
        (inFlightAccessControlsRef.current.accessType || 1) - 1,
      );
      if (inFlightAccessControlsRef.current.accessType === 0) {
        markAccessControlSaving("accessType", false);
      }
    }
  };

  const handleDurationModeChange = async (mode: AccessDurationMode) => {
    if (accessRulesDraftRef.current.durationMode === mode) return;

    clearAccessControlStatus("durationMode");
    if (fixedDurationDebounceTimerRef.current) {
      clearTimeout(fixedDurationDebounceTimerRef.current);
      fixedDurationDebounceTimerRef.current = null;
    }
    // Invalidate in-flight fixed duration requests so an older duration response cannot overwrite
    ++accessControlVersionsRef.current.fixedDuration;

    const previousMode = accessRulesDraftRef.current.durationMode;
    const version = ++accessControlVersionsRef.current.durationMode;

    // 1. Optimistic update
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      durationMode: mode,
    };
    setAccessRules((prev) => ({ ...prev, durationMode: mode }));
    inFlightAccessControlsRef.current.durationMode =
      (inFlightAccessControlsRef.current.durationMode || 0) + 1;
    markAccessControlSaving("durationMode", true);

    try {
      const targetCourseId = await ensureCourseDraftForAccessRules();

      let durationDays: number | null = null;
      if (mode === "fixed") {
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

      await upsertAccessRulesMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          accessType: accessRulesDraftRef.current.accessType || "everyone",
          durationType: mode === "fixed" ? "fixed_duration" : "lifetime",
          durationDays: mode === "fixed" ? durationDays : null,
        },
      });

      if (accessControlVersionsRef.current.durationMode === version) {
        setAccessRulesExists(true);
        setServerAccessRules((prev) => ({
          ...prev,
          durationMode: mode,
          ...(mode === "fixed"
            ? {
                fixedDurationValue:
                  accessRulesDraftRef.current.fixedDurationValue,
                fixedDurationUnit:
                  accessRulesDraftRef.current.fixedDurationUnit,
              }
            : {}),
        }));
        markAccessControlSaved("durationMode");
      }
    } catch (err: unknown) {
      if (accessControlVersionsRef.current.durationMode === version) {
        markAccessControlFailed("durationMode");
        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          durationMode: previousMode,
        };
        setAccessRules((prev) => ({
          ...prev,
          durationMode: previousMode,
        }));
        const errorMsg =
          (err as { message?: string })?.message ||
          "Failed to update access duration.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightAccessControlsRef.current.durationMode = Math.max(
        0,
        (inFlightAccessControlsRef.current.durationMode || 1) - 1,
      );
      if (inFlightAccessControlsRef.current.durationMode === 0) {
        markAccessControlSaving("durationMode", false);
      }
    }
  };

  const persistFixedDuration = async (
    explicitVal?: number,
    explicitUnit?: DurationUnit,
  ) => {
    const currentDraft = accessRulesDraftRef.current;
    if (currentDraft.durationMode !== "fixed") return;

    clearAccessControlStatus("fixedDuration");
    const val = Math.max(
      1,
      explicitVal !== undefined
        ? explicitVal
        : currentDraft.fixedDurationValue || 1,
    );
    const unit =
      explicitUnit !== undefined
        ? explicitUnit
        : currentDraft.fixedDurationUnit || "Days";

    const unitMultiplier =
      unit === "Years"
        ? 365
        : unit === "Months"
          ? 30
          : unit === "Weeks"
            ? 7
            : 1;
    const durationDays = val * unitMultiplier;

    const previousVal = serverAccessRules.fixedDurationValue;
    const previousUnit = serverAccessRules.fixedDurationUnit;
    const version = ++accessControlVersionsRef.current.fixedDuration;

    inFlightAccessControlsRef.current.fixedDuration =
      (inFlightAccessControlsRef.current.fixedDuration || 0) + 1;
    markAccessControlSaving("fixedDuration", true);

    const run = async () => {
      try {
        const targetCourseId = await ensureCourseDraftForAccessRules();

        await upsertAccessRulesMutation.mutateAsync({
          courseId: targetCourseId,
          payload: {
            accessType: accessRulesDraftRef.current.accessType || "everyone",
            durationType: "fixed_duration",
            durationDays,
          },
        });

        if (
          accessControlVersionsRef.current.fixedDuration === version &&
          accessRulesDraftRef.current.durationMode === "fixed"
        ) {
          setAccessRulesExists(true);
          setServerAccessRules((prev) => ({
            ...prev,
            durationMode: "fixed",
            fixedDurationValue: val,
            fixedDurationUnit: unit,
          }));
          markAccessControlSaved("fixedDuration");
        }
      } catch (err: unknown) {
        if (
          accessControlVersionsRef.current.fixedDuration === version &&
          accessRulesDraftRef.current.durationMode === "fixed"
        ) {
          markAccessControlFailed("fixedDuration");
          accessRulesDraftRef.current = {
            ...accessRulesDraftRef.current,
            fixedDurationValue: previousVal,
            fixedDurationUnit: previousUnit,
          };
          setAccessRules((prev) => ({
            ...prev,
            fixedDurationValue: previousVal,
            fixedDurationUnit: previousUnit,
          }));
          const errorMsg =
            (err as { message?: string })?.message ||
            "Failed to update fixed access duration.";
          setToastMessage(errorMsg);
        }
      } finally {
        inFlightAccessControlsRef.current.fixedDuration = Math.max(
          0,
          (inFlightAccessControlsRef.current.fixedDuration || 1) - 1,
        );
        if (inFlightAccessControlsRef.current.fixedDuration === 0) {
          markAccessControlSaving("fixedDuration", false);
        }
        if (accessControlVersionsRef.current.fixedDuration === version) {
          inFlightDurationPromiseRef.current = null;
        }
      }
    };

    const promise = run();
    inFlightDurationPromiseRef.current = promise;
    return await promise;
  };

  const flushFixedDurationPersistence = async () => {
    if (fixedDurationDebounceTimerRef.current) {
      clearTimeout(fixedDurationDebounceTimerRef.current);
      fixedDurationDebounceTimerRef.current = null;
    }

    const currentDraft = accessRulesDraftRef.current;
    const isDurationDirty =
      currentDraft.durationMode === "fixed" &&
      (serverAccessRules.durationMode !== "fixed" ||
        currentDraft.fixedDurationValue !==
          serverAccessRules.fixedDurationValue ||
        currentDraft.fixedDurationUnit !== serverAccessRules.fixedDurationUnit);

    if (isDurationDirty) {
      await persistFixedDuration();
    } else if (inFlightDurationPromiseRef.current) {
      await inFlightDurationPromiseRef.current;
    }
  };

  const handleFixedDurationValueChange = (val: number) => {
    clearAccessControlStatus("fixedDuration");
    const value = Math.max(1, isNaN(val) ? 1 : val);
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      fixedDurationValue: value,
    };
    setAccessRules((prev) => ({
      ...prev,
      fixedDurationValue: value,
    }));

    if (fixedDurationDebounceTimerRef.current) {
      clearTimeout(fixedDurationDebounceTimerRef.current);
    }
    fixedDurationDebounceTimerRef.current = setTimeout(() => {
      fixedDurationDebounceTimerRef.current = null;
      void persistFixedDuration();
    }, 400);
  };

  const handleFixedDurationUnitChange = (unit: DurationUnit) => {
    clearAccessControlStatus("fixedDuration");
    if (fixedDurationDebounceTimerRef.current) {
      clearTimeout(fixedDurationDebounceTimerRef.current);
      fixedDurationDebounceTimerRef.current = null;
    }
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      fixedDurationUnit: unit,
    };
    setAccessRules((prev) => ({ ...prev, fixedDurationUnit: unit }));
    void persistFixedDuration(
      accessRulesDraftRef.current.fixedDurationValue,
      unit,
    );
  };

  const handleToggleQA = async () => {
    clearAccessControlStatus("enableQA");
    const previousValue = accessRulesDraftRef.current.enableQA;
    const nextValue = !previousValue;
    const version = ++accessControlVersionsRef.current.enableQA;

    // 1. Optimistic update
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      enableQA: nextValue,
    };
    setAccessRules((prev) => ({ ...prev, enableQA: nextValue }));
    inFlightAccessControlsRef.current.enableQA =
      (inFlightAccessControlsRef.current.enableQA || 0) + 1;
    markAccessControlSaving("enableQA", true);

    try {
      const targetCourseId = await ensureCourseDraftForAccessRules();

      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          allowQa: nextValue,
        },
      });

      if (accessControlVersionsRef.current.enableQA === version) {
        const confirmedQa =
          res.allowQa !== undefined ? Boolean(res.allowQa) : nextValue;

        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableQA: confirmedQa,
        };
        setServerAccessRules((prev) => ({
          ...prev,
          enableQA: confirmedQa,
        }));
        setAccessRules((prev) => ({
          ...prev,
          enableQA: confirmedQa,
        }));
        markAccessControlSaved("enableQA");
      }
    } catch (err: unknown) {
      if (accessControlVersionsRef.current.enableQA === version) {
        markAccessControlFailed("enableQA");
        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableQA: previousValue,
        };
        setAccessRules((prev) => ({
          ...prev,
          enableQA: previousValue,
        }));
        const errorMsg =
          (err as { message?: string })?.message ||
          "Failed to update Q&A setting.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightAccessControlsRef.current.enableQA = Math.max(
        0,
        (inFlightAccessControlsRef.current.enableQA || 1) - 1,
      );
      if (inFlightAccessControlsRef.current.enableQA === 0) {
        markAccessControlSaving("enableQA", false);
      }
    }
  };

  const handleToggleComments = async () => {
    clearAccessControlStatus("enableComments");
    const previousValue = accessRulesDraftRef.current.enableComments;
    const nextValue = !previousValue;
    const version = ++accessControlVersionsRef.current.enableComments;

    // 1. Optimistic update
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      enableComments: nextValue,
    };
    setAccessRules((prev) => ({ ...prev, enableComments: nextValue }));
    inFlightAccessControlsRef.current.enableComments =
      (inFlightAccessControlsRef.current.enableComments || 0) + 1;
    markAccessControlSaving("enableComments", true);

    try {
      const targetCourseId = await ensureCourseDraftForAccessRules();

      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          allowComments: nextValue,
        },
      });

      if (accessControlVersionsRef.current.enableComments === version) {
        const confirmedComments =
          res.allowComments !== undefined
            ? Boolean(res.allowComments)
            : nextValue;

        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableComments: confirmedComments,
        };
        setServerAccessRules((prev) => ({
          ...prev,
          enableComments: confirmedComments,
        }));
        setAccessRules((prev) => ({
          ...prev,
          enableComments: confirmedComments,
        }));
        markAccessControlSaved("enableComments");
      }
    } catch (err: unknown) {
      if (accessControlVersionsRef.current.enableComments === version) {
        markAccessControlFailed("enableComments");
        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableComments: previousValue,
        };
        setAccessRules((prev) => ({
          ...prev,
          enableComments: previousValue,
        }));
        const errorMsg =
          (err as { message?: string })?.message ||
          "Failed to update comments setting.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightAccessControlsRef.current.enableComments = Math.max(
        0,
        (inFlightAccessControlsRef.current.enableComments || 1) - 1,
      );
      if (inFlightAccessControlsRef.current.enableComments === 0) {
        markAccessControlSaving("enableComments", false);
      }
    }
  };

  const handleToggleNotes = async () => {
    clearAccessControlStatus("enableNotes");
    const previousValue = accessRulesDraftRef.current.enableNotes;
    const nextValue = !previousValue;
    const version = ++accessControlVersionsRef.current.enableNotes;

    // 1. Optimistic update
    accessRulesDraftRef.current = {
      ...accessRulesDraftRef.current,
      enableNotes: nextValue,
    };
    setAccessRules((prev) => ({ ...prev, enableNotes: nextValue }));
    inFlightAccessControlsRef.current.enableNotes =
      (inFlightAccessControlsRef.current.enableNotes || 0) + 1;
    markAccessControlSaving("enableNotes", true);

    try {
      const targetCourseId = await ensureCourseDraftForAccessRules();

      const res = await upsertSettingsMutation.mutateAsync({
        courseId: targetCourseId,
        payload: {
          allowNotes: nextValue,
        },
      });

      if (accessControlVersionsRef.current.enableNotes === version) {
        const confirmedNotes =
          res.allowNotes !== undefined ? Boolean(res.allowNotes) : nextValue;

        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableNotes: confirmedNotes,
        };
        setServerAccessRules((prev) => ({
          ...prev,
          enableNotes: confirmedNotes,
        }));
        setAccessRules((prev) => ({
          ...prev,
          enableNotes: confirmedNotes,
        }));
        markAccessControlSaved("enableNotes");
      }
    } catch (err: unknown) {
      if (accessControlVersionsRef.current.enableNotes === version) {
        markAccessControlFailed("enableNotes");
        accessRulesDraftRef.current = {
          ...accessRulesDraftRef.current,
          enableNotes: previousValue,
        };
        setAccessRules((prev) => ({
          ...prev,
          enableNotes: previousValue,
        }));
        const errorMsg =
          (err as { message?: string })?.message ||
          "Failed to update notes setting.";
        setToastMessage(errorMsg);
      }
    } finally {
      inFlightAccessControlsRef.current.enableNotes = Math.max(
        0,
        (inFlightAccessControlsRef.current.enableNotes || 1) - 1,
      );
      if (inFlightAccessControlsRef.current.enableNotes === 0) {
        markAccessControlSaving("enableNotes", false);
      }
    }
  };
  return {
    handleAccessTypeChange,
    handleDurationModeChange,
    flushFixedDurationPersistence,
    handleFixedDurationValueChange,
    handleFixedDurationUnitChange,
    handleToggleQA,
    handleToggleComments,
    handleToggleNotes,
  };
}
