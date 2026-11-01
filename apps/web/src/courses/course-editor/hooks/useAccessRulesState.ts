import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { AccessRulesControlKey } from "../statusIndicators";
import {
  type AccessRulesFormState,
  initialAccessRulesState,
  isAccessRulesEqual,
} from "../accessRulesState";

export interface UseAccessRulesStateArgs {
  isSavingAccessRules: boolean;
}

export interface UseAccessRulesStateResult {
  setAccessRulesExists: Dispatch<SetStateAction<boolean>>;
  serverAccessRules: AccessRulesFormState;
  setServerAccessRules: Dispatch<SetStateAction<AccessRulesFormState>>;
  accessRulesDraft: AccessRulesFormState;
  setAccessRulesDraft: Dispatch<SetStateAction<AccessRulesFormState>>;
  accessRulesDraftRef: RefObject<AccessRulesFormState>;
  isAccessRulesDirtyRef: RefObject<boolean>;
  needsAccessRulesSave: boolean;
  accessRules: AccessRulesFormState;
  setAccessRules: Dispatch<SetStateAction<AccessRulesFormState>>;
  savingAccessControls: Set<string>;
  savingAccessControlsRef: RefObject<Set<string>>;
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
  isAccessControlSaving: (controlKey: string) => boolean;
  setAccessRulesSaveFailed: Dispatch<SetStateAction<boolean>>;
  triggerAccessRulesSavedBriefly: () => void;
  clearAccessControlStatus: (controlKey: AccessRulesControlKey) => void;
  markAccessControlSaved: (controlKey: AccessRulesControlKey) => void;
  markAccessControlFailed: (controlKey: AccessRulesControlKey) => void;
  getAccessControlDisplayStatus: (
    controlKey: AccessRulesControlKey,
  ) => "saving" | "saved" | "failed" | null;
  accessRulesOverallStatus: "saving" | "saved" | "failed" | null;
}

