import { lazy, Suspense, useEffect, useState } from "react";
import "../styles/features/course-wizard.css";
import { createPortal } from "react-dom";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { CourseStaticPageRefreshNotice } from "./CourseStaticPageRefreshNotice";

const DiscussionMarkdown = lazy(() =>
  import("../learning/discussion-editor/DiscussionMarkdown").then((module) => ({
    default: module.DiscussionMarkdown,
  })),
);
const LessonVideoUpload = lazy(() =>
  import("./lesson-video-upload/LessonVideoUpload").then((module) => ({
    default: module.LessonVideoUpload,
  })),
);
const QuizAuthoringPanel = lazy(() =>
  import("../quizzes/QuizAuthoringPanel").then((module) => ({
    default: module.QuizAuthoringPanel,
  })),
);
import { ToastNotification } from "../ToastNotification";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { NavigateTo } from "../routing/navigation";
import { SwipeableTabPanel } from "../navigation/SwipeableTabPanel";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal";
import {
  useCourseEditor,
  useCoursePreview,
  useCourseValidation,
  useCreateCourse,
  useUpdateCourseBasics,
} from "../services/courses";
import { waitForCourseThumbnailCdnUrl } from "./courseMedia";
import { CourseBannerUpload } from "./course-editor/CourseBannerUpload";
import { MEDIA_MAX_SIZES } from "@veolms/contracts";
import { mediaService } from "../services/media";
import {
  getThumbnailUploadErrorMessage,
  isBasicsMetaEqual,
} from "./course-editor/basicsState";
import {
  type CurriculumLessonItem,
  isLessonDirty,
} from "./course-editor/curriculumItems";
import {
  WIZARD_STEPS,
  WIZARD_STEP_IDS,
  WIZARD_STEP_PERMISSIONS,
  type CourseWizardStepId,
} from "./course-editor/wizardSteps";
import { type BasicsFieldKey } from "./course-editor/statusIndicators";
import { CourseWizardSkeleton } from "./course-editor/CourseWizardSkeleton";
import { PricingStepPanel } from "./course-editor/PricingStepPanel";
import { AccessRulesStepPanel } from "./course-editor/AccessRulesStepPanel";
import { PluginCourseEditorSections } from "./course-editor/PluginCourseEditorSections";
import { PublishStepPanel } from "./course-editor/PublishStepPanel";
import { ExtrasStepPanel } from "./course-editor/ExtrasStepPanel";
import { BasicsStepPanel } from "./course-editor/BasicsStepPanel";
import { CurriculumStepPanel } from "./course-editor/CurriculumStepPanel";
import { CourseEditorHeader } from "./course-editor/CourseEditorHeader";
import { CourseEditorStepsNav } from "./course-editor/CourseEditorStepsNav";
import { CourseEditorFooter } from "./course-editor/CourseEditorFooter";
import { CourseEditorMobileStepStatus } from "./course-editor/CourseEditorMobileStepStatus";
import { CourseEditorMobileActionBar } from "./course-editor/CourseEditorMobileActionBar";
import { CoursePreviewModal } from "./course-editor/CoursePreviewModal";
import { CourseCategoriesModal } from "./course-editor/CourseCategoriesModal";
import { useWizardNavigationState } from "./course-editor/hooks/useWizardNavigationState";
import { useBasicsDraftState } from "./course-editor/hooks/useBasicsDraftState";
import { useBasicsSaveStatus } from "./course-editor/hooks/useBasicsSaveStatus";
import { useCategoryState } from "./course-editor/hooks/useCategoryState";
import { useSavingState } from "./course-editor/hooks/useSavingState";
import { useCurriculumState } from "./course-editor/hooks/useCurriculumState";
import { useAccessRulesState } from "./course-editor/hooks/useAccessRulesState";
import { usePricingState } from "./course-editor/hooks/usePricingState";
import { usePublishStatus } from "./course-editor/hooks/usePublishStatus";
import { useExtrasState } from "./course-editor/hooks/useExtrasState";
import { useEditorHydration } from "./course-editor/hooks/useEditorHydration";
import { useExtrasHandlers } from "./course-editor/hooks/useExtrasHandlers";
import { useAccessRulesHandlers } from "./course-editor/hooks/useAccessRulesHandlers";
import { useSectionHandlers } from "./course-editor/hooks/useSectionHandlers";
import { useLessonHandlers } from "./course-editor/hooks/useLessonHandlers";
import { useLessonResourceAndDragHandlers } from "./course-editor/hooks/useLessonResourceAndDragHandlers";
import { usePricingHandlers } from "./course-editor/hooks/usePricingHandlers";
import { usePreviewAndChecklist } from "./course-editor/hooks/usePreviewAndChecklist";
import { useBasicsPersistence } from "./course-editor/hooks/useBasicsPersistence";
import { useStepSavesAndNavigation } from "./course-editor/hooks/useStepSavesAndNavigation";
import { useCapabilities } from "../services/authorization/authorization.queries";
import { useAuthStore } from "../store/auth.store";

const getCurriculumLessonKey = (lesson: CurriculumLessonItem) => lesson.id;

export interface CourseCreatePageProps {
  courseId?: string;
  editCourseId?: string;
  onNavigatePage?: NavigateTo;
  bottomNavHidden?: boolean;
}

