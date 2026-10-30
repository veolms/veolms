import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

export interface UsePublishStatusArgs {
  isPreviewModalOpen: boolean;
  setIsPreviewModalOpen: Dispatch<SetStateAction<boolean>>;
  isSavingPublish: boolean;
}

export interface UsePublishStatusResult {
  publishValidationError: string | null;
  setPublishValidationError: Dispatch<SetStateAction<string | null>>;
  setPublishSaveFailed: Dispatch<SetStateAction<boolean>>;
  triggerPublishSavedBriefly: () => void;
  publishOverallStatus: "saving" | "saved" | "failed" | null;
}

export function usePublishStatus({
  isPreviewModalOpen,
  setIsPreviewModalOpen,
  isSavingPublish,
}: UsePublishStatusArgs): UsePublishStatusResult {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPreviewModalOpen) {
        setIsPreviewModalOpen(false);
      }
    };
    if (isPreviewModalOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPreviewModalOpen]);

  const [publishValidationError, setPublishValidationError] = useState<
    string | null
  >(null);

  // Auto-hide validation error message after 3.5 seconds
  useEffect(() => {
    if (!publishValidationError) return;
    const timer = setTimeout(() => {
      setPublishValidationError(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [publishValidationError]);

  // Immediate persistence states for Publish interactive controls
  const [publishControlStatus, setPublishControlStatus] = useState<
    Record<string, "saving" | "saved" | "failed" | null>
  >({});
  const publishControlTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const [publishSaveFailed, setPublishSaveFailed] = useState(false);
  const [showPublishSavedBriefly, setShowPublishSavedBriefly] = useState(false);
  const publishSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const triggerPublishSavedBriefly = () => {
    if (publishSavedBrieflyTimerRef.current) {
      clearTimeout(publishSavedBrieflyTimerRef.current);
    }
    setShowPublishSavedBriefly(true);
    publishSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowPublishSavedBriefly(false);
      publishSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    // The record is only ever mutated, never replaced: timers added after
    // this point are in it when the cleanup runs.
    const publishControlTimers = publishControlTimersRef.current;
    return () => {
      Object.values(publishControlTimers).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (publishSavedBrieflyTimerRef.current) {
        clearTimeout(publishSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const isAnyPublishSaving =
    isSavingPublish ||
    Object.values(publishControlStatus).some((status) => status === "saving");

  const hasPublishControlFailed =
    publishSaveFailed ||
    Object.values(publishControlStatus).some((status) => status === "failed");

  const publishOverallStatus = useMemo(():
    "saving" | "failed" | "saved" | null => {
    if (isAnyPublishSaving) return "saving";
    if (hasPublishControlFailed) return "failed";
    if (showPublishSavedBriefly) return "saved";
    return null;
  }, [isAnyPublishSaving, hasPublishControlFailed, showPublishSavedBriefly]);
  return {
    publishValidationError,
    setPublishValidationError,
    setPublishSaveFailed,
    triggerPublishSavedBriefly,
    publishOverallStatus,
  };
}