export function useAccessRulesState({
  isSavingAccessRules,
}: UseAccessRulesStateArgs): UseAccessRulesStateResult {
  // Access Rules Step server-confirmed and draft states
  const [accessRulesExists, setAccessRulesExists] = useState(false);
  const [serverAccessRules, setServerAccessRules] =
    useState<AccessRulesFormState>(initialAccessRulesState);
  const [accessRulesDraft, setAccessRulesDraft] =
    useState<AccessRulesFormState>(initialAccessRulesState);
  const accessRulesDraftRef = useRef(accessRulesDraft);
  accessRulesDraftRef.current = accessRulesDraft;
  const isAccessRulesDirty = useMemo(
    () => !isAccessRulesEqual(accessRulesDraft, serverAccessRules),
    [accessRulesDraft, serverAccessRules],
  );
  const isAccessRulesDirtyRef = useRef(isAccessRulesDirty);
  isAccessRulesDirtyRef.current = isAccessRulesDirty;

  const needsAccessRulesSave =
    isAccessRulesDirty && Boolean(accessRulesDraft.durationMode);
  const accessRules = accessRulesDraft;
  const setAccessRules = setAccessRulesDraft;

  // Immediate persistence states for Access Rules interactive controls
  const [savingAccessControls, setSavingAccessControls] = useState<Set<string>>(
    () => new Set(),
  );
  const savingAccessControlsRef = useRef<Set<string>>(new Set());
  const accessControlVersionsRef = useRef<{
    accessType: number;
    durationMode: number;
    fixedDuration: number;
    enableQA: number;
    enableComments: number;
    enableDownloads: number;
    enableNotes: number;
  }>({
    accessType: 0,
    durationMode: 0,
    fixedDuration: 0,
    enableQA: 0,
    enableComments: 0,
    enableDownloads: 0,
    enableNotes: 0,
  });
  const inFlightAccessControlsRef = useRef<Record<string, number>>({
    accessType: 0,
    durationMode: 0,
    fixedDuration: 0,
    enableQA: 0,
    enableComments: 0,
    enableDownloads: 0,
    enableNotes: 0,
  });
  const fixedDurationDebounceTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const inFlightDurationPromiseRef = useRef<Promise<unknown> | null>(null);

  const markAccessControlSaving = (controlKey: string, isSaving: boolean) => {
    if (isSaving) {
      savingAccessControlsRef.current.add(controlKey);
    } else {
      savingAccessControlsRef.current.delete(controlKey);
    }
    setSavingAccessControls(new Set(savingAccessControlsRef.current));
  };

  const isAccessControlSaving = (controlKey: string) =>
    savingAccessControlsRef.current.has(controlKey) ||
    (inFlightAccessControlsRef.current[controlKey] ?? 0) > 0;

  const [accessControlStatus, setAccessControlStatus] = useState<
    Partial<Record<AccessRulesControlKey, "saved" | "failed" | null>>
  >({});
  const accessControlTimersRef = useRef<
    Partial<Record<AccessRulesControlKey, ReturnType<typeof setTimeout>>>
  >({});
  const [accessRulesSaveFailed, setAccessRulesSaveFailed] = useState(false);
  const [showAccessRulesSavedBriefly, setShowAccessRulesSavedBriefly] =
    useState(false);
  const accessRulesSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const triggerAccessRulesSavedBriefly = () => {
    if (accessRulesSavedBrieflyTimerRef.current) {
      clearTimeout(accessRulesSavedBrieflyTimerRef.current);
    }
    setShowAccessRulesSavedBriefly(true);
    accessRulesSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowAccessRulesSavedBriefly(false);
      accessRulesSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    // The record is only ever mutated, never replaced: timers added after
    // this point are in it when the cleanup runs.
    const accessControlTimers = accessControlTimersRef.current;
    return () => {
      Object.values(accessControlTimers).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (accessRulesSavedBrieflyTimerRef.current) {
        clearTimeout(accessRulesSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const clearAccessControlStatus = (controlKey: AccessRulesControlKey) => {
    if (accessControlTimersRef.current[controlKey]) {
      clearTimeout(accessControlTimersRef.current[controlKey]);
      delete accessControlTimersRef.current[controlKey];
    }
    setAccessControlStatus((prev) => {
      if (!prev[controlKey]) return prev;
      const next = { ...prev };
      delete next[controlKey];
      return next;
    });
    setAccessRulesSaveFailed(false);
    if (accessRulesSavedBrieflyTimerRef.current) {
      clearTimeout(accessRulesSavedBrieflyTimerRef.current);
      accessRulesSavedBrieflyTimerRef.current = null;
    }
    setShowAccessRulesSavedBriefly(false);
  };

  const markAccessControlSaved = (controlKey: AccessRulesControlKey) => {
    if (accessControlTimersRef.current[controlKey]) {
      clearTimeout(accessControlTimersRef.current[controlKey]);
      delete accessControlTimersRef.current[controlKey];
    }
    setAccessControlStatus((prev) => ({ ...prev, [controlKey]: "saved" }));
    setAccessRulesSaveFailed(false);
    triggerAccessRulesSavedBriefly();

    accessControlTimersRef.current[controlKey] = setTimeout(() => {
      setAccessControlStatus((prev) => {
        if (prev[controlKey] !== "saved") return prev;
        const next = { ...prev };
        delete next[controlKey];
        return next;
      });
      delete accessControlTimersRef.current[controlKey];
    }, 1500);
  };

  const markAccessControlFailed = (controlKey: AccessRulesControlKey) => {
    if (accessControlTimersRef.current[controlKey]) {
      clearTimeout(accessControlTimersRef.current[controlKey]);
      delete accessControlTimersRef.current[controlKey];
    }
    setAccessControlStatus((prev) => ({ ...prev, [controlKey]: "failed" }));
    setAccessRulesSaveFailed(true);
    if (accessRulesSavedBrieflyTimerRef.current) {
      clearTimeout(accessRulesSavedBrieflyTimerRef.current);
      accessRulesSavedBrieflyTimerRef.current = null;
    }
    setShowAccessRulesSavedBriefly(false);
  };

  const getAccessControlDisplayStatus = (
    controlKey: AccessRulesControlKey,
  ): "saving" | "saved" | "failed" | null => {
    if (
      savingAccessControls.has(controlKey) ||
      (inFlightAccessControlsRef.current[controlKey] ?? 0) > 0
    ) {
      return "saving";
    }
    return accessControlStatus[controlKey] ?? null;
  };

  const isAnyAccessRulesSaving =
    savingAccessControls.size > 0 ||
    isSavingAccessRules ||
    (inFlightAccessControlsRef.current.accessType ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.durationMode ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.fixedDuration ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.enableQA ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.enableComments ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.enableDownloads ?? 0) > 0 ||
    (inFlightAccessControlsRef.current.enableNotes ?? 0) > 0;

  const hasAccessControlFailed =
    accessRulesSaveFailed ||
    Object.values(accessControlStatus).some((status) => status === "failed");

  const accessRulesOverallStatus = useMemo(():
    "saving" | "failed" | "saved" | null => {
    if (isAnyAccessRulesSaving) return "saving";
    if (hasAccessControlFailed) return "failed";
    if (showAccessRulesSavedBriefly) return "saved";
    return null;
  }, [
    isAnyAccessRulesSaving,
    hasAccessControlFailed,
    showAccessRulesSavedBriefly,
  ]);

  useEffect(() => {
    return () => {
      if (fixedDurationDebounceTimerRef.current) {
        clearTimeout(fixedDurationDebounceTimerRef.current);
      }
    };
  }, []);
  return {
    setAccessRulesExists,
    serverAccessRules,
    setServerAccessRules,
    accessRulesDraft,
    setAccessRulesDraft,
    accessRulesDraftRef,
    isAccessRulesDirtyRef,
    needsAccessRulesSave,
    accessRules,
    setAccessRules,
    savingAccessControls,
    savingAccessControlsRef,
    accessControlVersionsRef,
    inFlightAccessControlsRef,
    fixedDurationDebounceTimerRef,
    inFlightDurationPromiseRef,
    markAccessControlSaving,
    isAccessControlSaving,
    setAccessRulesSaveFailed,
    triggerAccessRulesSavedBriefly,
    clearAccessControlStatus,
    markAccessControlSaved,
    markAccessControlFailed,
    getAccessControlDisplayStatus,
    accessRulesOverallStatus,
  };
}
