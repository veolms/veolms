import { OctopusIllustration } from "../components/OctopusIllustration";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ImageIcon as Image } from "@phosphor-icons/react/Image";
import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { PAGE_FULLSCREEN_CHANGE_EVENT } from "@veolms/video-player";
import type { ReactNode, RefObject } from "react";
import type { LessonResource } from "@veolms/contracts";
import { DEFAULT_DEBOUNCE_DELAY_MS, useDebounce } from "../hooks/useDebounce";
import { ExpandableSearch } from "../ExpandableSearch";
import { ContextMenu, ContextMenuTrigger } from "../components/ui/context-menu";
import { ElasticScroller } from "../components/elastic-scroller";
import type { ElasticScrollerHandle } from "../components/elastic-scroller";
import {
  CurriculumActionsMenu,
  CurriculumSectionActionsMenuContent,
} from "./CurriculumSectionActionsMenu";
import { getInitialCurriculumExpandedSections } from "./curriculumExpandedSections";
import { formatTotalLessonDuration } from "./courseContent";
import type { CourseSection, Lesson } from "./courseContent";
import { CurriculumProgressBar } from "./CurriculumProgressBar";

import {
  isStoredBoolean,
  isStoredString,
  useSessionStorageState,
} from "./useSessionStorageState";
import type { LessonDrawerHeroControlProps } from "./useLessonDrawerHeroControl";
import { CurriculumLessonRows } from "./CurriculumLessonRows";
import { useContinuousLessonNumbering } from "./useContinuousLessonNumbering";
import { useLearningPreferenceValue } from "./useLearningPreferenceValue";
import { useStuckSectionHeadings } from "./useStuckSectionHeadings";
import { useCurriculumSectionScrollAnchor } from "./useCurriculumSectionScrollAnchor";
import {
  formatCourseProgress,
  roundCourseProgress,
} from "./courseProgressFormat";

const EMPTY_CURRICULUM_SECTIONS: CourseSection[] = [];
const EMPTY_LESSONS_BY_ID: ReadonlyMap<number, Lesson> = new Map();

const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;
/** The course's percentage while the learner's progress is on its way. */
const PROGRESS_SHIMMER =
  "animate-pulse rounded-[4px] bg-[color-mix(in_srgb,currentColor_24%,transparent)] motion-reduce:animate-none";
/** The bars the header and the list are drawn as while the course loads. */
const SKELETON_BAR =
  "bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]";
/** A faint fill in the text's colour: the panel's own surfaces are tints of it. */
const TINT_4 = "bg-[color-mix(in_srgb,var(--text)_4%,transparent)]";
/**
 * The round buttons at the head of the panel (search, and the ⋯ menu): a
 * 44px press area with a 36px disc inside it. The disc is a pseudo-element
 * behind the glyph, because the shared search keeps its button itself clear
 * (`bg-transparent!`); the ⋯ button is drawn the same way to match.
 */
const HEAD_BUTTON_CLASS =
  "relative isolate flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full! border-0 bg-transparent text-(--text) before:absolute before:inset-1 before:-z-1 before:rounded-full before:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] before:transition-colors before:duration-150 before:content-[''] hover:before:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] active:before:bg-[color-mix(in_srgb,var(--text)_14%,transparent)] data-popup-open:before:bg-[color-mix(in_srgb,var(--text)_14%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)";
/**
 * The two places the learner is at, under the progress: the section and the
 * lesson being played, each a chip that brings its own into view. The chips
 * grow with the bar as it comes to hold (`--bar-stick`, see the bar) into
 * two full buttons: as tall as the bar, square, joined, in a deep shade of
 * the accent, their words moved out to 16px, where the section titles under
 * them begin. Every measure is one calc of `--bar-stick`, so the growth
 * follows the scroll and nothing moves after the bar holds. (The chip's
 * height, radius, padding and fill are those calcs alone: a plain utility
 * for any of them would contend with its calc.)
 */
const JUMP_CHIP_CLASS =
  "group/jump inline-flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-0 [background-color:color-mix(in_srgb,color-mix(in_srgb,var(--accent)_14%,var(--canvas))_calc(var(--bar-stick,0)_*_100%),color-mix(in_srgb,var(--text)_4%,transparent))] [border-radius:calc(8px_*_(1_-_var(--bar-stick,0)))] [height:calc(32px_+_24px_*_var(--bar-stick,0))] [padding-left:calc(10px_+_6px_*_var(--bar-stick,0))] pr-2.5 text-left text-[0.85rem]! font-medium text-(--muted) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) active:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)";
/**
 * The two buttons close up as they grow (the bar's gap goes to nothing),
 * and a thin line of the accent comes in between them, tapering away
 * towards their top and bottom (its fade eases out, so the ends thin to
 * nothing instead of stopping): each draws a 1px half of it along the edge
 * that faces the other, as the bar comes to hold (`--bar-stick`), so the
 * two halves come in together and meet as one 2px line once joined.
 *
 * On a phone, once they have (`data-stuck` on the bar), the line draws back
 * from the top, fading out before it reaches the chip under the sheet's
 * grab handle: a mask that is clear for its first 10px and fades in over
 * the next 20, kept above the line until then, moves down over it (a
 * gradient itself cannot be transitioned) — sliding when the halves met
 * slowly (`data-collision`), at once after a flick. The panel has no handle
 * over the line, so there it stays whole.
 */
const JUMP_CHIP_DIVIDER_CLASS =
  "relative before:pointer-events-none before:absolute before:inset-y-0 before:w-px before:bg-[linear-gradient(to_bottom,transparent,color-mix(in_srgb,color-mix(in_srgb,var(--accent)_75%,white)_5%,transparent)_14%,color-mix(in_srgb,color-mix(in_srgb,var(--accent)_75%,white)_40%,transparent)_32%,color-mix(in_srgb,var(--accent)_75%,white)_50%,color-mix(in_srgb,color-mix(in_srgb,var(--accent)_75%,white)_40%,transparent)_68%,color-mix(in_srgb,color-mix(in_srgb,var(--accent)_75%,white)_5%,transparent)_86%,transparent)] before:opacity-(--bar-stick,0) before:content-[''] max-[820px]:before:[mask-image:linear-gradient(to_bottom,transparent_10px,black_30px)] max-[820px]:before:[mask-size:100%_calc(100%_+_30px)] max-[820px]:before:[mask-repeat:no-repeat] max-[820px]:before:[mask-position:0_-30px] max-[820px]:[[data-stuck]>&]:before:[mask-position:0_0] max-[820px]:[[data-collision]>&]:before:transition-[mask-position] max-[820px]:[[data-collision]>&]:before:duration-300 max-[820px]:[[data-collision]>&]:before:ease-out motion-reduce:before:transition-none";
