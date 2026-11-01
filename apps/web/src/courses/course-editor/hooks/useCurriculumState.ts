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
import ISO6391 from "iso-639-1";
import type { NavigateTo } from "../../../routing/navigation";
import { usePageBeforeEditor } from "../../usePageBeforeEditor";
import type {
  CurriculumLessonItem,
  CurriculumSectionItem,
} from "../curriculumItems";
import type { CourseWizardStepId } from "../wizardSteps";
import { getCurrencyOptions } from "../pricingState";
import { checkIsCurriculumDirty } from "../curriculumDirty";

export interface UseCurriculumStateArgs {
  onNavigatePage: NavigateTo | undefined;
  activeEditId: string | null;
  requestedSectionId: string | null;
  activeStep: CourseWizardStepId;
  isCreatingSection: boolean;
  creatingLessonSectionId: string | null;
  savingLessonId: string | null;
  deletingLessonId: string | null;
  reorderingLessonsSectionId: string | null;
  isReorderingSections: boolean;
  updatingSectionId: string | null;
  deletingSectionId: string | null;
  isSavingCurriculum: boolean;
}

export interface UseCurriculumStateResult {
  currencyOptions: (readonly [
    string,
    string,
    ({ searchKeywords?: string } | undefined)?,
  ])[];
  handleBackToCourses: () => void;
  handleBack: () => void;
  sections: CurriculumSectionItem[];
  setSections: Dispatch<SetStateAction<CurriculumSectionItem[]>>;
  sectionsRef: RefObject<CurriculumSectionItem[]>;
  sectionHeaderElementsRef: RefObject<Map<string, HTMLDivElement>>;
  pendingAddedSectionScrollRef: RefObject<string | null>;
  sectionScrollDelayRef: RefObject<number>;
  lessonTitleDraftsRef: RefObject<Map<string, string>>;
  isCollapsingSectionRef: RefObject<boolean>;
  inFlightLessonSavesRef: RefObject<Map<string, Promise<boolean>>>;
  isSavingAllDirtyLessonsRef: RefObject<boolean>;
  isCurriculumDirty: boolean;
  dragInitialSectionsStateRef: RefObject<{
    sectionIds: string[];
    previousSections: CurriculumSectionItem[];
  } | null>;
  dragInitialLessonStateRef: RefObject<{
    sectionId: string;
    lessonIds: string[];
    previousLessons: CurriculumLessonItem[];
  } | null>;
  setCurriculumSaveFailed: Dispatch<SetStateAction<boolean>>;
  triggerCurriculumSavedBriefly: () => void;
  clearCurriculumItemStatus: (itemId: string) => void;
  markCurriculumItemSaved: (itemId: string) => void;
  markCurriculumItemFailed: (itemId: string) => void;
  getCurriculumItemDisplayStatus: (
    itemId: string,
  ) => "saving" | "saved" | "failed" | null;
  curriculumOverallStatus: "saving" | "saved" | "failed" | null;
}

