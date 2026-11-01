import type { CourseEditorDataResponse } from "@veolms/contracts";
import type { AccessType, AccessRulesFormState } from "./accessRulesState";
import { type PricingFormState, buildPricingPayload } from "./pricingState";

export interface BuildLocalPreviewParams {
  currentCourseId: string | null;
  courseTitle: string;
  shortDescription: string;
  courseDescription: string;
  categoryId: string;
  difficultyLevel: "beginner" | "intermediate" | "advanced" | "";
  language: string;
  instructorAlias: string;
  showInstructorName: boolean;
  courseVersion: number;
  isPublished: boolean;
  thumbnailMediaId?: string | null;
  trailerMediaId?: string | null;
  sections: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      description?: string | null;
      contentType: "video" | "document" | "quiz" | "audio" | "image";
      contentMediaId?: string | null;
      durationSeconds?: number;
      isPreview?: boolean;
      isPublished?: boolean;
      resources?: Array<{
        id: string;
        name: string;
        mediaAssetId?: string;
      }>;
    }>;
  }>;
  pricingDraft: PricingFormState;
  accessRulesDraft: AccessRulesFormState;
  enableCertificate: boolean;
  manualIncludesDraft: Array<{ id: string; text: string }>;
  editorDefaults?: {
    course?: {
      slug?: string;
      status?: "draft" | "published" | "archived";
      creatorId?: string | null;
      thumbnailMediaId?: string | null;
      trailerMediaId?: string | null;
      createdAt?: string;
      updatedAt?: string;
      publishedAt?: string | null;
      totalDurationSeconds?: number;
    } | null;
    accessRules?: { id?: string } | null;
    pricing?: { id?: string } | null;
    settings?: { id?: string; estimatedDuration?: number | null } | null;
  } | null;
  totalDurationSeconds?: number;
  now?: string;
}

export function buildLocalPreviewData({
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
  trailerMediaId,
  sections,
  pricingDraft,
  accessRulesDraft,
  enableCertificate,
  manualIncludesDraft,
  editorDefaults,
  totalDurationSeconds,
  now = new Date().toISOString(),
}: BuildLocalPreviewParams): CourseEditorDataResponse | null {
  // Preserve course-title/course-ID boundary without "Untitled Course" fallback
  if (!currentCourseId || !courseTitle.trim()) {
    return null;
  }

  const totalSectionsCount = sections.length;
  const totalLessonsCount = sections.reduce(
    (acc, sec) => acc + (sec.lessons?.length ?? 0),
    0,
  );

  const isFixedDuration = accessRulesDraft.durationMode === "fixed";
  const unitMultiplier =
    accessRulesDraft.fixedDurationUnit === "Years"
      ? 365
      : accessRulesDraft.fixedDurationUnit === "Months"
        ? 30
        : accessRulesDraft.fixedDurationUnit === "Weeks"
          ? 7
          : 1;
  const durationDays = isFixedDuration
    ? (accessRulesDraft.fixedDurationValue || 30) * unitMultiplier
    : null;

  const pricingPayload = buildPricingPayload(pricingDraft);

  const courseData: CourseEditorDataResponse["course"] = {
    id: currentCourseId,
    slug: editorDefaults?.course?.slug || "",
    title: courseTitle.trim(),
    shortDescription: shortDescription.trim() || null,
    description: courseDescription.trim() || null,
    difficulty: difficultyLevel ? difficultyLevel : null,
    status: isPublished
      ? "published"
      : editorDefaults?.course?.status || "draft",
    creatorId: editorDefaults?.course?.creatorId || null,
    categoryId: categoryId || null,
    thumbnailMediaId:
      thumbnailMediaId !== undefined
        ? thumbnailMediaId
        : editorDefaults?.course?.thumbnailMediaId || null,
    trailerMediaId:
      trailerMediaId ?? (editorDefaults?.course?.trailerMediaId || null),
    instructorAlias: instructorAlias.trim() || null,
    version: courseVersion,
    createdAt: editorDefaults?.course?.createdAt || now,
    updatedAt: editorDefaults?.course?.updatedAt || now,
    publishedAt: editorDefaults?.course?.publishedAt || null,
    totalSections: totalSectionsCount,
    totalLessons: totalLessonsCount,
    totalDurationSeconds:
      totalDurationSeconds ?? editorDefaults?.course?.totalDurationSeconds ?? 0,
  };

  const sectionsData: CourseEditorDataResponse["sections"] = sections.map(
    (sec, secIdx) => ({
      id: sec.id,
      title: sec.title,
      position: secIdx,
      lessons: (sec.lessons || []).map((les, lesIdx) => ({
        id: les.id,
        title: les.title,
        description: les.description || null,
        contentType: (les.contentType === "audio"
          ? "video"
          : les.contentType === "image"
            ? "document"
            : les.contentType) as "video" | "document" | "quiz",
        contentMediaId: les.contentMediaId ?? null,
        durationSeconds: les.durationSeconds,
        position: lesIdx,
        isPreview: Boolean(les.isPreview),
        isPublished: les.isPublished !== undefined ? les.isPublished : true,
        resources: (les.resources || []).map((res) => ({
          id: res.id,
          mediaAssetId: res.mediaAssetId || res.id,
          title: res.name,
        })),
      })),
    }),
  );

  const accessRulesData: CourseEditorDataResponse["accessRules"] = {
    id: editorDefaults?.accessRules?.id || "preview-access-rules",
    accessType: (accessRulesDraft.accessType as AccessType) || "everyone",
    durationType: isFixedDuration ? "fixed_duration" : "lifetime",
    durationDays,
  };

  const pricingData: CourseEditorDataResponse["pricing"] = {
    id: editorDefaults?.pricing?.id || "preview-pricing",
    pricingType: pricingPayload.pricingType,
    price: pricingPayload.price,
    salePrice: pricingPayload.salePrice,
    currency: pricingPayload.currency,
    showDiscountBadge: pricingPayload.showDiscountBadge,
  };

  const settingsData: CourseEditorDataResponse["settings"] = {
    id: editorDefaults?.settings?.id || "preview-settings",
    allowQa: accessRulesDraft.enableQA,
    allowComments: accessRulesDraft.enableComments,
    allowDownloads: accessRulesDraft.enableDownloads,
    allowNotes: accessRulesDraft.enableNotes,
    certificateEnabled: enableCertificate,
    showInstructorName: showInstructorName !== false,
    language: language || "en",
    estimatedDuration: editorDefaults?.settings?.estimatedDuration ?? null,
  };

  const includesData: CourseEditorDataResponse["includes"] = manualIncludesDraft
    .filter((inc) => Boolean(inc.text.trim()))
    .map((inc, index) => ({
      id: inc.id,
      text: inc.text.trim(),
      position: index,
    }));

  return {
    course: courseData,
    sections: sectionsData,
    accessRules: accessRulesData,
    pricing: pricingData,
    settings: settingsData,
    includes: includesData,
  };
}
