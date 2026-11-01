import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  type NavigateFunction,
} from "react-router";
import { getCourseEditorPath } from "../../courseEditorRouting";
import {
  getNumberShortcutIndex,
  isEditingShortcutTarget,
} from "../../../keyboardShortcuts";
import {
  type CourseWizardStepId,
  type WizardStepDefinition,
  WIZARD_STEPS,
  WIZARD_STEP_IDS,
  COURSE_WIZARD_ARROW_KEY_OWNER_SELECTOR,
  getAdjacentWizardSteps,
  parseWizardTab,
} from "../wizardSteps";

export interface UseWizardNavigationStateArgs {
  propCourseId: string | undefined;
  propEditCourseId: string | undefined;
}

export interface UseWizardNavigationStateResult {
  navigate: NavigateFunction;
  routeEditTab: string | undefined;
  searchParams: URLSearchParams;
  activeEditId: string | null;
  requestedSectionId: string | null;
  requestedLessonId: string | null;
  activeStep: CourseWizardStepId;
  setActiveStep: Dispatch<SetStateAction<CourseWizardStepId>>;
  pendingWizardNavigationRef: RefObject<CourseWizardStepId | null>;
  mountedTabs: Set<CourseWizardStepId>;
  setMountedTabs: Dispatch<SetStateAction<Set<CourseWizardStepId>>>;
  tabRefs: RefObject<{ [key: string]: HTMLButtonElement | null }>;
  stepsNavRef: RefObject<HTMLElement | null>;
  mountedLessonEditorIds: string[];
  editingLessonTarget: { sectionId: string; lessonId: string } | null;
  setEditingLessonTarget: Dispatch<
    SetStateAction<{ sectionId: string; lessonId: string } | null>
  >;
  rememberLessonEditor: (lessonId: string) => void;
  navigateToStepRef: RefObject<
    (destination: CourseWizardStepId) => Promise<void>
  >;
  handleNavMouseDown: (e: React.MouseEvent) => void;
  handleNavMouseLeave: () => void;
  handleNavMouseUp: () => void;
  handleNavMouseMove: (e: React.MouseEvent) => void;
}

