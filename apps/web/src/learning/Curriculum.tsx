import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import { DEFAULT_DEBOUNCE_DELAY_MS, useDebounce } from "../hooks/useDebounce";
import { ExpandableSearch } from "../ExpandableSearch";
import { CourseThumbnailPlaceholder } from "../courses/CourseThumbnailPlaceholder";
import { ContextMenu, ContextMenuTrigger } from "../components/ui/context-menu";
import { ElasticScroller } from "../components/elastic-scroller";
import type { ElasticScrollerHandle } from "../components/elastic-scroller";
import { CurriculumSectionActionsMenuContent } from "./CurriculumSectionActionsMenu";
import { getInitialCurriculumExpandedSections } from "./curriculumExpandedSections";
import {
  lessonsById as defaultLessonsById,
  sections as defaultSections,
} from "./courseContent";
import type { CourseSection, Lesson } from "./courseContent";
import {
  isStoredBoolean,
  isStoredString,
  useSessionStorageState,
} from "./useSessionStorageState";
import type { LessonDrawerHeroControlProps } from "./useLessonDrawerHeroControl";
import { CurriculumLessonRows } from "./CurriculumLessonRows";
import { useCurriculumLayoutRevision } from "./useCurriculumLayoutRevision";

const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;
const EMPTY_LESSON_PROGRESS: Readonly<Record<number, number>> = {};

interface CurriculumProps {
  selectedLesson: number;
  sections?: readonly CourseSection[];
  lessonsById?: ReadonlyMap<number, Lesson>;
  lessonProgress?: Readonly<Record<number, number>>;
  onSelectLesson: (lessonNumber: number) => void;
  onOpenCourseOverview?: () => void;
  courseNavigationActionLabel?: string;
  courseTitle: string;
  courseThumbnail?: string;
  onClose?: () => void;
  onLessonSearchOpen?: () => void;
  focusRequest?: number;
  topRequest?: number;
  persistenceKey: string;
  isLessonAvailable?: (lessonNumber: number) => boolean;
  isLoading?: boolean;
  scrollportId?: string;
  scrollportRef?: RefObject<HTMLElement | null>;
  scrollControlBottomClearance?: number | string;
  drawerHeroControlProps?: LessonDrawerHeroControlProps;
  hideHero?: boolean;
  expandAllSections?: boolean;
  expandedSectionIds?: readonly number[];
  onExpandedSectionIdsChange?: (sectionIds: readonly number[]) => void;
}

