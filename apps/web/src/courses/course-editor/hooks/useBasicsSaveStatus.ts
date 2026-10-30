import {
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { BasicsFieldKey } from "../statusIndicators";

export interface UseBasicsSaveStatusArgs {
  setVideoTrailer: Dispatch<SetStateAction<string | null>>;
  videoTrailerInputRef: RefObject<HTMLInputElement | null>;
}

export interface UseBasicsSaveStatusResult {
  triggerVideoTrailerUpload: () => void;
  handleRemoveVideoTrailer: (e: React.MouseEvent) => void;
  savingBasicsControls: Set<string>;
  savingBasicsControlsRef: RefObject<Set<string>>;
  basicsVersionRef: RefObject<number>;
  inFlightBasicsControlsRef: RefObject<Record<string, number>>;
  inFlightBasicsPromiseRef: RefObject<Promise<unknown> | null>;
  inFlightCourseCreationPromiseRef: RefObject<Promise<{
    id: string;
    version: number;
    title: string;
    instructorAlias?: string | null;
  }> | null>;
  titleCreationDebounceTimerRef: RefObject<NodeJS.Timeout | null>;
  cancelTitleCreationDebounce: () => void;
  markBasicsControlSaving: (controlKey: string, isSaving: boolean) => void;
  isBasicsControlSaving: (controlKey: string) => boolean;
  basicsFieldStatus: Partial<Record<BasicsFieldKey, "saved" | "failed" | null>>;
  basicsSaveFailed: boolean;
  setBasicsSaveFailed: Dispatch<SetStateAction<boolean>>;
  showBasicsSavedBriefly: boolean;
  triggerBasicsSavedBriefly: () => void;
  clearBasicsFieldStatus: (fieldKey: BasicsFieldKey) => void;
  markBasicsFieldSaved: (fieldKey: BasicsFieldKey) => void;
  markBasicsFieldFailed: (fieldKey: BasicsFieldKey) => void;
}

export function useBasicsSaveStatus({
  setVideoTrailer,
  videoTrailerInputRef,
}: UseBasicsSaveStatusArgs): UseBasicsSaveStatusResult {
  const triggerVideoTrailerUpload = () => {
    videoTrailerInputRef.current?.click();
  };

  const handleRemoveVideoTrailer = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVideoTrailer(null);
    if (videoTrailerInputRef.current) {
      videoTrailerInputRef.current.value = "";
    }
  };

  // Immediate persistence states for Basics interactive controls
  const [savingBasicsControls, setSavingBasicsControls] = useState<Set<string>>(
    () => new Set(),
  );
  const savingBasicsControlsRef = useRef<Set<string>>(new Set());
  const basicsVersionRef = useRef<number>(0);
  const inFlightBasicsControlsRef = useRef<Record<string, number>>({
    title: 0,
    shortDescription: 0,
    courseDescription: 0,
    instructorAlias: 0,
    showInstructorName: 0,
  });
  const inFlightBasicsPromiseRef = useRef<Promise<unknown> | null>(null);
  /**
   * Shared in-flight new-course creation promise.
   * Registered BEFORE the first await so every concurrent caller joins the
   * same POST /courses request instead of firing a new one.
   * Cleared in the finally block after success or failure.
   */
  const inFlightCourseCreationPromiseRef = useRef<Promise<{
    id: string;
    version: number;
    title: string;
    instructorAlias?: string | null;
  }> | null>(null);

  /**
   * 1-second debounce timer for initial new-course title creation.
   * Cleared whenever the user presses Enter, blurs, navigates, saves, or unmounts.
   */
  const titleCreationDebounceTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const cancelTitleCreationDebounce = () => {
    if (titleCreationDebounceTimerRef.current) {
      clearTimeout(titleCreationDebounceTimerRef.current);
      titleCreationDebounceTimerRef.current = null;
    }
  };

  const markBasicsControlSaving = (controlKey: string, isSaving: boolean) => {
    if (isSaving) {
      savingBasicsControlsRef.current.add(controlKey);
    } else {
      savingBasicsControlsRef.current.delete(controlKey);
    }
    setSavingBasicsControls(new Set(savingBasicsControlsRef.current));
  };

  const isBasicsControlSaving = (controlKey: string) =>
    savingBasicsControlsRef.current.has(controlKey) ||
    (inFlightBasicsControlsRef.current[controlKey] ?? 0) > 0;

  const [basicsFieldStatus, setBasicsFieldStatus] = useState<
    Partial<Record<BasicsFieldKey, "saved" | "failed" | null>>
  >({});
  const basicsFieldTimersRef = useRef<
    Partial<Record<BasicsFieldKey, ReturnType<typeof setTimeout>>>
  >({});
  const [basicsSaveFailed, setBasicsSaveFailed] = useState(false);
  const [showBasicsSavedBriefly, setShowBasicsSavedBriefly] = useState(false);
  const basicsSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const triggerBasicsSavedBriefly = () => {
    if (basicsSavedBrieflyTimerRef.current) {
      clearTimeout(basicsSavedBrieflyTimerRef.current);
    }
    setShowBasicsSavedBriefly(true);
    basicsSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowBasicsSavedBriefly(false);
      basicsSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    // The record is only ever mutated, never replaced: timers added after
    // this point are in it when the cleanup runs.
    const basicsFieldTimers = basicsFieldTimersRef.current;
    return () => {
      if (titleCreationDebounceTimerRef.current) {
        clearTimeout(titleCreationDebounceTimerRef.current);
        titleCreationDebounceTimerRef.current = null;
      }
      Object.values(basicsFieldTimers).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (basicsSavedBrieflyTimerRef.current) {
        clearTimeout(basicsSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const clearBasicsFieldStatus = (fieldKey: BasicsFieldKey) => {
    if (basicsFieldTimersRef.current[fieldKey]) {
      clearTimeout(basicsFieldTimersRef.current[fieldKey]);
      delete basicsFieldTimersRef.current[fieldKey];
    }
    setBasicsFieldStatus((prev) => {
      if (!prev[fieldKey]) return prev;
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
    setBasicsSaveFailed(false);
    if (basicsSavedBrieflyTimerRef.current) {
      clearTimeout(basicsSavedBrieflyTimerRef.current);
      basicsSavedBrieflyTimerRef.current = null;
    }
    setShowBasicsSavedBriefly(false);
  };

  const markBasicsFieldSaved = (fieldKey: BasicsFieldKey) => {
    if (basicsFieldTimersRef.current[fieldKey]) {
      clearTimeout(basicsFieldTimersRef.current[fieldKey]);
      delete basicsFieldTimersRef.current[fieldKey];
    }
    setBasicsFieldStatus((prev) => ({ ...prev, [fieldKey]: "saved" }));
    setBasicsSaveFailed(false);
    triggerBasicsSavedBriefly();

    basicsFieldTimersRef.current[fieldKey] = setTimeout(() => {
      setBasicsFieldStatus((prev) => {
        if (prev[fieldKey] !== "saved") return prev;
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
      delete basicsFieldTimersRef.current[fieldKey];
    }, 1500);
  };

  const markBasicsFieldFailed = (fieldKey: BasicsFieldKey) => {
    if (basicsFieldTimersRef.current[fieldKey]) {
      clearTimeout(basicsFieldTimersRef.current[fieldKey]);
      delete basicsFieldTimersRef.current[fieldKey];
    }
    setBasicsFieldStatus((prev) => ({ ...prev, [fieldKey]: "failed" }));
    setBasicsSaveFailed(true);
    if (basicsSavedBrieflyTimerRef.current) {
      clearTimeout(basicsSavedBrieflyTimerRef.current);
      basicsSavedBrieflyTimerRef.current = null;
    }
    setShowBasicsSavedBriefly(false);
  };
  return {
    triggerVideoTrailerUpload,
    handleRemoveVideoTrailer,
    savingBasicsControls,
    savingBasicsControlsRef,
    basicsVersionRef,
    inFlightBasicsControlsRef,
    inFlightBasicsPromiseRef,
    inFlightCourseCreationPromiseRef,
    titleCreationDebounceTimerRef,
    cancelTitleCreationDebounce,
    markBasicsControlSaving,
    isBasicsControlSaving,
    basicsFieldStatus,
    basicsSaveFailed,
    setBasicsSaveFailed,
    showBasicsSavedBriefly,
    triggerBasicsSavedBriefly,
    clearBasicsFieldStatus,
    markBasicsFieldSaved,
    markBasicsFieldFailed,
  };
}