export function useWizardNavigationState({
  propCourseId,
  propEditCourseId,
}: UseWizardNavigationStateArgs): UseWizardNavigationStateResult {
  const location = useLocation();
  const navigate = useNavigate();
  const { courseId: routeCourseId, editTab: routeEditTab } = useParams<{
    courseId?: string;
    editTab?: string;
  }>();
  const searchParams = useMemo(
    () => new URLSearchParams(location?.search ?? ""),
    [location?.search],
  );
  const activeEditId =
    propCourseId ||
    propEditCourseId ||
    routeCourseId ||
    searchParams.get("edit") ||
    searchParams.get("courseId") ||
    null;

  const requestedSectionId = searchParams.get("sectionId");
  const requestedLessonId = searchParams.get("lessonId");
  const routeRequestedStep =
    parseWizardTab(routeEditTab) ||
    parseWizardTab(searchParams.get("tab")) ||
    parseWizardTab(searchParams.get("step"));
  const initialStep = routeRequestedStep || "basics";
  const editorRouteIdentity = `${activeEditId || "create"}:${routeRequestedStep || "basics"}`;
  const [activeStep, setActiveStep] = useState<CourseWizardStepId>(initialStep);
  const pendingWizardNavigationRef = useRef<CourseWizardStepId | null>(null);
  const [slideDirection, setSlideDirection] = useState<"right" | "left">(
    "right",
  );
  // Keep the active wizard panel and its immediate neighbors warm for smooth
  // tab navigation. Heavy lesson editors are mounted only when opened below.
  const [mountedTabs, setMountedTabs] = useState<Set<CourseWizardStepId>>(() =>
    getAdjacentWizardSteps(initialStep),
  );

  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const stepsNavRef = useRef<HTMLElement | null>(null);
  const [mountedLessonEditorIds, setMountedLessonEditorIds] = useState<
    string[]
  >([]);
  const [editingLessonTarget, setEditingLessonTarget] = useState<{
    sectionId: string;
    lessonId: string;
  } | null>(null);
  const previousEditorRouteIdentityRef = useRef(editorRouteIdentity);

  // Automatically reset lesson editor if navigating away from curriculum step
  useEffect(() => {
    if (activeStep !== "curriculum") {
      setEditingLessonTarget(null);
    }
  }, [activeStep]);

  useEffect(() => {
    setMountedLessonEditorIds([]);
  }, [activeEditId]);

  const rememberLessonEditor = useCallback((lessonId: string) => {
    setMountedLessonEditorIds((previous) => {
      const next = [
        ...previous.filter((mountedLessonId) => mountedLessonId !== lessonId),
        lessonId,
      ];
      return next.slice(-3);
    });
  }, []);

  const navigateToStepRef = useRef<
    (destination: CourseWizardStepId) => Promise<void>
  >((async () => {}) as any);
  const [isNavMouseDown, setIsNavMouseDown] = useState(false);
  const [navStartX, setNavStartX] = useState(0);
  const [navScrollLeft, setNavScrollLeft] = useState(0);

  const handleNavMouseDown = (e: React.MouseEvent) => {
    if (!stepsNavRef.current) return;
    setIsNavMouseDown(true);
    setNavStartX(e.pageX - stepsNavRef.current.offsetLeft);
    setNavScrollLeft(stepsNavRef.current.scrollLeft);
  };

  const handleNavMouseLeave = () => {
    setIsNavMouseDown(false);
  };

  const handleNavMouseUp = () => {
    setIsNavMouseDown(false);
  };

  const handleNavMouseMove = (e: React.MouseEvent) => {
    if (!isNavMouseDown || !stepsNavRef.current) return;
    e.preventDefault();
    const x = e.pageX - stepsNavRef.current.offsetLeft;
    const walk = (x - navStartX) * 1.5;
    stepsNavRef.current.scrollLeft = navScrollLeft - walk;
  };

  useEffect(() => {
    const updateIndicator = () => {
      const activeEl = tabRefs.current[activeStep];
      if (!activeEl) return;
      const nav = stepsNavRef.current;
      if (nav) {
        const style = getComputedStyle(activeEl);
        const indicatorToken = style
          .getPropertyValue("--page-tab-active-indicator")
          .trim();
        const toneToken = style.getPropertyValue("--page-tab-tone").trim();
        const color =
          indicatorToken.includes("--page-tab-tone") ||
          indicatorToken === "var(--page-tab-tone)"
            ? toneToken
            : indicatorToken || "var(--accent)";

        nav.style.setProperty(
          "--page-tab-indicator-left",
          `${activeEl.offsetLeft}px`,
        );
        nav.style.setProperty(
          "--page-tab-indicator-width",
          `${activeEl.offsetWidth}px`,
        );
        nav.style.setProperty("--page-tab-indicator-color", color);

        const navWidth = nav.offsetWidth;
        const elLeft = activeEl.offsetLeft;
        const elWidth = activeEl.offsetWidth;
        if (
          elLeft < nav.scrollLeft ||
          elLeft + elWidth > nav.scrollLeft + navWidth
        ) {
          nav.scrollTo({
            left: elLeft - navWidth / 2 + elWidth / 2,
            behavior: "smooth",
          });
        }
      }
    };
    updateIndicator();
    const rafId = requestAnimationFrame(updateIndicator);
    window.addEventListener("resize", updateIndicator);

    const observer = new MutationObserver(updateIndicator);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        "data-page-tab-colors",
        "data-theme",
        "data-palette",
        "data-sidebar-icon-style",
      ],
    });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateIndicator);
      observer.disconnect();
    };
  }, [activeStep]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.courseWizardActive = "true";
    }
    return () => {
      if (typeof document !== "undefined") {
        delete document.documentElement.dataset.courseWizardActive;
      }
    };
  }, []);

  useEffect(() => {
    const scrollport = document.getElementById("courses-main-scrollport");
    if (scrollport) {
      scrollport.scrollTop = 0;
    }
    const tabContent = document.getElementById("course-wizard-tab-panel");
    if (tabContent) {
      tabContent.scrollTop = 0;
    }
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, [activeStep]);

  useEffect(() => {
    setMountedTabs(getAdjacentWizardSteps(activeStep));
  }, [activeStep]);

  useEffect(() => {
    const navigateWizardTab = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditingShortcutTarget(event.target))
        return;

      let destination: WizardStepDefinition | undefined;
      if (event.altKey) {
        const index = getNumberShortcutIndex(event);
        destination = index === null ? undefined : WIZARD_STEPS[index];
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !(
          event.target instanceof Element &&
          event.target.closest(COURSE_WIZARD_ARROW_KEY_OWNER_SELECTOR)
        )
      ) {
        const offset = event.key === "ArrowRight" ? 1 : -1;
        const currentIndex = WIZARD_STEP_IDS.indexOf(activeStep);
        const nextIndex =
          (currentIndex + offset + WIZARD_STEPS.length) % WIZARD_STEPS.length;
        destination = WIZARD_STEPS[nextIndex];
      }

      if (!destination) return;
      event.preventDefault();
      void navigateToStepRef.current(destination.id);
    };

    document.addEventListener("keydown", navigateWizardTab);
    return () => document.removeEventListener("keydown", navigateWizardTab);
  }, [activeStep]);

  // Keep the URL as the canonical source for the active editor step. Legacy
  // query-string URLs are replaced with the same route structure used by new
  // create and edit links.
  useEffect(() => {
    const canonicalPath = getCourseEditorPath({
      mode: activeEditId ? "edit" : "create",
      courseId: activeEditId,
      step: activeStep,
      sectionId: activeStep === "curriculum" ? requestedSectionId : null,
      lessonId: activeStep === "curriculum" ? requestedLessonId : null,
    });
    const currentPath = `${location.pathname}${location.search}`;
    if (currentPath === canonicalPath) return;

    // Let the route-to-state effect below settle when the user navigates to a
    // different course or enters the editor through a different tab URL.
    if (previousEditorRouteIdentityRef.current !== editorRouteIdentity) {
      return;
    }

    const hasLegacyQueryParams =
      searchParams.has("edit") ||
      searchParams.has("courseId") ||
      searchParams.has("tab") ||
      searchParams.has("step");
    const shouldReplace =
      location.pathname === "/courses/create" || hasLegacyQueryParams;
    void navigate(canonicalPath, { replace: shouldReplace });
  }, [
    activeEditId,
    activeStep,
    editorRouteIdentity,
    location.pathname,
    location.search,
    navigate,
    requestedLessonId,
    requestedSectionId,
    searchParams,
  ]);

  useEffect(() => {
    if (previousEditorRouteIdentityRef.current === editorRouteIdentity) {
      return;
    }
    previousEditorRouteIdentityRef.current = editorRouteIdentity;
    setActiveStep(initialStep);
    setEditingLessonTarget(null);
  }, [editorRouteIdentity, initialStep]);
  return {
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
  };
}
