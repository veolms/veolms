import {
  useState,
  useRef,
  useMemo,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  useCreateCategory,
  useCreateCourseInclude,
  useCreateLesson,
  useCreateLessonResource,
  useCreateSection,
  useDeleteCategory,
  useDeleteCourseInclude,
  useDeleteLesson,
  useDeleteLessonResource,
  useDeleteSection,
  useReorderCourseIncludes,
  useReorderLessons,
  useReorderSections,
  useUpdateCourseInclude,
  useUpdateLesson,
  useUpdateSection,
  useUpsertAccessRules,
  useUpsertPricing,
  useUpsertSettings,
  usePublishCourse,
  useUnpublishCourse,
} from "../../../services/courses";
import { useIsMutating, type UseMutationResult } from "@tanstack/react-query";
import type {
  CourseEditorDataResponse,
  CreateLessonResourceRequest,
  CreateCourseSectionRequest,
  UpdateCourseSectionRequest,
  ReorderSectionsRequest,
  CreateCourseLessonRequest,
  UpdateCourseLessonRequest,
  ReorderLessonsRequest,
  UpdateCourseAccessRuleRequest,
  UpdateCourseSettingsRequest,
  UpdateCoursePricingRequest,
  CreateCourseIncludeRequest,
  UpdateCourseIncludeRequest,
  ReorderCourseIncludesRequest,
} from "@veolms/contracts";
import type { BasicsFieldKey } from "../statusIndicators";
import type { ApiError } from "../../../lib/api-error";

export interface UseSavingStateArgs {
  categoryId: string;
  currentCourseId: string | null;
  isThumbnailBusy: boolean;
  savingBasicsControls: Set<string>;
  inFlightBasicsControlsRef: RefObject<Record<string, number>>;
  inFlightBasicsPromiseRef: RefObject<Promise<unknown> | null>;
  basicsFieldStatus: Partial<Record<BasicsFieldKey, "saved" | "failed" | null>>;
  basicsSaveFailed: boolean;
  showBasicsSavedBriefly: boolean;
  setIsAddCategoryModalOpen: Dispatch<SetStateAction<boolean>>;
  setNewCategoryName: Dispatch<SetStateAction<string>>;
  setAddCategoryError: Dispatch<SetStateAction<string>>;
  isInitialCurriculumBootstrapInProgress: boolean;
  serverCategories: { id: string; name: string; slug: string }[];
  isPreviewLoading: boolean;
  isValidating: boolean;
  createCourseMutation: UseMutationResult<
    {
      id: string;
      slug: string;
      title: string;
      version: number;
      instructorAlias?: string | null | undefined;
    },
    ApiError,
    {
      title: string;
      shortDescription?: string | null | undefined;
      description?: string | null | undefined;
      categoryId?: string | null | undefined;
      difficulty?: "beginner" | "intermediate" | "advanced" | null | undefined;
      difficultyLevel?:
        "beginner" | "intermediate" | "advanced" | null | undefined;
      thumbnailMediaId?: string | null | undefined;
      trailerMediaId?: string | null | undefined;
      instructorAlias?: string | null | undefined;
    },
    unknown
  >;
}

