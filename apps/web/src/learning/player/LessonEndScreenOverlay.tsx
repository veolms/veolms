import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowElbowDownLeftIcon as ArrowElbowDownLeft } from "@phosphor-icons/react/ArrowElbowDownLeft";
import { BrainIcon as Brain } from "@phosphor-icons/react/Brain";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { usePlayerMobileInteraction } from "@veolms/video-player";

export interface NextLessonInfo {
  id: number;
  title: string;
  duration?: string;
  sectionTitle?: string;
  thumbnailSrc?: string;
  lectureNumber?: number;
  totalLessons?: number;
}

export interface LessonEndScreenOverlayProps {
  nextLesson?: NextLessonInfo;
  autoplayEnabled?: boolean;
  /** False while lessons other than the one that just ended are unfinished. */
  courseComplete?: boolean;
  onGoNext: () => void;
  onRestart: () => void;
  onCancelAutoplay: () => void;
  onClose?: () => void;
  countdownSeconds?: number;
  /**
   * The lesson has a quiz. The screen offers it instead of counting down to
   * the next lesson: Attempt Quiz (Enter) opens it, Skip Quiz (Esc) goes on
   * to the next lesson, or closes the screen after the last one.
   */
  quiz?: { onAttempt: () => void };
  /** The player's timeline and bottom row are shown over the end screen. */
  controlsInset?: boolean;
  /**
   * The player is the mini window: the screen is drawn small, under the
   * window's own close and expand, and the countdown stands still (it goes
   * on when the player is full again), so the next lesson never starts while
   * the learner is busy elsewhere. Enter and Esc are left to the page.
   */
  minimized?: boolean;
}

/*
 * The end screen covers the whole video and is drawn the way the rest of the
 * player is: white words on the dimmed last frame, the white button the
 * player's other messages use, nothing raised. It is laid out by the size
 * of the player itself (a container), not the window: the same screen is a
 * strip on a phone held upright, a box beside the lessons panel, and the
 * whole display in full screen.
 *
 * Heights, measured on the player: a phone held upright gives about 200px,
 * so the countdown ring (which needs 17rem) gives way there to the words
 * "in 5s" after "Up next", and the details line (11rem) stays.
 */
const buttonBase =
  "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white @lg:h-10 @lg:px-5 @4xl:h-12 @4xl:px-6 @4xl:text-base";
const primaryButtonClass = `${buttonBase} bg-white text-black hover:bg-white/85`;
const secondaryButtonClass = `${buttonBase} bg-white/12 text-white hover:bg-white/20`;
const buttonIconClass = "size-4 @4xl:size-5";

/*
 * Next and Cancel are drawn as the keys that do them, Enter and Esc: a
 * keycap's raised bottom edge that sinks when pressed, and the key's own
 * mark on it.
 */
const keycapBase =
  "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-3.5 pb-0.5 text-sm font-semibold whitespace-nowrap transition-[background-color,box-shadow,translate] duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:translate-y-0.5 @lg:h-10 @lg:px-4 @4xl:h-12 @4xl:px-5 @4xl:text-base";
const enterKeycapClass = `${keycapBase} bg-white text-black shadow-[inset_0_-3px_0_rgb(0_0_0/0.2),0_1px_2px_rgb(0_0_0/0.35)] hover:bg-white/90 active:shadow-[inset_0_-1px_0_rgb(0_0_0/0.2)]`;
const escKeycapClass = `${keycapBase} bg-white/12 text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.35),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-white/20 active:shadow-[inset_0_-1px_0_rgb(0_0_0/0.35)]`;
/** The key's name, as printed on it. */
const keyLabelClass =
  "rounded-[5px] px-1.5 py-px text-[0.6875rem] leading-4 font-bold tracking-wide uppercase @4xl:text-xs";

/** Typing, or a control that answers the key itself, keeps the key. */
function keyBelongsToTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    Boolean(
      target.closest(
        "input, textarea, select, button, a[href], [role=button], [role=menuitem], [role=option], [role=slider]",
      ),
    )
  );
}

/** The ring's circle: radius 21 in a 48-unit box. */
const RING_LENGTH = 2 * Math.PI * 21;

