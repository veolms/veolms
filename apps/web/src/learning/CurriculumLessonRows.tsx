import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CircleIcon as Circle } from "@phosphor-icons/react/Circle";
import type { Lesson } from "./courseContent";

const VIRTUALIZED_LESSON_THRESHOLD = 50;
const LESSON_ROW_ESTIMATED_SIZE = 46;
const LESSON_LIST_OVERSCAN = 8;

interface CurriculumLessonButtonProps {
  lesson: Lesson;
  progress: number;
  isActive: boolean;
  isAvailable: boolean;
  onSelectLesson: (lessonNumber: number) => void;
  onClose?: () => void;
  activeLessonRef?: RefObject<HTMLButtonElement | null>;
  virtualIndex?: number;
  onVirtualizedKeyDown?: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

const CurriculumLessonButton = memo(function CurriculumLessonButton({
  lesson,
  progress,
  isActive,
  isAvailable,
  onSelectLesson,
  onClose,
  activeLessonRef,
  virtualIndex,
  onVirtualizedKeyDown,
}: CurriculumLessonButtonProps) {
  const [number, title, duration, status] = lesson;
  const completed =
    status === "done" || progress >= LESSON_PROGRESS_COMPLETE_THRESHOLD;
  const showProgress = isActive || progress > 0;

  return (
    <button
      type="button"
      ref={activeLessonRef}
      disabled={!isAvailable}
      title={isAvailable ? undefined : "Log in to watch this lecture"}
      aria-label={isAvailable ? undefined : `${title} (log in to watch)`}
      data-curriculum-lesson-index={virtualIndex}
      onKeyDown={onVirtualizedKeyDown}
      onClick={() => {
        if (!isAvailable) return;
        onSelectLesson(number);
        onClose?.();
      }}
      className={`learning-curriculum__lesson ${isActive ? "is-active" : ""} ${!isAvailable ? "cursor-not-allowed opacity-50" : ""}`}
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
      <span className="learning-curriculum__lesson-number">{number}.</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="learning-curriculum__lesson-duration">{duration}</span>
    </button>
  );
});

const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;

interface CurriculumLessonRowsProps {
  sectionId: number;
  sectionTitle: string;
  lessons: readonly Lesson[];
  selectedLesson: number;
  lessonProgress: Readonly<Record<number, number>>;
  onSelectLesson: (lessonNumber: number) => void;
  isLessonAvailable?: (lessonNumber: number) => boolean;
  onClose?: () => void;
  activeLessonRef: RefObject<HTMLButtonElement | null>;
  scrollportRef: RefObject<HTMLElement | null>;
  layoutRevision: number;
}

export function CurriculumLessonRows(props: CurriculumLessonRowsProps) {
  if (props.lessons.length < VIRTUALIZED_LESSON_THRESHOLD) {
    return (
      <>
        {props.lessons.map((lesson) => (
          <CurriculumLessonButton
            key={lesson[0]}
            lesson={lesson}
            progress={getLessonProgress(props.lessonProgress, lesson)}
            isActive={props.selectedLesson === lesson[0]}
            isAvailable={props.isLessonAvailable?.(lesson[0]) ?? true}
            onSelectLesson={props.onSelectLesson}
            onClose={props.onClose}
            activeLessonRef={
              props.selectedLesson === lesson[0]
                ? props.activeLessonRef
                : undefined
            }
          />
        ))}
      </>
    );
  }

  return <VirtualizedCurriculumLessonRows {...props} />;
}

function VirtualizedCurriculumLessonRows({
  sectionId,
  sectionTitle,
  lessons,
  selectedLesson,
  lessonProgress,
  onSelectLesson,
  isLessonAvailable,
  onClose,
  activeLessonRef,
  scrollportRef,
  layoutRevision,
}: CurriculumLessonRowsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocusIndexRef = useRef<number | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const activeIndex = useMemo(
    () => lessons.findIndex(([number]) => number === selectedLesson),
    [lessons, selectedLesson],
  );
  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      const indices = new Set(defaultRangeExtractor(range));
      indices.add(0);
      indices.add(lessons.length - 1);
      if (activeIndex >= 0) indices.add(activeIndex);
      return [...indices].sort((left, right) => left - right);
    },
    [activeIndex, lessons.length],
  );

  useLayoutEffect(() => {
    const scrollport = scrollportRef.current;
    const list = listRef.current;
    if (!scrollport || !list) return;

    const nextScrollMargin = Math.max(
      0,
      list.getBoundingClientRect().top -
        scrollport.getBoundingClientRect().top +
        scrollport.scrollTop,
    );
    setScrollMargin((current) =>
      Math.abs(current - nextScrollMargin) > 1 ? nextScrollMargin : current,
    );
  }, [layoutRevision, scrollportRef, sectionId]);

  // TanStack Virtual exposes a mutable virtualizer API by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: lessons.length,
    getScrollElement: () => scrollportRef.current,
    estimateSize: () => LESSON_ROW_ESTIMATED_SIZE,
    getItemKey: (index) => lessons[index]?.[0] ?? index,
    initialRect: { width: 1024, height: 768 },
    overscan: LESSON_LIST_OVERSCAN,
    rangeExtractor,
    scrollMargin,
  });
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const virtualItems = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    const pendingFocusIndex = pendingFocusIndexRef.current;
    if (pendingFocusIndex === null) return;
    const target = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-curriculum-lesson-index="${pendingFocusIndex}"]`,
    );
    if (!target) return;
    pendingFocusIndexRef.current = null;
    target.focus();
  }, [virtualItems]);

  const handleVirtualizedTab = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Tab") return;
      const currentIndex = Number(
        event.currentTarget.dataset.curriculumLessonIndex,
      );
      if (!Number.isInteger(currentIndex)) return;

      const direction = event.shiftKey ? -1 : 1;
      let nextIndex = currentIndex + direction;
      while (
        nextIndex >= 0 &&
        nextIndex < lessons.length &&
        !(isLessonAvailable?.(lessons[nextIndex]![0]) ?? true)
      ) {
        nextIndex += direction;
      }
      if (nextIndex < 0 || nextIndex >= lessons.length) return;
      const nextButton = listRef.current?.querySelector(
        `[data-curriculum-lesson-index="${nextIndex}"]`,
      );
      if (nextButton && !nextButton.hasAttribute("disabled")) return;

      event.preventDefault();
      pendingFocusIndexRef.current = nextIndex;
      virtualizerRef.current.scrollToIndex(nextIndex, { align: "auto" });
    },
    [isLessonAvailable, lessons],
  );

  return (
    <div
      ref={listRef}
      className="relative w-full"
      role="list"
      aria-label={`Section ${sectionId}: ${sectionTitle} lessons`}
      data-curriculum-virtualized-lessons
      data-section-id={sectionId}
      data-section-title={sectionTitle}
      data-lesson-count={lessons.length}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualItems.map((virtualItem) => {
        const lesson = lessons[virtualItem.index];
        if (!lesson) return null;
        const isActive = selectedLesson === lesson[0];
        return (
          <div
            key={lesson[0]}
            className="absolute inset-x-0 top-0"
            role="listitem"
            aria-posinset={virtualItem.index + 1}
            aria-setsize={lessons.length}
            data-index={virtualItem.index}
            style={{
              height: `${LESSON_ROW_ESTIMATED_SIZE}px`,
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
          >
            <CurriculumLessonButton
              lesson={lesson}
              progress={getLessonProgress(lessonProgress, lesson)}
              isActive={isActive}
              isAvailable={isLessonAvailable?.(lesson[0]) ?? true}
              onSelectLesson={onSelectLesson}
              onClose={onClose}
              activeLessonRef={isActive ? activeLessonRef : undefined}
              virtualIndex={virtualItem.index}
              onVirtualizedKeyDown={handleVirtualizedTab}
            />
          </div>
        );
      })}
    </div>
  );
}

function getLessonProgress(
  lessonProgress: Readonly<Record<number, number>>,
  lesson: Lesson,
) {
  const [number, , , status] = lesson;
  const storedProgress = lessonProgress[number];
  if (typeof storedProgress === "number") {
    return Math.max(0, Math.min(100, storedProgress));
  }
  return status === "done" ? 100 : 0;
}