export interface UseSavingStateResult {
  createSectionMutation: UseMutationResult<
    { id: string; title: string },
    ApiError,
    { courseId: string; payload: CreateCourseSectionRequest },
    unknown
  >;
  updateSectionMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    {
      courseId: string;
      sectionId: string;
      payload: UpdateCourseSectionRequest;
    },
    unknown
  >;
  deleteSectionMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; sectionId: string },
    unknown
  >;
  reorderSectionsMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; payload: ReorderSectionsRequest },
    { previousEditorData?: CourseEditorDataResponse }
  >;
  createLessonMutation: UseMutationResult<
    { id: string },
    ApiError,
    { courseId: string; sectionId: string; payload: CreateCourseLessonRequest },
    unknown
  >;
  createLessonResourceMutation: UseMutationResult<
    {
      id: string;
      mediaAssetId: string;
      title: string;
      mediaAsset?:
        | {
            originalFilename: string;
            mimeType: string;
            sizeBytes: number;
            status:
              "uploading" | "processing" | "failed" | "uploaded" | "ready";
          }
        | undefined;
    },
    ApiError,
    {
      courseId: string;
      lessonId: string;
      payload: CreateLessonResourceRequest;
    },
    unknown
  >;
  updateLessonMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; lessonId: string; payload: UpdateCourseLessonRequest },
    unknown
  >;
  deleteLessonMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; lessonId: string },
    unknown
  >;
  deleteLessonResourceMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; resourceId: string },
    unknown
  >;
  reorderLessonsMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; sectionId: string; payload: ReorderLessonsRequest },
    { previousEditorData?: CourseEditorDataResponse }
  >;
  isCreatingSection: boolean;
  setIsCreatingSection: Dispatch<SetStateAction<boolean>>;
  creatingLessonSectionId: string | null;
  setCreatingLessonSectionId: Dispatch<SetStateAction<string | null>>;
  savingLessonId: string | null;
  setSavingLessonId: Dispatch<SetStateAction<string | null>>;
  deletingLessonId: string | null;
  setDeletingLessonId: Dispatch<SetStateAction<string | null>>;
  reorderingLessonsSectionId: string | null;
  setReorderingLessonsSectionId: Dispatch<SetStateAction<string | null>>;
  isReorderingSections: boolean;
  setIsReorderingSections: Dispatch<SetStateAction<boolean>>;
  isReorderingIncludes: boolean;
  setIsReorderingIncludes: Dispatch<SetStateAction<boolean>>;
  updatingSectionId: string | null;
  setUpdatingSectionId: Dispatch<SetStateAction<string | null>>;
  deletingSectionId: string | null;
  setDeletingSectionId: Dispatch<SetStateAction<string | null>>;
  createCategoryMutation: UseMutationResult<
    { id: string; name: string; slug: string },
    ApiError,
    { name: string },
    unknown
  >;
  deleteCategoryMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    string,
    unknown
  >;
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
  createIncludeMutation: UseMutationResult<
    { id: string; text: string; position: number },
    ApiError,
    { courseId: string; payload: CreateCourseIncludeRequest },
    unknown
  >;
  updateIncludeMutation: UseMutationResult<
    { id: string; text: string; position: number },
    ApiError,
    {
      courseId: string;
      includeId: string;
      payload: UpdateCourseIncludeRequest;
    },
    unknown
  >;
  deleteIncludeMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; includeId: string },
    unknown
  >;
  reorderIncludesMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; payload: ReorderCourseIncludesRequest },
    unknown
  >;
  publishCourseMutation: UseMutationResult<
    {
      id: string;
      slug: string;
      status: "draft" | "published" | "archived";
      version: number;
    },
    ApiError,
    string,
    unknown
  >;
  unpublishCourseMutation: UseMutationResult<
    {
      id: string;
      slug: string;
      status: "draft" | "published" | "archived";
      version: number;
    },
    ApiError,
    string,
    unknown
  >;
  actionLoading: "publish" | "draft" | "save" | "unpublish" | "validate" | null;
  setActionLoading: Dispatch<
    SetStateAction<
      "publish" | "draft" | "save" | "unpublish" | "validate" | null
    >
  >;
  saveActionInFlightRef: RefObject<boolean>;
  setIsSavingBasics: Dispatch<SetStateAction<boolean>>;
  isSavingCurriculum: boolean;
  setIsSavingCurriculum: Dispatch<SetStateAction<boolean>>;
  isSavingAccessRules: boolean;
  setIsSavingAccessRules: Dispatch<SetStateAction<boolean>>;
  isSavingPricing: boolean;
  setIsSavingPricing: Dispatch<SetStateAction<boolean>>;
  isSavingExtras: boolean;
  setIsSavingExtras: Dispatch<SetStateAction<boolean>>;
  isSavingPublish: boolean;
  setIsSavingPublish: Dispatch<SetStateAction<boolean>>;
  isBasicsSaving: boolean;
  isAccessRulesSaving: boolean;
  isExtrasSaving: boolean;
  isInitialCourseCreationPending: boolean;
  basicsOverallStatus: "saving" | "saved" | "failed" | null;
  isAnyApiInProgress: boolean;
  handleCloseAddCategoryModal: () => void;
}