export function CourseCreatePage({
  courseId: propCourseId,
  editCourseId: propEditCourseId,
  onNavigatePage,
  bottomNavHidden = false,
}: CourseCreatePageProps) {
  const {
    navigate,
    routeEditTab,
    searchParams,
    activeEditId,
    requestedSectionId,
    requestedLessonId,
    activeStep,
    setActiveStep,
    pendingWizardNavigationRef,
    mountedTabs,
    setMountedTabs,
    tabRefs,
    stepsNavRef,
    mountedLessonEditorIds,
    editingLessonTarget,
    setEditingLessonTarget,
    rememberLessonEditor,
    navigateToStepRef,
    handleNavMouseDown,
    handleNavMouseLeave,
    handleNavMouseUp,
    handleNavMouseMove,
  } = useWizardNavigationState({
    propCourseId,
    propEditCourseId,
  });

  const {
    setServerBasics,
    setBasicsDraft,
    isBasicsDirty,
    isBasicsDirtyRef,
    courseTitle,
    shortDescription,
    courseDescription,
    categoryId,
    difficultyLevel,
    language,
    instructorAlias,
    showInstructorName,
    serverBasicsRef,
    basicsDraftRef,
    setCourseTitle,
    setShortDescription,
    setCourseDescription,
    setCategoryId,
    setInstructorAlias,
    setShowInstructorName,
    currentCourseId,
    setCurrentCourseId,
    courseVersion,
    setCourseVersion,
    courseVersionRef,
    currentCourseIdRef,
    thumbnail,
    setThumbnail,
    thumbnailMediaId,
    setThumbnailMediaId,
    setThumbnailUploadStatus,
    thumbnailUploadError,
    setThumbnailUploadError,
    thumbnailInputRef,
    thumbnailMediaIdRef,
    thumbnailUploadStatusRef,
    thumbnailDirtyRef,
    thumbnailObjectUrlRef,
    thumbnailUploadAbortControllerRef,
    thumbnailRequestIdRef,
    thumbnailMountedRef,
    isThumbnailBusy,
    setVideoTrailer,
    videoTrailerInputRef,
  } = useBasicsDraftState({
    activeEditId,
  });

  async function handleThumbnailFileSelect(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadThumbnailFile(file);
  }

  /** A picked or dropped image, uploaded and saved as the thumbnail. */
  async function uploadThumbnailFile(file: File): Promise<void> {
    if (isThumbnailBusy) return;

    const contentType = file.type.toLowerCase();
    if (!contentType.startsWith("image/")) {
      setThumbnailUploadError("Please choose an image file for the thumbnail.");
      setThumbnailUploadStatus("error");
      return;
    }
    if (file.size <= 0) {
      setThumbnailUploadError("The selected thumbnail is empty.");
      setThumbnailUploadStatus("error");
      return;
    }
    if (file.size > MEDIA_MAX_SIZES.image) {
      setThumbnailUploadError("Thumbnail images must be 10 MB or smaller.");
      setThumbnailUploadStatus("error");
      return;
    }

    const targetCourseId = currentCourseIdRef.current || currentCourseId;
    if (!targetCourseId) {
      setThumbnailUploadError(
        "Save the course title before uploading a thumbnail.",
      );
      setThumbnailUploadStatus("error");
      return;
    }

    const requestId = ++thumbnailRequestIdRef.current;
    const previousThumbnail = thumbnail;
    const previousMediaId = thumbnailMediaIdRef.current;
    const previousObjectUrl = thumbnailObjectUrlRef.current;
    const imageUrl = URL.createObjectURL(file);

    thumbnailObjectUrlRef.current = imageUrl;
    thumbnailDirtyRef.current = true;
    setThumbnail(imageUrl);
    setThumbnailUploadError(null);
    setThumbnailUploadStatus("uploading");

    const requestIsActive = () =>
      thumbnailMountedRef.current &&
      thumbnailRequestIdRef.current === requestId;

    const restorePreviousThumbnail = () => {
      if (!requestIsActive()) return;
      URL.revokeObjectURL(imageUrl);
      thumbnailObjectUrlRef.current = previousObjectUrl;
      thumbnailMediaIdRef.current = previousMediaId;
      setThumbnail(previousThumbnail);
      setThumbnailMediaId(previousMediaId);
      thumbnailDirtyRef.current = false;
    };

    const uploadAbortController = new AbortController();
    thumbnailUploadAbortControllerRef.current = uploadAbortController;

    try {
      if (!(await flushBasicsPersistence()) || !requestIsActive()) {
        throw new Error(
          "Save the course details before uploading a thumbnail.",
        );
      }

      const presigned = await mediaService.presignMediaUpload({
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
        type: "image",
        visibility: "public",
      });

      if (!requestIsActive()) return;

      await mediaService.uploadFileToPresignedUrl(
        presigned.uploadUrl,
        file,
        undefined,
        uploadAbortController.signal,
      );

      if (!requestIsActive()) return;
      setThumbnailUploadStatus("confirming");
      const confirmation = await mediaService.confirmUpload(
        presigned.mediaAssetId,
      );

      if (!requestIsActive()) return;
      setThumbnailUploadStatus("processing");
      const processedThumbnailUrl = await waitForCourseThumbnailCdnUrl(
        presigned.mediaAssetId,
        { signal: uploadAbortController.signal },
      );

      if (!requestIsActive()) return;
      setThumbnailUploadStatus("saving");

      const updated = await updateBasicsMutation.mutateAsync({
        id: targetCourseId,
        payload: {
          thumbnailMediaId: presigned.mediaAssetId,
          version: courseVersionRef.current,
        },
      });

      if (!requestIsActive()) return;

      setCourseVersion(updated.version);
      courseVersionRef.current = updated.version;
      thumbnailMediaIdRef.current = presigned.mediaAssetId;
      setThumbnailMediaId(presigned.mediaAssetId);
      setThumbnail(processedThumbnailUrl);
      thumbnailDirtyRef.current = false;
      setThumbnailUploadStatus("idle");
      setThumbnailUploadError(null);

      if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
      thumbnailObjectUrlRef.current = null;
    } catch (error: unknown) {
      if (
        !requestIsActive() ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        return;
      }

      restorePreviousThumbnail();
      setThumbnailUploadStatus("error");
      setThumbnailUploadError(getThumbnailUploadErrorMessage(error));
    } finally {
      if (thumbnailUploadAbortControllerRef.current === uploadAbortController) {
        thumbnailUploadAbortControllerRef.current = null;
      }
    }
  }

  async function saveBannerMediaId(
    bannerMediaId: string | null,
  ): Promise<number> {
    const targetCourseId = currentCourseIdRef.current || currentCourseId;
    if (!targetCourseId) {
      throw new Error("Save the course title before adding a banner.");
    }
    const updated = await updateBasicsMutation.mutateAsync({
      id: targetCourseId,
      payload: { bannerMediaId, version: courseVersionRef.current },
    });
    setCourseVersion(updated.version);
    courseVersionRef.current = updated.version;
    return updated.version;
  }

  const triggerThumbnailUpload = () => {
    thumbnailInputRef.current?.click();
  };

  const handleTrailerMediaAttached = async (
    mediaAssetId: string,
  ): Promise<boolean> => {
    if (!currentCourseId || !editorData?.course) return false;

    try {
      // The version this page last saved: the thumbnail and banner move it
      // ahead of the editor data until that is read again.
      const updated = await updateBasicsMutation.mutateAsync({
        id: currentCourseId,
        payload: {
          trailerMediaId: mediaAssetId,
          version: courseVersionRef.current,
        },
      });
      setCourseVersion(updated.version);
      courseVersionRef.current = updated.version;
      await refetchEditor();
      return true;
    } catch {
      return false;
    }
  };

  const handleRemoveTrailer = async (): Promise<void> => {
    const targetCourseId = currentCourseIdRef.current || currentCourseId;
    if (!targetCourseId) return;
    if (!(await flushBasicsPersistence())) {
      throw new Error("Save the course details before removing the trailer.");
    }
    const updated = await updateBasicsMutation.mutateAsync({
      id: targetCourseId,
      payload: { trailerMediaId: null, version: courseVersionRef.current },
    });
    setCourseVersion(updated.version);
    courseVersionRef.current = updated.version;
    await refetchEditor();
  };

  const {
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
  } = useBasicsSaveStatus({
    setVideoTrailer,
    videoTrailerInputRef,
  });

  const getBasicsFieldDisplayStatus = (
    fieldKey: BasicsFieldKey,
  ): "saving" | "saved" | "failed" | null => {
    if (
      savingBasicsControls.has(fieldKey) ||
      (inFlightBasicsControlsRef.current[fieldKey] ?? 0) > 0 ||
      (!currentCourseId &&
        fieldKey === "title" &&
        createCourseMutation.isPending)
    ) {
      return "saving";
    }
    return basicsFieldStatus[fieldKey] ?? null;
  };

  const {
    isAddCategoryModalOpen,
    setIsAddCategoryModalOpen,
    isPreviewModalOpen,
    setIsPreviewModalOpen,
    newCategoryName,
    setNewCategoryName,
    addCategoryError,
    setAddCategoryError,
    categoryToDelete,
    setCategoryToDelete,
    isEditing,
    isInitialCurriculumBootstrapInProgress,
    setIsInitialCurriculumBootstrapInProgress,
    isInitialCurriculumBootstrapInProgressRef,
    isDownstreamUnlocked,
    titleInputRef,
    showTitleTooltip,
    setShowTitleTooltip,
    serverCategories,
    isLoadingCategories,
  } = useCategoryState({
    routeEditTab,
    searchParams,
    activeEditId,
    activeStep,
    setActiveStep,
    pendingWizardNavigationRef,
    courseTitle,
    currentCourseId,
    currentCourseIdRef,
  });
  const {
    data: editorData,
    isLoading: isLoadingEditor,
    isFetching: isFetchingEditor,
    isError: isEditorError,
    error: editorError,
    refetch: refetchEditor,
  } = useCourseEditor(currentCourseId);
  const isInitialLoadingCourse =
    isEditing && (isLoadingEditor || isFetchingEditor) && !editorData;
  // Steps open to whoever may change them on this course; a new course is
  // the user's own.
  const capabilities = useCapabilities();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const editedCourse = isEditing
    ? editorData?.course
    : { creatorId: currentUserId ?? null };
  const isStepAllowed = (stepId: CourseWizardStepId) =>
    !capabilities.isFetched ||
    !editedCourse ||
    WIZARD_STEP_PERMISSIONS[stepId].some((permission) =>
      capabilities.canOnCourse(permission, editedCourse),
    );
  // The public page's rebuild status is read with course.details.update.
  const followsPageRefresh =
    capabilities.isFetched &&
    Boolean(editedCourse) &&
    capabilities.canOnCourse("course.details.update", editedCourse);
  const {
    data: previewData,
    isLoading: isPreviewLoading,
    isError: isPreviewError,
    refetch: refetchPreview,
  } = useCoursePreview(currentCourseId, {
    enabled: isPreviewModalOpen && Boolean(currentCourseId),
  });
  const {
    data: serverValidation,
    refetch: refetchValidation,
    isFetching: isValidating,
  } = useCourseValidation(currentCourseId, {
    enabled: activeStep === "publish",
  });
  const createCourseMutation = useCreateCourse();
  const updateBasicsMutation = useUpdateCourseBasics();
  const {
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
  } = useSavingState({
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
  });

  const handleCreateCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setAddCategoryError("Please enter a category name.");
      return;
    }

    const isDuplicate = serverCategories.some(
      (cat) => cat.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) {
      setAddCategoryError("This category already exists.");
      return;
    }

    try {
      const created = await createCategoryMutation.mutateAsync({
        name: trimmed,
      });
      setCategoryId(created.id);
      setNewCategoryName("");
      setAddCategoryError("");
      setToastMessage(`Category "${created.name}" created successfully.`);
    } catch {
      setAddCategoryError("Failed to create category. Please try again.");
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    const targetName = categoryToDelete.name;
    const targetId = categoryToDelete.id;
    try {
      await deleteCategoryMutation.mutateAsync(targetId);
      if (categoryId === targetId) {
        setCategoryId("");
      }
      setToastMessage(`Category "${targetName}" deleted successfully.`);
    } catch {
      setToastMessage(`Failed to delete category "${targetName}".`);
    } finally {
      setCategoryToDelete(null);
    }
  };

  const {
    currencyOptions,
    handleBackToCourses,
    handleBack,
    sections,
    setSections,
    sectionsRef,
    sectionHeaderElementsRef,
    pendingAddedSectionScrollRef,
    sectionScrollDelayRef,
    lessonTitleDraftsRef,
    isCollapsingSectionRef,
    inFlightLessonSavesRef,
    isSavingAllDirtyLessonsRef,
    isCurriculumDirty,
    dragInitialSectionsStateRef,
    dragInitialLessonStateRef,
    setCurriculumSaveFailed,
    triggerCurriculumSavedBriefly,
    clearCurriculumItemStatus,
    markCurriculumItemSaved,
    markCurriculumItemFailed,
    getCurriculumItemDisplayStatus,
    curriculumOverallStatus,
  } = useCurriculumState({
    onNavigatePage,
    activeEditId,
    requestedSectionId,
    activeStep,
    isCreatingSection,
    creatingLessonSectionId,
    savingLessonId,
    deletingLessonId,
    reorderingLessonsSectionId,
    isReorderingSections,
    updatingSectionId,
    deletingSectionId,
    isSavingCurriculum,
  });

  const {
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
  } = useAccessRulesState({
    isSavingAccessRules,
  });

  const {
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
  } = usePricingState({
    isSavingPricing,
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const {
    publishValidationError,
    setPublishValidationError,
    setPublishSaveFailed,
    triggerPublishSavedBriefly,
    publishOverallStatus,
  } = usePublishStatus({
    isPreviewModalOpen,
    setIsPreviewModalOpen,
    isSavingPublish,
  });

  const {
    setServerExtras,
    serverIncludes,
    setServerIncludes,
    manualIncludesDraft,
    setManualIncludesDraft,
    manualIncludesDraftRef,
    dragInitialIncludesStateRef,
    deletingIncludeIdsRef,
    deletingIncludeIds,
    setDeletingIncludeIds,
    savingIncludeIdsRef,
    savingIncludeIds,
    setSavingIncludeIds,
    isSavingCertificate,
    setIsSavingCertificate,
    isSavingCertificateRef,
    extrasControlStatus,
    setExtrasSaveFailed,
    triggerExtrasSavedBriefly,
    clearExtrasControlStatus,
    markExtrasControlSaved,
    markExtrasControlFailed,
    getExtrasControlDisplayStatus,
    extrasOverallStatus,
    extras,
    setExtras,
    suggestedInclusions,
    isManualIncludesDirty,
    isExtrasDirty,
    isExtrasDirtyRef,
    isStepDirty,
    hasUnsavedChanges,
  } = useExtrasState({
    isBasicsDirty,
    isReorderingIncludes,
    createIncludeMutation,
    reorderIncludesMutation,
    isSavingExtras,
    sections,
    isCurriculumDirty,
    accessRulesDraft,
    needsAccessRulesSave,
    isPricingDirty,
  });

  useEditorHydration({
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
  });

  const {
    dragEnabledInclusionId,
    setDragEnabledInclusionId,
    handleAddManualInclusion,
    handleUpdateManualInclusionText,
    handleUpdateManualInclusionDetail,
    handleSetInclusionStyle,
    handleManualInclusionBlur,
    handleDeleteManualInclusion,
    handleInclusionDragStart,
    handleInclusionDragOver,
    handleInclusionDragEnd,
    handleToggleCertificate,
    handleCertificateTemplateChange,
    handleToggleAutoEmailCertificate,
  } = useExtrasHandlers({
    currentCourseId,
    isReorderingIncludes,
    setIsReorderingIncludes,
    upsertSettingsMutation,
    createIncludeMutation,
    updateIncludeMutation,
    deleteIncludeMutation,
    reorderIncludesMutation,
    isExtrasSaving,
    setToastMessage,
    setServerExtras,
    serverIncludes,
    setServerIncludes,
    setManualIncludesDraft,
    manualIncludesDraftRef,
    dragInitialIncludesStateRef,
    deletingIncludeIdsRef,
    setDeletingIncludeIds,
    savingIncludeIdsRef,
    setSavingIncludeIds,
    setIsSavingCertificate,
    isSavingCertificateRef,
    clearExtrasControlStatus,
    markExtrasControlSaved,
    markExtrasControlFailed,
    extras,
    setExtras,
  });

  const {
    handleAccessTypeChange,
    handleDurationModeChange,
    flushFixedDurationPersistence,
    handleFixedDurationValueChange,
    handleFixedDurationUnitChange,
    handleToggleQA,
    handleToggleComments,
    handleToggleNotes,
  } = useAccessRulesHandlers({
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
  });

  const {
    draggedSectionIndex,
    dragEnabledSectionId,
    setDragEnabledSectionId,
    draggedLessonState,
    setDraggedLessonState,
    pinnedVirtualizedLessonIds,
    draggedLessonStateRef,
    lessonDropTarget,
    setLessonDropTarget,
    lessonDropTargetRef,
    dragEnabledLessonId,
    setDragEnabledLessonId,
    deleteModalState,
    setDeleteModalState,
    handleAddSection,
    handleStartEditSectionTitle,
    handleSaveSectionTitle,
    handleDeleteSection,
    handleSectionDragStart,
    handleSectionDragOver,
    handleSectionDragEnd,
  } = useSectionHandlers({
    mountedLessonEditorIds,
    currentCourseId,
    courseVersion,
    setCourseVersion,
    createCourseMutation,
    createSectionMutation,
    updateSectionMutation,
    deleteSectionMutation,
    reorderSectionsMutation,
    isCreatingSection,
    setIsCreatingSection,
    isReorderingSections,
    setIsReorderingSections,
    setUpdatingSectionId,
    updatingSectionId,
    deletingSectionId,
    setDeletingSectionId,
    sections,
    setSections,
    sectionsRef,
    pendingAddedSectionScrollRef,
    dragInitialSectionsStateRef,
    clearCurriculumItemStatus,
    markCurriculumItemSaved,
    markCurriculumItemFailed,
    setToastMessage,
  });

  const {
    handleAddLesson,
    handleDeleteLesson,
    handleUpdateLesson,
    handleCancelLessonDraft,
    persistLesson,
    handleLessonFieldBlur,
    handleStartEditLessonTitle,
    handleCancelEditLessonTitle,
    handleLessonTitleBlur,
    handleCancelLessonDescriptionEdit,
    handleLessonDiscreteChange,
    handleLessonMediaAttached,
    handleLessonProcessingComplete,
    saveAllDirtyLessons,
    handleToggleLessonExpand,
  } = useLessonHandlers({
    currentCourseId,
    currentCourseIdRef,
    refetchEditor,
    refetchPreview,
    createCourseMutation,
    createSectionMutation,
    createLessonMutation,
    updateLessonMutation,
    deleteLessonMutation,
    creatingLessonSectionId,
    setCreatingLessonSectionId,
    setSavingLessonId,
    setDeletingLessonId,
    sections,
    setSections,
    sectionsRef,
    lessonTitleDraftsRef,
    inFlightLessonSavesRef,
    isSavingAllDirtyLessonsRef,
    clearCurriculumItemStatus,
    markCurriculumItemSaved,
    markCurriculumItemFailed,
    setToastMessage,
    setDeleteModalState,
  });

  const {
    navigateToCurriculumFocus,
    handleToggleSectionExpand,
    handleCreateLessonResource,
    handleLessonResourceAdded,
    handleDeleteLessonResource,
    handleLessonResourceRemoved,
    handleLessonDragStart,
    handleLessonDragOver,
    handleLessonDragEnd,
  } = useLessonResourceAndDragHandlers({
    navigate,
    activeEditId,
    currentCourseId,
    courseVersion,
    setCourseVersion,
    isEditing,
    createLessonResourceMutation,
    deleteLessonResourceMutation,
    reorderLessonsMutation,
    savingLessonId,
    deletingLessonId,
    reorderingLessonsSectionId,
    setReorderingLessonsSectionId,
    sections,
    setSections,
    sectionsRef,
    sectionScrollDelayRef,
    isCollapsingSectionRef,
    isSavingAllDirtyLessonsRef,
    dragInitialLessonStateRef,
    setToastMessage,
    setDraggedLessonState,
    draggedLessonStateRef,
    setLessonDropTarget,
    lessonDropTargetRef,
    setDragEnabledLessonId,
    persistLesson,
  });

  const {
    totalSections,
    totalLessons,
    computedDuration,
    ensureCourseDraftForPricing,
    flushPricingPersistence,
    handleSellingPriceChange,
    handleShowDiscountBadgeChange,
    handleLinkedOnlyChange,
    handleOriginalPriceChange,
    handleCurrencyChange,
  } = usePricingHandlers({
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
  });

  const {
    activePreviewData,
    getChecklistState,
    validationChecklistItems,
    isCourseReadyToPublish,
  } = usePreviewAndChecklist({
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
  });

  const handlePreviewAction = async () => {
    if (
      isAnyApiInProgress ||
      isPreviewLoading ||
      actionLoading !== null ||
      isSavingAllDirtyLessonsRef.current ||
      isInitialCourseCreationPending
    )
      return;

    if (activeStep === "curriculum") {
      const currentSections = sectionsRef.current || sections;
      const hasDirty = currentSections.some((s) =>
        s.lessons.some((l) => isLessonDirty(l) && !l.isPendingCreation),
      );
      if (hasDirty) {
        setActionLoading("save");
        try {
          const success = await saveAllDirtyLessons();
        } catch {
          return;
        } finally {
          setActionLoading(null);
        }
      }
    }

    if (activeStep === "basics") {
      await flushBasicsPersistence();
    }

    setIsPreviewModalOpen(true);
  };

  const {
    executeSerializedBasicsMetaMutation,
    ensureCourseCreated,
    persistBasicsField,
    handleShowInstructorNameChange,
  } = useBasicsPersistence({
    setServerBasics,
    setBasicsDraft,
    serverBasicsRef,
    basicsDraftRef,
    setCourseTitle,
    setShortDescription,
    setCourseDescription,
    setInstructorAlias,
    setShowInstructorName,
    currentCourseId,
    setCurrentCourseId,
    setCourseVersion,
    courseVersionRef,
    currentCourseIdRef,
    basicsVersionRef,
    inFlightBasicsControlsRef,
    inFlightBasicsPromiseRef,
    inFlightCourseCreationPromiseRef,
    cancelTitleCreationDebounce,
    markBasicsControlSaving,
    clearBasicsFieldStatus,
    markBasicsFieldSaved,
    markBasicsFieldFailed,
    setIsInitialCurriculumBootstrapInProgress,
    isInitialCurriculumBootstrapInProgressRef,
    setShowTitleTooltip,
    createCourseMutation,
    updateBasicsMutation,
    createSectionMutation,
    createLessonMutation,
    upsertSettingsMutation,
    setSections,
    sectionsRef,
    setToastMessage,
  });

  const flushBasicsPersistence = async (): Promise<boolean> => {
    const currentDraft = basicsDraftRef.current;

    let targetCourseId = currentCourseIdRef.current || currentCourseId;
    if (!targetCourseId) {
      if (!currentDraft.title.trim()) {
        return false;
      }
      try {
        await persistBasicsField("title");
        return Boolean(currentCourseIdRef.current || currentCourseId);
      } catch {
        return false;
      }
    }

    // If a basics save is already in-flight (e.g. started by the description
    // field's blur handler), await it before re-evaluating dirtiness.  Without
    // this guard both blur and navigation call executeSerializedBasicsMetaMutation
    // with the same courseVersion, producing an optimistic-lock conflict:
    //   1. blur fires → inFlightBasicsPromiseRef set synchronously → run() reads
    //      courseVersionRef but the stale-response guard skips updating it when
    //      basicsVersionRef has already been bumped by the navigation path.
    //   2. navigation's run() then reads the un-updated courseVersionRef and
    //      sends a PUT with the old version → backend rejects with 409.
    // Awaiting here joins the in-flight save, lets it complete (which updates
    // courseVersionRef and serverBasicsRef), and then the isMetaDirty check
    // below correctly finds nothing left to save.
    if (inFlightBasicsPromiseRef.current) {
      try {
        await inFlightBasicsPromiseRef.current;
      } catch {
        // Ignored – isMetaDirty is re-evaluated below with fresh ref values.
      }
    }

    const isMetaDirty = !isBasicsMetaEqual(
      basicsDraftRef.current,
      serverBasicsRef.current,
    );
    if (isMetaDirty) {
      if (!basicsDraftRef.current.title.trim()) {
        setCourseTitle(serverBasicsRef.current.title);
        setToastMessage("Course title cannot be empty.");
        return false;
      }
      const version = ++basicsVersionRef.current;
      markBasicsControlSaving("title", true);
      inFlightBasicsControlsRef.current.title =
        (inFlightBasicsControlsRef.current.title || 0) + 1;
      const previousSnapshot = { ...serverBasicsRef.current };
      try {
        await executeSerializedBasicsMetaMutation(
          "title",
          version,
          previousSnapshot,
        );
        return true;
      } catch {
        return false;
      }
    } else if (
      inFlightCourseCreationPromiseRef.current ||
      inFlightBasicsPromiseRef.current
    ) {
      try {
        // Await whichever in-flight operation is active (creation takes priority).
        await (inFlightCourseCreationPromiseRef.current ??
          inFlightBasicsPromiseRef.current);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  };

  const {
    navigateToStep,
    previousStepId,
    nextStepId,
    handleValidateCourseAction,
    handleFinalPublishCourse,
    handleConfirmUnpublishCourse,
  } = useStepSavesAndNavigation({
    activeStep,
    setActiveStep,
    pendingWizardNavigationRef,
    setMountedTabs,
    navigateToStepRef,
    setServerBasics,
    setBasicsDraft,
    isBasicsDirty,
    serverBasicsRef,
    basicsDraftRef,
    currentCourseId,
    setCurrentCourseId,
    setCourseVersion,
    courseVersionRef,
    currentCourseIdRef,
    inFlightBasicsPromiseRef,
    cancelTitleCreationDebounce,
    setBasicsSaveFailed,
    triggerBasicsSavedBriefly,
    markBasicsFieldSaved,
    isDownstreamUnlocked,
    titleInputRef,
    setShowTitleTooltip,
    isValidating,
    refetchValidation,
    updateBasicsMutation,
    updateSectionMutation,
    upsertAccessRulesMutation,
    upsertPricingMutation,
    createIncludeMutation,
    updateIncludeMutation,
    deleteIncludeMutation,
    publishCourseMutation,
    unpublishCourseMutation,
    actionLoading,
    setActionLoading,
    saveActionInFlightRef,
    setIsSavingBasics,
    setIsSavingCurriculum,
    setIsSavingAccessRules,
    setIsSavingPricing,
    setIsSavingExtras,
    setIsSavingPublish,
    sections,
    setSections,
    isSavingAllDirtyLessonsRef,
    setCurriculumSaveFailed,
    triggerCurriculumSavedBriefly,
    markCurriculumItemSaved,
    setAccessRulesExists,
    serverAccessRules,
    setServerAccessRules,
    setAccessRulesDraft,
    accessRulesDraftRef,
    needsAccessRulesSave,
    setAccessRulesSaveFailed,
    triggerAccessRulesSavedBriefly,
    setServerPricing,
    serverPricingRef,
    setPricingDraft,
    pricingDraftRef,
    isPricingDirty,
    setPricingValidationError,
    setPricingSaveFailed,
    triggerPricingSavedBriefly,
    isPublished,
    setIsPublished,
    setIsUnpublishModalOpen,
    setToastMessage,
    setPublishValidationError,
    setPublishSaveFailed,
    triggerPublishSavedBriefly,
    serverIncludes,
    setServerIncludes,
    manualIncludesDraft,
    setManualIncludesDraft,
    setExtrasSaveFailed,
    triggerExtrasSavedBriefly,
    isManualIncludesDirty,
    isExtrasDirty,
    isStepDirty,
    flushFixedDurationPersistence,
    saveAllDirtyLessons,
    ensureCourseDraftForPricing,
    flushPricingPersistence,
    ensureCourseCreated,
    persistBasicsField,
    flushBasicsPersistence,
  });

  // A step this person cannot change (Basics, where the editor opens, for a
  // role that only edits lessons) gives way to the first one they can.
  const permissionsKnown = capabilities.isFetched && Boolean(editedCourse);
  const firstAllowedStep = permissionsKnown
    ? WIZARD_STEP_IDS.find(isStepAllowed)
    : undefined;
  const activeStepAllowed = !permissionsKnown || isStepAllowed(activeStep);
  useEffect(() => {
    if (activeStepAllowed || !firstAllowedStep) return;
    void navigateToStep(firstAllowedStep);
    // navigateToStep is rebuilt each render; the step decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStepAllowed, firstAllowedStep]);

  if (isEditorError && !editorData && isEditing) {
    return (
      <div className="relative flex w-full flex-1 flex-col min-h-[calc(100dvh-130px)] p-0 text-[--text] box-border max-[768px]:pb-0">
        <header className="relative shrink-0 mb-4 max-[768px]:mb-2 max-[768px]:w-full max-[768px]:max-w-full max-[768px]:min-w-0 max-[768px]:box-border">
          <div className="flex items-start justify-between gap-4 mb-3 max-[768px]:flex-col max-[768px]:gap-3 max-[768px]:mb-2">
            <div className="flex items-start gap-3 min-w-0">
              <button
                type="button"
                className="flex w-9 h-9 shrink-0 items-center justify-center border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg text-(--text-secondary) bg-[color-mix(in_srgb,var(--text)_4%,transparent)] cursor-pointer transition-[border-color,background-color,color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
                onClick={handleBack}
                aria-label="Go back"
              >
                <ArrowLeft size={17} weight="bold" />
              </button>
              <div className="pt-0.5 min-w-0">
                <h1 className="m-0 text-(--text) text-[clamp(1.2rem,1.8vw,1.55rem)] font-bold tracking-[-0.015em] leading-[1.2]">
                  Edit Course
                </h1>
                <p className="m-0 mt-1 text-(--muted) text-[0.84rem] max-w-155 leading-[1.4]">
                  Unable to load course data.
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="relative flex flex-1 flex-col items-center justify-center w-full min-h-[calc(100dvh-230px)] rounded-[14px] border border-red-500/20 bg-(--surface) p-8 text-center shadow-(--card-shadow) my-auto">
          <div className="relative mb-5 flex h-18 w-18 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <WarningCircle size={38} weight="bold" />
          </div>
          <h2 className="m-0 text-[1.28rem] font-bold tracking-[-0.015em] text-(--text)">
            Unable to load course details
          </h2>
          <p className="m-0 mt-2 max-w-md text-[0.88rem] leading-relaxed text-(--muted)">
            {editorError?.message ||
              "There was an error communicating with the server to fetch this course."}
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-4 text-[0.82rem] font-semibold text-(--text) cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-(--text)"
              onClick={handleBackToCourses}
            >
              Back to Courses
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg border-none bg-(--accent) px-4 text-[0.82rem] font-semibold text-(--on-accent,#ffffff) shadow-[0_2px_8px_var(--accent-shadow,rgba(0,0,0,0.2))] cursor-pointer transition-all hover:bg-(--accent-hover,var(--accent)) hover:brightness-110 active:scale-[0.98]"
              onClick={() => void refetchEditor()}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex w-full flex-1 flex-col min-h-full p-0 text-[--text] box-border"
      data-course-wizard
    >
      <CourseStaticPageRefreshNotice
        courseId={followsPageRefresh ? currentCourseId : null}
      />
      {/* Wizard Header */}
      <CourseEditorHeader
        handleBack={handleBack}
        isEditing={isEditing}
        isPublished={isPublished}
        activeStep={activeStep}
        publishValidationError={publishValidationError}
      />

      {/* Wizard Steps Navigation */}
      <CourseEditorStepsNav
        stepsNavRef={stepsNavRef}
        isEditing={isEditing}
        handleNavMouseDown={handleNavMouseDown}
        handleNavMouseLeave={handleNavMouseLeave}
        handleNavMouseUp={handleNavMouseUp}
        handleNavMouseMove={handleNavMouseMove}
        activeStep={activeStep}
        isStepDirty={isStepDirty}
        tabRefs={tabRefs}
        isDownstreamUnlocked={isDownstreamUnlocked}
        actionLoading={actionLoading}
        isInitialLoadingCourse={isInitialLoadingCourse}
        navigateToStep={navigateToStep}
        isStepAllowed={isStepAllowed}
      />

      {/* Wizard Step Panels using SwipeableTabPanel */}
      {isInitialLoadingCourse ? (
        <CourseWizardSkeleton activeStep={activeStep} />
      ) : (
        <Suspense
          fallback={
            <CenteredLoadingSpinner
              label="Loading course details"
              className="min-h-80 w-full flex-1"
            />
          }
        >
          <SwipeableTabPanel
            tabs={WIZARD_STEP_IDS}
            activeTab={activeStep}
            onTabChange={(newStep) => {
              void navigateToStep(newStep);
            }}
            tabListRef={stepsNavRef}
            id="course-wizard-tab-panel"
            className="course-wizard-tab-content relative min-h-0 flex-1 flex flex-col pt-4 pb-6 max-[640px]:pt-3"
            stateAttribute="data-wizard-step"
            labelledBy={`course-wizard-tab-${activeStep}`}
            disabled={
              actionLoading !== null ||
              (!isDownstreamUnlocked && activeStep === "basics")
            }
            spaceBetween={32}
          >
            {(panelStep) =>
              !mountedTabs.has(panelStep) ? null : panelStep === "basics" ? (
                <BasicsStepPanel
                  isEditing={isEditing}
                  showTitleTooltip={showTitleTooltip}
                  isDownstreamUnlocked={isDownstreamUnlocked}
                  isInitialCourseCreationPending={
                    isInitialCourseCreationPending
                  }
                  titleInputRef={titleInputRef}
                  setShowTitleTooltip={setShowTitleTooltip}
                  getBasicsFieldDisplayStatus={getBasicsFieldDisplayStatus}
                  currentCourseId={currentCourseId}
                  courseTitle={courseTitle}
                  setCourseTitle={setCourseTitle}
                  clearBasicsFieldStatus={clearBasicsFieldStatus}
                  currentCourseIdRef={currentCourseIdRef}
                  cancelTitleCreationDebounce={cancelTitleCreationDebounce}
                  titleCreationDebounceTimerRef={titleCreationDebounceTimerRef}
                  persistBasicsField={persistBasicsField}
                  createCourseMutation={createCourseMutation}
                  shortDescription={shortDescription}
                  setShortDescription={setShortDescription}
                  courseDescription={courseDescription}
                  setCourseDescription={setCourseDescription}
                  instructorAlias={instructorAlias}
                  setInstructorAlias={setInstructorAlias}
                  showInstructorName={showInstructorName}
                  isBasicsControlSaving={isBasicsControlSaving}
                  handleShowInstructorNameChange={
                    handleShowInstructorNameChange
                  }
                  thumbnailInputRef={thumbnailInputRef}
                  isBasicsSaving={isBasicsSaving}
                  isThumbnailBusy={isThumbnailBusy}
                  handleThumbnailFileSelect={handleThumbnailFileSelect}
                  thumbnail={thumbnail}
                  triggerThumbnailUpload={triggerThumbnailUpload}
                  uploadThumbnailFile={uploadThumbnailFile}
                  thumbnailUploadError={thumbnailUploadError}
                  handleRemoveTrailer={handleRemoveTrailer}
                  bannerUpload={
                    <CourseBannerUpload
                      courseId={currentCourseId}
                      disabled={!isDownstreamUnlocked || isBasicsSaving}
                      serverBannerMediaId={editorData?.course.bannerMediaId}
                      serverBannerUrl={editorData?.course.bannerUrl}
                      flushBasicsPersistence={flushBasicsPersistence}
                      saveBannerMediaId={saveBannerMediaId}
                      hero={{
                        title: courseTitle,
                        shortDescription,
                        sections: totalSections,
                        lessons: totalLessons,
                        duration: computedDuration,
                        thumbnail,
                      }}
                    />
                  }
                  LessonVideoUpload={LessonVideoUpload}
                  editorData={editorData}
                  handleTrailerMediaAttached={handleTrailerMediaAttached}
                  refetchEditor={refetchEditor}
                  totalSections={totalSections}
                  totalLessons={totalLessons}
                  computedDuration={computedDuration}
                  DiscussionMarkdown={DiscussionMarkdown}
                />
              ) : panelStep === "curriculum" ? (
                <CurriculumStepPanel
                  editingLessonTarget={editingLessonTarget}
                  sections={sections}
                  editorData={editorData}
                  courseTitle={courseTitle}
                  savingLessonId={savingLessonId}
                  setEditingLessonTarget={setEditingLessonTarget}
                  handleCancelLessonDraft={handleCancelLessonDraft}
                  handleUpdateLesson={handleUpdateLesson}
                  persistLesson={persistLesson}
                  setToastMessage={setToastMessage}
                  handleDeleteLesson={handleDeleteLesson}
                  currentCourseId={currentCourseId}
                  handleLessonMediaAttached={handleLessonMediaAttached}
                  handleLessonProcessingComplete={
                    handleLessonProcessingComplete
                  }
                  handleCreateLessonResource={handleCreateLessonResource}
                  handleLessonResourceAdded={handleLessonResourceAdded}
                  handleDeleteLessonResource={handleDeleteLessonResource}
                  handleLessonResourceRemoved={handleLessonResourceRemoved}
                  QuizAuthoringPanel={QuizAuthoringPanel}
                  isReorderingSections={isReorderingSections}
                  reorderSectionsMutation={reorderSectionsMutation}
                  isCreatingSection={isCreatingSection}
                  createSectionMutation={createSectionMutation}
                  createCourseMutation={createCourseMutation}
                  handleAddSection={handleAddSection}
                  deletingSectionId={deletingSectionId}
                  draggedSectionIndex={draggedSectionIndex}
                  dragEnabledSectionId={dragEnabledSectionId}
                  updatingSectionId={updatingSectionId}
                  handleSectionDragStart={handleSectionDragStart}
                  handleSectionDragOver={handleSectionDragOver}
                  handleSectionDragEnd={handleSectionDragEnd}
                  sectionHeaderElementsRef={sectionHeaderElementsRef}
                  handleToggleSectionExpand={handleToggleSectionExpand}
                  setDragEnabledSectionId={setDragEnabledSectionId}
                  handleSaveSectionTitle={handleSaveSectionTitle}
                  handleStartEditSectionTitle={handleStartEditSectionTitle}
                  reorderingLessonsSectionId={reorderingLessonsSectionId}
                  getCurriculumItemDisplayStatus={
                    getCurriculumItemDisplayStatus
                  }
                  handleDeleteSection={handleDeleteSection}
                  getCurriculumLessonKey={getCurriculumLessonKey}
                  pinnedVirtualizedLessonIds={pinnedVirtualizedLessonIds}
                  draggedLessonState={draggedLessonState}
                  lessonDropTarget={lessonDropTarget}
                  dragEnabledLessonId={dragEnabledLessonId}
                  deletingLessonId={deletingLessonId}
                  reorderLessonsMutation={reorderLessonsMutation}
                  createLessonResourceMutation={createLessonResourceMutation}
                  deleteLessonResourceMutation={deleteLessonResourceMutation}
                  mountedLessonEditorIds={mountedLessonEditorIds}
                  requestedSectionId={requestedSectionId}
                  requestedLessonId={requestedLessonId}
                  rememberLessonEditor={rememberLessonEditor}
                  handleToggleLessonExpand={handleToggleLessonExpand}
                  navigateToCurriculumFocus={navigateToCurriculumFocus}
                  handleLessonDragStart={handleLessonDragStart}
                  handleLessonDragOver={handleLessonDragOver}
                  handleLessonDragEnd={handleLessonDragEnd}
                  setDragEnabledLessonId={setDragEnabledLessonId}
                  handleLessonTitleBlur={handleLessonTitleBlur}
                  handleCancelEditLessonTitle={handleCancelEditLessonTitle}
                  handleStartEditLessonTitle={handleStartEditLessonTitle}
                  handleCancelLessonDescriptionEdit={
                    handleCancelLessonDescriptionEdit
                  }
                  handleLessonFieldBlur={handleLessonFieldBlur}
                  handleLessonDiscreteChange={handleLessonDiscreteChange}
                  LessonVideoUpload={LessonVideoUpload}
                  creatingLessonSectionId={creatingLessonSectionId}
                  createLessonMutation={createLessonMutation}
                  handleAddLesson={handleAddLesson}
                />
              ) : panelStep === "access-rules" ? (
                <AccessRulesStepPanel
                  getAccessControlDisplayStatus={getAccessControlDisplayStatus}
                  isAccessRulesSaving={isAccessRulesSaving}
                  savingAccessControls={savingAccessControls}
                  accessRules={accessRules}
                  handleAccessTypeChange={handleAccessTypeChange}
                  handleDurationModeChange={handleDurationModeChange}
                  handleFixedDurationValueChange={
                    handleFixedDurationValueChange
                  }
                  flushFixedDurationPersistence={flushFixedDurationPersistence}
                  handleFixedDurationUnitChange={handleFixedDurationUnitChange}
                  handleToggleQA={handleToggleQA}
                  handleToggleComments={handleToggleComments}
                  handleToggleNotes={handleToggleNotes}
                >
                  <PluginCourseEditorSections
                    step="access-rules"
                    courseId={currentCourseId}
                    courseSlug={editorData?.course.slug}
                    notify={setToastMessage}
                  />
                </AccessRulesStepPanel>
              ) : panelStep === "pricing" ? (
                <PricingStepPanel
                  pricingValidationError={pricingValidationError}
                  getPricingControlDisplayStatus={
                    getPricingControlDisplayStatus
                  }
                  pricing={pricing}
                  handleCurrencyChange={handleCurrencyChange}
                  currencyOptions={currencyOptions}
                  isSavingPricing={isSavingPricing}
                  isPricingControlSaving={isPricingControlSaving}
                  handleSellingPriceChange={handleSellingPriceChange}
                  flushPricingPersistence={flushPricingPersistence}
                  handleOriginalPriceChange={handleOriginalPriceChange}
                  handleShowDiscountBadgeChange={handleShowDiscountBadgeChange}
                  handleLinkedOnlyChange={handleLinkedOnlyChange}
                  currentCourseId={currentCourseId}
                  navigateToStep={navigateToStep}
                  onNavigatePage={onNavigatePage}
                />
              ) : panelStep === "extras" ? (
                <ExtrasStepPanel
                  getExtrasControlDisplayStatus={getExtrasControlDisplayStatus}
                  extras={extras}
                  isSavingCertificate={isSavingCertificate}
                  handleToggleCertificate={handleToggleCertificate}
                  handleCertificateTemplateChange={
                    handleCertificateTemplateChange
                  }
                  handleToggleAutoEmailCertificate={
                    handleToggleAutoEmailCertificate
                  }
                  totalSections={totalSections}
                  totalLessons={totalLessons}
                  computedDuration={computedDuration}
                  isReorderingIncludes={isReorderingIncludes}
                  reorderIncludesMutation={reorderIncludesMutation}
                  extrasControlStatus={extrasControlStatus}
                  manualIncludesDraft={manualIncludesDraft}
                  isExtrasSaving={isExtrasSaving}
                  deletingIncludeIds={deletingIncludeIds}
                  savingIncludeIds={savingIncludeIds}
                  dragEnabledInclusionId={dragEnabledInclusionId}
                  handleInclusionDragStart={handleInclusionDragStart}
                  handleInclusionDragOver={handleInclusionDragOver}
                  handleInclusionDragEnd={handleInclusionDragEnd}
                  setDragEnabledInclusionId={setDragEnabledInclusionId}
                  handleManualInclusionBlur={handleManualInclusionBlur}
                  handleUpdateManualInclusionText={
                    handleUpdateManualInclusionText
                  }
                  handleUpdateManualInclusionDetail={
                    handleUpdateManualInclusionDetail
                  }
                  handleSetInclusionStyle={handleSetInclusionStyle}
                  handleDeleteManualInclusion={handleDeleteManualInclusion}
                  handleAddManualInclusion={handleAddManualInclusion}
                >
                  <PluginCourseEditorSections
                    step="extras"
                    courseId={currentCourseId}
                    courseSlug={editorData?.course.slug}
                    notify={setToastMessage}
                  />
                </ExtrasStepPanel>
              ) : panelStep === "publish" ? (
                <PublishStepPanel
                  isPublished={isPublished}
                  publishSettings={publishSettings}
                  setPublishSettings={setPublishSettings}
                  validationChecklistItems={validationChecklistItems}
                  getChecklistState={getChecklistState}
                  serverValidation={serverValidation}
                  expandedValidationArea={expandedValidationArea}
                  setExpandedValidationArea={setExpandedValidationArea}
                  isCourseReadyToPublish={isCourseReadyToPublish}
                />
              ) : (
                <div className="relative z-10 grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)] gap-6 items-start max-[768px]:gap-4.5 w-full min-w-0">
                  <section className="relative z-10 rounded-[14px] p-6 bg-(--surface) shadow-(--card-shadow) max-[768px]:p-4">
                    <div className="mb-4.5">
                      <h2 className="m-0 text-(--text) text-[1.18rem] font-[650] tracking-[-0.015em]">
                        {WIZARD_STEPS.find((s) => s.id === panelStep)?.label}
                      </h2>
                      <p className="m-0 mt-1 mb-5 text-(--muted) text-[0.82rem]">
                        This section will allow configuring course {panelStep}.
                      </p>
                    </div>
                  </section>
                </div>
              )
            }
          </SwipeableTabPanel>
        </Suspense>
      )}

      {/* Sticky Bottom Action Bar (Desktop / Tablet) */}
      <CourseEditorFooter
        activeStep={activeStep}
        isPublished={isPublished}
        isAnyApiInProgress={isAnyApiInProgress}
        isPreviewLoading={isPreviewLoading}
        handlePreviewAction={handlePreviewAction}
        basicsOverallStatus={basicsOverallStatus}
        curriculumOverallStatus={curriculumOverallStatus}
        accessRulesOverallStatus={accessRulesOverallStatus}
        pricingOverallStatus={pricingOverallStatus}
        extrasOverallStatus={extrasOverallStatus}
        publishOverallStatus={publishOverallStatus}
        actionLoading={actionLoading}
        previousStepId={previousStepId}
        navigateToStep={navigateToStep}
        handleValidateCourseAction={handleValidateCourseAction}
        isValidating={isValidating}
        isDownstreamUnlocked={isDownstreamUnlocked}
        nextStepId={nextStepId}
        setIsUnpublishModalOpen={setIsUnpublishModalOpen}
        isCourseReadyToPublish={isCourseReadyToPublish}
        handleFinalPublishCourse={handleFinalPublishCourse}
      />

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Basics only, above mobile bar) */}
      <CourseEditorMobileStepStatus
        activeStep={activeStep}
        basicsOverallStatus={basicsOverallStatus}
        bottomNavHidden={bottomNavHidden}
        curriculumOverallStatus={curriculumOverallStatus}
        accessRulesOverallStatus={accessRulesOverallStatus}
        pricingOverallStatus={pricingOverallStatus}
        extrasOverallStatus={extrasOverallStatus}
        publishOverallStatus={publishOverallStatus}
      />

      {/* Mobile Sticky / Fixed Bottom Action Bar */}
      <CourseEditorMobileActionBar
        bottomNavHidden={bottomNavHidden}
        isPreviewModalOpen={isPreviewModalOpen}
        isAddCategoryModalOpen={isAddCategoryModalOpen}
        categoryToDelete={categoryToDelete}
        activeStep={activeStep}
        isPublished={isPublished}
        isAnyApiInProgress={isAnyApiInProgress}
        isPreviewLoading={isPreviewLoading}
        handlePreviewAction={handlePreviewAction}
        actionLoading={actionLoading}
        previousStepId={previousStepId}
        navigateToStep={navigateToStep}
        handleValidateCourseAction={handleValidateCourseAction}
        isValidating={isValidating}
        isDownstreamUnlocked={isDownstreamUnlocked}
        nextStepId={nextStepId}
        setIsUnpublishModalOpen={setIsUnpublishModalOpen}
        isCourseReadyToPublish={isCourseReadyToPublish}
        handleFinalPublishCourse={handleFinalPublishCourse}
      />

      {/* Floating Action Feedback Toast */}
      {toastMessage && (
        <ToastNotification
          message={toastMessage}
          type="success"
          onDismiss={() => setToastMessage(null)}
        />
      )}
      {/* Reusable Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModalState.isOpen}
        title={deleteModalState.title}
        message={deleteModalState.message}
        onConfirm={deleteModalState.onConfirm}
        onClose={() =>
          setDeleteModalState((prev) => ({ ...prev, isOpen: false }))
        }
      />

      {/* Realistic Student-Facing Course Overview Full Preview Modal */}
      {isPreviewModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <CoursePreviewModal
            setIsPreviewModalOpen={setIsPreviewModalOpen}
            hasUnsavedChanges={hasUnsavedChanges}
            currentCourseId={currentCourseId}
            activePreviewData={activePreviewData}
            serverCategories={serverCategories}
            isPreviewLoading={isPreviewLoading}
            isPreviewError={isPreviewError}
            refetchPreview={refetchPreview}
          />,
          document.body,
        )}

      {/* Manage Categories Modal */}
      {isAddCategoryModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <CourseCategoriesModal
            handleCloseAddCategoryModal={handleCloseAddCategoryModal}
            handleCreateCategory={handleCreateCategory}
            newCategoryName={newCategoryName}
            setNewCategoryName={setNewCategoryName}
            addCategoryError={addCategoryError}
            setAddCategoryError={setAddCategoryError}
            createCategoryMutation={createCategoryMutation}
            serverCategories={serverCategories}
            isLoadingCategories={isLoadingCategories}
            setCategoryToDelete={setCategoryToDelete}
            deleteCategoryMutation={deleteCategoryMutation}
          />,
          document.body,
        )}

      {/* Delete Category Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={Boolean(categoryToDelete)}
        title="Delete Category"
        message={`Are you sure you want to delete the category "${categoryToDelete?.name}"? This action will remove it from available course categories.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteCategory}
        onClose={() => setCategoryToDelete(null)}
      />

      {/* Unpublish Course Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={isUnpublishModalOpen}
        title="Unpublish Course"
        message="Are you sure you want to unpublish this course? It will return to Draft state and be hidden from the catalogue. Enrolled students will also lose access to it until you publish it again. Course content, curriculum, and settings are kept."
        confirmLabel="Unpublish"
        cancelLabel="Keep Published"
        onConfirm={handleConfirmUnpublishCourse}
        onClose={() => setIsUnpublishModalOpen(false)}
      />
    </div>
  );
}
