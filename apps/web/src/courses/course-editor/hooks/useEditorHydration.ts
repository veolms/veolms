import {
  useEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { toLessonResourceItem } from "../../lesson-resources/LessonResourceManager";
import { draftCategoryAfterReload } from "../../basicsCategoryDraft";
import { draftValueAfterReload } from "../../basicsDraftChange";
import { getCourseThumbnailCdnUrl } from "../../courseMedia";
import {
  type ThumbnailUploadStatus,
  type BasicsFormState,
  normalizeBasicsState,
} from "../basicsState";
import { readLessonEditorDraft } from "../lessonEditorDraft";
import { type CurriculumSectionItem, isLessonDirty } from "../curriculumItems";
import {
  type AccessType,
  type DurationUnit,
  type AccessRulesFormState,
  initialAccessRulesState,
  normalizeAccessRulesState,
} from "../accessRulesState";
import {
  type PricingFormState,
  normalizePricingState,
  pricingFormFromServer,
} from "../pricingState";
import { type ExtrasFormState, normalizeExtrasState } from "../extrasState";
import type { ExtrasState } from "../editorLocalTypes";
import type { IncludeDraftItem } from "../editorLocalTypes";

export interface UseEditorHydrationArgs {
  setServerBasics: Dispatch<SetStateAction<BasicsFormState>>;
  setBasicsDraft: Dispatch<SetStateAction<BasicsFormState>>;
  isBasicsDirtyRef: RefObject<boolean>;
  serverBasicsRef: RefObject<BasicsFormState>;
  basicsDraftRef: RefObject<BasicsFormState>;
  setCourseVersion: Dispatch<SetStateAction<number>>;
  courseVersionRef: RefObject<number>;
  currentCourseIdRef: RefObject<string | null>;
  setThumbnail: Dispatch<SetStateAction<string | null>>;
  setThumbnailMediaId: Dispatch<SetStateAction<string | null | undefined>>;
  thumbnailMediaIdRef: RefObject<string | null>;
  thumbnailUploadStatusRef: RefObject<ThumbnailUploadStatus>;
  thumbnailDirtyRef: RefObject<boolean>;
  thumbnailObjectUrlRef: RefObject<string | null>;
  savingBasicsControlsRef: RefObject<Set<string>>;
  inFlightBasicsPromiseRef: RefObject<Promise<unknown> | null>;
  serverCategories: { id: string; name: string; slug: string }[];
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
              linkedOnly?: boolean | undefined;
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
        includes?:
          | {
              id: string;
              text: string;
              position: number;
              detail?: string | null | undefined;
              icon?: string | null | undefined;
              color?: string | null | undefined;
              kind?: "custom" | "video" | undefined;
            }[]
          | undefined;
      }
    | undefined;
  setSections: Dispatch<SetStateAction<CurriculumSectionItem[]>>;
  setAccessRulesExists: Dispatch<SetStateAction<boolean>>;
  setServerAccessRules: Dispatch<SetStateAction<AccessRulesFormState>>;
  setAccessRulesDraft: Dispatch<SetStateAction<AccessRulesFormState>>;
  accessRulesDraftRef: RefObject<AccessRulesFormState>;
  isAccessRulesDirtyRef: RefObject<boolean>;
  savingAccessControlsRef: RefObject<Set<string>>;
  isAccessControlSaving: (controlKey: string) => boolean;
  setServerPricing: Dispatch<SetStateAction<PricingFormState>>;
  serverPricingRef: RefObject<PricingFormState>;
  setPricingDraft: Dispatch<SetStateAction<PricingFormState>>;
  pricingDraftRef: RefObject<PricingFormState>;
  isPricingDirtyRef: RefObject<boolean>;
  savingPricingControlsRef: RefObject<Set<string>>;
  setIsPublished: Dispatch<SetStateAction<boolean>>;
  setServerExtras: Dispatch<SetStateAction<ExtrasFormState>>;
  setServerIncludes: Dispatch<
    SetStateAction<{ id: string; text: string; position: number }[]>
  >;
  setManualIncludesDraft: Dispatch<SetStateAction<IncludeDraftItem[]>>;
  setExtras: Dispatch<SetStateAction<ExtrasState>>;
  isExtrasDirtyRef: RefObject<boolean>;
}