export function Curriculum({
  selectedLesson,
  sections = defaultSections,
  lessonsById = defaultLessonsById,
  lessonProgress = EMPTY_LESSON_PROGRESS,
  onSelectLesson,
  onOpenCourseOverview,
  courseNavigationActionLabel,
  courseTitle,
  courseThumbnail = "",
  onClose,
  onLessonSearchOpen,
  focusRequest = 0,
  topRequest = 0,
  persistenceKey,
  isLessonAvailable,
  isLoading = false,
  scrollportId,
  scrollportRef,
  scrollControlBottomClearance,
  drawerHeroControlProps,
  hideHero = false,
  expandAllSections = false,
  expandedSectionIds: controlledExpandedSectionIds,
  onExpandedSectionIdsChange,
}: CurriculumProps) {
  const sectionIds = sections.map(({ id }) => id);
  const isExpandedControlled = controlledExpandedSectionIds !== undefined;
  const [uncontrolledExpandedSectionIds, setUncontrolledExpandedSectionIds] =
    useState<number[]>(() =>
      getInitialCurriculumExpandedSections(sections, selectedLesson, {
        expandAllSections,
        hideHero,
      }),
    );
  const expanded =
    controlledExpandedSectionIds ?? uncontrolledExpandedSectionIds;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const setExpanded = useCallback(
    (
      value:
        readonly number[] | ((current: readonly number[]) => readonly number[]),
    ) => {
      const resolveNext = (current: readonly number[]) =>
        typeof value === "function" ? value(current) : value;
      if (onExpandedSectionIdsChange) {
        onExpandedSectionIdsChange(resolveNext(expandedRef.current));
        return;
      }
      setUncontrolledExpandedSectionIds((current) => [...resolveNext(current)]);
    },
    [onExpandedSectionIdsChange],
  );
  const storageBase = `veolms-learning-${persistenceKey}-curriculum`;
  const [lessonSearch, setLessonSearch] = useSessionStorageState(
    `${storageBase}-search`,
    "",
    isStoredString,
  );
  const [searchOpen, setSearchOpen] = useSessionStorageState(
    `${storageBase}-search-open`,
    false,
    isStoredBoolean,
  );
  const debouncedLessonSearch = useDebounce(
    lessonSearch,
    DEFAULT_DEBOUNCE_DELAY_MS,
  );
  const activeLessonSearch = searchOpen ? debouncedLessonSearch : "";
  const lessonSearchInputId = `learning-curriculum-search-${useId().replaceAll(":", "")}`;
  const activeLessonRef = useRef<HTMLButtonElement>(null);
  const currentSectionRef = useRef<HTMLElement>(null);
  const lessonListRef = useRef<HTMLDivElement>(null);
  const layoutRevision = useCurriculumLayoutRevision(lessonListRef);
  const curriculumRef = useRef<HTMLElement>(null);
  const contextMenuPortalHostRef = useRef<HTMLElement | null>(null);
  const scrollControlRef = useRef<ElasticScrollerHandle>(null);
  const handledFocusRequestRef = useRef(0);
  const handledTopRequestRef = useRef(0);
  const fallbackLesson: Lesson = [selectedLesson || 1, "", "", "todo"];
  const currentSection = useMemo(
    () =>
      sections.find((section) =>
        section.lessons.some(([number]) => number === selectedLesson),
      ) ||
      sections[0] ||
      { id: 0, title: "", progress: "", lessons: [] },
    [sections, selectedLesson],
  );
  const currentLesson =
    lessonsById?.get(selectedLesson) || lessonsById?.get(1) || fallbackLesson;
  useEffect(() => {
    if (expandAllSections || !hideHero || isExpandedControlled) return;
    if (
      expandedRef.current.length === 1 &&
      expandedRef.current[0] === currentSection.id
    ) {
      return;
    }
    setExpanded([currentSection.id]);
  }, [
    currentSection.id,
    expandAllSections,
    hideHero,
    isExpandedControlled,
    selectedLesson,
    setExpanded,
  ]);

  const setCurriculumScrollport = useCallback(
    (node: HTMLElement | null) => {
      curriculumRef.current = node;
      contextMenuPortalHostRef.current =
        node?.closest<HTMLElement>(".video-shell") ?? null;
      if (scrollportRef) scrollportRef.current = node;
    },
    [scrollportRef],
  );

  const { courseProgress, completedLessonsBySection } = useMemo(() => {
    let lessonCount = 0;
    let totalProgress = 0;
    const completedLessonsBySection = new Map<number, number>();

    for (const section of sections) {
      let completedLessons = 0;
      for (const [number, , , status] of section.lessons) {
        const storedProgress = lessonProgress[number];
        const progress =
          typeof storedProgress === "number"
            ? Math.max(0, Math.min(100, storedProgress))
            : status === "done"
              ? 100
              : 0;
        totalProgress += progress;
        lessonCount += 1;
        if (progress >= LESSON_PROGRESS_COMPLETE_THRESHOLD) {
          completedLessons += 1;
        }
      }
      completedLessonsBySection.set(section.id, completedLessons);
    }

    return {
      courseProgress:
        lessonCount > 0 ? Math.round(totalProgress / lessonCount) : 0,
      completedLessonsBySection,
    };
  }, [lessonProgress, sections]);
  const searchableSections = useMemo(() => {
    const query = activeLessonSearch.toLowerCase();
    return sections
      .map((section) => {
        const matchingLessons = query
          ? section.lessons.filter((lesson) =>
              lesson[1].toLowerCase().includes(query),
            )
          : section.lessons;
        return {
          section,
          matchingLessons,
          sectionMatches: Boolean(query && section.title.toLowerCase().includes(query)),
        };
      })
      .filter(
        ({ matchingLessons, sectionMatches }) =>
          !query || sectionMatches || matchingLessons.length > 0,
      );
  }, [activeLessonSearch, sections]);
  const scrollItemToTop = (element: HTMLElement | null) => {
    const curriculum = element?.closest<HTMLElement>(".learning-curriculum");
    if (!element || !curriculum) return;

    const itemTop =
      element.getBoundingClientRect().top -
      curriculum.getBoundingClientRect().top +
      curriculum.scrollTop;

    if (typeof curriculum.scrollTo === "function") {
      curriculum.scrollTo({
        top: itemTop,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    } else {
      curriculum.scrollTop = itemTop;
    }
  };

  const revealAndScrollTo = (
    target: "section" | "chapter",
    sectionId: number,
  ) => {
    setSearchOpen(false);
    setExpanded((current) =>
      current.includes(sectionId) ? current : [...current, sectionId],
    );

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const targetElement =
          target === "section"
            ? currentSectionRef.current
            : activeLessonRef.current;
        const curriculum = targetElement?.closest<HTMLElement>(
          ".learning-curriculum",
        );
        const lessonList = lessonListRef.current;
        if (!targetElement || !curriculum || !lessonList) return;

        const targetTop =
          targetElement.getBoundingClientRect().top -
          curriculum.getBoundingClientRect().top +
          curriculum.scrollTop;
        const currentRevealSpace = Number.parseFloat(
          lessonList.dataset.revealSpace || "0",
        );
        const maximumScrollWithoutRevealSpace = Math.max(
          0,
          curriculum.scrollHeight -
            currentRevealSpace -
            curriculum.clientHeight,
        );
        const nextRevealSpace = Math.ceil(
          Math.max(0, targetTop - maximumScrollWithoutRevealSpace) + 4,
        );

        if (nextRevealSpace !== currentRevealSpace) {
          lessonList.dataset.revealSpace = String(nextRevealSpace);
          lessonList.style.setProperty(
            "--curriculum-reveal-space",
            `${nextRevealSpace}px`,
          );
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => scrollItemToTop(targetElement));
          });
          return;
        }

        scrollItemToTop(targetElement);
      });
    });
  };

  const openLessonSearch = useCallback(() => {
    onLessonSearchOpen?.();
    scrollControlRef.current?.scrollToStart();
    setSearchOpen(true);
  }, [onLessonSearchOpen, setSearchOpen]);

  const handleLessonSearchOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        if (!searchOpen) openLessonSearch();
        return;
      }
      setSearchOpen(false);
    },
    [openLessonSearch, searchOpen, setSearchOpen],
  );

  useEffect(() => {
    const lessonList = lessonListRef.current;
    if (!lessonList) return;
    lessonList.dataset.revealSpace = "0";
    lessonList.style.setProperty("--curriculum-reveal-space", "0px");
  }, [selectedLesson]);

  const toggleSection = (id: number) => {
    setExpanded((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  useEffect(() => {
    if (!focusRequest || focusRequest === handledFocusRequestRef.current)
      return undefined;

    handledFocusRequestRef.current = focusRequest;
    setExpanded((current) =>
      current.includes(currentSection.id)
        ? current
        : [...current, currentSection.id],
    );

    let firstFrame: number;
    let secondFrame: number | undefined;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        scrollItemToTop(activeLessonRef.current);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [focusRequest, currentSection.id, setExpanded]);

  useEffect(() => {
    if (!topRequest || topRequest === handledTopRequestRef.current)
      return undefined;

    handledTopRequestRef.current = topRequest;
    setSearchOpen(false);

    let firstFrame: number;
    let secondFrame: number | undefined;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        scrollControlRef.current?.scrollToStart();
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [setSearchOpen, topRequest]);

  useEffect(() => {
    if (!hideHero) return undefined;

    let firstFrame: number;
    let secondFrame: number | undefined;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const targetElement = currentSectionRef.current;
        const curriculum = targetElement?.closest<HTMLElement>(
          ".learning-curriculum",
        );
        const lessonList = lessonListRef.current;
        if (!targetElement || !curriculum) return;

        if (lessonList) {
          const targetTop =
            targetElement.getBoundingClientRect().top -
            curriculum.getBoundingClientRect().top +
            curriculum.scrollTop;
          const currentRevealSpace = Number.parseFloat(
            lessonList.dataset.revealSpace || "0",
          );
          const maximumScrollWithoutRevealSpace = Math.max(
            0,
            curriculum.scrollHeight -
              currentRevealSpace -
              curriculum.clientHeight,
          );
          const nextRevealSpace = Math.ceil(
            Math.max(0, targetTop - maximumScrollWithoutRevealSpace) + 4,
          );

          if (nextRevealSpace !== currentRevealSpace) {
            lessonList.dataset.revealSpace = String(nextRevealSpace);
            lessonList.style.setProperty(
              "--curriculum-reveal-space",
              `${nextRevealSpace}px`,
            );
          }
        }

        scrollItemToTop(targetElement);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [hideHero, currentSection.id]);

  return (
    <ContextMenu>
      <aside
        ref={setCurriculumScrollport}
        id={scrollportId}
        className={`learning-curriculum ${hideHero ? "learning-curriculum--compact" : ""}`}
        aria-label="Course curriculum"
      >
        <ElasticScroller
          ref={scrollControlRef}
          scrollportRef={curriculumRef}
          ariaControls={scrollportId}
          scrollAreaLabel="Curriculum"
          contentRevision={`${selectedLesson}:${activeLessonSearch}:${expanded.join(",")}`}
          bottomClearance={scrollControlBottomClearance}
        />
        {!hideHero ? (
          <ContextMenuTrigger
            render={
              <div
                {...drawerHeroControlProps}
                className="learning-curriculum__hero"
              />
            }
          >
            {courseThumbnail ? (
              <img
                src={courseThumbnail}
                alt=""
                className="learning-curriculum__cover"
              />
            ) : (
              <div className="learning-curriculum__cover overflow-hidden">
                <CourseThumbnailPlaceholder />
              </div>
            )}
            <div className="learning-curriculum__shade" aria-hidden="true" />
            <button
              type="button"
              className="learning-curriculum__overview-link"
              aria-label={
                searchOpen
                  ? "Close lesson search"
                  : (courseNavigationActionLabel ??
                    `View course overview for ${courseTitle}`)
              }
              title={
                searchOpen
                  ? "Close search"
                  : (courseNavigationActionLabel ?? "View")
              }
              onClick={() => {
                if (searchOpen) {
                  setSearchOpen(false);
                  return;
                }
                onOpenCourseOverview?.();
              }}
            />
            <header className="learning-curriculum__overview">
              <div className="learning-curriculum__overview-content">
                <div className="learning-curriculum__title-row @container">
                  <ExpandableSearch
                    inputId={lessonSearchInputId}
                    label="Search lessons"
                    placeholder="Search lessons..."
                    value={lessonSearch}
                    onValueChange={setLessonSearch}
                    open={searchOpen}
                    onOpenChange={handleLessonSearchOpenChange}
                    overlay
                    shortcutPriority
                    backLabel="Back from lesson search"
                    triggerClassName="learning-curriculum__search-trigger rounded-full"
                    triggerIconSize={21.375}
                    backButtonClassName="learning-curriculum__search-trigger rounded-full"
                  >
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[clamp(1rem,4.25cqi,1.1875rem)]">
                        {courseTitle}
                      </h2>
                    </div>
                  </ExpandableSearch>
                </div>
              </div>
            </header>

            <div className="learning-curriculum__sticky-meta">
              <div className="learning-curriculum__progress-copy">
                <span>Progress</span>
                <strong>{courseProgress}%</strong>
              </div>
              <div
                className="learning-curriculum__progress-track"
                role="progressbar"
                aria-label={`Course progress: ${courseProgress} percent`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={courseProgress}
              >
                <span style={{ width: `${courseProgress}%` }} />
              </div>
              <div
                className="learning-curriculum__current"
                aria-label="Current lesson location"
              >
                <button
                  type="button"
                  className="learning-curriculum__current-action"
                  aria-label={`Go to current section, Section ${currentSection.id}: ${currentSection.title}`}
                  title={`Go to Section ${currentSection.id}: ${currentSection.title}`}
                  onClick={() => {
                    if (searchOpen) {
                      setSearchOpen(false);
                      return;
                    }
                    revealAndScrollTo("section", currentSection.id);
                  }}
                >
                  <span
                    className="learning-curriculum__current-key"
                    aria-hidden="true"
                  >
                    S{currentSection.id}:
                  </span>
                  <span className="learning-curriculum__current-label">
                    {currentSection.title}
                  </span>
                </button>
                <button
                  type="button"
                  className="learning-curriculum__current-action"
                  aria-label={`Go to current chapter, Chapter ${selectedLesson}: ${currentLesson[1]}`}
                  title={`Go to Chapter ${selectedLesson}: ${currentLesson[1]}`}
                  onClick={() => {
                    if (searchOpen) {
                      setSearchOpen(false);
                      return;
                    }
                    revealAndScrollTo("chapter", currentSection.id);
                  }}
                >
                  <span
                    className="learning-curriculum__current-key"
                    aria-hidden="true"
                  >
                    L{selectedLesson}:
                  </span>
                  <span className="learning-curriculum__current-label">
                    {currentLesson[1]}
                  </span>
                </button>
              </div>
            </div>
          </ContextMenuTrigger>
        ) : null}

        <div ref={lessonListRef} className="learning-curriculum__lesson-list">
          {isLoading ? (
            <div
              className="p-3 space-y-4 animate-pulse"
              data-testid="curriculum-loading-skeleton"
              aria-label="Loading curriculum"
            >
              {[1, 2, 3].map((sectionIndex) => (
                <div key={sectionIndex} className="space-y-2.5">
                  <div className="flex items-center justify-between py-2 px-1">
                    <div className="h-4 w-36 rounded bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
                    <div className="h-3.5 w-8 rounded bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
                  </div>
                  <div className="space-y-1.5 pl-6">
                    <div className="h-7 w-4/5 rounded bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
                    <div className="h-7 w-3/5 rounded bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            searchableSections.map(({ section, matchingLessons }) => {
              const completedLessons =
                completedLessonsBySection.get(section.id) ?? 0;
              const sectionProgress = `${completedLessons}/${section.lessons.length}`;
              const isOpen =
                expanded.includes(section.id) ||
                Boolean(activeLessonSearch && matchingLessons.length > 0);
              return (
                <section
                  key={section.id}
                  ref={
                    section.id === currentSection.id
                      ? currentSectionRef
                      : undefined
                  }
                  className="learning-curriculum__section relative after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-(--learning-panel-border) after:content-['']"
                  data-expanded={isOpen}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={isOpen}
                    className="learning-curriculum__section-toggle"
                  >
                    <span
                      className={`learning-curriculum__section-arrow${isOpen ? " is-open" : ""}`}
                      aria-hidden="true"
                    >
                      <CaretDown size={17} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      Section {section.id}: {section.title}
                    </span>
                    <span className="learning-curriculum__section-progress">
                      {sectionProgress}
                    </span>
                  </button>
                  {matchingLessons.length > 0 && (
                    <div
                      className={`learning-curriculum__section-lessons ${isOpen ? "is-open" : ""}`}
                      aria-hidden={!isOpen ? true : undefined}
                      inert={!isOpen ? true : undefined}
                    >
                      <div className="learning-curriculum__section-lessons-inner">
                        {isOpen ? (
                          <CurriculumLessonRows
                            sectionId={section.id}
                            sectionTitle={section.title}
                            lessons={matchingLessons}
                            selectedLesson={selectedLesson}
                            lessonProgress={lessonProgress}
                            onSelectLesson={onSelectLesson}
                            isLessonAvailable={isLessonAvailable}
                            onClose={onClose}
                            activeLessonRef={activeLessonRef}
                            scrollportRef={curriculumRef}
                            layoutRevision={layoutRevision}
                          />
                        ) : null}
                      </div>
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </aside>

      <CurriculumSectionActionsMenuContent
        sectionIds={sectionIds}
        expandedSectionIds={expanded}
        onExpandAllSections={() => setExpanded(sectionIds)}
        onCollapseAllSections={() => setExpanded([])}
        onOpenCourseOverview={onOpenCourseOverview}
        portalContainer={contextMenuPortalHostRef}
      />
    </ContextMenu>
  );
}
