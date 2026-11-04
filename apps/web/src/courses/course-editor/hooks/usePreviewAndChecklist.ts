import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type {
  CourseEditorDataResponse,
  CourseValidationArea,
} from "@veolms/contracts";
import { resolveCourseDurationSeconds } from "../../courseAdapter";
import type { ChecklistState } from "../basicsState";
import type { CurriculumSectionItem } from "../curriculumItems";
import type { AccessRulesFormState } from "../accessRulesState";
import { type PricingFormState, getCurrencySymbol } from "../pricingState";
import { buildLocalPreviewData } from "../localPreview";
import type { ExtrasState } from "../editorLocalTypes";
import type { IncludeDraftItem } from "../editorLocalTypes";

export interface UsePreviewAndChecklistArgs {
  courseTitle: string;
  shortDescription: string;
  courseDescription: string;
  categoryId: string;
  difficultyLevel: "" | "beginner" | "intermediate" | "advanced";
  language: string;
  instructorAlias: string;
  showInstructorName: boolean;
  currentCourseId: string | null;
  courseVersion: number;
  thumbnailMediaId: string | null | undefined;
  isPreviewModalOpen: boolean;
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
  previewData:
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
  isValidating: boolean;
  serverValidation:
    | {
        canPublish: boolean;
        sections: {
          basics: { valid: boolean; errors: string[] };
          curriculum: { valid: boolean; errors: string[] };
          accessRules: { valid: boolean; errors: string[] };
          pricing: { valid: boolean; errors: string[] };
          extras: { valid: boolean; errors: string[] };
        };
        errors: { message: string }[];
      }
    | undefined;
  sections: CurriculumSectionItem[];
  accessRulesDraft: AccessRulesFormState;
  accessRules: AccessRulesFormState;
  pricingDraft: PricingFormState;
  pricing: PricingFormState;
  isPublished: boolean;
  setExpandedValidationArea: Dispatch<
    SetStateAction<
      "basics" | "curriculum" | "pricing" | "extras" | "accessRules" | null
    >
  >;
  manualIncludesDraft: IncludeDraftItem[];
  extras: ExtrasState;
  totalSections: number;
  totalLessons: number;
}

export interface UsePreviewAndChecklistResult {
  activePreviewData:
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
  getChecklistState: (area: CourseValidationArea) => ChecklistState;
  validationChecklistItems: {
    area: CourseValidationArea;
    label: string;
    summary: string;
  }[];
  isCourseReadyToPublish: boolean;
}