export function LessonEndScreenOverlay({
  nextLesson,
  autoplayEnabled = true,
  courseComplete = true,
  onGoNext,
  onRestart,
  onCancelAutoplay,
  onClose,
  countdownSeconds = 5,
  quiz,
  controlsInset = false,
  minimized = false,
}: LessonEndScreenOverlayProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(countdownSeconds);
  // A click or tap on the screen (not on its buttons) holds the countdown
  // where it is, number and ring alike. Only Cancel or Next ends it then.
  const [countdownHeld, setCountdownHeld] = useState(false);
  const centralControlsShown = useCentralControlsShown();
  const hasNextLesson = Boolean(nextLesson);
  // Still counting down at zero: the next lesson is opened right after that
  // render, and the screen stays as it was until then. Ending the countdown
  // at zero drew the Replay screen for a frame on the way to the next lesson.
  // A lesson with a quiz has no countdown: the learner attempts the quiz
  // or skips it.
  const isCountdownActive = autoplayEnabled && hasNextLesson && !quiz;
  const skipQuiz = hasNextLesson ? onGoNext : (onClose ?? onCancelAutoplay);

  useEffect(() => {
    if (!isCountdownActive || countdownHeld || minimized) {
      return;
    }

    if (secondsRemaining <= 0) {
      onGoNext();
      return;
    }

    const timer = window.setTimeout(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdownHeld, isCountdownActive, minimized, onGoNext, secondsRemaining]);

  // Enter goes on to the next lesson, Esc cancels the countdown (or, with
  // none running, closes the end screen), as the two keycaps say.
  const keysRef = useRef({
    hasNextLesson,
    isCountdownActive,
    minimized,
    onGoNext,
    quiz,
    skipQuiz,
  });
  keysRef.current = {
    hasNextLesson,
    isCountdownActive,
    minimized,
    onGoNext,
    quiz,
    skipQuiz,
  };
  const cancelKeyRef = useRef(onCancelAutoplay);
  cancelKeyRef.current = onCancelAutoplay;
  const closeKeyRef = useRef(onClose);
  closeKeyRef.current = onClose;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        keyBelongsToTarget(event.target)
      ) {
        return;
      }
      const keys = keysRef.current;
      if (keys.minimized) return;
      if (keys.quiz) {
        if (event.key === "Enter") {
          event.preventDefault();
          keys.quiz.onAttempt();
        } else if (event.key === "Escape") {
          event.preventDefault();
          keys.skipQuiz();
        }
        return;
      }
      if (event.key === "Enter" && keys.hasNextLesson) {
        event.preventDefault();
        keys.onGoNext();
      } else if (event.key === "Escape") {
        const action = keys.isCountdownActive
          ? cancelKeyRef.current
          : closeKeyRef.current;
        if (!action) return;
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const screenProps = {
    "data-lesson-end-screen": "",
    role: "dialog",
    "aria-label": quiz
      ? "Lesson quiz"
      : nextLesson
        ? "Up next"
        : "Lesson finished",
    "data-countdown-held": countdownHeld ? "" : undefined,
    // The screen keeps its clicks: one that reached the video beneath
    // would play it, and playing closes the end screen. The mini window
    // still gets the presses, so it can be dragged from anywhere on it.
    onPointerDown: minimized
      ? undefined
      : (event: ReactPointerEvent) => event.stopPropagation(),
    onPointerUp: minimized
      ? undefined
      : (event: ReactPointerEvent) => event.stopPropagation(),
    onDoubleClick: (event: ReactMouseEvent) => event.stopPropagation(),
    onClick: (event: ReactMouseEvent) => {
      event.stopPropagation();
      if (event.target instanceof Element && event.target.closest("button")) {
        return;
      }
      if (isCountdownActive) setCountdownHeld(true);
    },
  } as const;
  const screenClass = `pointer-events-auto absolute inset-0 overflow-hidden bg-black/85 text-white select-none [container-type:size] animate-in fade-in duration-200 ${
    // The player's controls layer (z-30) is drawn over the end screen.
    controlsInset ? "z-20" : "z-50"
  }`;

  if (minimized) {
    return (
      <MinimizedLessonEndScreen
        screenProps={screenProps}
        screenClass={screenClass}
        nextLesson={nextLesson}
        courseComplete={courseComplete}
        isCountdownActive={isCountdownActive}
        onGoNext={onGoNext}
        onRestart={onRestart}
        onCancelAutoplay={onCancelAutoplay}
      />
    );
  }

  if (centralControlsShown) {
    return (
      <LessonEndScreenAroundCentralControls
        screenProps={screenProps}
        screenClass={screenClass}
        nextLesson={nextLesson}
        courseComplete={courseComplete}
        isCountdownActive={isCountdownActive}
        secondsRemaining={secondsRemaining}
        quiz={
          quiz ? { onAttempt: quiz.onAttempt, onSkip: skipQuiz } : undefined
        }
        onGoNext={onGoNext}
        onRestart={onRestart}
        onCancelAutoplay={onCancelAutoplay}
      />
    );
  }

  if (quiz) {
    return (
      <div
        {...screenProps}
        className={`${screenClass} grid place-items-center ${
          controlsInset ? "pb-14 @lg:pb-16" : ""
        }`}
      >
        <div className="flex w-full max-w-2xl min-w-0 flex-col items-center px-6 text-center @4xl:max-w-3xl">
          <Brain
            weight="fill"
            aria-hidden="true"
            className="mb-3 hidden size-11 text-(--accent) [@container_(min-height:15rem)]:block @4xl:size-16"
          />
          <p className="text-sm font-medium text-white/65 @4xl:text-base">
            {QUIZ_LABEL}
          </p>
          <h2 className="mt-1 line-clamp-2 max-w-full text-base leading-snug font-semibold text-balance [@container_(max-height:11rem)]:line-clamp-1 @lg:text-xl @4xl:text-3xl">
            {QUIZ_TITLE}
          </h2>
          <p className="mt-1 hidden max-w-full text-xs text-balance text-white/60 [@container_(min-height:11rem)]:block @lg:text-sm @4xl:text-base">
            {quizMessage(nextLesson)}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 @lg:mt-5 @lg:gap-3 @4xl:mt-7">
            <SkipQuizKeycap onSkip={skipQuiz} />
            <AttemptQuizKeycap onAttempt={quiz.onAttempt} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      {...screenProps}
      className={`${screenClass} grid place-items-center ${
        // The words and buttons are centred above the controls' lowest band.
        controlsInset ? "pb-14 @lg:pb-16" : ""
      }`}
    >
      <div className="flex w-full max-w-2xl min-w-0 flex-col items-center px-6 text-center @4xl:max-w-3xl">
        {nextLesson ? (
          <>
            {isCountdownActive ? (
              <CountdownRing
                seconds={countdownSeconds}
                remaining={secondsRemaining}
                held={countdownHeld}
              />
            ) : null}
            <p className="text-sm font-medium text-white/65 @4xl:text-base">
              Up next
              {isCountdownActive ? (
                <span className="[@container_(min-height:17rem)]:hidden">
                  {" "}
                  in {secondsRemaining}s
                </span>
              ) : null}
            </p>
            <h2 className="mt-1 line-clamp-2 max-w-full text-base leading-snug font-semibold text-balance [@container_(max-height:11rem)]:line-clamp-1 @lg:text-xl @4xl:text-3xl">
              {nextLesson.title}
            </h2>
            <NextLessonDetails lesson={nextLesson} />
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 @lg:mt-5 @lg:gap-3 @4xl:mt-7">
              {/* One slot, so the focus stays on it when Cancel turns into
                  Replay. */}
              {isCountdownActive ? (
                <button
                  type="button"
                  onClick={onCancelAutoplay}
                  className={escKeycapClass}
                  aria-keyshortcuts="Escape"
                  title="Cancel (Esc)"
                >
                  <span
                    aria-hidden="true"
                    className={`${keyLabelClass} bg-white/14 text-white/80`}
                  >
                    Esc
                  </span>
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRestart}
                  className={secondaryButtonClass}
                >
                  <ArrowCounterClockwise
                    weight="bold"
                    className={buttonIconClass}
                  />
                  Replay
                </button>
              )}
              <button
                type="button"
                onClick={onGoNext}
                className={enterKeycapClass}
                aria-label="Next lesson"
                aria-keyshortcuts="Enter"
                title="Next lesson (Enter)"
              >
                Next
                <ArrowElbowDownLeft
                  weight="bold"
                  aria-hidden="true"
                  className={buttonIconClass}
                />
              </button>
            </div>
          </>
        ) : (
          <>
            <CheckCircle
              weight="fill"
              aria-hidden="true"
              className="mb-3 hidden size-11 text-(--accent) [@container_(min-height:15rem)]:block @4xl:size-16"
            />
            {/* The last lesson ending used to announce the course as
                completed even with earlier lessons skipped. */}
            <h2 className="text-lg leading-snug font-semibold text-balance @lg:text-xl @4xl:text-3xl">
              {courseComplete
                ? "Course complete"
                : "You've reached the last lesson"}
            </h2>
            <p className="mt-1 text-sm text-white/65 @4xl:text-base">
              {courseComplete
                ? "You've finished every lesson in this course."
                : "Some earlier lessons are still unfinished."}
            </p>
            <div className="mt-4 flex justify-center @lg:mt-5 @4xl:mt-7">
              <button
                type="button"
                onClick={onRestart}
                className={primaryButtonClass}
              >
                <ArrowCounterClockwise
                  weight="bold"
                  className={buttonIconClass}
                />
                Replay
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/*
 * The player's own buttons in the middle of the picture (previous, play,
 * next: `LessonCentralControls`) are shown on a touch screen and in a window
 * narrower than 40rem (`max-sm`). The end screen then leaves them their band
 * across the middle instead of drawing its own buttons under them.
 */
const NARROW_WINDOW_QUERY = "(width < 40rem)";

function subscribeNarrowWindow(onChange: () => void) {
  const query = window.matchMedia(NARROW_WINDOW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useCentralControlsShown() {
  const touch = usePlayerMobileInteraction();
  const narrow = useSyncExternalStore(
    subscribeNarrowWindow,
    () => window.matchMedia(NARROW_WINDOW_QUERY).matches,
    () => false,
  );
  return touch || narrow;
}

/**
 * The band the central controls take: the 62px play button between the
 * 46px lesson buttons, 24px apart (`LessonCentralControls`).
 */
const centralBandClass = "h-15.5 w-[12.625rem] shrink-0";
/** Side buttons, beside the central controls: no key marks, less padding. */
const sideButtonClass =
  "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * The end screen where the player's central controls are shown. Three
 * bands, the middle one theirs: the words above it in two short lines (no
 * details line, the title on one line), and Cancel and Next below it. A
 * player too short for that (a phone held upright, about 200px) puts the
 * words on one line and Cancel and Next either side of the central
 * controls.
 */
function LessonEndScreenAroundCentralControls({
  screenProps,
  screenClass,
  nextLesson,
  courseComplete,
  isCountdownActive,
  secondsRemaining,
  quiz,
  onGoNext,
  onRestart,
  onCancelAutoplay,
}: {
  screenProps: HTMLAttributes<HTMLDivElement>;
  screenClass: string;
  nextLesson?: NextLessonInfo;
  courseComplete: boolean;
  isCountdownActive: boolean;
  secondsRemaining: number;
  /** The lesson's quiz, offered in place of the next lesson. */
  quiz?: { onAttempt: () => void; onSkip: () => void };
  onGoNext: () => void;
  onRestart: () => void;
  onCancelAutoplay: () => void;
}) {
  const label = quiz
    ? QUIZ_LABEL
    : nextLesson
      ? `Up next${isCountdownActive ? ` in ${secondsRemaining}s` : ""}`
      : courseComplete
        ? "Course complete"
        : "You've reached the last lesson";
  const title = quiz
    ? QUIZ_TITLE
    : nextLesson
      ? nextLesson.title
      : courseComplete
        ? "You've finished every lesson in this course."
        : "Some earlier lessons are still unfinished.";
  const firstAction = quiz
    ? { label: "Skip Quiz", onClick: quiz.onSkip }
    : isCountdownActive
      ? { label: "Cancel", onClick: onCancelAutoplay }
      : { label: "Replay", onClick: onRestart };
  const secondAction = quiz
    ? {
        label: "Attempt Quiz",
        ariaLabel: "Attempt quiz",
        onClick: quiz.onAttempt,
      }
    : nextLesson
      ? { label: "Next", ariaLabel: "Next lesson", onClick: onGoNext }
      : null;

  return (
    <div
      {...screenProps}
      className={`${screenClass} grid grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)]`}
    >
      <div className="flex min-h-0 min-w-0 flex-col items-center justify-end px-6 pb-1.5 text-center">
        <p className="hidden max-w-full text-sm font-medium text-white/65 [@container_(min-height:16.5rem)]:block">
          {label}
        </p>
        <h2 className="hidden max-w-full truncate text-base leading-snug font-semibold [@container_(min-height:16.5rem)]:mt-1 [@container_(min-height:16.5rem)]:block">
          {title}
        </h2>
        <p className="max-w-full truncate text-sm [@container_(min-height:16.5rem)]:hidden">
          <span className="font-medium text-white/65">{label} · </span>
          <span className="font-semibold">{title}</span>
        </p>
      </div>
      <div className="flex items-center justify-center gap-1.5">
        <div className="flex w-0 grow justify-end">
          <button
            type="button"
            onClick={firstAction.onClick}
            className={`${sideButtonClass} bg-white/12 text-white hover:bg-white/20 [@container_(min-height:16.5rem)]:hidden`}
          >
            {firstAction.label}
          </button>
        </div>
        <div aria-hidden="true" className={centralBandClass} />
        <div className="flex w-0 grow justify-start">
          {secondAction ? (
            <button
              type="button"
              onClick={secondAction.onClick}
              className={`${sideButtonClass} bg-white text-black hover:bg-white/85 [@container_(min-height:16.5rem)]:hidden`}
              aria-label={secondAction.ariaLabel}
            >
              {secondAction.label}
            </button>
          ) : null}
        </div>
      </div>
      <div className="hidden items-start justify-center gap-2 pt-2 [@container_(min-height:16.5rem)]:flex">
        {quiz ? (
          <>
            <SkipQuizKeycap onSkip={quiz.onSkip} />
            <AttemptQuizKeycap onAttempt={quiz.onAttempt} />
          </>
        ) : isCountdownActive ? (
          <button
            type="button"
            onClick={onCancelAutoplay}
            className={escKeycapClass}
            aria-keyshortcuts="Escape"
            title="Cancel (Esc)"
          >
            <span
              aria-hidden="true"
              className={`${keyLabelClass} bg-white/14 text-white/80`}
            >
              Esc
            </span>
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onRestart}
            className={nextLesson ? secondaryButtonClass : primaryButtonClass}
          >
            <ArrowCounterClockwise weight="bold" className={buttonIconClass} />
            Replay
          </button>
        )}
        {nextLesson && !quiz ? (
          <button
            type="button"
            onClick={onGoNext}
            className={enterKeycapClass}
            aria-label="Next lesson"
            aria-keyshortcuts="Enter"
            title="Next lesson (Enter)"
          >
            Next
            <ArrowElbowDownLeft
              weight="bold"
              aria-hidden="true"
              className={buttonIconClass}
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}

const QUIZ_LABEL = "Quiz time";
const QUIZ_TITLE = "Check what you just learned";

function quizMessage(nextLesson: NextLessonInfo | undefined) {
  return nextLesson
    ? "Attempt this lesson's quiz, or skip it and go on to the next lesson."
    : "Attempt this lesson's quiz, or skip it.";
}

/** Skip Quiz, in Cancel's place and drawn as its key, Esc. */
function SkipQuizKeycap({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      className={escKeycapClass}
      aria-keyshortcuts="Escape"
      title="Skip quiz (Esc)"
    >
      <span
        aria-hidden="true"
        className={`${keyLabelClass} bg-white/14 text-white/80`}
      >
        Esc
      </span>
      Skip Quiz
    </button>
  );
}

/** Attempt Quiz, in Next's place and drawn as its key, Enter. */
function AttemptQuizKeycap({ onAttempt }: { onAttempt: () => void }) {
  return (
    <button
      type="button"
      onClick={onAttempt}
      className={enterKeycapClass}
      aria-keyshortcuts="Enter"
      title="Attempt quiz (Enter)"
    >
      Attempt Quiz
      <ArrowElbowDownLeft
        weight="bold"
        aria-hidden="true"
        className={buttonIconClass}
      />
    </button>
  );
}

/** Buttons small enough for the mini window. */
const miniButtonClass =
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * The end screen in the mini window: what comes next on one line and its
 * title on another, with Cancel (or Replay) and Next under them, below the
 * window's own close and expand. No countdown is shown, as none runs here.
 */
function MinimizedLessonEndScreen({
  screenProps,
  screenClass,
  nextLesson,
  courseComplete,
  isCountdownActive,
  onGoNext,
  onRestart,
  onCancelAutoplay,
}: {
  screenProps: HTMLAttributes<HTMLDivElement>;
  screenClass: string;
  nextLesson?: NextLessonInfo;
  courseComplete: boolean;
  isCountdownActive: boolean;
  onGoNext: () => void;
  onRestart: () => void;
  onCancelAutoplay: () => void;
}) {
  const label = nextLesson
    ? "Up next"
    : courseComplete
      ? "Course complete"
      : "You've reached the last lesson";

  return (
    <div
      {...screenProps}
      className={`${screenClass} flex flex-col items-center justify-center px-3 pt-9 pb-2 text-center`}
    >
      <p className="text-xs font-medium text-white/65">{label}</p>
      {nextLesson ? (
        <h2 className="mt-0.5 line-clamp-1 max-w-full text-sm leading-snug font-semibold">
          {nextLesson.title}
        </h2>
      ) : null}
      <div className="mt-2 flex items-center justify-center gap-2">
        {isCountdownActive ? (
          <button
            type="button"
            onClick={onCancelAutoplay}
            className={`${miniButtonClass} bg-white/12 text-white hover:bg-white/20`}
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onRestart}
            className={`${miniButtonClass} gap-1.5 ${
              nextLesson
                ? "bg-white/12 text-white hover:bg-white/20"
                : "bg-white text-black hover:bg-white/85"
            }`}
          >
            <ArrowCounterClockwise weight="bold" className="size-3.5" />
            Replay
          </button>
        )}
        {nextLesson ? (
          <button
            type="button"
            onClick={onGoNext}
            className={`${miniButtonClass} bg-white text-black hover:bg-white/85`}
            aria-label="Next lesson"
          >
            Next
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Where the next lesson stands in the course, its section and length. */
function NextLessonDetails({ lesson }: { lesson: NextLessonInfo }) {
  const details = [
    lesson.lectureNumber
      ? `Lesson ${lesson.lectureNumber}${lesson.totalLessons ? ` of ${lesson.totalLessons}` : ""}`
      : null,
    lesson.sectionTitle,
    lesson.duration,
  ].filter(Boolean);
  if (details.length === 0) return null;
  return (
    <p className="mt-1 hidden max-w-full truncate text-xs text-white/60 [@container_(min-height:11rem)]:block @lg:text-sm @4xl:text-base">
      {details.join(" · ")}
    </p>
  );
}

/**
 * The seconds left, in a ring that fills as they run out. The ring is one
 * animation from start to end, so it moves smoothly instead of a step each
 * second.
 */
function CountdownRing({
  seconds,
  remaining,
  held = false,
}: {
  seconds: number;
  remaining: number;
  /** Stopped where it is (see `countdownHeld`). */
  held?: boolean;
}) {
  const progressRef = useRef<SVGCircleElement>(null);
  const animationRef = useRef<Animation | null>(null);
  // A ring drawn part way through (the player made full again from the mini
  // window, where the countdown stood still) starts where the count is.
  const startRemainingRef = useRef(remaining);

  useEffect(() => {
    const circle = progressRef.current;
    if (!circle || typeof circle.animate !== "function") return;
    const animation = circle.animate(
      [{ strokeDashoffset: RING_LENGTH }, { strokeDashoffset: 0 }],
      { duration: seconds * 1000, easing: "linear", fill: "forwards" },
    );
    animation.currentTime =
      Math.max(0, seconds - startRemainingRef.current) * 1000;
    animationRef.current = animation;
    return () => {
      animation.cancel();
      animationRef.current = null;
    };
  }, [seconds]);

  useEffect(() => {
    if (held) animationRef.current?.pause();
  }, [held]);

  return (
    <span
      aria-hidden="true"
      className="relative mb-3 hidden size-14 place-items-center [@container_(min-height:17rem)]:grid @4xl:mb-5 @4xl:size-20"
    >
      <svg
        viewBox="0 0 48 48"
        className="absolute inset-0 size-full -rotate-90"
      >
        <circle
          cx="24"
          cy="24"
          r="21"
          fill="none"
          strokeWidth="3"
          className="stroke-white/20"
        />
        <circle
          ref={progressRef}
          cx="24"
          cy="24"
          r="21"
          fill="none"
          strokeWidth="3"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH}
          className="stroke-(--accent)"
        />
      </svg>
      <span className="text-xl font-semibold tabular-nums @4xl:text-3xl">
        {remaining}
      </span>
    </span>
  );
}
