import { ArrowsInLineVerticalIcon as ArrowsInLineVertical } from "@phosphor-icons/react/ArrowsInLineVertical";
import { ArrowsOutLineVerticalIcon as ArrowsOutLineVertical } from "@phosphor-icons/react/ArrowsOutLineVertical";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CircleIcon as Circle } from "@phosphor-icons/react/Circle";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { ExpandableSearch } from "../ExpandableSearch";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../components/ui/context-menu";
import { ElasticScroller } from "../components/elastic-scroller";
import type { ElasticScrollerHandle } from "../components/elastic-scroller";
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

const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;

interface CurriculumProps {
  selectedLesson: number;
  sections?: readonly CourseSection[];
  lessonsById?: ReadonlyMap<number, Lesson>;
  lessonProgress?: Readonly<Record<number, number>>;
  onSelectLesson: (lessonNumber: number) => void;
  onOpenCourseOverview: () => void;
  courseTitle: string;
  courseThumbnail: string;
  onClose?: () => void;
  onLessonSearchOpen?: () => void;
  focusRequest?: number;
  topRequest?: number;
  persistenceKey: string;
  isLessonAvailable?: (lessonNumber: number) => boolean;
  scrollportId?: string;
  scrollportRef?: RefObject<HTMLElement | null>;
  scrollControlBottomClearance?: number | string;
  drawerHeroControlProps?: LessonDrawerHeroControlProps;
}