export function usePreviewAndChecklist({
  courseTitle,
  shortDescription,
  courseDescription,
  categoryId,
  difficultyLevel,
  language,
  instructorAlias,
  showInstructorName,
  currentCourseId,
  courseVersion,
  thumbnailMediaId,
  isPreviewModalOpen,
  editorData,
  previewData,
  isValidating,
  serverValidation,
  sections,
  accessRulesDraft,
  accessRules,
  pricingDraft,
  pricing,
  isPublished,
  setExpandedValidationArea,
  manualIncludesDraft,
  extras,
  totalSections,
  totalLessons,
}: UsePreviewAndChecklistArgs): UsePreviewAndChecklistResult {
  const currencySymbol = getCurrencySymbol(pricing.currency || "INR");

  const editorCourseSlug = editorData?.course?.slug;
  const editorCourseStatus = editorData?.course?.status;
  const editorCourseCreatorId = editorData?.course?.creatorId;
  const editorCourseThumbnailMediaId = editorData?.course?.thumbnailMediaId;
  const editorCourseTrailerMediaId = editorData?.course?.trailerMediaId;
  const editorCourseCreatedAt = editorData?.course?.createdAt;
  const editorCourseUpdatedAt = editorData?.course?.updatedAt;
  const editorCoursePublishedAt = editorData?.course?.publishedAt;
  const editorCourseTotalDurationSeconds =
    editorData?.course?.totalDurationSeconds;
  const editorAccessRulesId = editorData?.accessRules?.id;
  const editorPricingId = editorData?.pricing?.id;
  const editorSettingsId = editorData?.settings?.id;
  const editorEstimatedDuration = editorData?.settings?.estimatedDuration;

  const localPreviewData = useMemo<CourseEditorDataResponse | null>(() => {
    if (!isPreviewModalOpen) return null;

    return buildLocalPreviewData({
      currentCourseId,
      courseTitle,
      shortDescription,
      courseDescription,
      categoryId,
      difficultyLevel,
      language,
      instructorAlias,
      showInstructorName,
      courseVersion,
      isPublished,
      thumbnailMediaId,
      trailerMediaId: editorCourseTrailerMediaId || null,
      sections,
      pricingDraft,
      accessRulesDraft,
      enableCertificate: extras.enableCertificate,
      manualIncludesDraft,
      editorDefaults: {
        course: {
          slug: editorCourseSlug,
          status: editorCourseStatus,
          creatorId: editorCourseCreatorId,
          thumbnailMediaId: editorCourseThumbnailMediaId,
          trailerMediaId: editorCourseTrailerMediaId,
          createdAt: editorCourseCreatedAt,
          updatedAt: editorCourseUpdatedAt,
          publishedAt: editorCoursePublishedAt,
          totalDurationSeconds: editorCourseTotalDurationSeconds,
        },
        accessRules: { id: editorAccessRulesId },
        pricing: { id: editorPricingId },
        settings: {
          id: editorSettingsId,
          estimatedDuration: editorEstimatedDuration,
        },
      },
      totalDurationSeconds: resolveCourseDurationSeconds(
        editorCourseTotalDurationSeconds,
        editorEstimatedDuration,
      ),
    });
  }, [
    isPreviewModalOpen,
    currentCourseId,
    courseTitle,
    shortDescription,
    courseDescription,
    difficultyLevel,
    categoryId,
    instructorAlias,
    showInstructorName,
    language,
    courseVersion,
    isPublished,
    thumbnailMediaId,
    editorCourseSlug,
    editorCourseStatus,
    editorCourseCreatorId,
    editorCourseThumbnailMediaId,
    editorCourseTrailerMediaId,
    editorCourseCreatedAt,
    editorCourseUpdatedAt,
    editorCoursePublishedAt,
    editorCourseTotalDurationSeconds,
    editorAccessRulesId,
    editorPricingId,
    editorSettingsId,
    editorEstimatedDuration,
    sections,
    accessRulesDraft,
    pricingDraft,
    extras.enableCertificate,
    manualIncludesDraft,
  ]);

  // Explicit non-reconciliation: when local preview data is available from wizard state,
  // it renders immediately. previewData remains fetched in the background without overwriting.
  const activePreviewData = localPreviewData || previewData;

  // Publish Checklist Validation based strictly on server validation response
  const getChecklistState = (area: CourseValidationArea): ChecklistState => {
    if (isValidating) return "validating";
    if (!serverValidation) return "idle";
    return serverValidation.sections[area].valid ? "valid" : "invalid";
  };

  const validationChecklistItems: Array<{
    area: CourseValidationArea;
    label: string;
    summary: string;
  }> = [
    { area: "basics", label: "Basics", summary: "Completed" },
    {
      area: "curriculum",
      label: "Curriculum",
      summary: `${totalSections} Sections, ${totalLessons} Lessons`,
    },
    {
      area: "accessRules",
      label: "Access Rules",
      summary:
        accessRules.accessType === "everyone"
          ? "Everyone"
          : "Restricted Access",
    },
    {
      area: "pricing",
      label: "Pricing",
      summary: pricing.linkedOnly
        ? "Linked course only"
        : pricing.pricingType === "free"
          ? "Free"
          : `${currencySymbol}${pricing.sellingPrice}`,
    },
    {
      area: "extras",
      label: "Extras",
      summary: extras.enableCertificate ? "Certificate Enabled" : "Disabled",
    },
  ];

  useEffect(() => {
    if (isValidating) setExpandedValidationArea(null);
  }, [isValidating]);

  const isCourseReadyToPublish = serverValidation?.canPublish ?? false;
  return {
    activePreviewData,
    getChecklistState,
    validationChecklistItems,
    isCourseReadyToPublish,
  };
}
