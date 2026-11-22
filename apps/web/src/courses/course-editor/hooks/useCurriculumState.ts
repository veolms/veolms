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
  requestedLessonId: string | null;
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
  lessonElementsRef: RefObject<Map<string, HTMLDivElement>>;
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
  requestedLessonId,
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
  const lessonElementsRef = useRef(new Map<string, HTMLDivElement>());
  const pendingAddedSectionScrollRef = useRef<string | null>(null);
  const lastSectionScrollRequestRef = useRef<string | null>(null);
  const lastLessonScrollRequestRef = useRef<string | null>(null);
  const sectionScrollDelayRef = useRef(300);
  const lessonTitleDraftsRef = useRef<Map<string, string>>(new Map());

  const getWizardScrollport = (
    element: HTMLElement | null,
  ): HTMLElement | null => {
    if (typeof document === "undefined") return null;
    const tabContent = document.getElementById("course-wizard-tab-panel");
    if (tabContent) return tabContent;
    for (
      let parent = element?.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      const overflowY = window.getComputedStyle(parent).overflowY;
      if (
        overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay"
      ) {
        return parent;
      }
    }
    return null;
  };

  const scrollSectionHeaderIntoView = useCallback((sectionId: string) => {
    const header =
      sectionHeaderElementsRef.current.get(sectionId) ||
      (typeof document !== "undefined"
        ? (document.getElementById(
            `section-header-${sectionId}`,
          ) as HTMLDivElement | null) ||
          document.querySelector<HTMLDivElement>(
            `[data-section-id="${sectionId}"]`,
          )
        : null);
    if (!header || typeof window === "undefined") return false;
    if (header.clientHeight === 0) return false;

    const scrollport = getWizardScrollport(header);
    if (!scrollport) return false;
    if (scrollport.scrollHeight <= scrollport.clientHeight + 1) return false;

    const headerRect = header.getBoundingClientRect();
    const scrollportRect = scrollport.getBoundingClientRect();
    const relativeTop = headerRect.top - scrollportRect.top;

    const isAlreadyInView =
      relativeTop >= 10 && relativeTop <= scrollportRect.height - 80;
    if (isAlreadyInView && scrollport.scrollTop > 0) {
      return true;
    }

    const top = scrollport.scrollTop + relativeTop - 20;
    scrollport.scrollTop = Math.max(0, top);

    const newRelativeTop =
      header.getBoundingClientRect().top - scrollportRect.top;
    return Math.abs(newRelativeTop - 20) <= 6;
  }, []);

  const scrollLessonIntoView = useCallback((lessonId: string) => {
    const lessonEl =
      lessonElementsRef.current.get(lessonId) ||
      (typeof document !== "undefined"
        ? (document.getElementById(
            `lesson-card-${lessonId}`,
          ) as HTMLDivElement | null) ||
          document.querySelector<HTMLDivElement>(
            `[data-lesson-id="${lessonId}"]`,
          )
        : null);
    if (!lessonEl || typeof window === "undefined") {
      console.log("[SCROLL-DEBUG] lessonEl not found for", lessonId);
      return false;
    }
    if (lessonEl.clientHeight === 0) {
      console.log("[SCROLL-DEBUG] lessonEl clientHeight is 0");
      return false;
    }

    const scrollport = getWizardScrollport(lessonEl);
    if (!scrollport) {
      console.log("[SCROLL-DEBUG] scrollport not found");
      return false;
    }
    if (scrollport.scrollHeight <= scrollport.clientHeight + 1) {
      console.log(
        "[SCROLL-DEBUG] scrollport not scrollable yet",
        scrollport.scrollHeight,
        scrollport.clientHeight,
      );
      return false;
    }

    const lessonRect = lessonEl.getBoundingClientRect();
    const scrollportRect = scrollport.getBoundingClientRect();
    const relativeTop = lessonRect.top - scrollportRect.top;

    const isComfortablyInView =
      relativeTop >= 10 && relativeTop <= scrollportRect.height - 80;
    if (isComfortablyInView && scrollport.scrollTop > 0) {
      return true;
    }

    const top = scrollport.scrollTop + relativeTop - 20;
    scrollport.scrollTop = Math.max(0, top);

    const newRelativeTop =
      lessonEl.getBoundingClientRect().top - scrollportRect.top;
    return Math.abs(newRelativeTop - 20) <= 6;
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
    if (
      activeStep !== "curriculum" ||
      (!requestedSectionId && !requestedLessonId)
    ) {
      return;
    }

    setSections((previous) => {
      if (previous.length === 0) return previous;
      const targetSectionId =
        requestedSectionId ||
        (requestedLessonId
          ? previous.find((s) =>
              s.lessons.some((l) => l.id === requestedLessonId),
            )?.id
          : null);
      if (!targetSectionId) return previous;

      let changed = false;
      const next = previous.map((section) => {
        if (section.id !== targetSectionId) {
          return section;
        }
        const sectionNeedsExpand = !section.isExpanded;
        const lessonNeedsExpand = requestedLessonId
          ? section.lessons.some(
              (l) => l.id === requestedLessonId && !l.isExpanded,
            )
          : false;

        if (!sectionNeedsExpand && !lessonNeedsExpand) {
          return section;
        }
        changed = true;
        return {
          ...section,
          isExpanded: true,
          lessons: requestedLessonId
            ? section.lessons.map((l) =>
                l.id === requestedLessonId ? { ...l, isExpanded: true } : l,
              )
            : section.lessons,
        };
      });

      if (changed) {
        sectionsRef.current = next;
        return next;
      }
      return previous;
    });
  }, [activeStep, requestedSectionId, requestedLessonId, sections.length]);

  useEffect(() => {
    if (activeStep !== "curriculum" || !requestedLessonId) {
      lastLessonScrollRequestRef.current = null;
      return;
    }
    const requestKey = `${activeEditId ?? "create"}:${requestedLessonId}`;
    if (lastLessonScrollRequestRef.current === requestKey) return;

    let retryTimer = 0;
    let attempts = 0;
    const tryScrollToRequestedLesson = () => {
      if (scrollLessonIntoView(requestedLessonId)) {
        lastLessonScrollRequestRef.current = requestKey;
      } else if (attempts++ < 35) {
        retryTimer = window.setTimeout(tryScrollToRequestedLesson, 50);
      }
    };
    const timeout = window.setTimeout(tryScrollToRequestedLesson, 50);

    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(retryTimer);
    };
  }, [
    activeEditId,
    activeStep,
    requestedLessonId,
    scrollLessonIntoView,
    sections,
  ]);

  useEffect(() => {
    if (
      activeStep !== "curriculum" ||
      !requestedSectionId ||
      requestedLessonId
    ) {
      lastSectionScrollRequestRef.current = null;
      sectionScrollDelayRef.current = 300;
      return;
    }
    const requestKey = `${activeEditId ?? "create"}:${requestedSectionId}`;
    if (lastSectionScrollRequestRef.current === requestKey) return;

    const delay = sectionScrollDelayRef.current;
    let retryTimer = 0;
    let attempts = 0;
    const tryScrollToRequestedSection = () => {
      if (scrollSectionHeaderIntoView(requestedSectionId)) {
        lastSectionScrollRequestRef.current = requestKey;
      } else if (attempts++ < 30) {
        retryTimer = window.setTimeout(tryScrollToRequestedSection, 50);
      }
    };
    const timeout = window.setTimeout(tryScrollToRequestedSection, delay);

    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(retryTimer);
    };
  }, [
    activeEditId,
    activeStep,
    requestedSectionId,
    requestedLessonId,
    scrollSectionHeaderIntoView,
    sections,
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
    lessonElementsRef,
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
