import { ArrowsInLineVertical } from "@phosphor-icons/react/ArrowsInLineVertical";
import { ArrowsOutLineVertical } from "@phosphor-icons/react/ArrowsOutLineVertical";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CalendarCheck } from "@phosphor-icons/react/CalendarCheck";
import { Check } from "@phosphor-icons/react/Check";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Eye } from "@phosphor-icons/react/Eye";
import { FileText } from "@phosphor-icons/react/FileText";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { Question } from "@phosphor-icons/react/Question";
import {
  useContext,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { flushSync } from "react-dom";
import type { CourseSection } from "../../learning/courseContent";
import { formatDuration } from "../courseAdapter";
import {
  CurriculumIntentContext,
  useCurriculumIntent,
} from "./curriculumIntent";
import {
  readApplicationScrollPosition,
  scrollApplicationTo,
} from "../../shell/applicationScroll";
import { useContinuousLessonNumbering } from "../../learning/useContinuousLessonNumbering";
import type { LessonOpenIntent } from "../../learning/lessonOpenIntent";
import {
  bandHeaderClasses,
  bandLinkClasses,
  bandTitleClasses,
  overviewCardClasses,
  overviewCardPaddingClasses,
} from "./overviewStyles";

/**
 * A long outline starts with its first sections only and a button for the
 * rest, so the page under it is not a long scroll away. An outline only
 * one longer than that is shown in full: a button for a single section
 * would save nothing.
 */
const SECTIONS_SHOWN_FIRST = 3;
const SECTIONS_SHOWN_IN_FULL = 4;

/**
 * The room a lesson takes, with the gap to the next: a card of one line of
 * title and the line under it (70px), or on a wide screen one 48px line.
 * Used as `--lesson-rows` × these, in the list's classes below.
 */

function parseDurationLabel(label: string): number {
  const hours = Number(label.match(/(\d+)h/)?.[1] ?? 0);
  const minutes = Number(label.match(/(\d+)m/)?.[1] ?? 0);
  return hours * 3600 + minutes * 60;
}

interface CurriculumSectionRowProps {
  section: CourseSection;
  index: number;
  isOpen: boolean;
  /**
   * False when every section was opened or shut at once: two dozen panels
   * growing together lay the whole page out again on every frame, so they
   * change in one step instead.
   */
  animate: boolean;
  onToggle: () => void;
  onSelectLesson?: (lessonNumber: number) => void;
  lessonIntentFor?: LessonIntentFor;
  isReadOnlyPreview?: boolean;
  isPaidCourse?: boolean;
}

/**
 * A lesson row's handlers that ready its lesson ahead of the press (see
 * lessonOpenIntent), or none for a lesson the viewer cannot play.
 */
export type LessonIntentFor = (
  lessonNumber: number,
  isPreview: boolean,
) => LessonOpenIntent["handlers"] | undefined;

/**
 * One section of the outline, a block of its own: a numbered badge, the
 * title with its facts under it, and a round caret. A press opens the
 * section's lessons inside the block, under a hairline; an open block takes
 * a faint accent edge and a trace of the accent in its fill (not a grey:
 * the theme's own colour) so it stands out from the closed ones around it.
 */
function CurriculumSectionRow({
  section,
  index,
  isOpen,
  animate,
  onToggle,
  onSelectLesson,
  lessonIntentFor,
  isReadOnlyPreview = false,
  isPaidCourse = false,
}: CurriculumSectionRowProps) {
  const curriculumIntent = useCurriculumIntent();
  const panelId = `cov-section-panel-${section.id}`;
  const buttonId = `cov-section-toggle-${section.id}`;
  const lessonCount = section.lessons.length;
  const durationSeconds = section.lessons.reduce(
    (total, lesson) => total + parseDurationLabel(lesson[2]),
    0,
  );
  const durationLabel =
    durationSeconds > 0 ? formatDuration(durationSeconds) : "";
  const doneCount = section.lessons.filter(
    (lesson) => lesson[3] === "done",
  ).length;
  const sectionDone = lessonCount > 0 && doneCount === lessonCount;
  // The section opens at once, at its full height, and its lessons are
  // drawn straight after as lower-priority work: the click is answered in
  // the next frame however many sections open with it ("Expand all" opens
  // them all).
  //
  // Every lesson of an open section is in the page: no virtual list, and
  // nothing held back until the section is near the screen. Both left gaps
  // while scrolling, when the page moved faster than the rows could be put
  // back. A course's lessons are single-line rows (hundreds, not tens of
  // thousands), which a browser scrolls without help. What keeps a fully
  // expanded course cheap is `content-visibility` on each section's list
  // (see below): the browser itself skips the layout and painting of the
  // lists that are off screen, and does them, within the same frame, when
  // they come into view.
  const lessonsShown = useDeferredValue(isOpen) && isOpen;
  // The learning page's numbering: every section starts again at 1, or the
  // lessons are numbered straight through the course when the learner has
  // chosen that. A lesson's own number is its place in the course.
  const continuousLessonNumbering = useContinuousLessonNumbering();
  const lessonNumberBase = continuousLessonNumbering
    ? 0
    : (section.lessons[0]?.[0] ?? 1) - 1;

  return (
    <div
      role="listitem"
      data-fixed-radius
      className={`overflow-hidden rounded-2xl border transition-[border-color,background-color] duration-200 ${
        isOpen
          ? "border-[color-mix(in_srgb,var(--accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
          : "border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
      }`}
    >
      <button
        id={buttonId}
        type="button"
        className="group/section flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent px-4 py-4 text-left text-(--text) transition-colors duration-140 hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent) max-[640px]:gap-3 max-[640px]:px-3.5 @xl/curriculum:px-5"
        aria-expanded={isOpen}
        aria-controls={panelId}
        {...curriculumIntent}
        onClick={onToggle}
      >
        {/* The section's number, two figures, on a tinted tile; a done
            section's tile turns green and holds a tick instead. */}
        <span
          aria-hidden="true"
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-[0.92rem] font-bold tabular-nums transition-colors duration-200 max-[640px]:size-10 ${
            sectionDone
              ? "bg-emerald-500/14 text-emerald-500"
              : isOpen
                ? "bg-(--accent) text-(--on-accent,white)"
                : "bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-(--accent-ink,var(--accent))"
          }`}
        >
          {sectionDone ? (
            <Check size={18} weight="bold" />
          ) : (
            String(index + 1).padStart(2, "0")
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 text-[1.02rem] leading-snug font-semibold tracking-[-0.01em]">
            <span className="sr-only">Section {index + 1}: </span>
            {section.title}
          </span>
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.82rem] text-(--muted) tabular-nums">
            <span>
              {lessonCount} lesson{lessonCount === 1 ? "" : "s"}
            </span>
            {durationLabel ? (
              <>
                <span aria-hidden="true" className="opacity-60">
                  ·
                </span>
                <span>{durationLabel}</span>
              </>
            ) : null}
            {sectionDone ? (
              <>
                <span aria-hidden="true" className="opacity-60">
                  ·
                </span>
                <span className="font-medium text-emerald-500">Completed</span>
              </>
            ) : doneCount > 0 ? (
              <>
                <span aria-hidden="true" className="opacity-60">
                  ·
                </span>
                <span className="font-medium text-(--text-secondary,var(--text))">
                  {doneCount}/{lessonCount} done
                </span>
              </>
            ) : null}
          </span>
        </span>

        <span
          className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--muted) transition-[transform,background-color,color] duration-200 ease-out group-hover/section:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover/section:text-(--text) motion-reduce:transition-none ${
            isOpen ? "rotate-180 text-(--text)" : ""
          }`}
          aria-hidden="true"
        >
          <CaretDown size={15} weight="bold" />
        </span>
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        aria-hidden={!isOpen}
        className={`grid motion-reduce:transition-none ${
          animate
            ? "transition-[grid-template-rows,opacity,visibility]"
            : "transition-none"
        } ${
          isOpen
            ? "visible grid-rows-[1fr] opacity-100 duration-220 ease-[cubic-bezier(0.22,1,0.36,1)]"
            : "invisible grid-rows-[0fr] opacity-0 duration-250 ease-[cubic-bezier(0,1,0,1)]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] p-2 max-[640px]:px-1.5 @xl/curriculum:px-3">
            <div
              className="flex min-h-[calc(var(--lesson-rows)*76px)] flex-col gap-1.5 [contain-intrinsic-size:auto_calc(var(--lesson-rows)*76px)] [content-visibility:auto] lg:min-h-[calc(var(--lesson-rows)*54px)] lg:[contain-intrinsic-size:auto_calc(var(--lesson-rows)*54px)]"
              // The lessons' room is held before they are drawn, while the
              // section shuts after they are gone, and while the browser
              // skips the list off screen (`contain-intrinsic-size` is the
              // height it assumes for a list it has not laid out).
              style={{ "--lesson-rows": lessonCount } as CSSProperties}
            >
              {section.lessons.length > 0 ? (
                lessonsShown ? (
                  section.lessons.map(
                    ([
                      number,
                      title,
                      duration,
                      status,
                      isPreview,
                      contentType,
                    ]) => {
                      const isDoc = contentType === "document";
                      const isQuiz = contentType === "quiz";
                      const isDone = status === "done";
                      // What the lesson is: a video, a document or a quiz,
                      // or a tick once it is done. It leads the line under
                      // the title, before the lesson's length.
                      const TypeIcon = isDone
                        ? CheckCircle
                        : isDoc
                          ? FileText
                          : isQuiz
                            ? Question
                            : PlayCircle;
                      const typeLabel = isDoc
                        ? "Document"
                        : isQuiz
                          ? "Quiz"
                          : "Video";
                      return (
                        // A lesson is a small card of its own, as on the
                        // learning page: its title (two lines at most),
                        // and under it what kind of lesson it is, how long
                        // it takes and, on a paid course, whether it is a
                        // free preview. On a wide screen, where such cards
                        // would be long bars, it is one plain line instead
                        // (filled only under the pointer): the kind, the
                        // title, the free tag and the length, in that order;
                        // the line under the title takes itself apart
                        // (`contents`) so its pieces line up in the row.
                        <button
                          type="button"
                          data-fixed-radius
                          className={`group/lesson flex w-full flex-col gap-2 rounded-xl border-0 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-3.5 py-3 text-left transition-colors duration-140 lg:min-h-12 lg:flex-row lg:items-center lg:gap-3 lg:bg-transparent lg:py-2 ${
                            isReadOnlyPreview
                              ? "cursor-default"
                              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] lg:hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:outline-none focus-visible:ring-inset"
                          }`}
                          key={number}
                          disabled={isReadOnlyPreview}
                          // Only a video has anything to ready.
                          {...(isDoc || isQuiz
                            ? undefined
                            : lessonIntentFor?.(number, Boolean(isPreview)))}
                          onClick={() => {
                            if (isReadOnlyPreview) return;
                            onSelectLesson?.(number);
                          }}
                        >
                          <span
                            className={`line-clamp-2 text-[0.92rem] leading-[1.4] font-semibold lg:min-w-0 lg:flex-1 lg:line-clamp-1 ${
                              isDone ? "text-(--muted)" : "text-(--text)"
                            }`}
                          >
                            {/* Numbered as on the learning page. */}
                            {number - lessonNumberBase}. {title}
                          </span>

                          <span className="flex min-h-6 w-full items-center gap-2 text-[0.8rem] font-medium text-(--muted) tabular-nums lg:contents">
                            {/* Filled and coloured by kind: a video in the
                                theme's own colour, a violet document, a
                                sky-blue quiz; green once done. */}
                            <TypeIcon
                              size={17}
                              weight="fill"
                              aria-hidden="true"
                              className={`shrink-0 lg:order-first ${
                                isDone
                                  ? "text-emerald-500"
                                  : isDoc
                                    ? "text-violet-400 [:root[data-theme=light]_&]:text-violet-600"
                                    : isQuiz
                                      ? "text-sky-400 [:root[data-theme=light]_&]:text-sky-600"
                                      : "text-(--accent-ink,var(--accent))"
                              }`}
                            />
                            <span className="sr-only">{typeLabel}, </span>
                            {/* A document with no length says what it is
                                instead. */}
                            {/* On a wide screen the length is a column of
                                its own, as wide for every lesson, so the free
                                tags beside it line up; a document with no
                                length says "Doc" there. */}
                            <span className="lg:order-2 lg:w-12 lg:shrink-0 lg:text-right">
                              {duration || (
                                <>
                                  <span className="lg:hidden">{typeLabel}</span>
                                  <span className="hidden lg:inline">
                                    {isDoc ? "Doc" : typeLabel}
                                  </span>
                                </>
                              )}
                            </span>
                            {isDone ? (
                              <span className="text-emerald-500 lg:order-2">
                                · Done
                              </span>
                            ) : null}

                            {/* Free preview: only on a paid course, for a
                                lesson marked as one. Green, as the saving
                                beside the price is. */}
                            {isPaidCourse && isPreview ? (
                              <span
                                className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--success,#10b981)_14%,transparent)] lg:order-1 px-2.5 py-1 text-[0.72rem] leading-none font-bold text-[color-mix(in_srgb,var(--success,#10b981)_72%,var(--text))]"
                                aria-label="Free preview"
                              >
                                <Eye
                                  size={13}
                                  weight="bold"
                                  aria-hidden="true"
                                />
                                Free
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    },
                  )
                ) : null
              ) : (
                <div className="px-3 py-3 text-[0.86rem] text-(--muted) italic">
                  No lessons added yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CourseOverviewCurriculumProps {
  courseSections: CourseSection[];
  openSections: Set<number>;
  onToggleSection: (index: number) => void;
  /** Opens the first `count` sections (the ones on the page). */
  onExpandAll: (count: number) => void;
  onCollapseAll: () => void;
  onSelectLesson?: (lessonNumber: number) => void;
  /** Readies a lesson while the pointer rests on its row. */
  lessonIntentFor?: LessonIntentFor;
  isReadOnlyPreview?: boolean;
  isPaidCourse?: boolean;
  /** For someone who manages the course: opens the curriculum editor. */
  onEdit?: () => void;
  /** How long the course stays with a learner (see `courseValidityLabel`). */
  validityLabel?: string | null;
  /**
   * How many sections the whole curriculum has, when `courseSections` holds
   * only the first ones (the page was built with those, see
   * `useCoursePageData`).
   */
  totalSections?: number;
  /** Whether `courseSections` holds every section. */
  sectionsComplete?: boolean;
  /** Asks for the sections not yet here. */
  onRequestAllSections?: () => void;
}

export function CourseOverviewCurriculum({
  courseSections,
  openSections,
  onToggleSection,
  onExpandAll,
  onCollapseAll,
  onSelectLesson,
  lessonIntentFor,
  isReadOnlyPreview = false,
  isPaidCourse = false,
  onEdit,
  validityLabel = null,
  totalSections,
  sectionsComplete = true,
  onRequestAllSections,
}: CourseOverviewCurriculumProps) {
  const sectionCount = Math.max(courseSections.length, totalSections ?? 0);
  const curriculumIntent = useCurriculumIntent();
  const prefetchAllSections = useContext(CurriculumIntentContext);
  const showAllButtonRef = useRef<HTMLButtonElement>(null);
  // A phone has no hover: there the rest of the curriculum is fetched as
  // the button comes near the screen, which is where a reader who scrolls
  // that far is heading.
  useEffect(() => {
    const button = showAllButtonRef.current;
    if (!button || !prefetchAllSections) return;
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        prefetchAllSections();
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [prefetchAllSections]);
  // Whether the last change was to every section at once (see `animate`).
  const [changedTogether, setChangedTogether] = useState(false);
  const [showingAllSections, setShowingAllSections] = useState(false);
  const sectionsCut =
    !showingAllSections && sectionCount > SECTIONS_SHOWN_IN_FULL;
  const shownSections = sectionsCut
    ? courseSections.slice(0, SECTIONS_SHOWN_FIRST)
    : courseSections;
  // "Expand all" and "Collapse all" are about the sections on the page:
  // while the outline is cut short, the ones under the button are left
  // as they are.
  const allSectionsExpanded =
    shownSections.length > 0 &&
    shownSections.every((_, index) => openSections.has(index));

  return (
    <section
      className={`@container/curriculum ${overviewCardClasses} ${overviewCardPaddingClasses}`}
      aria-labelledby="cov-curriculum-heading"
      data-fixed-radius
    >
      <div className={`${bandHeaderClasses} flex-nowrap! items-center!`}>
        <div className="min-w-0">
          <h2 id="cov-curriculum-heading" className={bandTitleClasses}>
            Curriculum
          </h2>
          {validityLabel ? (
            <p
              data-course-validity=""
              className="mt-1 inline-flex items-center gap-1.5 text-[0.82rem] text-(--muted)"
            >
              <CalendarCheck size={15} weight="bold" aria-hidden="true" />
              {validityLabel}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-5">
          {onEdit ? (
            <button type="button" className={bandLinkClasses} onClick={onEdit}>
              <PencilSimple size={15} weight="bold" aria-hidden="true" />
              <span>Edit curriculum</span>
            </button>
          ) : null}
          {courseSections.length > 0 ? (
            // An icon that says what a press does: arrows pointing apart
            // to open every section, together to close them. Its name comes
            // up in a tooltip over it on hover or keyboard focus, as the
            // discussion's publishing options do theirs.
            <span className="group/expand relative inline-flex">
              <button
                type="button"
                aria-label={
                  allSectionsExpanded
                    ? "Collapse all sections"
                    : "Expand all sections"
                }
                aria-describedby="cov-curriculum-expand-tip"
                className="peer inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border-0 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-(--accent-ink,var(--accent)) transition-colors duration-140 hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) active:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
                onClick={() => {
                  setChangedTogether(true);
                  if (allSectionsExpanded) onCollapseAll();
                  else onExpandAll(shownSections.length);
                }}
              >
                {allSectionsExpanded ? (
                  <ArrowsInLineVertical
                    size={19}
                    weight="bold"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowsOutLineVertical
                    size={19}
                    weight="bold"
                    aria-hidden="true"
                  />
                )}
              </button>
              <span
                id="cov-curriculum-expand-tip"
                role="tooltip"
                className="pointer-events-none invisible absolute right-0 bottom-[calc(100%+0.375rem)] z-30 w-max translate-y-1 rounded-lg bg-(--surface-elevated,var(--surface)) px-2.5 py-1.5 text-xs leading-4 font-medium text-(--text) opacity-0 shadow-[0_10px_26px_color-mix(in_srgb,var(--canvas)_48%,transparent),inset_0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)] transition-[opacity,transform,visibility] duration-150 group-hover/expand:visible group-hover/expand:translate-y-0 group-hover/expand:opacity-100 peer-focus-visible:visible peer-focus-visible:translate-y-0 peer-focus-visible:opacity-100"
              >
                {allSectionsExpanded ? "Collapse all" : "Expand all"}
              </span>
            </span>
          ) : null}
        </div>
      </div>

      {courseSections.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)] py-10 text-center text-[0.9rem] text-(--muted)">
          No sections added yet
        </div>
      ) : (
        // On a phone the sections run to 1px short of the screen's edges, past
        // the card's own room.
        <div
          className="mt-6 flex flex-col gap-3 max-[640px]:-mx-[15px]"
          role="list"
        >
          {shownSections.map((section, index) => (
            <CurriculumSectionRow
              key={section.id}
              section={section}
              index={index}
              isOpen={openSections.has(index)}
              animate={!changedTogether}
              onToggle={() => {
                setChangedTogether(false);
                onToggleSection(index);
              }}
              onSelectLesson={onSelectLesson}
              lessonIntentFor={lessonIntentFor}
              isReadOnlyPreview={isReadOnlyPreview}
              isPaidCourse={isPaidCourse}
            />
          ))}
        </div>
      )}

      {sectionCount > SECTIONS_SHOWN_IN_FULL ? (
        // The rest of the outline, in one press, and the way back to the
        // first few. The rest comes in under the sections already shown, so
        // nothing on screen moves. Hiding them again keeps this button where
        // it was on the screen: the page is scrolled by as much as the
        // outline shrank, so the reader is not left far down the page.
        <button
          type="button"
          aria-expanded={showingAllSections}
          // On a wide screen it is dressed as a closed section above it: the
          // same faint fill, thin edge (stronger under the pointer) and
          // corners, which the roundness preference leaves alone, as it
          // does the sections'; a little lower. On a phone it is plainer,
          // words only, with no fill or edge until it is pressed, and its
          // press area takes all the room under the last section, down to
          // the card's bottom edge (past the card's own padding there).
          data-fixed-radius
          className="mt-3 flex min-h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-4 text-[0.92rem] font-semibold text-(--accent-ink,var(--accent)) transition-colors duration-140 hover:border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) active:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] max-[640px]:-mx-[15px] max-[640px]:mt-1 max-[640px]:-mb-5 max-[640px]:min-h-16 max-[640px]:w-[calc(100%+30px)] max-[640px]:border-transparent max-[640px]:bg-transparent max-[640px]:active:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
          ref={showAllButtonRef}
          // The rest of the outline is fetched as the reader reaches for
          // this button (see `useCurriculumIntent`), or on the press.
          {...curriculumIntent}
          onClick={(event) => {
            if (!showingAllSections) {
              onRequestAllSections?.();
              setShowingAllSections(true);
              return;
            }
            const button = event.currentTarget;
            const topBefore = button.getBoundingClientRect().top;
            flushSync(() => setShowingAllSections(false));
            const shrunkBy = topBefore - button.getBoundingClientRect().top;
            if (shrunkBy > 0) {
              scrollApplicationTo({
                top: readApplicationScrollPosition().top - shrunkBy,
                behavior: "auto",
              });
            }
          }}
        >
          <span>
            {showingAllSections
              ? sectionsComplete
                ? `Show first ${SECTIONS_SHOWN_FIRST} sections`
                : `Loading all ${sectionCount} sections…`
              : `Show all ${sectionCount} sections`}
          </span>
          <CaretDown
            size={15}
            weight="bold"
            aria-hidden="true"
            className={`transition-transform duration-200 motion-reduce:transition-none ${
              showingAllSections ? "rotate-180" : ""
            }`}
          />
        </button>
      ) : null}
    </section>
  );
}
