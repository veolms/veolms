import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { CourseValidationArea } from "@veolms/contracts";
import type { PricingControlKey, PricingPriceField } from "../statusIndicators";
import {
  type PricingFormState,
  initialPricingState,
  normalizePricingState,
  isPricingEqual,
} from "../pricingState";
import type { PublishState } from "../editorLocalTypes";

export interface UsePricingStateArgs {
  isSavingPricing: boolean;
}

export interface UsePricingStateResult {
  setServerPricing: Dispatch<SetStateAction<PricingFormState>>;
  serverPricingRef: RefObject<PricingFormState>;
  pricingDraft: PricingFormState;
  setPricingDraft: Dispatch<SetStateAction<PricingFormState>>;
  pricingDraftRef: RefObject<PricingFormState>;
  isPricingDirty: boolean;
  isPricingDirtyRef: RefObject<boolean>;
  pricing: PricingFormState;
  pricingValidationError: string | null;
  setPricingValidationError: Dispatch<SetStateAction<string | null>>;
  savingPricingControlsRef: RefObject<Set<string>>;
  pricingControlVersionsRef: RefObject<{
    pricingType: number;
    currency: number;
    pricingDetails: number;
  }>;
  pricingVersionRef: RefObject<number>;
  inFlightPricingControlsRef: RefObject<Record<string, number>>;
  pricingDebounceTimerRef: RefObject<NodeJS.Timeout | null>;
  inFlightPricingPromiseRef: RefObject<Promise<unknown> | null>;
  markPricingControlSaving: (controlKey: string, isSaving: boolean) => void;
  isPricingControlSaving: (controlKey: string) => boolean;
  lastEditedPricingFieldRef: RefObject<PricingPriceField | null>;
  setPricingSaveFailed: Dispatch<SetStateAction<boolean>>;
  triggerPricingSavedBriefly: () => void;
  clearPricingControlStatus: (controlKey: PricingControlKey) => void;
  markPricingControlSaved: (controlKey: PricingControlKey) => void;
  markPricingControlFailed: (controlKey: PricingControlKey) => void;
  getPricingControlDisplayStatus: (
    controlKey: PricingControlKey,
  ) => "saving" | "saved" | "failed" | null;
  pricingOverallStatus: "saving" | "saved" | "failed" | null;
  isPublished: boolean;
  setIsPublished: Dispatch<SetStateAction<boolean>>;
  publishSettings: PublishState;
  setPublishSettings: Dispatch<SetStateAction<PublishState>>;
  expandedValidationArea:
    "basics" | "curriculum" | "pricing" | "extras" | "accessRules" | null;
  setExpandedValidationArea: Dispatch<
    SetStateAction<
      "basics" | "curriculum" | "pricing" | "extras" | "accessRules" | null
    >
  >;
  isUnpublishModalOpen: boolean;
  setIsUnpublishModalOpen: Dispatch<SetStateAction<boolean>>;
}

