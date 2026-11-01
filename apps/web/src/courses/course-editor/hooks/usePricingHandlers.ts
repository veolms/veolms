import {
  useMemo,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import { CertificateIcon as Certificate } from "@phosphor-icons/react/Certificate";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import type { UseMutationResult } from "@tanstack/react-query";
import type { UpdateCoursePricingRequest } from "@veolms/contracts";
import type { CourseInclude } from "../../CourseOverviewPage";
import {
  formatDuration,
  resolveCourseDurationSeconds,
} from "../../courseAdapter";
import type { CurriculumSectionItem } from "../curriculumItems";
import type { PricingControlKey } from "../statusIndicators";
import {
  type PricingFormState,
  normalizePricingState,
  pricingFormFromServer,
  isPricingEqual,
  validatePricing,
  buildPricingPayload,
} from "../pricingState";
import type { ApiError } from "../../../lib/api-error";

export interface UsePricingHandlersArgs {
  currentCourseId: string | null;
  currentCourseIdRef: RefObject<string | null>;
  inFlightBasicsPromiseRef: RefObject<Promise<unknown> | null>;
  editorData:
    | {
        course: {
          id: string;
          slug: string;
          title: string;
          status: "draft" | "published" | "archived";
          creatorId: string | null;
          version: number;
          createdAt: string;
          updatedAt: string;
          shortDescription?: string | null | undefined;
          description?: string | null | undefined;
          difficulty?:
            "beginner" | "intermediate" | "advanced" | null | undefined;
          categoryId?: string | null | undefined;
          thumbnailMediaId?: string | null | undefined;
          thumbnailUrl?: string | null | undefined;
          thumbnailSrcSet?:
            { url: string; width: number; height: number }[] | undefined;
          trailerMediaId?: string | null | undefined;
          instructorAlias?: string | null | undefined;
          publishedAt?: string | null | undefined;
          totalSections?: number | undefined;
          totalLessons?: number | undefined;
          totalDurationSeconds?: number | undefined;
        };
        sections: {
          id: string;
          title: string;
          position: number;
          lessons?:
            | {
                id: string;
                title: string;
                contentType: "video" | "document" | "quiz";
                position: number;
                isPreview: boolean;
                isPublished: boolean;
                description?: string | null | undefined;
                contentMediaId?: string | null | undefined;
                durationSeconds?: number | undefined;
                resources?:
                  | {
                      id: string;
                      mediaAssetId: string;
                      title: string;
                      mediaAsset?:
                        | {
                            originalFilename: string;
                            mimeType: string;
                            sizeBytes: number;
                            status:
                              | "uploading"
                              | "processing"
                              | "failed"
                              | "uploaded"
                              | "ready";
                          }
                        | undefined;
                    }[]
                  | undefined;
              }[]
            | undefined;
        }[];
        accessRules?:
          | {
              id: string;
              accessType: "everyone" | "restricted";
              durationType: "lifetime" | "fixed_duration" | "custom_expiration";
              durationDays?: number | null | undefined;
            }
          | null
          | undefined;
        pricing?:
          | {
              id: string;
              pricingType: "free" | "paid";
              price: number;
              currency: string;
              salePrice?: number | null | undefined;
              showDiscountBadge?: boolean | undefined;
            }
          | null
          | undefined;
        settings?:
          | {
              id: string;
              allowQa: boolean;
              allowComments: boolean;
              allowDownloads: boolean;
              allowNotes: boolean;
              certificateEnabled: boolean;
              showInstructorName: boolean;
              language: string;
              estimatedDuration?: number | null | undefined;
            }
          | null
          | undefined;
        includes?: { id: string; text: string; position: number }[] | undefined;
      }
    | undefined;
  upsertPricingMutation: UseMutationResult<
    {
      id: string;
      pricingType: "free" | "paid";
      price: number;
      currency: string;
      salePrice?: number | null | undefined;
      showDiscountBadge?: boolean | undefined;
    },
    ApiError,
    { courseId: string; payload: UpdateCoursePricingRequest },
    unknown
  >;
  sections: CurriculumSectionItem[];
  setServerPricing: Dispatch<SetStateAction<PricingFormState>>;
  serverPricingRef: RefObject<PricingFormState>;
  setPricingDraft: Dispatch<SetStateAction<PricingFormState>>;
  pricingDraftRef: RefObject<PricingFormState>;
  pricingValidationError: string | null;
  setPricingValidationError: Dispatch<SetStateAction<string | null>>;
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
  lastEditedPricingFieldRef: RefObject<"sellingPrice" | "originalPrice" | null>;
  clearPricingControlStatus: (controlKey: PricingControlKey) => void;
  markPricingControlSaved: (controlKey: PricingControlKey) => void;
  markPricingControlFailed: (controlKey: PricingControlKey) => void;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  manualIncludesDraft: {
    id: string;
    text: string;
    isPendingCreation?: boolean;
  }[];
}

export interface UsePricingHandlersResult {
  totalSections: number;
  totalLessons: number;
  computedDuration: string;
  ensureCourseDraftForPricing: (
    explicitCourseId?: string | null,
  ) => Promise<string>;
  flushPricingPersistence: () => Promise<void>;
  handleSellingPriceChange: (val: string) => void;
  handleShowDiscountBadgeChange: (checked: boolean) => void;
  handleOriginalPriceChange: (val: string) => void;
  handleCurrencyChange: (val: string) => Promise<void>;
}

export function usePricingHandlers({
  currentCourseId,
  currentCourseIdRef,
  inFlightBasicsPromiseRef,
  editorData,
  upsertPricingMutation,
  sections,
  setServerPricing,
  serverPricingRef,
  setPricingDraft,
  pricingDraftRef,
  pricingValidationError,
  setPricingValidationError,
  pricingControlVersionsRef,
  pricingVersionRef,
  inFlightPricingControlsRef,
  pricingDebounceTimerRef,
  inFlightPricingPromiseRef,
  markPricingControlSaving,
  lastEditedPricingFieldRef,
  clearPricingControlStatus,
  markPricingControlSaved,
  markPricingControlFailed,
  setToastMessage,
  manualIncludesDraft,
}: UsePricingHandlersArgs): UsePricingHandlersResult {
  // Computed total stats
  const totalSections = sections.length;
  const totalLessons = sections.reduce(
    (acc, sec) => acc + sec.lessons.length,
    0,
  );

  // Prefer the server-calculated duration or estimated duration from editor data.
  const courseDurationSeconds = resolveCourseDurationSeconds(
    editorData?.course?.totalDurationSeconds,
    editorData?.settings?.estimatedDuration,
  );
  const computedDuration = formatDuration(courseDurationSeconds);

  const previewInclusions: string[] = useMemo(() => {
    return manualIncludesDraft
      .map((m) => m.text.trim())
      .filter(Boolean)
      .slice(0, 6);
  }, [manualIncludesDraft]);

  const previewIncludes: CourseInclude[] = useMemo(() => {
    return previewInclusions.map((text) => ({
      icon: /certificate/i.test(text)
        ? Certificate
        : /download/i.test(text)
          ? DownloadSimple
          : /lifetime|access/i.test(text)
            ? Clock
            : /preview/i.test(text)
              ? PlayCircle
              : CheckCircle,
      label: text,
    }));
  }, [previewInclusions]);

  const ensureCourseDraftForPricing = async (
    explicitCourseId?: string | null,
  ): Promise<string> => {
    let targetId =
      explicitCourseId || currentCourseIdRef.current || currentCourseId;
    if (targetId) return targetId;
    if (inFlightBasicsPromiseRef.current) {
      await inFlightBasicsPromiseRef.current;
      targetId =
        explicitCourseId || currentCourseIdRef.current || currentCourseId;
      if (targetId) return targetId;
    }
    throw new Error(
      "Course draft must be created before setting pricing. Please enter a course title first.",
    );
  };

  const executeSerializedPricingMutation = async (
    controlKey: "pricingType" | "currency" | "pricingDetails",
    targetVersion: number,
    previousSnapshot: PricingFormState,
  ) => {
    const priorPromise = inFlightPricingPromiseRef.current;

    const run = async () => {
      if (priorPromise) {
        try {
          await priorPromise;
        } catch {
          // Allow subsequent queued requests to proceed even if previous failed
        }
      }

      // If a newer version was triggered while waiting in queue, abort obsolete execution
      if (pricingVersionRef.current !== targetVersion) {
        return;
      }

      const latestDraft = pricingDraftRef.current;
      const validation = validatePricing(latestDraft);
      if (!validation.isValid) {
        return;
      }

      const targetCourseId = await ensureCourseDraftForPricing();
      const payload = buildPricingPayload(latestDraft);

      const res = await upsertPricingMutation.mutateAsync({
        courseId: targetCourseId,
        payload,
      });

      // Stale-response protection: Only update baseline if we are still at targetVersion
      if (pricingVersionRef.current === targetVersion) {
        const newBaseline: PricingFormState = pricingFormFromServer(res);
        setServerPricing(newBaseline);
        serverPricingRef.current = newBaseline;

        if (controlKey === "pricingDetails") {
          const field = lastEditedPricingFieldRef.current;
          if (field) {
            markPricingControlSaved(field);
          }
          markPricingControlSaved("pricingDetails");
        } else {
          markPricingControlSaved(controlKey);
        }
      }
      return res;
    };

    const execute = async () => {
      try {
        return await run();
      } catch (err: unknown) {
        // Rollback only if no newer edit has superseded this one
        if (pricingVersionRef.current === targetVersion) {
          if (controlKey === "pricingType") {
            pricingDraftRef.current = {
              ...pricingDraftRef.current,
              pricingType: previousSnapshot.pricingType,
            };
            setPricingDraft((prev) => ({
              ...prev,
              pricingType: previousSnapshot.pricingType,
            }));
            markPricingControlFailed("pricingType");
          } else if (controlKey === "currency") {
            pricingDraftRef.current = {
              ...pricingDraftRef.current,
              currency: previousSnapshot.currency,
            };
            setPricingDraft((prev) => ({
              ...prev,
              currency: previousSnapshot.currency,
            }));
            markPricingControlFailed("currency");
          } else if (controlKey === "pricingDetails") {
            pricingDraftRef.current = {
              ...pricingDraftRef.current,
              sellingPrice: previousSnapshot.sellingPrice,
              originalPrice: previousSnapshot.originalPrice,
              showDiscountBadge: previousSnapshot.showDiscountBadge,
            };
            setPricingDraft((prev) => ({
              ...prev,
              sellingPrice: previousSnapshot.sellingPrice,
              originalPrice: previousSnapshot.originalPrice,
              showDiscountBadge: previousSnapshot.showDiscountBadge,
            }));
            const field = lastEditedPricingFieldRef.current;
            if (field) {
              markPricingControlFailed(field);
            }
            markPricingControlFailed("pricingDetails");
          }
          const errorMsg =
            err instanceof Error
              ? err.message
              : "Failed to save pricing changes. Reverting to last saved state.";
          setToastMessage(errorMsg);
        }
        throw err;
      } finally {
        inFlightPricingControlsRef.current[controlKey] = Math.max(
          0,
          (inFlightPricingControlsRef.current[controlKey] || 1) - 1,
        );
        if (inFlightPricingControlsRef.current[controlKey] === 0) {
          markPricingControlSaving(controlKey, false);
        }
        if (pricingVersionRef.current === targetVersion) {
          inFlightPricingPromiseRef.current = null;
        }
      }
    };

    const promise = execute();
    inFlightPricingPromiseRef.current = promise;
    return await promise;
  };

  const persistPricingDetails = async () => {
    const currentDraft = pricingDraftRef.current;
    const validation = validatePricing(currentDraft);
    if (!validation.isValid) {
      return;
    }

    const version = ++pricingVersionRef.current;
    pricingControlVersionsRef.current.pricingDetails = version;
    inFlightPricingControlsRef.current.pricingDetails =
      (inFlightPricingControlsRef.current.pricingDetails || 0) + 1;
    markPricingControlSaving("pricingDetails", true);

    const previousSnapshot = { ...serverPricingRef.current };
    return await executeSerializedPricingMutation(
      "pricingDetails",
      version,
      previousSnapshot,
    );
  };

  const flushPricingPersistence = async () => {
    if (pricingDebounceTimerRef.current) {
      clearTimeout(pricingDebounceTimerRef.current);
      pricingDebounceTimerRef.current = null;
    }

    const currentDraft = pricingDraftRef.current;
    const isDirty = !isPricingEqual(currentDraft, serverPricingRef.current);

    if (isDirty) {
      const validation = validatePricing(currentDraft);
      if (validation.isValid) {
        await persistPricingDetails();
      }
    } else if (inFlightPricingPromiseRef.current) {
      await inFlightPricingPromiseRef.current;
    }
  };

  const handleSellingPriceChange = (val: string) => {
    lastEditedPricingFieldRef.current = "sellingPrice";
    clearPricingControlStatus("sellingPrice");
    clearPricingControlStatus("pricingDetails");
    const digitsOnly = val.replace(/\D/g, "");
    pricingDraftRef.current = {
      ...pricingDraftRef.current,
      sellingPrice: digitsOnly,
    };
    setPricingDraft((prev) => ({ ...prev, sellingPrice: digitsOnly }));
    if (pricingValidationError) setPricingValidationError(null);

    if (pricingDebounceTimerRef.current) {
      clearTimeout(pricingDebounceTimerRef.current);
    }
    pricingDebounceTimerRef.current = setTimeout(() => {
      pricingDebounceTimerRef.current = null;
      void persistPricingDetails();
    }, 400);
  };

  // The badge is one click, not typing: it is saved at once.
  const handleShowDiscountBadgeChange = (checked: boolean) => {
    lastEditedPricingFieldRef.current = "originalPrice";
    clearPricingControlStatus("originalPrice");
    clearPricingControlStatus("pricingDetails");
    pricingDraftRef.current = {
      ...pricingDraftRef.current,
      showDiscountBadge: checked,
    };
    setPricingDraft((prev) => ({ ...prev, showDiscountBadge: checked }));
    if (pricingDebounceTimerRef.current) {
      clearTimeout(pricingDebounceTimerRef.current);
      pricingDebounceTimerRef.current = null;
    }
    void persistPricingDetails();
  };

  const handleOriginalPriceChange = (val: string) => {
    lastEditedPricingFieldRef.current = "originalPrice";
    clearPricingControlStatus("originalPrice");
    clearPricingControlStatus("pricingDetails");
    const digitsOnly = val.replace(/\D/g, "");
    pricingDraftRef.current = {
      ...pricingDraftRef.current,
      originalPrice: digitsOnly,
    };
    setPricingDraft((prev) => ({ ...prev, originalPrice: digitsOnly }));
    if (pricingValidationError) setPricingValidationError(null);

    if (pricingDebounceTimerRef.current) {
      clearTimeout(pricingDebounceTimerRef.current);
    }
    pricingDebounceTimerRef.current = setTimeout(() => {
      pricingDebounceTimerRef.current = null;
      void persistPricingDetails();
    }, 400);
  };

  const handleCurrencyChange = async (val: string) => {
    if (pricingDraftRef.current.currency === val) return;

    clearPricingControlStatus("currency");
    const previousSnapshot = { ...pricingDraftRef.current };
    const version = ++pricingVersionRef.current;
    pricingControlVersionsRef.current.currency = version;

    // 1. Optimistic update
    pricingDraftRef.current = {
      ...pricingDraftRef.current,
      currency: val,
    };
    setPricingDraft((prev) => ({ ...prev, currency: val }));
    if (pricingValidationError) setPricingValidationError(null);

    // While the price is not valid yet, keep the currency in the local draft
    {
      const validation = validatePricing(pricingDraftRef.current);
      if (!validation.isValid) {
        return;
      }
    }

    inFlightPricingControlsRef.current.currency =
      (inFlightPricingControlsRef.current.currency || 0) + 1;
    markPricingControlSaving("currency", true);

    try {
      await executeSerializedPricingMutation(
        "currency",
        version,
        previousSnapshot,
      );
    } catch {
      // Error handled in executeSerializedPricingMutation
    }
  };
  return {
    totalSections,
    totalLessons,
    computedDuration,
    ensureCourseDraftForPricing,
    flushPricingPersistence,
    handleSellingPriceChange,
    handleShowDiscountBadgeChange,
    handleOriginalPriceChange,
    handleCurrencyChange,
  };
}