/**
 * The moment the two halves meet, when they met slowly (the bar marked
 * `data-collision`, see useStuckSectionHeadings; a flick lands them met
 * with nothing played), a ripple sets off from the seam across each
 * button, as if the two had collided: a band of light a quarter of the
 * button wide, brightest down its middle, that widens and fades as it runs
 * to the far edge (keyframes in learning.css). It is a pseudo-element on
 * each button, clipped to it, and replays each time the bar comes to hold
 * again.
 *
 * The two outer top corners come to lie in the rounded top corners of what
 * holds the list (the panel, or the phone's sheet): they round out from
 * 8px to that radius (`--curriculum-top-radius`, set on the bar) as the
 * buttons grow, so nothing square of theirs is ever drawn into those
 * corners, even in a frame where the clip has not caught up with a
 * scrolling layer.
 */
const JUMP_CHIP_RIPPLE_CLASS =
  "overflow-hidden after:pointer-events-none after:absolute after:inset-y-0 after:w-1/4 after:opacity-0 after:content-[''] motion-reduce:after:animate-none!";
const JUMP_CHIP_FIRST_CLASS = `${JUMP_CHIP_DIVIDER_CLASS} ${JUMP_CHIP_RIPPLE_CLASS} [border-start-start-radius:calc(8px_+_(var(--curriculum-top-radius,16px)_-_8px)_*_var(--bar-stick,0))] before:right-0 after:right-0 after:origin-right after:bg-[linear-gradient(to_right,color-mix(in_srgb,var(--accent)_55%,white),color-mix(in_srgb,var(--accent)_30%,transparent)_45%,transparent)] [[data-collision]>&]:after:animate-[curriculum-seam-ripple-start_720ms_cubic-bezier(0.2,0.7,0.3,1)_both]`;
const JUMP_CHIP_LAST_CLASS = `${JUMP_CHIP_DIVIDER_CLASS} ${JUMP_CHIP_RIPPLE_CLASS} [border-start-end-radius:calc(8px_+_(var(--curriculum-top-radius,16px)_-_8px)_*_var(--bar-stick,0))] before:left-0 after:left-0 after:origin-left after:bg-[linear-gradient(to_left,color-mix(in_srgb,var(--accent)_55%,white),color-mix(in_srgb,var(--accent)_30%,transparent)_45%,transparent)] [[data-collision]>&]:after:animate-[curriculum-seam-ripple-end_720ms_cubic-bezier(0.2,0.7,0.3,1)_both]`;

/**
 * The bar of chips: whatever scrolls up passes behind it. As the list
 * scrolls it towards the top of the panel, over its last 48px of travel
 * (`--bar-stick`, 0 to 1, set in the scroll event by
 * useStuckSectionHeadings), it gives up its padding and gap and the chips
 * grow into two full buttons, edge to edge and 56px tall (JUMP_CHIP_CLASS),
 * joined, with a thin line between them, so that by the moment it holds
 * nothing is left to move. At rest it is one with the panel's shade (the
 * sheet's, on a phone). The two buttons need no line under them, so the
 * bar draws none. On a phone a small chip of the sheet's colour sits behind
 * the grab handle over their top, 10px deep and a little wider than the
 * handle, so the line between them is not seen above the handle; it lets
 * presses through. `--curriculum-top-radius` tells the buttons the radius
 * of the corners they grow into.
 */
// Written out in full: Tailwind only generates classes it can read whole.
const STICKY_BAR_CLASS =
  "sticky top-0 z-4 flex min-w-0 shrink-0 [padding:calc(10px_*_(1_-_var(--bar-stick,0)))_calc(16px_*_(1_-_var(--bar-stick,0)))_calc(8px_*_(1_-_var(--bar-stick,0)))] [gap:calc(6px_*_(1_-_var(--bar-stick,0)))] [--curriculum-top-radius:var(--control-radius-learning-panel,8px)] bg-[color-mix(in_srgb,var(--surface)_91%,var(--canvas))] max-[820px]:[--curriculum-top-radius:16px] max-[820px]:bg-(--canvas) max-[820px]:before:pointer-events-none max-[820px]:before:absolute max-[820px]:before:top-0 max-[820px]:before:left-1/2 max-[820px]:before:z-1 max-[820px]:before:h-2.5 max-[820px]:before:w-28 max-[820px]:before:-translate-x-1/2 max-[820px]:before:rounded-b-lg max-[820px]:before:bg-(--canvas) max-[820px]:before:opacity-(--bar-stick,0) max-[820px]:before:content-['']";
/**
 * How far below the bar's line the first section stands, and an open
 * section's heading holds (the list's top padding, learning.css).
 */
const STICKY_BAR_GAP = 10;
/**
 * How far down the panel an open section's heading holds: under the bar of
 * chips as it stands once stuck (56px, the two buttons) and the room kept
 * under that (STICKY_BAR_GAP). The class is the one place it is set; code
 * that needs the number reads it off the heading.
 */
const STUCK_HEADING_TOP_CLASS = "top-[66px]";
const stuckHeadingTopOf = (heading: HTMLElement | null) =>
  (heading && Number.parseFloat(getComputedStyle(heading).top)) || 0;
/**
 * How deep the block's rounded foot is: its corner radius (rounded-2xl).
 * The lessons pad their foot by as much (CurriculumLessonRows).
 */
const SECTION_FOOT_DEPTH = 16;
/**
 * The heading's share of the block's frame while the section is open: the
 * top and the sides, and the bottom edge only once the frame's own has
 * gone behind it (useStuckSectionHeadings gives it a width,
 * `--section-foot-border-width`, then, and `--section-foot-radius` as the heading's bottom corners round
 * off along the frame's foot). Overflow is hidden so the progress bar at
 * its foot stays inside those corners.
 */
const OPEN_HEADING_FRAME_CLASS =
  "overflow-hidden rounded-t-2xl border-[color-mix(in_srgb,var(--accent)_32%,transparent)] [border-bottom-width:var(--section-foot-border-width,0px)] [border-bottom-left-radius:var(--section-foot-radius,0px)] [border-bottom-right-radius:var(--section-foot-radius,0px)]";
/**
 * The lessons' frame paints only below the heading's bottom edge
 * (`--frame-clip-top`, set by useStuckSectionHeadings while the heading
 * holds; nothing is clipped otherwise), so none of its sides shows beside
 * the heading's corners.
 */
const LESSONS_FRAME_CLASS =
  "rounded-b-2xl border border-t-0 [clip-path:inset(var(--frame-clip-top,0px)_0_0_0)]";