export function Curriculum({
  selectedLesson,
  sections = defaultSections,
  lessonsById = defaultLessonsById,
  lessonProgress = {},
  onSelectLesson,
  onOpenCourseOverview,
  courseTitle,
  courseThumbnail,
  onClose,
  onLessonSearchOpen,
  focusRequest = 0,
  topRequest = 0,
  persistenceKey,
  isLessonAvailable,
  scrollportId,
  scrollportRef,
  scrollControlBottomClearance,
  drawerHeroControlProps,
}: CurriculumProps) {
  const [expanded, setExpanded] = useState<number[]>([1, 2]);
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
  const activeLessonSearch = searchOpen ? lessonSearch : "";
  const lessonSearchInputId = `learning-curriculum-search-${useId().replaceAll(":", "")}`;
  const activeLessonRef = useRef<HTMLButtonElement>(null);
  const currentSectionRef = useRef<HTMLElement>(null);
  const lessonListRef = useRef<HTMLDivElement>(null);
  const curriculumRef = useRef<HTMLElement>(null);
  const contextMenuPortalHostRef = useRef<HTMLElement | null>(null);
  const scrollControlRef = useRef<ElasticScrollerHandle>(null);
  const handledFocusRequestRef = useRef(0);
  const handledTopRequestRef = useRef(0);
  const currentSection =
    sections.find((section) =>
      section.lessons.some(([number]) => number === selectedLesson),
    ) || sections[0]!;
  const currentLesson = lessonsById.get(selectedLesson) || lessonsById.get(1)!;
  const courseProgress = 52;
  const sectionIds = sections.map(({ id }) => id);
  const expandedSectionCount = sectionIds.reduce(
    (count, id) => count + (expanded.includes(id) ? 1 : 0),
    0,
  );
  const allSectionsExpanded = expandedSectionCount === sectionIds.length;
  const allSectionsCollapsed = expandedSectionCount === 0;

  const setCurriculumScrollport = useCallback(
    (node: HTMLElement | null) => {
      curriculumRef.current = node;
      contextMenuPortalHostRef.current =
        node?.closest<HTMLElement>(".video-shell") ?? null;
      if (scrollportRef) scrollportRef.current = node;
    },
    [scrollportRef],
  );

  const getLessonProgress = (number: number, status: string) => {
    const storedProgress = lessonProgress[number];
    if (typeof storedProgress === "number")
      return Math.max(0, Math.min(100, storedProgress));
    if (status === "done") return 100;
    if (status === "active") return 52;
    return 0;
  };

  const scrollItemToTop = (element: HTMLElement | null) => {
    const curriculum = element?.closest<HTMLElement>(".learning-curriculum");
    if (!element || !curriculum) return;

    const itemTop =
      element.getBoundingClientRect().top -
      curriculum.getBoundingClientRect().top +
      curriculum.scrollTop;

    curriculum.scrollTo({
      top: itemTop,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
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
  }, [focusRequest, currentSection.id]);

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

  return (
    <ContextMenu>
      <aside
        ref={setCurriculumScrollport}
        id={scrollportId}
        className="learning-curriculum"
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
        <ContextMenuTrigger
          render={
            <div
              {...drawerHeroControlProps}
              className="learning-curriculum__hero"
            />
          }
        >
          <img
            src={courseThumbnail}
            alt=""
            className="learning-curriculum__cover"
          />
          <div className="learning-curriculum__shade" aria-hidden="true" />
          <button
            type="button"
            className="learning-curriculum__overview-link"
            aria-label={
              searchOpen
                ? "Close lesson search"
                : `View course overview for ${courseTitle}`
            }
            title={searchOpen ? "Close search" : "View"}
            onClick={() => {
              if (searchOpen) {
                setSearchOpen(false);
                return;
              }
              onOpenCourseOverview();
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

        <div ref={lessonListRef} className="learning-curriculum__lesson-list">
          {sections.map((section) => {
            const matchingLessons = section.lessons.filter((lesson) =>
              lesson[1]
                .toLowerCase()
                .includes(activeLessonSearch.toLowerCase()),
            );
            const isOpen =
              expanded.includes(section.id) ||
              Boolean(activeLessonSearch && matchingLessons.length > 0);
            if (
              activeLessonSearch &&
              !section.title
                .toLowerCase()
                .includes(activeLessonSearch.toLowerCase()) &&
              matchingLessons.length === 0
            )
              return null;
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
                    {section.progress}
                  </span>
                </button>
                {matchingLessons.length > 0 && (
                  <div
                    className={`learning-curriculum__section-lessons ${isOpen ? "is-open" : ""}`}
                    aria-hidden={!isOpen ? true : undefined}
                    inert={!isOpen ? true : undefined}
                  >
                    <div className="learning-curriculum__section-lessons-inner">
                      {matchingLessons.map(
                        ([number, title, duration, status]) => {
                          const active = selectedLesson === number;
                          const available = isLessonAvailable?.(number) ?? true;
                          const progress = getLessonProgress(number, status);
                          const completed =
                            status === "done" ||
                            progress >= LESSON_PROGRESS_COMPLETE_THRESHOLD;
                          const showProgress = active || progress > 0;
                          return (
                            <button
                              type="button"
                              key={number}
                              ref={active ? activeLessonRef : undefined}
                              disabled={!available}
                              title={
                                available
                                  ? undefined
                                  : "Log in to watch this lecture"
                              }
                              aria-label={
                                available
                                  ? undefined
                                  : `${title} (log in to watch)`
                              }
                              onClick={() => {
                                if (!available) return;
                                onSelectLesson(number);
                                onClose?.();
                              }}
                              className={`learning-curriculum__lesson ${active ? "is-active" : ""} ${!available ? "cursor-not-allowed opacity-50" : ""}`}
                            >
                              {completed ? (
                                <span
                                  className="learning-curriculum__lesson-status"
                                  aria-label="Completed"
                                >
                                  <Check size={12} weight="bold" />
                                </span>
                              ) : showProgress ? (
                                <span
                                  className="learning-curriculum__lesson-progress"
                                  role="progressbar"
                                  aria-label={`Lecture ${number} progress`}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={Math.round(progress)}
                                  aria-valuetext={`${Math.round(progress)}% watched`}
                                >
                                  <svg viewBox="0 0 20 20" aria-hidden="true">
                                    <circle
                                      className="learning-curriculum__lesson-progress-track"
                                      cx="10"
                                      cy="10"
                                      r="8"
                                    />
                                    <circle
                                      className="learning-curriculum__lesson-progress-value"
                                      cx="10"
                                      cy="10"
                                      r="8"
                                      pathLength="100"
                                      strokeDasharray="100"
                                      strokeDashoffset={100 - progress}
                                    />
                                  </svg>
                                </span>
                              ) : (
                                <Circle
                                  size={20}
                                  className="learning-curriculum__lesson-status learning-curriculum__lesson-status--todo"
                                />
                              )}
                              <span className="learning-curriculum__lesson-number">
                                {number}.
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {title}
                              </span>
                              <span className="learning-curriculum__lesson-duration">
                                {duration}
                              </span>
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </aside>

      <ContextMenuContent
        aria-label="Course curriculum actions"
        className="w-max min-w-0"
        portalContainer={contextMenuPortalHostRef}
      >
        <ContextMenuGroup>
          {!allSectionsExpanded && (
            <ContextMenuItem onClick={() => setExpanded(sectionIds)}>
              <ArrowsOutLineVertical aria-hidden="true" />
              Expand all sections
            </ContextMenuItem>
          )}
          {!allSectionsCollapsed && (
            <ContextMenuItem onClick={() => setExpanded([])}>
              <ArrowsInLineVertical aria-hidden="true" />
              Collapse all sections
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={onOpenCourseOverview}>
            <Eye aria-hidden />
            View course overview
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
