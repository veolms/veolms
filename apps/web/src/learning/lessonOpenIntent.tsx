import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { PrefetchPageLinks } from "react-router";
import type { CourseAccessResponse } from "@veolms/contracts";
import {
  courseKeys,
  fetchCourseAccess,
  prefetchCoursePage,
} from "../services/courses";
import {
  fetchLearningProgressResumeContext,
  learningProgressKeys,
  prefetchLearningProgressSnapshot,
} from "../services/learning-progress";
import type { LearningProgressResumeContextResponse } from "@veolms/contracts";
import {
  getCoursePlayerPath,
  getStoredCourseLessonId,
} from "./coursePlayerNavigation";
import { requestLessonAutoplay } from "./lessonAutoplayRequest";
import { persistentLearningPlayerHostBody } from "../routing/prerenderedBodies";
import { peekLastPlayedLesson } from "./lessonPositionOutbox";
import { beginLessonOpening } from "./lessonOpeningState";

/**
 * Which lesson a press on a course's play button (its picture, "Continue
 * Learning", a lesson in its curriculum) opens:
 *
 * - `resume`: a course the learner holds, at the lesson they carry on with:
 *   the one played last on any device (the server keeps it), or the next
 *   once that one is finished. `known` is that lesson when the page has it
 *   already (the course page's access answer). A finished course (`review`)
 *   opens where the course's own address does.
 * - a lesson number: that lesson (a free preview, a curriculum row).
 * - `course`: where the course's own address (`/learn/<course>`) opens, the
 *   lesson this browser last had open, or the first.
 */
export interface LessonOpenTarget {
  courseKey: string;
  lesson: "resume" | "course" | number;
  known?: number | null;
  review?: boolean;
}

/** How long the pointer rests on a way in before its lesson is readied. */
const HOVER_DELAY_MS = 120;
/** How many segments past the start the readied video fetches. */
const READY_SEGMENTS = 3;
/**
 * How long a press waits for the answer that names the lesson, when it was
 * not in yet (a tap, which has no hover before it): after that the course's
 * own address decides instead.
 */
const PRESS_WAIT_MS = 400;

const resumeOf = (
  answer: CourseAccessResponse | LearningProgressResumeContextResponse | null,
) => {
  if (!answer) return null;
  const lesson =
    "resume" in answer ? answer.resume?.resumeLesson : answer.resumeLesson;
  return lesson?.lessonNumber ?? null;
};

/** The lesson, when it can be told without asking the server. */
function readLesson(
  queryClient: QueryClient,
  target: LessonOpenTarget,
): number | null {
  if (typeof target.lesson === "number") return target.lesson;
  if (target.lesson === "course" || target.review) {
    return getStoredCourseLessonId(target.courseKey);
  }
  // Played in this tab since the server was last told: newer than it.
  const playedHere = peekLastPlayedLesson(target.courseKey);
  if (playedHere) return playedHere;
  const access = queryClient.getQueryState<CourseAccessResponse>(
    courseKeys.access(target.courseKey),
  );
  const resumeContext =
    queryClient.getQueryState<LearningProgressResumeContextResponse>(
      learningProgressKeys.resumeContext(target.courseKey),
    );
  // The fresher of the two answers the server may already have given.
  const answers = [access, resumeContext]
    .filter((state) => state?.data && !state.isInvalidated)
    .sort((a, b) => (b?.dataUpdatedAt ?? 0) - (a?.dataUpdatedAt ?? 0));
  for (const state of answers) {
    const lesson = resumeOf(state?.data ?? null);
    if (lesson) return lesson;
  }
  return target.known ?? null;
}

/**
 * The lesson, asking the server when it is not known here: the course's
 * access answer, which the lesson page asks for first anyway, or (an API
 * from before it) the resume answer. Failing both, the course's address.
 */
async function resolveLesson(
  queryClient: QueryClient,
  target: LessonOpenTarget,
): Promise<number> {
  const known = readLesson(queryClient, target);
  if (known) return known;
  const asked = await fetchCourseAccess(queryClient, target.courseKey)
    .then(resumeOf)
    .catch(() =>
      fetchLearningProgressResumeContext(queryClient, target.courseKey)
        .then(resumeOf)
        .catch(() => null),
    );
  return asked ?? getStoredCourseLessonId(target.courseKey);
}

/**
 * Gets a lesson ready to open playing at once: its course's curriculum and
 * access answer and the learner's progress in it (what the lesson page asks
 * for first), the player's own code, and the video's start-up answer and
 * first segments from where the learner left off (`preloadLessonPlayback`,
 * which also loads the video engine; skipped on a connection that saves
 * data). The page keeps one such video preload, which the next replaces.
 */
export function readyLessonToOpen(
  queryClient: QueryClient,
  courseKey: string,
  lessonNumber: number,
): void {
  void prefetchCoursePage(queryClient, courseKey);
  void prefetchLearningProgressSnapshot(queryClient, courseKey);
  void persistentLearningPlayerHostBody.preload();
  void import("./earlyHlsPreload").then(({ preloadLessonPlayback }) =>
    preloadLessonPlayback(courseKey, lessonNumber, {
      segments: READY_SEGMENTS,
    }),
  );
}

type IntentHandlers = {
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
};

export interface LessonOpenIntent {
  /** For the control (or controls) that open the lesson. */
  handlers: IntentHandlers;
  /**
   * Opens the lesson playing: `go` is given the lesson's number and does the
   * navigating (the lesson's address is `getCoursePlayerPath`).
   */
  open: (go: (lessonNumber: number) => void) => void;
  /** Readies the lesson now, as a hover does. */
  ready: () => void;
  /** The lesson page's code and stylesheets once readied; render it. */
  pageLinks: ReactNode;
}