export function useEditorHydration({
  setServerBasics,
  setBasicsDraft,
  isBasicsDirtyRef,
  serverBasicsRef,
  basicsDraftRef,
  setCourseVersion,
  courseVersionRef,
  currentCourseIdRef,
  setThumbnail,
  setThumbnailMediaId,
  thumbnailMediaIdRef,
  thumbnailUploadStatusRef,
  thumbnailDirtyRef,
  thumbnailObjectUrlRef,
  savingBasicsControlsRef,
  inFlightBasicsPromiseRef,
  serverCategories,
  editorData,
  setSections,
  setAccessRulesExists,
  setServerAccessRules,
  setAccessRulesDraft,
  accessRulesDraftRef,
  isAccessRulesDirtyRef,
  savingAccessControlsRef,
  isAccessControlSaving,
  setServerPricing,
  serverPricingRef,
  setPricingDraft,
  pricingDraftRef,
  isPricingDirtyRef,
  savingPricingControlsRef,
  setIsPublished,
  setServerExtras,
  setServerIncludes,
  setManualIncludesDraft,
  setExtras,
  isExtrasDirtyRef,
}: UseEditorHydrationArgs) {
  // Pre-populate fields when editing an existing course
  useEffect(() => {
    if (editorData?.course) {
      const c = editorData.course;
      const confirmedBasics = normalizeBasicsState({
        title: c.title || "",
        shortDescription: c.shortDescription || "",
        description: c.description || "",
        categoryId: c.categoryId || "",
        difficulty: (c.difficulty as BasicsFormState["difficulty"]) || "",
        language: editorData.settings?.language || "en",
        instructorAlias: c.instructorAlias || "",
        showInstructorName:
          editorData.settings?.showInstructorName !== undefined
            ? editorData.settings.showInstructorName
            : true,
      });
      const previouslyConfirmedCategoryId = serverBasicsRef.current.categoryId;
      const previouslyConfirmedDifficulty = serverBasicsRef.current.difficulty;
      setServerBasics(confirmedBasics);
      serverBasicsRef.current = confirmedBasics;
      setCourseVersion(c.version || 1);
      courseVersionRef.current = c.version || 1;

      const confirmedThumbnailMediaId = c.thumbnailMediaId ?? null;
      if (
        !thumbnailDirtyRef.current &&
        thumbnailUploadStatusRef.current === "idle"
      ) {
        if (thumbnailObjectUrlRef.current) {
          URL.revokeObjectURL(thumbnailObjectUrlRef.current);
          thumbnailObjectUrlRef.current = null;
        }
        thumbnailMediaIdRef.current = confirmedThumbnailMediaId;
        setThumbnailMediaId(confirmedThumbnailMediaId);
        setThumbnail(
          c.thumbnailUrl ??
            getCourseThumbnailCdnUrl(confirmedThumbnailMediaId) ??
            null,
        );
      }

      const isBasicsSavingActive =
        savingBasicsControlsRef.current.size > 0 ||
        Boolean(inFlightBasicsPromiseRef.current);
      if (!isBasicsDirtyRef.current && !isBasicsSavingActive) {
        setBasicsDraft(confirmedBasics);
        basicsDraftRef.current = confirmedBasics;
      } else {
        // The draft is kept for its unsaved edit. A category the creator
        // has not touched still follows the course, so a later save cannot
        // send an outdated (or empty) one as if they had chosen it.
        const categoryId = draftCategoryAfterReload(
          basicsDraftRef.current.categoryId,
          previouslyConfirmedCategoryId,
          confirmedBasics.categoryId,
        );
        if (categoryId !== basicsDraftRef.current.categoryId) {
          setBasicsDraft((prev) => ({ ...prev, categoryId }));
          basicsDraftRef.current = { ...basicsDraftRef.current, categoryId };
        }
        // The level follows the course in the same way.
        const difficulty = draftValueAfterReload(
          basicsDraftRef.current.difficulty,
          previouslyConfirmedDifficulty,
          confirmedBasics.difficulty,
        );
        if (difficulty !== basicsDraftRef.current.difficulty) {
          setBasicsDraft((prev) => ({ ...prev, difficulty }));
          basicsDraftRef.current = { ...basicsDraftRef.current, difficulty };
        }
      }
      setIsPublished(c.status === "published");

      const hasAccessRules = Boolean(
        editorData.accessRules && editorData.accessRules.id,
      );
      setAccessRulesExists(hasAccessRules);

      const ar = editorData.accessRules;
      const s = editorData.settings;
      const isFixed = ar?.durationType === "fixed_duration";
      let fixedVal = 30;
      let fixedUnit: DurationUnit = "Days";

      if (
        hasAccessRules &&
        isFixed &&
        ar?.durationDays &&
        ar.durationDays > 0
      ) {
        const days = ar.durationDays;
        if (days % 365 === 0 && days >= 365) {
          fixedVal = days / 365;
          fixedUnit = "Years";
        } else if (days % 30 === 0 && days >= 30) {
          fixedVal = days / 30;
          fixedUnit = "Months";
        } else if (days % 7 === 0 && days >= 7) {
          fixedVal = days / 7;
          fixedUnit = "Weeks";
        } else {
          fixedVal = days;
          fixedUnit = "Days";
        }
      }

      const confirmedAccessRules: AccessRulesFormState =
        normalizeAccessRulesState({
          accessType: (ar?.accessType as AccessType) || "everyone",
          durationMode: hasAccessRules ? (isFixed ? "fixed" : "lifetime") : "",
          fixedDurationValue: fixedVal,
          fixedDurationUnit: fixedUnit,
          enableQA:
            s?.allowQa !== undefined
              ? Boolean(s.allowQa)
              : initialAccessRulesState.enableQA,
          enableComments:
            s?.allowComments !== undefined
              ? Boolean(s.allowComments)
              : initialAccessRulesState.enableComments,
          enableDownloads:
            s?.allowDownloads !== undefined
              ? Boolean(s.allowDownloads)
              : initialAccessRulesState.enableDownloads,
          enableNotes:
            s?.allowNotes !== undefined
              ? Boolean(s.allowNotes)
              : initialAccessRulesState.enableNotes,
        });

      setServerAccessRules((prev) => ({
        accessType: isAccessControlSaving("accessType")
          ? prev.accessType
          : confirmedAccessRules.accessType,
        durationMode: isAccessControlSaving("durationMode")
          ? prev.durationMode
          : confirmedAccessRules.durationMode,
        fixedDurationValue: isAccessControlSaving("fixedDuration")
          ? prev.fixedDurationValue
          : confirmedAccessRules.fixedDurationValue,
        fixedDurationUnit: isAccessControlSaving("fixedDuration")
          ? prev.fixedDurationUnit
          : confirmedAccessRules.fixedDurationUnit,
        enableQA: isAccessControlSaving("enableQA")
          ? prev.enableQA
          : confirmedAccessRules.enableQA,
        enableComments: isAccessControlSaving("enableComments")
          ? prev.enableComments
          : confirmedAccessRules.enableComments,
        enableDownloads: isAccessControlSaving("enableDownloads")
          ? prev.enableDownloads
          : confirmedAccessRules.enableDownloads,
        enableNotes: isAccessControlSaving("enableNotes")
          ? prev.enableNotes
          : confirmedAccessRules.enableNotes,
      }));

      if (
        !isAccessRulesDirtyRef.current &&
        savingAccessControlsRef.current.size === 0
      ) {
        setAccessRulesDraft((prev) => {
          const next = {
            accessType: isAccessControlSaving("accessType")
              ? prev.accessType
              : confirmedAccessRules.accessType || prev.accessType,
            durationMode: isAccessControlSaving("durationMode")
              ? prev.durationMode
              : confirmedAccessRules.durationMode || prev.durationMode,
            fixedDurationValue: isAccessControlSaving("fixedDuration")
              ? prev.fixedDurationValue
              : confirmedAccessRules.fixedDurationValue,
            fixedDurationUnit: isAccessControlSaving("fixedDuration")
              ? prev.fixedDurationUnit
              : confirmedAccessRules.fixedDurationUnit,
            enableQA: isAccessControlSaving("enableQA")
              ? prev.enableQA
              : confirmedAccessRules.enableQA,
            enableComments: isAccessControlSaving("enableComments")
              ? prev.enableComments
              : confirmedAccessRules.enableComments,
            enableDownloads: isAccessControlSaving("enableDownloads")
              ? prev.enableDownloads
              : confirmedAccessRules.enableDownloads,
            enableNotes: isAccessControlSaving("enableNotes")
              ? prev.enableNotes
              : confirmedAccessRules.enableNotes,
          };
          accessRulesDraftRef.current = next;
          return next;
        });
      }

      if (editorData.settings) {
        const s = editorData.settings;
        const confirmedExtras: ExtrasFormState = normalizeExtrasState({
          enableCertificate: s.certificateEnabled ?? false,
        });
        setServerExtras(confirmedExtras);
        setExtras((prev) => ({
          ...prev,
          enableCertificate: confirmedExtras.enableCertificate,
        }));
      }

      if (editorData.includes) {
        setServerIncludes(editorData.includes);
        if (!isExtrasDirtyRef.current) {
          const serverItems = editorData.includes.map((inc) => ({
            id: inc.id,
            text: inc.text,
            detail: inc.detail,
            icon: inc.icon,
            color: inc.color,
            kind: inc.kind,
          }));
          setManualIncludesDraft((prev) => {
            const pendingItems = prev.filter((p) => p.isPendingCreation);
            if (pendingItems.length === 0) return serverItems;
            const serverIds = new Set(serverItems.map((s) => s.id));
            const uniquePending = pendingItems.filter(
              (p) => !serverIds.has(p.id),
            );
            return [...serverItems, ...uniquePending];
          });
        }
      } else {
        setServerIncludes([]);
        if (!isExtrasDirtyRef.current) {
          setManualIncludesDraft((prev) =>
            prev.filter((p) => p.isPendingCreation),
          );
        }
      }

      if (editorData.pricing) {
        const p = editorData.pricing;
        const confirmedPricing: PricingFormState = pricingFormFromServer(p);
        setServerPricing(confirmedPricing);
        serverPricingRef.current = confirmedPricing;
        if (
          !isPricingDirtyRef.current &&
          savingPricingControlsRef.current.size === 0
        ) {
          setPricingDraft(confirmedPricing);
          pricingDraftRef.current = confirmedPricing;
        }
      }
      if (editorData.sections && editorData.sections.length > 0) {
        setSections((prev) => {
          const prevMap = new Map(prev.map((s) => [s.id, s]));
          const mappedServerSections = editorData.sections.map(
            (sec, secIdx) => {
              const existing = prevMap.get(sec.id);
              const serverLessonIds = new Set(
                (sec.lessons || []).map((l) => l.id),
              );
              const serverLessons = (sec.lessons || []).map((les) => {
                const existingLesson = existing?.lessons.find(
                  (l) => l.id === les.id,
                );
                const storedLessonDraft = readLessonEditorDraft(
                  currentCourseIdRef.current,
                  les.id,
                );
                const isDirty = existingLesson
                  ? isLessonDirty(existingLesson)
                  : false;
                const title =
                  isDirty && existingLesson
                    ? existingLesson.title
                    : (storedLessonDraft?.title ?? les.title);
                const description =
                  isDirty && existingLesson
                    ? existingLesson.description || ""
                    : (storedLessonDraft?.description ??
                      (les.description || ""));
                const contentType =
                  isDirty && existingLesson
                    ? existingLesson.contentType
                    : (storedLessonDraft?.contentType ?? les.contentType);
                const contentMediaId =
                  isDirty && existingLesson
                    ? (existingLesson.contentMediaId ?? null)
                    : (storedLessonDraft?.contentMediaId ??
                      les.contentMediaId ??
                      null);
                const durationSeconds =
                  isDirty && existingLesson
                    ? existingLesson.durationSeconds
                    : les.durationSeconds;
                const isPub =
                  isDirty && existingLesson
                    ? existingLesson.isPublished !== undefined
                      ? existingLesson.isPublished
                      : true
                    : (storedLessonDraft?.isPublished ??
                      (les.isPublished !== undefined ? les.isPublished : true));
                const isPrev =
                  isDirty && existingLesson
                    ? existingLesson.isPreview !== undefined
                      ? existingLesson.isPreview
                      : false
                    : (storedLessonDraft?.isPreview ??
                      (les.isPreview !== undefined ? les.isPreview : false));
                const desc = les.description || "";
                return {
                  id: les.id,
                  title,
                  isEditingTitle: existingLesson?.isEditingTitle ?? false,
                  contentTypeSelected:
                    existingLesson?.contentTypeSelected ?? true,
                  description,
                  contentType,
                  contentMediaId,
                  durationSeconds,
                  isExpanded: existingLesson
                    ? existingLesson.isExpanded
                    : false,
                  isPublished: isPub,
                  isPreview: isPrev,
                  initialState: existingLesson?.initialState || {
                    title: les.title,
                    description: desc,
                    contentType: les.contentType,
                    contentMediaId: les.contentMediaId ?? null,
                    isPublished:
                      les.isPublished !== undefined ? les.isPublished : true,
                    isPreview:
                      les.isPreview !== undefined ? les.isPreview : false,
                  },
                  resources: (les.resources || []).map((res) =>
                    toLessonResourceItem(res),
                  ),
                };
              });

              // Preserve any pending optimistic lessons that are still being created
              const pendingLessons = (existing?.lessons || []).filter(
                (l) => l.isPendingCreation || !serverLessonIds.has(l.id),
              );

              return {
                id: sec.id,
                title: sec.title,
                isExpanded: existing ? existing.isExpanded : secIdx === 0,
                isEditingTitle: existing ? existing.isEditingTitle : false,
                lessons: [...serverLessons, ...pendingLessons],
              };
            },
          );

          // Preserve any pending optimistic sections that are still being created
          const serverSectionIds = new Set(
            editorData.sections.map((s) => s.id),
          );
          const pendingSections = prev.filter(
            (s) => s.isPendingCreation || !serverSectionIds.has(s.id),
          );

          return [...mappedServerSections, ...pendingSections];
        });
      }
    } else {
      setIsPublished(false);
    }
  }, [editorData, serverCategories]);
}
