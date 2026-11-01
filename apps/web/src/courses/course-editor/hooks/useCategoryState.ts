import {
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { useCategories } from "../../../services/courses";
import { EMPTY_CATEGORIES } from "../basicsState";
import { type CourseWizardStepId, parseWizardTab } from "../wizardSteps";

export interface UseCategoryStateArgs {
  routeEditTab: string | undefined;
  searchParams: URLSearchParams;
  activeEditId: string | null;
  activeStep: CourseWizardStepId;
  setActiveStep: Dispatch<SetStateAction<CourseWizardStepId>>;
  pendingWizardNavigationRef: RefObject<CourseWizardStepId | null>;
  courseTitle: string;
  currentCourseId: string | null;
  currentCourseIdRef: RefObject<string | null>;
}

export interface UseCategoryStateResult {
  isAddCategoryModalOpen: boolean;
  setIsAddCategoryModalOpen: Dispatch<SetStateAction<boolean>>;
  isPreviewModalOpen: boolean;
  setIsPreviewModalOpen: Dispatch<SetStateAction<boolean>>;
  newCategoryName: string;
  setNewCategoryName: Dispatch<SetStateAction<string>>;
  addCategoryError: string;
  setAddCategoryError: Dispatch<SetStateAction<string>>;
  categoryToDelete: { id: string; name: string } | null;
  setCategoryToDelete: Dispatch<
    SetStateAction<{ id: string; name: string } | null>
  >;
  isEditing: boolean;
  isInitialCurriculumBootstrapInProgress: boolean;
  setIsInitialCurriculumBootstrapInProgress: Dispatch<SetStateAction<boolean>>;
  isInitialCurriculumBootstrapInProgressRef: RefObject<boolean>;
  isDownstreamUnlocked: boolean;
  titleInputRef: RefObject<HTMLInputElement | null>;
  showTitleTooltip: boolean;
  setShowTitleTooltip: Dispatch<SetStateAction<boolean>>;
  serverCategories: { id: string; name: string; slug: string }[];
  isLoadingCategories: boolean;
}

export function useCategoryState({
  routeEditTab,
  searchParams,
  activeEditId,
  activeStep,
  setActiveStep,
  pendingWizardNavigationRef,
  courseTitle,
  currentCourseId,
  currentCourseIdRef,
}: UseCategoryStateArgs): UseCategoryStateResult {
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addCategoryError, setAddCategoryError] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const isEditing = Boolean(activeEditId);
  const isCourseTitleFilled = Boolean(courseTitle.trim());
  const [
    isInitialCurriculumBootstrapInProgress,
    setIsInitialCurriculumBootstrapInProgress,
  ] = useState(false);
  const isInitialCurriculumBootstrapInProgressRef = useRef(false);
  isInitialCurriculumBootstrapInProgressRef.current =
    isInitialCurriculumBootstrapInProgress;

  // Downstream tabs and fields are unlocked ONLY after a confirmed server-side
  // course ID exists AND initial curriculum bootstrap (Introduction section + lesson) has completed.
  const isDownstreamUnlocked =
    Boolean(currentCourseId) && !isInitialCurriculumBootstrapInProgress;

  useEffect(() => {
    currentCourseIdRef.current = currentCourseId;
  }, [currentCourseId]);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const [showTitleTooltip, setShowTitleTooltip] = useState(false);

  useEffect(() => {
    if (!currentCourseId && !isCourseTitleFilled && activeStep === "basics") {
      titleInputRef.current?.focus();
    }
  }, [currentCourseId, isCourseTitleFilled, activeStep]);

  // Keep state synced if URL params change (e.g. popstate / back-forward navigation)
  useEffect(() => {
    const tabFromUrl =
      parseWizardTab(routeEditTab) ||
      parseWizardTab(searchParams.get("tab")) ||
      parseWizardTab(searchParams.get("step"));
    const pendingWizardNavigation = pendingWizardNavigationRef.current;
    if (pendingWizardNavigation) {
      if (tabFromUrl === pendingWizardNavigation) {
        pendingWizardNavigationRef.current = null;
      } else {
        return;
      }
    }
    if (
      tabFromUrl &&
      tabFromUrl !== activeStep &&
      (isDownstreamUnlocked || Boolean(activeEditId) || tabFromUrl === "basics")
    ) {
      setActiveStep(tabFromUrl);
    }
  }, [
    searchParams,
    routeEditTab,
    isDownstreamUnlocked,
    activeEditId,
    activeStep,
  ]);

  const {
    data: serverCategories = EMPTY_CATEGORIES,
    isLoading: isLoadingCategories,
  } = useCategories();
  return {
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
  };
}