/**
 * What both hooks below share: readying, on a hover, a focus or a touch, the
 * lesson of the target `targetRef` holds at that moment, and opening it.
 */
function useIntentCore(
  targetRef: RefObject<LessonOpenTarget | null>,
): LessonOpenIntent {
  const queryClient = useQueryClient();
  const [readiedPath, setReadiedPath] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const cancel = useCallback(() => window.clearTimeout(timerRef.current), []);
  useEffect(() => cancel, [cancel]);

  const readyTarget = useCallback(
    (target: LessonOpenTarget) => {
      void resolveLesson(queryClient, target).then((lessonNumber) => {
        setReadiedPath(getCoursePlayerPath(target.courseKey, lessonNumber));
        readyLessonToOpen(queryClient, target.courseKey, lessonNumber);
      });
    },
    [queryClient],
  );

  const ready = useCallback(() => {
    cancel();
    const target = targetRef.current;
    if (target) readyTarget(target);
  }, [cancel, readyTarget, targetRef]);

  const later = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;
    cancel();
    // Which lesson it is, asked at once: a press may follow quickly.
    void resolveLesson(queryClient, target).catch(() => undefined);
    timerRef.current = window.setTimeout(
      () => readyTarget(target),
      HOVER_DELAY_MS,
    );
  }, [cancel, queryClient, readyTarget, targetRef]);

  const open = useCallback(
    (go: (lessonNumber: number) => void) => {
      cancel();
      const target = targetRef.current;
      if (!target) return;
      // Answered at once, before the wait below for the lesson's number and
      // the lesson page's code.
      beginLessonOpening();
      const proceed = (lessonNumber: number) => {
        // Pressed to watch: it opens playing (the press lets it play with
        // sound), whether or not the readied video is in yet.
        requestLessonAutoplay(target.courseKey);
        go(lessonNumber);
      };
      const known = readLesson(queryClient, target);
      if (known) {
        proceed(known);
        return;
      }
      let settled = false;
      const fallback = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        proceed(getStoredCourseLessonId(target.courseKey));
      }, PRESS_WAIT_MS);
      void resolveLesson(queryClient, target).then((lessonNumber) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallback);
        proceed(lessonNumber);
      });
    },
    [cancel, queryClient, targetRef],
  );

  const handlers = useMemo<IntentHandlers>(
    () => ({
      onPointerEnter: (event) => {
        if (event.pointerType !== "touch") later();
      },
      onPointerLeave: cancel,
      // A touch has no hover before it: the lesson is readied as it lands.
      onPointerDown: (event) => {
        if (event.pointerType !== "mouse") ready();
      },
      onFocus: (event) => {
        // Only keyboard focus: a mouse press focuses the control too.
        if (event.currentTarget.matches(":focus-visible")) later();
      },
      onBlur: cancel,
    }),
    [cancel, later, ready],
  );

  return {
    handlers,
    open,
    ready,
    pageLinks: readiedPath ? <PrefetchPageLinks page={readiedPath} /> : null,
  };
}

/**
 * A way into a course's lessons that has its lesson ready by the time it is
 * pressed, and opens it playing, as the home's hero does with Enter (see
 * home/learner/useHeroLessonWarmUp.ts): the lesson is readied once the
 * pointer has rested on the control a moment (`HOVER_DELAY_MS`), on
 * keyboard focus after the same moment, and on a touch at once, as the tap
 * lands. Passing over it readies nothing but the answer that names the
 * lesson, a small one that is kept for a minute.
 */
export function useLessonOpenIntent(
  target: LessonOpenTarget | null,
): LessonOpenIntent {
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });
  return useIntentCore(targetRef);
}

/**
 * `useLessonOpenIntent` for a list of a course's lessons (its curriculum):
 * each row's handlers, and its press, name the row's lesson.
 */
export function useLessonListOpenIntent(courseKey: string | null) {
  const targetRef = useRef<LessonOpenTarget | null>(null);
  const core = useIntentCore(targetRef);
  const pick = useCallback(
    (lessonNumber: number) => {
      targetRef.current = courseKey
        ? { courseKey, lesson: lessonNumber }
        : null;
    },
    [courseKey],
  );
  const handlersFor = useCallback(
    (lessonNumber: number): IntentHandlers => ({
      onPointerEnter: (event) => {
        pick(lessonNumber);
        core.handlers.onPointerEnter(event);
      },
      onPointerLeave: core.handlers.onPointerLeave,
      onPointerDown: (event) => {
        pick(lessonNumber);
        core.handlers.onPointerDown(event);
      },
      onFocus: (event) => {
        pick(lessonNumber);
        core.handlers.onFocus(event);
      },
      onBlur: core.handlers.onBlur,
    }),
    [core.handlers, pick],
  );
  const open = useCallback(
    (lessonNumber: number, go: (lessonNumber: number) => void) => {
      pick(lessonNumber);
      core.open(go);
    },
    [core, pick],
  );
  return { handlersFor, open, pageLinks: core.pageLinks };
}

type IntentHandlerSet = Partial<{
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
}>;

/** Several sets of intent handlers on one control, each called in turn. */
export function mergeIntentHandlers(
  ...sets: (IntentHandlerSet | undefined)[]
): Required<IntentHandlerSet> {
  const each =
    <Key extends keyof IntentHandlerSet>(key: Key) =>
    (...args: Parameters<NonNullable<IntentHandlerSet[Key]>>) => {
      for (const set of sets) {
        (set?.[key] as ((...a: typeof args) => void) | undefined)?.(...args);
      }
    };
  return {
    onPointerEnter: each("onPointerEnter"),
    onPointerLeave: each("onPointerLeave"),
    onPointerDown: each("onPointerDown"),
    onFocus: each("onFocus"),
    onBlur: each("onBlur"),
  };
}