export function useCurriculumState({
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
}: UseCurriculumStateArgs): UseCurriculumStateResult {
  const languageOptions = useMemo(() => {
    const codes = ISO6391.getAllCodes();
    const options: Array<
      readonly [string, string, { searchKeywords?: string }?]
    > = [["", "Select language"]];
    for (const code of codes) {
      const name = ISO6391.getName(code);
      if (name) {
        options.push([
          code,
          name,
          { searchKeywords: `${code} ${name} ${ISO6391.getNativeName(code)}` },
        ]);
      }
    }
    return options;
  }, []);

  const currencyOptions = useMemo(() => getCurrencyOptions(), []);

  const handleBackToCourses = useCallback(() => {
    if (onNavigatePage) {
      onNavigatePage("courses");
    } else if (typeof window !== "undefined") {
      window.history.back();
    }
  }, [onNavigatePage]);
  const handleBack = usePageBeforeEditor(handleBackToCourses);

  // Curriculum Step state
  const [sections, setSections] = useState<CurriculumSectionItem[]>([]);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const sectionHeaderElementsRef = useRef(new Map<string, HTMLDivElement>());
  const pendingAddedSectionScrollRef = useRef<string | null>(null);
  const lastSectionScrollRequestRef = useRef<string | null>(null);
  const sectionScrollDelayRef = useRef(300);
  const lessonTitleDraftsRef = useRef<Map<string, string>>(new Map());

  const scrollSectionHeaderIntoView = useCallback((sectionId: string) => {
    const header = sectionHeaderElementsRef.current.get(sectionId);
    if (!header || typeof window === "undefined") return false;

    let scrollport: HTMLElement | null = null;
    for (
      let parent = header.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      const overflowY = window.getComputedStyle(parent).overflowY;
      if (
        (overflowY === "auto" ||
          overflowY === "scroll" ||
          overflowY === "overlay") &&
        parent.scrollHeight > parent.clientHeight + 1
      ) {
        scrollport = parent;
        break;
      }
    }

    const headerTop = header.getBoundingClientRect().top;
    if (scrollport) {
      const scrollportTop = scrollport.getBoundingClientRect().top;
      const top = scrollport.scrollTop + headerTop - scrollportTop;
      const previousBehavior = scrollport.style.scrollBehavior;
      scrollport.style.scrollBehavior = "auto";
      scrollport.scrollTo({ top: Math.max(0, top), behavior: "auto" });
      scrollport.style.scrollBehavior = previousBehavior;
      return true;
    }

    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo({
      top: Math.max(0, window.scrollY + headerTop),
      behavior: "auto",
    });
    root.style.scrollBehavior = previousBehavior;
    return true;
  }, []);

  useEffect(() => {
    const sectionId = pendingAddedSectionScrollRef.current;
    if (!sectionId || !sections.some((section) => section.id === sectionId)) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (
        pendingAddedSectionScrollRef.current === sectionId &&
        scrollSectionHeaderIntoView(sectionId)
      ) {
        pendingAddedSectionScrollRef.current = null;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [sections, scrollSectionHeaderIntoView]);

  useEffect(() => {
    if (activeStep !== "curriculum" || !requestedSectionId) {
      lastSectionScrollRequestRef.current = null;
      sectionScrollDelayRef.current = 300;
      return;
    }

    const currentSections = sectionsRef.current;
    const targetIndex = currentSections.findIndex(
      (section) => section.id === requestedSectionId,
    );
    const targetAlreadyExpanded = currentSections.some(
      (section) => section.id === requestedSectionId && section.isExpanded,
    );
    if (targetIndex >= 0 && !targetAlreadyExpanded) {
      sectionScrollDelayRef.current = currentSections.some(
        (section, index) =>
          index < targetIndex &&
          section.id !== requestedSectionId &&
          section.isExpanded,
      )
        ? 300
        : 0;
    } else if (targetIndex < 0) {
      sectionScrollDelayRef.current = 300;
    }

    setSections((previous) => {
      let changed = false;
      const next = previous.map((section) => {
        const shouldExpand = section.id === requestedSectionId;
        if (section.isExpanded === shouldExpand) {
          return section;
        }
        changed = true;
        return { ...section, isExpanded: shouldExpand };
      });
      sectionsRef.current = changed ? next : previous;
      return changed ? next : previous;
    });
  }, [activeStep, requestedSectionId, sections.length]);

  useEffect(() => {
    if (activeStep !== "curriculum" || !requestedSectionId) return;
    const requestKey = `${activeEditId ?? "create"}:${requestedSectionId}`;
    if (lastSectionScrollRequestRef.current === requestKey) return;

    const delay = sectionScrollDelayRef.current;
    let frame = 0;
    let retryTimer = 0;
    let attempts = 0;
    const tryScrollToRequestedSection = () => {
      frame = window.requestAnimationFrame(() => {
        if (scrollSectionHeaderIntoView(requestedSectionId)) {
          lastSectionScrollRequestRef.current = requestKey;
        } else if (attempts++ < 20) {
          retryTimer = window.setTimeout(tryScrollToRequestedSection, 50);
        }
      });
    };
    const timeout = window.setTimeout(tryScrollToRequestedSection, delay);

    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(retryTimer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [
    activeEditId,
    activeStep,
    requestedSectionId,
    scrollSectionHeaderIntoView,
  ]);

  const isCollapsingSectionRef = useRef(false);
  const inFlightLessonSavesRef = useRef<Map<string, Promise<boolean>>>(
    new Map(),
  );
  const isSavingAllDirtyLessonsRef = useRef(false);
  const isCurriculumDirty = useMemo(
    () => checkIsCurriculumDirty(sections),
    [sections],
  );
  const dragInitialSectionsStateRef = useRef<{
    sectionIds: string[];
    previousSections: CurriculumSectionItem[];
  } | null>(null);
  const dragInitialLessonStateRef = useRef<{
    sectionId: string;
    lessonIds: string[];
    previousLessons: CurriculumLessonItem[];
  } | null>(null);

  // Immediate persistence states for Curriculum interactive items
  const [curriculumItemStatus, setCurriculumItemStatus] = useState<
    Record<string, "saved" | "failed" | null>
  >({});
  const curriculumItemTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const [curriculumSaveFailed, setCurriculumSaveFailed] = useState(false);
  const [showCurriculumSavedBriefly, setShowCurriculumSavedBriefly] =
    useState(false);
  const curriculumSavedBrieflyTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const triggerCurriculumSavedBriefly = () => {
    if (curriculumSavedBrieflyTimerRef.current) {
      clearTimeout(curriculumSavedBrieflyTimerRef.current);
    }
    setShowCurriculumSavedBriefly(true);
    curriculumSavedBrieflyTimerRef.current = setTimeout(() => {
      setShowCurriculumSavedBriefly(false);
      curriculumSavedBrieflyTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    // The record is only ever mutated, never replaced: timers added after
    // this point are in it when the cleanup runs.
    const curriculumItemTimers = curriculumItemTimersRef.current;
    return () => {
      Object.values(curriculumItemTimers).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (curriculumSavedBrieflyTimerRef.current) {
        clearTimeout(curriculumSavedBrieflyTimerRef.current);
      }
    };
  }, []);

  const clearCurriculumItemStatus = (itemId: string) => {
    if (curriculumItemTimersRef.current[itemId]) {
      clearTimeout(curriculumItemTimersRef.current[itemId]);
      delete curriculumItemTimersRef.current[itemId];
    }
    setCurriculumItemStatus((prev) => {
      if (!prev[itemId]) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setCurriculumSaveFailed(false);
    if (curriculumSavedBrieflyTimerRef.current) {
      clearTimeout(curriculumSavedBrieflyTimerRef.current);
      curriculumSavedBrieflyTimerRef.current = null;
    }
    setShowCurriculumSavedBriefly(false);
  };

  const markCurriculumItemSaved = (itemId: string) => {
    if (curriculumItemTimersRef.current[itemId]) {
      clearTimeout(curriculumItemTimersRef.current[itemId]);
      delete curriculumItemTimersRef.current[itemId];
    }
    setCurriculumItemStatus((prev) => ({ ...prev, [itemId]: "saved" }));
    setCurriculumSaveFailed(false);
    triggerCurriculumSavedBriefly();

    curriculumItemTimersRef.current[itemId] = setTimeout(() => {
      setCurriculumItemStatus((prev) => {
        if (prev[itemId] !== "saved") return prev;
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      delete curriculumItemTimersRef.current[itemId];
    }, 1500);
  };

  const markCurriculumItemFailed = (itemId: string) => {
    if (curriculumItemTimersRef.current[itemId]) {
      clearTimeout(curriculumItemTimersRef.current[itemId]);
      delete curriculumItemTimersRef.current[itemId];
    }
    setCurriculumItemStatus((prev) => ({ ...prev, [itemId]: "failed" }));
    setCurriculumSaveFailed(true);
    if (curriculumSavedBrieflyTimerRef.current) {
      clearTimeout(curriculumSavedBrieflyTimerRef.current);
      curriculumSavedBrieflyTimerRef.current = null;
    }
    setShowCurriculumSavedBriefly(false);
  };

  const getCurriculumItemDisplayStatus = (
    itemId: string,
  ): "saving" | "saved" | "failed" | null => {
    if (
      updatingSectionId === itemId ||
      savingLessonId === itemId ||
      inFlightLessonSavesRef.current.has(itemId)
    ) {
      return "saving";
    }
    return curriculumItemStatus[itemId] ?? null;
  };

  const isAnyCurriculumSaving =
    isSavingCurriculum ||
    isCreatingSection ||
    updatingSectionId !== null ||
    deletingSectionId !== null ||
    isReorderingSections ||
    creatingLessonSectionId !== null ||
    savingLessonId !== null ||
    deletingLessonId !== null ||
    reorderingLessonsSectionId !== null ||
    inFlightLessonSavesRef.current.size > 0 ||
    sections.some(
      (s) => s.isPendingCreation || s.lessons.some((l) => l.isPendingCreation),
    );

  const hasCurriculumItemFailed =
    curriculumSaveFailed ||
    Object.values(curriculumItemStatus).some((status) => status === "failed");

  const curriculumOverallStatus = useMemo(():
    "saving" | "failed" | "saved" | null => {
    if (isAnyCurriculumSaving) return "saving";
    if (hasCurriculumItemFailed) return "failed";
    if (showCurriculumSavedBriefly) return "saved";
    return null;
  }, [
    isAnyCurriculumSaving,
    hasCurriculumItemFailed,
    showCurriculumSavedBriefly,
  ]);
  return {
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
  };
}