/** A small drawn dot between the facts of a line. */
function Dot() {
  return (
    <span
      aria-hidden="true"
      className="size-[3px] shrink-0 rounded-full bg-current opacity-70"
    />
  );
}

interface CurriculumProps {
  selectedLesson: number;
  sections?: readonly CourseSection[];
  lessonsById?: ReadonlyMap<number, Lesson>;
  lessonProgress?: Readonly<Record<number, number>>;
  /**
   * The learner's progress is still on its way (the session has not said
   * who they are, or theirs has not arrived): the course's progress
   * shimmers instead of saying 0%. A page built ahead of time does not know
   * the visitor either; a visitor (no session remembered, see
   * store/sessionPresence.ts) is shown 0% from the first paint.
   */
  progressPending?: boolean;
  onSelectLesson: (lessonNumber: number) => void;
  onOpenCourseOverview?: () => void;
  courseNavigationActionLabel?: string;
  courseTitle: string;
  courseThumbnail?: string;
  courseThumbnailSrcSet?: string;
  onClose?: () => void;
  onLessonSearchOpen?: () => void;
  focusRequest?: number;
  topRequest?: number;
  persistenceKey: string;
  isLessonAvailable?: (lessonNumber: number) => boolean;
  /** Lessons the visitor cannot play yet; their cards show a lock. */
  lockedLessonNumbers?: ReadonlySet<number>;
  isLoading?: boolean;
  /**
   * The course could not be loaded, or has no lessons. There is then no
   * course to head the panel with and nothing to list, and it says so
   * instead of drawing a header out of the address's slug and blanks.
   */
  unavailable?: boolean;
  /**
   * With `unavailable`: the course is not missing or empty, loading it
   * failed (the server could not be reached, say), and the panel says that.
   */
  loadFailed?: boolean;
  scrollportId?: string;
  scrollportRef?: RefObject<HTMLElement | null>;
  scrollControlBottomClearance?: number | string;
  drawerHeroControlProps?: LessonDrawerHeroControlProps;
  hideHero?: boolean;
  expandAllSections?: boolean;
  expandedSectionIds?: readonly number[];
  onExpandedSectionIdsChange?: (sectionIds: readonly number[]) => void;
  /** Downloadable files of each lesson that has any, by lesson number. */
  lessonResources?: ReadonlyMap<number, readonly LessonResource[]>;
  /** Course slug or id the resources are downloaded through. */
  resourceCourseKey?: string;
  /** Lessons with a quiz attached. */
  quizLessonNumbers?: ReadonlySet<number>;
  /** The lesson whose quiz is currently open, if any. */
  activeQuizLesson?: number | null;
  onOpenLessonQuiz?: (lessonNumber: number) => void;
}

/** A little over the time a section takes to close (learning.css). */
const SECTION_CLOSE_MS = 260;
/** The learner taking the scroll back ends a hold on it. */
interface ScrollToItemOptions {
  instant?: boolean;
  onSettled?: () => void;
}

interface RevealOptions {
  instant?: boolean;
  /** Keeps the lessons out of sight until the list rests on the item. */
  hidden?: boolean;
}

// A full screen the page draws itself (Safari on iPhone) counts as one.
const FULLSCREEN_CHANGE_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
  PAGE_FULLSCREEN_CHANGE_EVENT,
];

const HOLD_CANCEL_EVENTS = [
  "wheel",
  "touchstart",
  "pointerdown",
  "keydown",
] as const;

/**
 * A section's lessons, kept in the page while the section closes. The
 * closing is a transition of the row they stand in; taken out the moment
 * the section is told to close, they left nothing for it to animate and
 * the section simply vanished. They go once it has shut.
 */