export function useSavingState({
  categoryId,
  currentCourseId,
  isThumbnailBusy,
  savingBasicsControls,
  inFlightBasicsControlsRef,
  inFlightBasicsPromiseRef,
  basicsFieldStatus,
  basicsSaveFailed,
  showBasicsSavedBriefly,
  setIsAddCategoryModalOpen,
  setNewCategoryName,
  setAddCategoryError,
  isInitialCurriculumBootstrapInProgress,
  serverCategories,
  isPreviewLoading,
  isValidating,
  createCourseMutation,
}: UseSavingStateArgs): UseSavingStateResult {
  const createSectionMutation = useCreateSection();
  const updateSectionMutation = useUpdateSection();
  const deleteSectionMutation = useDeleteSection();
  const reorderSectionsMutation = useReorderSections();
  const createLessonMutation = useCreateLesson();
  const createLessonResourceMutation = useCreateLessonResource();
  const updateLessonMutation = useUpdateLesson();
  const deleteLessonMutation = useDeleteLesson();
  const deleteLessonResourceMutation = useDeleteLessonResource();
  const reorderLessonsMutation = useReorderLessons();
  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [creatingLessonSectionId, setCreatingLessonSectionId] = useState<
    string | null
  >(null);
  const [savingLessonId, setSavingLessonId] = useState<string | null>(null);
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);
  const [reorderingLessonsSectionId, setReorderingLessonsSectionId] = useState<
    string | null
  >(null);
  const [isReorderingSections, setIsReorderingSections] =
    useState<boolean>(false);
  const [isReorderingIncludes, setIsReorderingIncludes] =
    useState<boolean>(false);
  const [updatingSectionId, setUpdatingSectionId] = useState<string | null>(
    null,
  );
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(
    null,
  );
  const createCategoryMutation = useCreateCategory();
  const deleteCategoryMutation = useDeleteCategory();
  const upsertAccessRulesMutation = useUpsertAccessRules();
  const upsertSettingsMutation = useUpsertSettings();
  const upsertPricingMutation = useUpsertPricing();
  const createIncludeMutation = useCreateCourseInclude();
  const updateIncludeMutation = useUpdateCourseInclude();
  const deleteIncludeMutation = useDeleteCourseInclude();
  const reorderIncludesMutation = useReorderCourseIncludes();
  const publishCourseMutation = usePublishCourse();
  const unpublishCourseMutation = useUnpublishCourse();

  // Footer Action Loading States
  const [actionLoading, setActionLoading] = useState<
    "draft" | "save" | "publish" | "unpublish" | "validate" | null
  >(null);
  const saveActionInFlightRef = useRef(false);

  // Page-specific in-flight save states
  const [isSavingBasics, setIsSavingBasics] = useState(false);
  const [isSavingCurriculum, setIsSavingCurriculum] = useState(false);
  const [isSavingAccessRules, setIsSavingAccessRules] = useState(false);
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [isSavingExtras, setIsSavingExtras] = useState(false);
  const [isSavingPublish, setIsSavingPublish] = useState(false);

  const isBasicsSaving = isSavingBasics;
  const isCurriculumSaving = isSavingCurriculum;
  const isAccessRulesSaving = isSavingAccessRules;
  const isPricingSaving = isSavingPricing;
  const isExtrasSaving = isSavingExtras;
  const isPublishSaving = isSavingPublish;

  const isInitialCourseCreationPending =
    (!currentCourseId || isInitialCurriculumBootstrapInProgress) &&
    (createCourseMutation.isPending ||
      isInitialCurriculumBootstrapInProgress ||
      isSavingBasics ||
      savingBasicsControls.has("title"));

  const isAnyBasicsSaving =
    savingBasicsControls.size > 0 ||
    isSavingBasics ||
    Boolean(inFlightBasicsPromiseRef.current) ||
    (inFlightBasicsControlsRef.current.title ?? 0) > 0 ||
    (inFlightBasicsControlsRef.current.shortDescription ?? 0) > 0 ||
    (inFlightBasicsControlsRef.current.courseDescription ?? 0) > 0 ||
    (inFlightBasicsControlsRef.current.instructorAlias ?? 0) > 0 ||
    (inFlightBasicsControlsRef.current.showInstructorName ?? 0) > 0;

  const hasBasicsFieldFailed =
    basicsSaveFailed ||
    Object.values(basicsFieldStatus).some((status) => status === "failed");

  const basicsOverallStatus = useMemo(():
    "saving" | "failed" | "saved" | null => {
    if (isAnyBasicsSaving) return "saving";
    if (hasBasicsFieldFailed) return "failed";
    if (showBasicsSavedBriefly) return "saved";
    return null;
  }, [isAnyBasicsSaving, hasBasicsFieldFailed, showBasicsSavedBriefly]);

  const isMutatingCount = useIsMutating();

  const isAnyApiInProgress =
    isMutatingCount > 0 ||
    actionLoading !== null ||
    isBasicsSaving ||
    isCurriculumSaving ||
    isAccessRulesSaving ||
    isPricingSaving ||
    isExtrasSaving ||
    isPublishSaving ||
    isCreatingSection ||
    creatingLessonSectionId !== null ||
    savingLessonId !== null ||
    deletingLessonId !== null ||
    isReorderingSections ||
    reorderingLessonsSectionId !== null ||
    isReorderingIncludes ||
    reorderIncludesMutation.isPending ||
    updatingSectionId !== null ||
    deletingSectionId !== null ||
    createCategoryMutation.isPending ||
    deleteCategoryMutation.isPending ||
    publishCourseMutation.isPending ||
    unpublishCourseMutation.isPending ||
    isValidating ||
    isThumbnailBusy ||
    isPreviewLoading;

  const selectedCategoryName = useMemo(() => {
    return serverCategories.find((c) => c.id === categoryId)?.name || "";
  }, [serverCategories, categoryId]);

  const handleCloseAddCategoryModal = () => {
    if (createCategoryMutation.isPending || deleteCategoryMutation.isPending)
      return;
    setIsAddCategoryModalOpen(false);
    setNewCategoryName("");
    setAddCategoryError("");
  };
  return {
    createSectionMutation,
    updateSectionMutation,
    deleteSectionMutation,
    reorderSectionsMutation,
    createLessonMutation,
    createLessonResourceMutation,
    updateLessonMutation,
    deleteLessonMutation,
    deleteLessonResourceMutation,
    reorderLessonsMutation,
    isCreatingSection,
    setIsCreatingSection,
    creatingLessonSectionId,
    setCreatingLessonSectionId,
    savingLessonId,
    setSavingLessonId,
    deletingLessonId,
    setDeletingLessonId,
    reorderingLessonsSectionId,
    setReorderingLessonsSectionId,
    isReorderingSections,
    setIsReorderingSections,
    isReorderingIncludes,
    setIsReorderingIncludes,
    updatingSectionId,
    setUpdatingSectionId,
    deletingSectionId,
    setDeletingSectionId,
    createCategoryMutation,
    deleteCategoryMutation,
    upsertAccessRulesMutation,
    upsertSettingsMutation,
    upsertPricingMutation,
    createIncludeMutation,
    updateIncludeMutation,
    deleteIncludeMutation,
    reorderIncludesMutation,
    publishCourseMutation,
    unpublishCourseMutation,
    actionLoading,
    setActionLoading,
    saveActionInFlightRef,
    setIsSavingBasics,
    isSavingCurriculum,
    setIsSavingCurriculum,
    isSavingAccessRules,
    setIsSavingAccessRules,
    isSavingPricing,
    setIsSavingPricing,
    isSavingExtras,
    setIsSavingExtras,
    isSavingPublish,
    setIsSavingPublish,
    isBasicsSaving,
    isAccessRulesSaving,
    isExtrasSaving,
    isInitialCourseCreationPending,
    basicsOverallStatus,
    isAnyApiInProgress,
    handleCloseAddCategoryModal,
  };
}