export function usePricingState({
  isSavingPricing,
}: UsePricingStateArgs): UsePricingStateResult {
  // Pricing Step server-confirmed and draft states
  const [serverPricing, setServerPricing] =
    useState<PricingFormState>(initialPricingState);
  const serverPricingRef = useRef(serverPricing);
  serverPricingRef.current = serverPricing;

  const [pricingDraft, setPricingDraft] =
    useState<PricingFormState>(initialPricingState);
  const pricingDraftRef = useRef(pricingDraft);
  pricingDraftRef.current = pricingDraft;

  const isPricingDirty = useMemo(
    () => !isPricingEqual(pricingDraft, serverPricing),
    [pricingDraft, serverPricing],
  );
  const isPricingDirtyRef = useRef(isPricingDirty);
  isPricingDirtyRef.current = isPricingDirty;

  // Normalised on every render so the type always follows the price typed.
  const pricing = useMemo(
    () => normalizePricingState(pricingDraft),
    [pricingDraft],
  );
  const [pricingValidationError, setPricingValidationError] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!pricingValidationError) return;
    const timer = setTimeout(() => {
      setPricingValidationError(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [pricingValidationError]);

  // Immediate persistence states for Pricing interactive controls
  const [savingPricingControls, setSavingPricingControls] = useState<
    Set<string>
  >(() => new Set());
  const savingPricingControlsRef = useRef<Set<string>>(new Set());
  const pricingControlVersionsRef = useRef<{
    pricingType: number;
    currency: number;
    pricingDetails: number;
  }>({
    pricingType: 0,
    currency: 0,
    pricingDetails: 0,
  });
  const pricingVersionRef = useRef<number>(0);
  const inFlightPricingControlsRef = useRef<Record<string, number>>({
    pricingType: 0,
    currency: 0,
    pricingDetails: 0,
  });
  const pricingDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const inFlightPricingPromiseRef = useRef<Promise<unknown> | null>(null);

  const markPricingControlSaving = (controlKey: string, isSaving: boolean) => {
    if (isSaving) {
      savingPricingControlsRef.current.add(controlKey);
    } else {
      savingPricingControlsRef.current.delete(controlKey);
    }
    setSavingPricingControls(new Set(savingPricingControlsRef.current));
  };

  const isPricingControlSaving = (controlKey: string) =>
    savingPricingControlsRef.current.has(controlKey) ||
    (inFlightPricingControlsRef.current[controlKey] ?? 0) > 0;

  const lastEditedPricingFieldRef = useRef<PricingPriceField | null>(null);

  const [pricingControlStatus, setPricingControlStatus] = useState<
    Partial<Record<PricingControlKey, "saved" | "failed" | null>>
  >({});
  const pricingControlTimersRef = useRef<
    Partial<Record<PricingControlKey, ReturnType<typeof setTimeout>>>
  >({});
  const [pricingSaveFailed, setPricingSaveFailed] = useState(false);
  const [showPricingSavedBriefly, setShowPricingSavedBriefly] = useState(false);
  const pricingSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const triggerPricingSavedBriefly = () => {
    if (pricingSavedBrieflyTimerRef.current) {
      clearTimeout(pricingSavedBrieflyTimerRef.current);
    }
    setShowPricingSavedBriefly(true);
    pricingSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowPricingSavedBriefly(false);
      pricingSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    // The record is only ever mutated, never replaced: timers added after
    // this point are in it when the cleanup runs.
    const pricingControlTimers = pricingControlTimersRef.current;
    return () => {
      Object.values(pricingControlTimers).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (pricingSavedBrieflyTimerRef.current) {
        clearTimeout(pricingSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const clearPricingControlStatus = (controlKey: PricingControlKey) => {
    if (pricingControlTimersRef.current[controlKey]) {
      clearTimeout(pricingControlTimersRef.current[controlKey]);
      delete pricingControlTimersRef.current[controlKey];
    }
    setPricingControlStatus((prev) => {
      if (!prev[controlKey]) return prev;
      const next = { ...prev };
      delete next[controlKey];
      return next;
    });
    setPricingSaveFailed(false);
    if (pricingSavedBrieflyTimerRef.current) {
      clearTimeout(pricingSavedBrieflyTimerRef.current);
      pricingSavedBrieflyTimerRef.current = null;
    }
    setShowPricingSavedBriefly(false);
  };

  const markPricingControlSaved = (controlKey: PricingControlKey) => {
    if (pricingControlTimersRef.current[controlKey]) {
      clearTimeout(pricingControlTimersRef.current[controlKey]);
      delete pricingControlTimersRef.current[controlKey];
    }
    setPricingControlStatus((prev) => ({ ...prev, [controlKey]: "saved" }));
    setPricingSaveFailed(false);
    triggerPricingSavedBriefly();

    pricingControlTimersRef.current[controlKey] = setTimeout(() => {
      setPricingControlStatus((prev) => {
        if (prev[controlKey] !== "saved") return prev;
        const next = { ...prev };
        delete next[controlKey];
        return next;
      });
      delete pricingControlTimersRef.current[controlKey];
    }, 1500);
  };

  const markPricingControlFailed = (controlKey: PricingControlKey) => {
    if (pricingControlTimersRef.current[controlKey]) {
      clearTimeout(pricingControlTimersRef.current[controlKey]);
      delete pricingControlTimersRef.current[controlKey];
    }
    setPricingControlStatus((prev) => ({ ...prev, [controlKey]: "failed" }));
    setPricingSaveFailed(true);
    if (pricingSavedBrieflyTimerRef.current) {
      clearTimeout(pricingSavedBrieflyTimerRef.current);
      pricingSavedBrieflyTimerRef.current = null;
    }
    setShowPricingSavedBriefly(false);
  };

  const getPricingControlDisplayStatus = (
    controlKey: PricingControlKey,
  ): "saving" | "saved" | "failed" | null => {
    if (controlKey === "sellingPrice" || controlKey === "originalPrice") {
      const isDetailsSaving =
        savingPricingControls.has("pricingDetails") ||
        (inFlightPricingControlsRef.current.pricingDetails ?? 0) > 0;
      if (
        isDetailsSaving &&
        (lastEditedPricingFieldRef.current === controlKey ||
          !lastEditedPricingFieldRef.current)
      ) {
        return "saving";
      }
      return pricingControlStatus[controlKey] ?? null;
    }
    if (
      savingPricingControls.has(controlKey) ||
      (inFlightPricingControlsRef.current[controlKey] ?? 0) > 0
    ) {
      return "saving";
    }
    return pricingControlStatus[controlKey] ?? null;
  };

  const isAnyPricingSaving =
    savingPricingControls.size > 0 ||
    isSavingPricing ||
    (inFlightPricingControlsRef.current.pricingType ?? 0) > 0 ||
    (inFlightPricingControlsRef.current.currency ?? 0) > 0 ||
    (inFlightPricingControlsRef.current.pricingDetails ?? 0) > 0;

  const hasPricingControlFailed =
    pricingSaveFailed ||
    Object.values(pricingControlStatus).some((status) => status === "failed");

  const pricingOverallStatus = useMemo(():
    "saving" | "failed" | "saved" | null => {
    if (isAnyPricingSaving) return "saving";
    if (hasPricingControlFailed) return "failed";
    if (showPricingSavedBriefly) return "saved";
    return null;
  }, [isAnyPricingSaving, hasPricingControlFailed, showPricingSavedBriefly]);

  useEffect(() => {
    return () => {
      if (pricingDebounceTimerRef.current) {
        clearTimeout(pricingDebounceTimerRef.current);
      }
    };
  }, []);

  // Course Life Cycle state
  const [isPublished, setIsPublished] = useState<boolean>(false);

  // Publish Step state
  const [publishSettings, setPublishSettings] = useState<PublishState>({
    visibility: "public",
    scheduleOption: "now",
    scheduleDate: "2026-08-20",
    scheduleTime: "10:00",
  });
  const [expandedValidationArea, setExpandedValidationArea] =
    useState<CourseValidationArea | null>(null);

  // Course Overview Live Full Preview Modal State
  const [isUnpublishModalOpen, setIsUnpublishModalOpen] =
    useState<boolean>(false);
  return {
    setServerPricing,
    serverPricingRef,
    pricingDraft,
    setPricingDraft,
    pricingDraftRef,
    isPricingDirty,
    isPricingDirtyRef,
    pricing,
    pricingValidationError,
    setPricingValidationError,
    savingPricingControlsRef,
    pricingControlVersionsRef,
    pricingVersionRef,
    inFlightPricingControlsRef,
    pricingDebounceTimerRef,
    inFlightPricingPromiseRef,
    markPricingControlSaving,
    isPricingControlSaving,
    lastEditedPricingFieldRef,
    setPricingSaveFailed,
    triggerPricingSavedBriefly,
    clearPricingControlStatus,
    markPricingControlSaved,
    markPricingControlFailed,
    getPricingControlDisplayStatus,
    pricingOverallStatus,
    isPublished,
    setIsPublished,
    publishSettings,
    setPublishSettings,
    expandedValidationArea,
    setExpandedValidationArea,
    isUnpublishModalOpen,
    setIsUnpublishModalOpen,
  };
}