function ClosingSectionLessons({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const [lingering, setLingering] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setLingering(!open);
  }
  useEffect(() => {
    if (!lingering) return undefined;
    const timer = window.setTimeout(
      () => setLingering(false),
      SECTION_CLOSE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [lingering]);
  return open || lingering ? children : null;
}

/**
 * Memoized: the lesson page around it renders for reasons of its own (its
 * panel being dragged wider is one), and everything it is given is stable
 * across those.
 */
export const Curriculum = memo(function Curriculum({
  selectedLesson,
  sections = EMPTY_CURRICULUM_SECTIONS,
  lessonsById = EMPTY_LESSONS_BY_ID,
  lessonProgress = {},
  progressPending = false,
  onSelectLesson,
  onOpenCourseOverview,
  courseNavigationActionLabel,
  courseTitle,
  courseThumbnail = "",
  courseThumbnailSrcSet,
  onClose,
  onLessonSearchOpen,
  focusRequest = 0,
  topRequest = 0,
  persistenceKey,
  isLessonAvailable,
  lockedLessonNumbers,
  isLoading = false,
  unavailable = false,
  loadFailed = false,
  scrollportId,
  scrollportRef,
  scrollControlBottomClearance,
  drawerHeroControlProps,
  hideHero = false,
  expandAllSections = false,
  expandedSectionIds: controlledExpandedSectionIds,
  onExpandedSectionIdsChange,
  lessonResources,
  resourceCourseKey,
  quizLessonNumbers,
  activeQuizLesson,
  onOpenLessonQuiz,
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
  const curriculumRef = useRef<HTMLElement>(null);
  const contextMenuPortalHostRef = useRef<HTMLElement | null>(null);
  const scrollControlRef = useRef<ElasticScrollerHandle>(null);
  const handledFocusRequestRef = useRef(0);
  const handledTopRequestRef = useRef(0);
  const fallbackSection: CourseSection = {
    id: 0,
    title: "",
    progress: "",
    lessons: [],
  };
  const fallbackLesson: Lesson = [selectedLesson || 1, "", "", "todo"];
  const currentSection =
    sections.find((section) =>
      section.lessons.some(([number]) => number === selectedLesson),
    ) ||
    sections[0] ||
    fallbackSection;
  const currentLesson =
    lessonsById?.get(selectedLesson) || lessonsById?.get(1) || fallbackLesson;
  // Lessons are numbered from 1 in each section unless the learner has
  // chosen to have them numbered straight through the course. A lesson's
  // own number is its place in the course; what a section takes off it is
  // one less than its first lesson's.
  const continuousLessonNumbering = useContinuousLessonNumbering();
  const getLessonNumberBase = (section: CourseSection) =>
    continuousLessonNumbering ? 0 : (section.lessons[0]?.[0] ?? 1) - 1;
  const selectedLessonDisplayNumber =
    selectedLesson - getLessonNumberBase(currentSection);
  // The section last opened for the lesson being played, to tell a lesson
  // in another section from one in the same.
  const openedForSectionRef = useRef<number | null>(null);

  const setCurriculumScrollport = useCallback(
    (node: HTMLElement | null) => {
      curriculumRef.current = node;
      contextMenuPortalHostRef.current =
        node?.closest<HTMLElement>(".video-shell") ?? null;
      if (scrollportRef) scrollportRef.current = node;
    },
    [scrollportRef],
  );

  const isSectionExpanded = useCallback(
    (sectionId: number) => expandedRef.current.includes(sectionId),
    [],
  );
  const { handleCollapseTransitionEnd } = useCurriculumSectionScrollAnchor(
    curriculumRef,
    isSectionExpanded,
  );

  const getLessonProgress = (number: number, status: string) => {
    const storedProgress = lessonProgress[number];
    if (typeof storedProgress === "number")
      return Math.max(0, Math.min(100, storedProgress));
    if (status === "done") return 100;
    return 0;
  };

  const allLessons = sections.flatMap(({ lessons }) => lessons);
  const courseDuration = formatTotalLessonDuration(allLessons);
  // The head, and the bar of chips under it, are shown once the course is
  // known; the mini player's playlist has neither.
  const hasStickyBar = !hideHero && !isLoading && !unavailable;
  // Whether an open section's heading holds to the top of the panel
  // (under the bar) while its lessons scroll under it: a learning setting
  // the panel's menus switch, on unless the learner turns it off.
  const stickOpenSection = useLearningPreferenceValue("stickOpenSection");
  const stickHeadings = hasStickyBar && stickOpenSection;
  useStuckSectionHeadings(
    curriculumRef,
    hasStickyBar,
    stickHeadings,
    STICKY_BAR_GAP,
    SECTION_FOOT_DEPTH,
    `${selectedLesson}:${expanded.join(",")}`,
  );
  // With two decimals, as course progress is shown everywhere (0.42%).
  const courseProgress =
    allLessons.length > 0
      ? roundCourseProgress(
          allLessons.reduce(
            (total, [number, , , status]) =>
              total + getLessonProgress(number, status),
            0,
          ) / allLessons.length,
        )
      : 0;
  // Any lesson with progress kept, a few seconds of one included: the bar
  // then shows a sliver even while the course is still at 0.00%.
  const courseStarted = allLessons.some(
    ([number, , , status]) =>
      typeof lessonProgress[number] === "number" || status === "done",
  );
  /**
   * The scroll position that brings an item to the top of what can be
   * seen: under the bar of chips that holds to the panel's top (and the
   * room kept under it) and, for a lesson, under its section's heading
   * when that holds there too. A lesson also stops as far below that as
   * lessons are from one another (the list gap), instead of touching
   * it; a section heading goes flush.
   */
  const measureItemTop = useCallback(
    (element: HTMLElement, curriculum: HTMLElement) => {
      const isSection = element === currentSectionRef.current;
      const lessonList = element.closest<HTMLElement>(".flex.flex-col");
      const topMargin =
        isSection || !lessonList
          ? 0
          : Number.parseFloat(getComputedStyle(lessonList).rowGap) || 0;
      const stickyBar = curriculum.querySelector<HTMLElement>(
        ":scope > [data-curriculum-sticky-bar]",
      );
      const barSpace = stickyBar ? stickyBar.offsetHeight + STICKY_BAR_GAP : 0;
      const sectionHeading = isSection
        ? null
        : (element
            .closest(".learning-curriculum__section")
            ?.querySelector<HTMLElement>(
              ":scope > .learning-curriculum__section-toggle",
            ) ?? null);
      const headingSpace =
        sectionHeading && getComputedStyle(sectionHeading).position === "sticky"
          ? sectionHeading.offsetHeight
          : 0;
      return Math.max(
        0,
        element.getBoundingClientRect().top -
          curriculum.getBoundingClientRect().top +
          curriculum.scrollTop -
          topMargin -
          barSpace -
          headingSpace,
      );
    },
    [],
  );

  /**
   * The lessons are hidden while the list is moved for the learner rather
   * than by them (a page just opened, the panel shown again, full screen
   * entered or left): they appear already at the lesson being played, and
   * the list is never seen running down to it.
   */
  const setLessonsHidden = useCallback((hidden: boolean) => {
    const lessonList = lessonListRef.current;
    if (!lessonList) return;
    if (hidden) lessonList.style.visibility = "hidden";
    else lessonList.style.removeProperty("visibility");
  }, []);

  /**
   * `instant` moves the list in one step, for a move the learner did not
   * make themself (a lesson opened, the panel shown); the jump chips glide.
   * `onSettled` is called once the list rests on the item.
   */
  const scrollItemToTop = useCallback(
    (
      element: HTMLElement | null,
      { instant = false, onSettled }: ScrollToItemOptions = {},
    ) => {
      const curriculum = element?.closest<HTMLElement>(".learning-curriculum");
      if (!element || !curriculum) {
        onSettled?.();
        return;
      }
      const behavior =
        instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth";
      let target = measureItemTop(element, curriculum);
      const go = () => {
        if (behavior === "auto" || typeof curriculum.scrollTo !== "function") {
          curriculum.scrollTop = target;
        } else {
          curriculum.scrollTo({ top: target, behavior });
        }
      };
      go();

      // The list above the item may change height as the list scrolls
      // (lessons far above come in and out of layout), which moves the
      // item. Until the list has come to rest on it, the target is measured
      // again each frame and the scroll sent after it when it has moved;
      // the learner taking the scroll back ends that.
      const started = performance.now();
      let settledFrames = 0;
      let frame = 0;
      const stop = () => {
        window.cancelAnimationFrame(frame);
        for (const type of HOLD_CANCEL_EVENTS) {
          curriculum.removeEventListener(type, stop);
        }
        onSettled?.();
      };
      const settle = () => {
        if (!element.isConnected) return stop();
        const next = measureItemTop(element, curriculum);
        if (Math.abs(next - target) > 1) {
          target = next;
          settledFrames = 0;
          go();
        } else if (Math.abs(curriculum.scrollTop - target) <= 1) {
          settledFrames += 1;
        }
        if (settledFrames >= 3 || performance.now() - started > 1500) stop();
        else frame = window.requestAnimationFrame(settle);
      };
      for (const type of HOLD_CANCEL_EVENTS) {
        curriculum.addEventListener(type, stop, { passive: true });
      }
      frame = window.requestAnimationFrame(settle);
    },
    [measureItemTop],
  );

  /**
   * Scrolls the list so the item stands at its top, two frames on (once
   * what was just opened is laid out). Near the end of the list there is
   * not enough below the item for that, so room is added under the list
   * first (`--curriculum-reveal-space`).
   */
  const revealAtTop = useCallback(
    (
      getTarget: () => HTMLElement | null,
      { instant = false, hidden = false }: RevealOptions = {},
    ) => {
      if (hidden) setLessonsHidden(true);
      const options: ScrollToItemOptions = {
        instant,
        onSettled: hidden ? () => setLessonsHidden(false) : undefined,
      };
      // On a page just opened the lessons may not be drawn yet (a section
      // has its lessons once the course's file is in), so the item is
      // looked for again each frame, for half a second at most.
      let tries = 0;
      const attempt = () => {
        const targetElement = getTarget();
        const curriculum = targetElement?.closest<HTMLElement>(
          ".learning-curriculum",
        );
        const lessonList = lessonListRef.current;
        if (!targetElement || !curriculum || !lessonList) {
          tries += 1;
          if (tries < 30) window.requestAnimationFrame(attempt);
          else options.onSettled?.();
          return;
        }

        const targetTop = measureItemTop(targetElement, curriculum);
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
            window.requestAnimationFrame(() =>
              scrollItemToTop(targetElement, options),
            );
          });
          return;
        }

        scrollItemToTop(targetElement, options);
      };
      window.requestAnimationFrame(() => window.requestAnimationFrame(attempt));
    },
    [measureItemTop, scrollItemToTop, setLessonsHidden],
  );

  const revealAndScrollTo = (
    target: "section" | "chapter",
    sectionId: number,
  ) => {
    setSearchOpen(false);
    setExpanded((current) =>
      current.includes(sectionId) ? current : [...current, sectionId],
    );
    revealAtTop(() =>
      target === "section"
        ? currentSectionRef.current
        : activeLessonRef.current,
    );
  };

  // A lesson is opened: its section is opened, and only it when the lesson
  // is in another section than the last one (a learner moving through the
  // course would otherwise be left with every section above open); the
  // sections the learner opens themselves stay while they stay in it. The
  // list then scrolls so the lesson being played stands at its top, unless
  // the learner is searching it.
  // Read when a lesson opens, not followed: opening the search must not
  // scroll the list again.
  // The list moves in one step; the first time (the page just opened) its
  // lessons stay hidden until it is there.
  const lessonRevealedRef = useRef(false);
  const revealOpenedLesson = useEffectEvent(() => {
    const firstReveal = !lessonRevealedRef.current;
    lessonRevealedRef.current = true;
    if (hideHero || searchOpen) {
      if (firstReveal) setLessonsHidden(false);
      return;
    }
    revealAtTop(() => activeLessonRef.current, {
      instant: true,
      hidden: firstReveal,
    });
  });
  // Hidden before the first paint, so the list is never seen at its top
  // and then moved; `revealOpenedLesson` shows it again. Not when the
  // sections are opened from outside, where no reveal follows.
  useLayoutEffect(() => {
    if (!hideHero && !searchOpen && !expandAllSections && !isExpandedControlled)
      setLessonsHidden(true);
    // Only on the first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The lesson being played is brought back to the top, in one step and
   * out of sight, whenever the list is shown again: when full screen is
   * entered or left (the side panel was left behind it, the full-screen
   * panel opens with it) and when the panel goes from hidden to shown.
   */
  const revealAgain = useEffectEvent(() => {
    if (hideHero || searchOpen || !lessonRevealedRef.current) return;
    revealAtTop(() => activeLessonRef.current, { instant: true, hidden: true });
  });
  useEffect(() => {
    const scrollport = curriculumRef.current;
    const onFullscreenChange = () => revealAgain();
    for (const type of FULLSCREEN_CHANGE_EVENTS) {
      document.addEventListener(type, onFullscreenChange);
    }
    let shown = Boolean(scrollport && scrollport.clientHeight > 0);
    const observer =
      scrollport && typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            const nowShown = scrollport.clientHeight > 0;
            if (nowShown && !shown) revealAgain();
            shown = nowShown;
          })
        : null;
    if (scrollport) observer?.observe(scrollport);
    return () => {
      for (const type of FULLSCREEN_CHANGE_EVENTS) {
        document.removeEventListener(type, onFullscreenChange);
      }
      observer?.disconnect();
    };
  }, []);
  useEffect(() => {
    if (expandAllSections || isExpandedControlled) return;
    const sectionChanged = openedForSectionRef.current !== currentSection.id;
    openedForSectionRef.current = currentSection.id;
    if (sectionChanged) setExpanded([currentSection.id]);
    else if (!expandedRef.current.includes(currentSection.id)) {
      setExpanded((current) => [...current, currentSection.id]);
    }
    revealOpenedLesson();
  }, [
    currentSection.id,
    expandAllSections,
    isExpandedControlled,
    selectedLesson,
    setExpanded,
  ]);

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

  // Any number of sections can be open: opening one leaves the others alone.
  const toggleSection = (id: number) => {
    setSearchOpen(false);
    if (expandedRef.current.includes(id)) keepStuckHeadingInPlace(id);
    setExpanded((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  /**
   * A section closed while its heading holds to the top of the panel (the
   * list scrolled part way into it) would otherwise shrink out from under
   * the scroll position, and the whole list would leap. Before it closes,
   * the list is scrolled so the section's own top stands where its heading
   * was holding: the heading stays put, the lessons fold up under it, and
   * only what follows moves up to fill the room.
   */
  const keepStuckHeadingInPlace = (sectionId: number) => {
    const scrollport = curriculumRef.current;
    const lessonList = lessonListRef.current;
    const section = scrollport
      ?.querySelector(`[data-curriculum-section-panel="${sectionId}"]`)
      ?.closest<HTMLElement>(".learning-curriculum__section");
    if (!stickHeadings || !scrollport || !lessonList || !section) return;
    const heading = section.querySelector<HTMLElement>(
      ":scope > .learning-curriculum__section-toggle",
    );
    const stuckTop = stuckHeadingTopOf(heading);
    const scrollportTop = scrollport.getBoundingClientRect().top;
    const sectionTop = section.getBoundingClientRect().top - scrollportTop;
    if (!heading || sectionTop >= stuckTop - 0.5) return;

    // Once the section has shut, the list may be too short to be scrolled
    // this far: room is kept under it (as the jump chips keep it) so the
    // position holds, instead of the list being pulled back up.
    const target = scrollport.scrollTop + sectionTop - stuckTop;
    const lessons = section.querySelector<HTMLElement>(
      ":scope > .learning-curriculum__section-lessons",
    );
    const currentRevealSpace = Number.parseFloat(
      lessonList.dataset.revealSpace || "0",
    );
    const maximumScrollAfterClosing =
      scrollport.scrollHeight -
      currentRevealSpace -
      (lessons?.offsetHeight ?? 0) -
      scrollport.clientHeight;
    const nextRevealSpace = Math.ceil(
      Math.max(0, target - maximumScrollAfterClosing + 4),
    );
    if (nextRevealSpace !== currentRevealSpace) {
      lessonList.dataset.revealSpace = String(nextRevealSpace);
      lessonList.style.setProperty(
        "--curriculum-reveal-space",
        `${nextRevealSpace}px`,
      );
    }
    scrollport.scrollTop = target;

    // While the section shuts, the list above it may still change height
    // (lessons far above come in and out of layout as the position moves),
    // and the browser's own anchoring would move the list too. So for as
    // long as the section takes to shut, the heading is held at its line
    // frame by frame, unless the learner scrolls themself.
    scrollport.style.overflowAnchor = "none";
    const started = performance.now();
    let frame = 0;
    const stop = () => {
      window.cancelAnimationFrame(frame);
      scrollport.style.removeProperty("overflow-anchor");
      for (const type of HOLD_CANCEL_EVENTS) {
        scrollport.removeEventListener(type, stop);
      }
    };
    const hold = () => {
      if (heading.isConnected) {
        const headingTop =
          heading.getBoundingClientRect().top -
          scrollport.getBoundingClientRect().top;
        if (Math.abs(headingTop - stuckTop) > 0.5) {
          scrollport.scrollTop += headingTop - stuckTop;
        }
      }
      if (performance.now() - started < SECTION_CLOSE_MS + 100) {
        frame = window.requestAnimationFrame(hold);
      } else {
        stop();
      }
    };
    for (const type of HOLD_CANCEL_EVENTS) {
      scrollport.addEventListener(type, stop, { passive: true });
    }
    frame = window.requestAnimationFrame(hold);
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

    // The panel was just opened to show where the learner is: the lessons
    // appear there, not at wherever the list was left.
    setLessonsHidden(true);
    const reveal = () => setLessonsHidden(false);
    let firstFrame: number;
    let secondFrame: number | undefined;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        secondFrame = undefined;
        scrollItemToTop(activeLessonRef.current, {
          instant: true,
          onSettled: reveal,
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) {
        window.cancelAnimationFrame(secondFrame);
        reveal();
      }
    };
  }, [
    focusRequest,
    currentSection.id,
    scrollItemToTop,
    setExpanded,
    setLessonsHidden,
  ]);

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
          const targetTop = measureItemTop(targetElement, curriculum);
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

        scrollItemToTop(targetElement, { instant: true });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [hideHero, currentSection.id, measureItemTop, scrollItemToTop]);

  return (
    <ContextMenu>
      <aside
        ref={setCurriculumScrollport}
        id={scrollportId}
        // It scrolls, so how a finger may pan is decided here: up and down
        // only. Sideways swipes then reach the page, which resizes the panel
        // with them (a browser would otherwise claim them itself).
        className={`learning-curriculum touch-pan-y touch-pinch-zoom ${hideHero ? "learning-curriculum--compact" : ""}`}
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
        {/* Until the course is known the header has nothing true to show:
            its title would be the address's slug, its progress zero, its
            section and lesson blank, its cover a placeholder. So while the
            course loads it is bars, like the list under it. */}
        {!hideHero && isLoading && !unavailable ? (
          <div
            className="animate-pulse px-4 pt-4 pb-3"
            aria-hidden="true"
            data-testid="curriculum-hero-skeleton"
          >
            <div className="flex h-11 items-center gap-3">
              <div
                className={`h-10 w-18 shrink-0 rounded-lg ${SKELETON_BAR}`}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className={`h-4 w-4/5 rounded ${SKELETON_BAR}`} />
                <div className={`h-3 w-3/5 rounded ${SKELETON_BAR}`} />
              </div>
              <div className={`size-9 rounded-full ${SKELETON_BAR}`} />
              <div className={`size-9 rounded-full ${SKELETON_BAR}`} />
            </div>
            <div className="mt-2.5 flex items-center gap-2.5">
              <div className={`h-1 flex-1 rounded-full ${SKELETON_BAR}`} />
              <div className={`h-3 w-10 rounded ${SKELETON_BAR}`} />
            </div>
            <div className="mt-2.5 flex gap-1.5">
              <div className={`h-8 flex-1 rounded-lg ${SKELETON_BAR}`} />
              <div className={`h-8 flex-1 rounded-lg ${SKELETON_BAR}`} />
            </div>
          </div>
        ) : null}
        {/* The head of the panel: the course's small picture and name
            (which leads to its page) with the course's size under it, the
            lesson search folded into a button beside them and a ⋯ menu for
            the panel's actions; then a thin line of progress, and two chips
            for where the learner is, the section and the lesson being
            played. On a phone it is also the handle the sheet is dragged
            by. */}
        {!hideHero && !isLoading && !unavailable ? (
          <ContextMenuTrigger
            render={
              <div
                {...drawerHeroControlProps}
                className="learning-curriculum__head relative z-3 shrink-0 px-4 pt-4 text-(--text)"
              />
            }
          >
            <div className="@container flex min-w-0 items-center gap-0.5">
              {/* The search's field, when open, lies over the picture and
                  the name; the ⋯ button stands outside it and stays. */}
              <ExpandableSearch
                inputId={lessonSearchInputId}
                label="Search lessons"
                placeholder="Search lessons..."
                value={lessonSearch}
                onValueChange={setLessonSearch}
                open={searchOpen}
                onOpenChange={handleLessonSearchOpenChange}
                shortcutPriority
                backLabel="Back from lesson search"
                triggerClassName={HEAD_BUTTON_CLASS}
                triggerIconSize={19}
                backButtonClassName="text-(--text)!"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={`block h-10 w-18 shrink-0 overflow-hidden rounded-lg ${TINT_4}`}
                    data-fixed-radius
                  >
                    {courseThumbnail ? (
                      <img
                        src={courseThumbnail}
                        srcSet={courseThumbnailSrcSet}
                        sizes="72px"
                        alt=""
                        className="block size-full object-cover"
                      />
                    ) : (
                      <span
                        className="flex size-full items-center justify-center text-(--muted)"
                        aria-hidden="true"
                      >
                        <Image size={18} weight="duotone" />
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[clamp(0.9375rem,4cqi,1.0625rem)] leading-snug font-semibold tracking-[-0.015em]">
                      <button
                        type="button"
                        className="block max-w-full cursor-pointer truncate rounded-sm border-0 bg-transparent p-0 text-left text-inherit underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                        aria-label={
                          courseNavigationActionLabel ??
                          `View course overview for ${courseTitle}`
                        }
                        title={courseNavigationActionLabel ?? "View course"}
                        onClick={() => onOpenCourseOverview?.()}
                      >
                        {courseTitle}
                      </button>
                    </h2>
                    {/* How big the course is. */}
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs leading-4 text-(--muted) tabular-nums">
                      <span className="shrink-0">
                        {sections.length}{" "}
                        {sections.length === 1 ? "section" : "sections"}
                      </span>
                      <Dot />
                      <span className="shrink-0">
                        {allLessons.length}{" "}
                        {allLessons.length === 1 ? "lesson" : "lessons"}
                      </span>
                      {courseDuration ? (
                        <>
                          <Dot />
                          <span className="min-w-0 truncate">
                            {courseDuration}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
              </ExpandableSearch>
              <CurriculumActionsMenu
                sectionIds={sectionIds}
                expandedSectionIds={expanded}
                onExpandAllSections={() => setExpanded(sectionIds)}
                onCollapseAllSections={() => setExpanded([])}
                currentSectionId={currentSection.id}
                onCollapseOtherSections={() => setExpanded([currentSection.id])}
                portalContainer={contextMenuPortalHostRef}
                triggerClassName={HEAD_BUTTON_CLASS}
              />
            </div>

            <div className="mt-2.5 flex items-center gap-2.5">
              <span
                className={`learning-curriculum__progress-track block h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_12%,transparent)] ${
                  progressPending
                    ? "[:root[data-session-hint=signed-in]_&]:animate-pulse [:root[data-session-hint=signed-in]_&]:motion-reduce:animate-none"
                    : ""
                }`}
                aria-busy={progressPending || undefined}
                role="progressbar"
                aria-label={`Course progress: ${courseProgress} percent`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={courseProgress}
              >
                <span
                  className={`block h-full rounded-full bg-(--accent) ${
                    progressPending
                      ? "[:root[data-session-hint=signed-in]_&]:invisible"
                      : ""
                  }`}
                  style={{
                    width: `${courseProgress}%`,
                    minWidth: courseStarted ? "0.375rem" : undefined,
                  }}
                />
              </span>
              <span className="shrink-0 text-xs leading-4 font-medium text-(--muted) tabular-nums">
                {progressPending ? (
                  <>
                    <span className="[:root[data-session-hint=signed-in]_&]:hidden">
                      {formatCourseProgress(0)}
                    </span>
                    <i
                      aria-hidden="true"
                      className={`${PROGRESS_SHIMMER} hidden h-3 w-10 align-middle [:root[data-session-hint=signed-in]_&]:inline-block`}
                    />
                  </>
                ) : (
                  formatCourseProgress(courseProgress)
                )}
              </span>
            </div>
          </ContextMenuTrigger>
        ) : null}
        {/* Where the learner is, as two chips (the section and the lesson
            being played) that bring their own into view. The bar holds to
            the top of the panel as the list scrolls, so they are always a
            press away; what scrolls up passes behind it (see the bar's
            surface). */}
        {hasStickyBar ? (
          <div
            data-curriculum-sticky-bar=""
            className={STICKY_BAR_CLASS}
            aria-label="Current lesson location"
          >
            <button
              type="button"
              data-fixed-radius
              className={`${JUMP_CHIP_CLASS} ${JUMP_CHIP_FIRST_CLASS}`}
              aria-label={`Go to current section, Section ${currentSection.id}: ${currentSection.title}`}
              title={`Section ${currentSection.id}: ${currentSection.title}`}
              onClick={() => {
                if (searchOpen) {
                  setSearchOpen(false);
                  return;
                }
                revealAndScrollTo("section", currentSection.id);
              }}
            >
              <span
                className="shrink-0 font-bold text-(--accent-ink,var(--accent)) tabular-nums"
                aria-hidden="true"
              >
                S{currentSection.id}
              </span>
              <span className="min-w-0 truncate">{currentSection.title}</span>
            </button>
            <button
              type="button"
              data-fixed-radius
              className={`${JUMP_CHIP_CLASS} ${JUMP_CHIP_LAST_CLASS}`}
              aria-label={`Go to current chapter, Chapter ${selectedLessonDisplayNumber}: ${currentLesson[1]}`}
              title={`Lesson ${selectedLessonDisplayNumber}: ${currentLesson[1]}`}
              onClick={() => {
                if (searchOpen) {
                  setSearchOpen(false);
                  return;
                }
                revealAndScrollTo("chapter", currentSection.id);
              }}
            >
              <span
                className="shrink-0 font-bold text-(--accent-ink,var(--accent)) tabular-nums"
                aria-hidden="true"
              >
                L{selectedLessonDisplayNumber}
              </span>
              <span className="min-w-0 truncate">{currentLesson[1]}</span>
            </button>
          </div>
        ) : null}

        <div ref={lessonListRef} className="learning-curriculum__lesson-list">
          {unavailable ? (
            <div className="grid min-h-60 place-items-center px-6 py-10 text-center">
              <div className="space-y-2">
                <OctopusIllustration
                  kind={loadFailed ? "went-wrong" : "not-found"}
                  className="mx-auto mb-3 h-28 w-auto"
                />
                <p className="text-sm font-semibold text-(--text)">
                  {loadFailed
                    ? "Couldn't load the lessons"
                    : "No course content"}
                </p>
                <p className="text-[0.8125rem] leading-5 text-(--muted)">
                  {loadFailed
                    ? "They will be listed here once the course loads."
                    : "Lessons will be listed here once the course opens."}
                </p>
              </div>
            </div>
          ) : isLoading ? (
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
            sections.map((section) => {
              const matchingLessons = section.lessons.filter((lesson) =>
                lesson[1]
                  .toLowerCase()
                  .includes(activeLessonSearch.toLowerCase()),
              );
              const completedLessons = section.lessons.filter(
                ([number, , , status]) =>
                  getLessonProgress(number, status) >=
                  LESSON_PROGRESS_COMPLETE_THRESHOLD,
              ).length;
              const lessonCount = section.lessons.length;
              const sectionDuration = formatTotalLessonDuration(
                section.lessons,
              );
              const sectionProgress = `${completedLessons}/${lessonCount}`;
              const sectionComplete =
                lessonCount > 0 && completedLessons === lessonCount;
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
                  // In the full panel a section is a block of its own, as on
                  // the course's page: a thin edge and a faint fill, which
                  // take a trace of the accent while it is open. The frame is
                  // drawn in two halves, the top by the heading and the bottom
                  // by the lessons, so that when the heading holds to the top
                  // of the panel (the setting) its corners and sides travel
                  // with it and the lessons' sides carry on straight below;
                  // the block itself draws nothing. While a heading holds, the
                  // frame paints only below it, and as the section ends the
                  // heading's bottom corners round off along the frame's foot
                  // (useStuckSectionHeadings), so the block closes up into one
                  // card instead of the heading lying over the corners.
                  // An open block reaches out past the list's 14px gutter to
                  // 1px from the panel's edges, and draws back in as it shuts.
                  // On a phone every block already runs 1px short of the sheet's
                  // edges (learning.css), so there is nothing to reach out to.
                  //
                  // The mini player's rows are dense and keep their faint
                  // hairline between sections, half a pixel thick: a full
                  // pixel there is two on a scaled screen, and reads as a bar.
                  className={
                    hideHero
                      ? "learning-curriculum__section relative after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-bottom after:scale-y-50 after:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] after:content-['']"
                      : `learning-curriculum__section relative transition-[margin] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${isOpen ? "-mx-[13px] max-[820px]:mx-0" : "mx-0"}`
                  }
                  data-fixed-radius={hideHero ? undefined : ""}
                  data-expanded={isOpen}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={isOpen}
                    // The top half of the block's frame (all of it while the
                    // section is closed). An open section's heading is picked
                    // out in a dark shade of the accent (deeper than the panel,
                    // as the bar of chips is on a phone), opaque: with the setting on it holds flush under the bar
                    // of chips, 56px, while its lessons pass behind it.
                    className={
                      hideHero
                        ? "learning-curriculum__section-toggle"
                        : `learning-curriculum__section-toggle group/section relative flex w-full cursor-pointer items-center gap-3 border px-4 py-3.5 text-left text-(--text) transition-[background-color,border-color] duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent) ${
                            isOpen
                              ? `${OPEN_HEADING_FRAME_CLASS} bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--accent)_13%,var(--surface))] ${stickHeadings ? `sticky ${STUCK_HEADING_TOP_CLASS} z-2` : ""}`
                              : "overflow-hidden rounded-2xl border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)]"
                          }`
                    }
                  >
                    {hideHero ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        {/* The title, with the section's facts in a small
                            line under it: its number, how many lessons, how
                            long. */}
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="line-clamp-2 text-[0.95rem] leading-snug font-semibold tracking-[-0.01em]">
                            <span className="sr-only">
                              Section {section.id}:{" "}
                            </span>
                            {section.title}
                          </span>
                          <span className="inline-flex flex-wrap items-center gap-x-1.5 text-[0.78rem] font-medium text-(--muted) tabular-nums">
                            <span aria-hidden="true">Section {section.id}</span>
                            <Dot />
                            <span>
                              {lessonCount}{" "}
                              {lessonCount === 1 ? "lesson" : "lessons"}
                            </span>
                            {sectionDuration ? (
                              <>
                                <Dot />
                                <span>{sectionDuration}</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                        <span className="sr-only">
                          {completedLessons} of {lessonCount} lessons completed
                        </span>
                        {/* How far the section has come, then a round caret
                            that turns as it opens. A finished section shows
                            a green tick in place of its count. */}
                        <span className="flex shrink-0 items-center gap-2">
                          {sectionComplete ? (
                            <CheckCircle
                              size={18}
                              weight="fill"
                              className="text-(--success)"
                              aria-hidden="true"
                            />
                          ) : (
                            <span
                              className="text-[0.8rem] font-semibold text-(--text-secondary,var(--muted)) tabular-nums"
                              aria-hidden="true"
                            >
                              {sectionProgress}
                            </span>
                          )}
                          <span
                            className={`learning-curriculum__section-arrow size-7 rounded-full bg-[color-mix(in_srgb,var(--text)_6%,transparent)] transition-[transform,background-color,color] group-hover/section:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover/section:text-(--text) ${
                              isOpen
                                ? "is-open text-(--text)"
                                : "text-(--muted)"
                            }`}
                            aria-hidden="true"
                          >
                            <CaretDown size={14} weight="bold" />
                          </span>
                        </span>
                        {isOpen ||
                        (completedLessons > 0 && !sectionComplete) ? (
                          <CurriculumProgressBar
                            percent={(completedLessons / lessonCount) * 100}
                          />
                        ) : null}
                      </>
                    )}
                  </button>
                  {matchingLessons.length > 0 && (
                    <div
                      className={`learning-curriculum__section-lessons ${isOpen ? "is-open" : ""} ${
                        hideHero
                          ? ""
                          : `${LESSONS_FRAME_CLASS} ${
                              isOpen
                                ? "border-[color-mix(in_srgb,var(--accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                                : "border-transparent bg-transparent"
                            }`
                      }`}
                      aria-hidden={!isOpen ? true : undefined}
                      inert={!isOpen ? true : undefined}
                      data-curriculum-section-panel={section.id}
                      onTransitionEnd={(event) => {
                        if (event.target === event.currentTarget) {
                          handleCollapseTransitionEnd(section.id);
                        }
                      }}
                    >
                      <div className="learning-curriculum__section-lessons-inner">
                        <ClosingSectionLessons open={isOpen}>
                          <CurriculumLessonRows
                            sectionId={section.id}
                            sectionTitle={section.title}
                            // The section's own list when nothing is being
                            // searched for: the filtered one is a new list
                            // each time, and would have every section's
                            // lessons render again with the panel.
                            lessons={
                              activeLessonSearch
                                ? matchingLessons
                                : section.lessons
                            }
                            lessonNumberBase={getLessonNumberBase(section)}
                            selectedLesson={selectedLesson}
                            lessonProgress={lessonProgress}
                            onSelectLesson={onSelectLesson}
                            isLessonAvailable={isLessonAvailable}
                            lockedLessonNumbers={lockedLessonNumbers}
                            onClose={onClose}
                            activeLessonRef={activeLessonRef}
                            compact={hideHero}
                            lessonResources={lessonResources}
                            resourceCourseKey={resourceCourseKey}
                            quizLessonNumbers={quizLessonNumbers}
                            activeQuizLesson={activeQuizLesson}
                            onOpenLessonQuiz={onOpenLessonQuiz}
                            portalContainer={contextMenuPortalHostRef}
                          />
                        </ClosingSectionLessons>
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
        currentSectionId={currentSection.id}
        onCollapseOtherSections={() => setExpanded([currentSection.id])}
        portalContainer={contextMenuPortalHostRef}
      />
    </ContextMenu>
  );
});
