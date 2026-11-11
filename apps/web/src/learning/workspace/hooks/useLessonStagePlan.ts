import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { LessonVideoPlayerProps } from "../../player";
import type { AdaptedCurriculum } from "../../courseCurriculumAdapter";
import {
  getCachedVideoPlaybackBootstrap,
  getRefusedVideoPlaybackBootstrap,
  getVideoPlaybackBootstrap,
  PLAYBACK_BOOTSTRAP_LIMIT_MS,
  VideoPlaybackBootstrapError,
} from "../../videoPlaybackBootstrap";
import {
  noVideoNoticeFor,
  noVideoStageFor,
  planLessonStage,
  viewerMayRecordProgress,
  type LessonDescriptionState,
  type LessonStagePlan,
} from "../../lessonWithoutVideo";
import {
  toVideoPlaybackBootstrapError,
  videoPlaybackFailureNotice,
} from "../../videoPlaybackFailure";
import type { AuthUser } from "../../../store/auth.store";
import type {
  useCourseAccess,
  useCourseOverview,
} from "../../../services/courses";
import type { VideoPlaybackBootstrap } from "@veolms/contracts";
import type { CourseLesson } from "@veolms/contracts";
import type { OctopusKind } from "../../../components/OctopusIllustration";
import { reportPlaybackIncident } from "../../player/playbackIncidents";
import { coursesService } from "../../../services/courses/courses.service";

/**
 * Bootstrap failures that are not a fault: the learner must sign in or get
 * the course, or the lesson has no video. Everything else that stops a
 * video from being prepared is reported as a `page_error` incident.
 */
const EXPECTED_BOOTSTRAP_REFUSALS = new Set([
  "UNAUTHORIZED",
  "MFA_REQUIRED",
  "MEDIA_NOT_FOUND",
]);

export interface UseLessonStagePlanArgs {
  courseSlug: string | undefined;
  onUnlockCourse: () => void;
  onOpenLogin: () => void;
  isAuthenticated: boolean;
  resolvedAuthUser: AuthUser | null;
  isAuthResolutionPending: boolean;
  courseAccessQuery: ReturnType<typeof useCourseAccess>;
  courseOverview: ReturnType<typeof useCourseOverview>["data"];
  selectedLesson: number;
  adaptedCurriculum: AdaptedCurriculum | null;
  playbackBootstrapError: VideoPlaybackBootstrapError | null;
  setPlaybackBootstrapError: Dispatch<
    SetStateAction<VideoPlaybackBootstrapError | null>
  >;
  showingQuiz: boolean;
  protectedPlayback: boolean;
  playbackRequestKey: string;
  playbackBootstrap: VideoPlaybackBootstrap | null;
  setPlaybackBootstrap: Dispatch<SetStateAction<VideoPlaybackBootstrap | null>>;
  playbackBootstrapAttempt: number;
  playbackRequestKeyRef: RefObject<string | null>;
  retryPlaybackBootstrap: () => void;
  courseUnavailable: "failed" | "not-found" | "no-lessons" | null;
  retryCourseOverview: () => void;
  selectedLessonQuizAttached: boolean | undefined;
  stageLesson: CourseLesson | undefined;
  lessonDescriptionState: LessonDescriptionState;
  retryLessonDescription: () => void;
}

export interface UseLessonStagePlanResult {
  lessonStagePlan: LessonStagePlan;
  playbackAccessError:
    | {
        kind: "login" | "access" | "retry" | "notice";
        message: string;
        actionLabel: string;
        onAction?: () => void;
        title?: string;
        link?: { label: string; href: string };
        illustration?: OctopusKind;
        article?: string;
      }
    | null
    | undefined;
  lessonTextPending: boolean;
  playbackBootstrapPending: boolean;
  /** An audio lesson's file address is on its way (the player's loader). */
  audioSourcePending: boolean;
  /** An audio lesson's file, once its address is known. */
  audioSource: LessonAudioSource | null;
  /** Asks for a new address (the last one expired, or failed). */
  retryAudioSource: () => void;
}

export function useLessonStagePlan({
  courseSlug,
  onUnlockCourse,
  onOpenLogin,
  isAuthenticated,
  resolvedAuthUser,
  isAuthResolutionPending,
  courseAccessQuery,
  courseOverview,
  selectedLesson,
  adaptedCurriculum,
  playbackBootstrapError,
  setPlaybackBootstrapError,
  showingQuiz,
  protectedPlayback,
  playbackRequestKey,
  playbackBootstrap,
  setPlaybackBootstrap,
  playbackBootstrapAttempt,
  playbackRequestKeyRef,
  retryPlaybackBootstrap,
  courseUnavailable,
  retryCourseOverview,
  selectedLessonQuizAttached,
  stageLesson,
  lessonDescriptionState,
  retryLessonDescription,
}: UseLessonStagePlanArgs): UseLessonStagePlanResult {
  const lessonStagePlan = useMemo(() => {
    const course = courseOverview?.course;
    // The server's answer: whether every lesson opens to the viewer.
    const courseAccess = courseAccessQuery.data;
    // Part of a course is held too: its sections play and record progress.
    const holdsCourse = courseAccess
      ? courseAccess.access === "full" ||
        Boolean(courseAccess.openSectionIds?.length)
      : undefined;
    return planLessonStage({
      lesson: adaptedCurriculum?.lessonsByNumber.get(selectedLesson),
      showingQuiz,
      hasQuiz: selectedLessonQuizAttached,
      descriptionState: lessonDescriptionState,
      viewerMayRecordProgress:
        Boolean(course) &&
        !isAuthResolutionPending &&
        viewerMayRecordProgress({
          isAuthenticated,
          managesCourse: courseAccess?.viewer === "manager",
          holdsCourse,
          pricingType: courseOverview?.pricing?.pricingType,
          canSelfEnroll: courseOverview?.canSelfEnroll,
        }),
    });
  }, [
    adaptedCurriculum,
    courseOverview,
    courseAccessQuery.data,
    isAuthResolutionPending,
    isAuthenticated,
    lessonDescriptionState,
    selectedLesson,
    selectedLessonQuizAttached,
    showingQuiz,
  ]);
  const requestsLessonPlayback = lessonStagePlan.requestsPlayback;
  const requestsLessonAudio = lessonStagePlan.requestsAudio;
  const audioLink = useLessonAudioLink(
    requestsLessonAudio ? courseOverview?.course.id : undefined,
    requestsLessonAudio ? stageLesson?.id : undefined,
  );

  useEffect(() => {
    setPlaybackBootstrapError(null);
    if (!courseSlug) {
      setPlaybackBootstrap(null);
      setPlaybackBootstrapError(null);
      playbackRequestKeyRef.current = null;
      return;
    }

    if (!requestsLessonPlayback) {
      // Nothing to play: the request could only come back "not found".
      setPlaybackBootstrap(null);
      playbackRequestKeyRef.current = null;
      return;
    }

    if (playbackRequestKeyRef.current === playbackRequestKey) return;
    playbackRequestKeyRef.current = playbackRequestKey;

    const cached = getCachedVideoPlaybackBootstrap({
      courseSlug,
      lessonNumber: selectedLesson,
    });
    if (cached) {
      setPlaybackBootstrap(cached);
      setPlaybackBootstrapError(null);
      return;
    }

    // An answer the preload or an earlier run of this effect was just given.
    // Taken here rather than from the promise below, so the refusal never
    // leaves the page for a moment in between.
    const refused = getRefusedVideoPlaybackBootstrap({
      courseSlug,
      lessonNumber: selectedLesson,
    });
    if (refused) {
      setPlaybackBootstrap(null);
      setPlaybackBootstrapError(refused);
      return () => {
        playbackRequestKeyRef.current = null;
      };
    }

    setPlaybackBootstrap(null);
    setPlaybackBootstrapError(null);
    let active = true;
    let settled = false;
    void getVideoPlaybackBootstrap({
      courseSlug,
      lessonNumber: selectedLesson,
    })
      .then((bootstrap) => {
        if (active) {
          settled = true;
          setPlaybackBootstrap(bootstrap);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        settled = true;
        setPlaybackBootstrap(null);
        setPlaybackBootstrapError(toVideoPlaybackBootstrapError(error));
      });

    return () => {
      active = false;
      // This effect also re-runs for the same lesson, for example when the
      // sign-in state resolves while the request is still out. The answer to
      // this request is now ignored, so forget the key: otherwise the re-run
      // sees the lesson as already requested and the player waits forever.
      if (!settled && playbackRequestKeyRef.current === playbackRequestKey) {
        playbackRequestKeyRef.current = null;
      }
    };
  }, [
    courseSlug,
    isAuthenticated,
    playbackRequestKey,
    playbackBootstrapAttempt,
    requestsLessonPlayback,
    selectedLesson,
    playbackRequestKeyRef,
    setPlaybackBootstrap,
    setPlaybackBootstrapError,
  ]);
  const playbackAccessError = useMemo<
    LessonVideoPlayerProps["playbackAccessError"]
  >(() => {
    if (courseUnavailable === "no-lessons") {
      return {
        kind: "retry",
        title: "No lessons yet",
        message: "This course doesn't have any lessons to watch yet.",
        actionLabel: "Try again",
        link: { label: "Browse courses", href: "/courses" },
      };
    }
    const courseNotFound: LessonVideoPlayerProps["playbackAccessError"] =
      courseUnavailable === "not-found"
        ? {
            kind: "retry",
            illustration: "not-found",
            title: "Course not found",
            message:
              "It may have been unpublished, or the address may be wrong.",
            actionLabel: "Try again",
            onAction: retryCourseOverview,
            link: { label: "Browse courses", href: "/courses" },
          }
        : courseUnavailable === "failed"
          ? {
              kind: "retry",
              illustration: "went-wrong",
              title: "Something went wrong",
              message:
                "We couldn't load this course. Check your connection and try again.",
              actionLabel: "Try again",
              onAction: retryCourseOverview,
            }
          : null;

    // A lesson the course lists with no video says so, whatever a request
    // made before the course had loaded came back with. Not before its
    // description is known, though: the description may be all its content.
    // A locked lesson asks the same of the viewer whether it is a video or
    // a reading: the server refuses either until they sign in or get the
    // course.
    const loginPrompt = {
      kind: "login",
      message: "Log in to dive in",
      actionLabel: "Log in",
      onAction: onOpenLogin,
    } as const;
    // A learner holding part of the course is told this lesson is in the
    // rest of it.
    const holdsPart = Boolean(courseAccessQuery.data?.openSectionIds?.length);
    const accessPrompt = {
      kind: "access",
      message: holdsPart
        ? "This lesson isn't part of your plan. Get the full course to unlock it and the rest."
        : "Join the course to unlock this lesson and all the rest.",
      actionLabel: holdsPart ? "Get the full course" : "Unlock the course",
      onAction: onUnlockCourse,
    } as const;

    // An audio lesson plays in the player from its file; asked for it, the
    // server says, as for a video, that the viewer must sign in or get the
    // course.
    if (!courseNotFound && requestsLessonAudio) {
      if (!audioLink.failure) return null;
      if (audioLink.failure.status === 401) return loginPrompt;
      if (audioLink.failure.status === 403) return accessPrompt;
      return {
        kind: "retry",
        title: "Couldn't load this audio",
        message: "Check your connection and try again.",
        actionLabel: "Try again",
        onAction: audioLink.retry,
      };
    }

    if (!courseNotFound && !requestsLessonPlayback) {
      const stage = noVideoStageFor(
        stageLesson,
        lessonDescriptionState,
        courseOverview?.course.id,
      );
      // The loader stands in meanwhile; see `lessonTextPending`.
      if (stage.kind === "pending") return null;
      if (stage.kind === "locked") {
        return stage.reason === "login" ? loginPrompt : accessPrompt;
      }
      return stage.kind === "retry"
        ? { ...stage, onAction: retryLessonDescription }
        : stage;
    }

    if (!playbackBootstrapError) return courseNotFound;

    // Asked to log in, a visitor is still asked to: a course that is not
    // public may load once they have.
    if (
      playbackBootstrapError.status === 401 ||
      playbackBootstrapError.code === "UNAUTHORIZED" ||
      playbackBootstrapError.code === "MFA_REQUIRED"
    ) {
      return loginPrompt;
    }

    if (courseNotFound) return courseNotFound;

    if (playbackBootstrapError.status === 403) return accessPrompt;

    // A video that is still being processed, and a lesson with no video,
    // used to get the same "couldn't prepare" message as a real failure. The
    // first is worth trying again later; the second can never play, so it
    // offers no retry.
    if (playbackBootstrapError.code === "MEDIA_NOT_READY") {
      return {
        kind: "retry",
        title: "Video not ready yet",
        message:
          "This video is still being prepared. Please check back in a few minutes.",
        actionLabel: "Try again",
        onAction: retryPlaybackBootstrap,
      };
    }

    // The same statement as when the course itself says the lesson has no
    // video: it is asked for only while the course is still loading.
    if (playbackBootstrapError.code === "MEDIA_NOT_FOUND") {
      return noVideoNoticeFor(stageLesson, courseOverview?.course.id);
    }

    return {
      ...videoPlaybackFailureNotice(playbackBootstrapError),
      onAction: retryPlaybackBootstrap,
    };
  }, [
    courseAccessQuery.data?.openSectionIds,
    courseOverview?.course.id,
    courseUnavailable,
    lessonDescriptionState,
    onUnlockCourse,
    onOpenLogin,
    playbackBootstrapError,
    requestsLessonPlayback,
    retryCourseOverview,
    retryLessonDescription,
    retryPlaybackBootstrap,
    stageLesson,
    requestsLessonAudio,
    audioLink.failure,
    audioLink.retry,
  ]);
  // A lesson with no video whose description is still on its way shows the
  // player's loader. Kept apart from `playbackBootstrapPending`, whose time
  // limit is for a video request.
  const lessonTextPending =
    !courseUnavailable &&
    !requestsLessonPlayback &&
    !requestsLessonAudio &&
    lessonDescriptionState === "loading";
  // The player's loader while an audio lesson's file address is on its way.
  const audioLinkPending =
    !courseUnavailable &&
    requestsLessonAudio &&
    !audioLink.source &&
    !audioLink.failure;
  const playbackBootstrapPending = Boolean(
    protectedPlayback &&
    requestsLessonPlayback &&
    !playbackBootstrap &&
    !playbackBootstrapError,
  );
  // The loader is never the last word. Whatever leaves the player waiting
  // (a request that does not come back, or one this page is no longer
  // listening to), after the limit it says that it failed and offers to try
  // again, which asks afresh.
  useEffect(() => {
    if (!playbackBootstrapPending) return undefined;
    const timer = window.setTimeout(() => {
      playbackRequestKeyRef.current = null;
      setPlaybackBootstrapError(
        new VideoPlaybackBootstrapError(
          0,
          "PLAYBACK_BOOTSTRAP_TIMEOUT",
          "The video took too long to prepare.",
        ),
      );
    }, PLAYBACK_BOOTSTRAP_LIMIT_MS + 1000);
    return () => window.clearTimeout(timer);
  }, [
    playbackBootstrapPending,
    playbackRequestKey,
    playbackBootstrapAttempt,
    playbackRequestKeyRef,
    setPlaybackBootstrapError,
  ]);
  // A video that could not be prepared is an incident too: the learner
  // sees "Something went wrong" (or "This is taking a while") where the
  // player would be, and the playback summary never starts.
  useEffect(() => {
    const error = playbackBootstrapError;
    if (!error || !courseSlug) return;
    if (EXPECTED_BOOTSTRAP_REFUSALS.has(error.code)) return;
    if (error.status === 401 || error.status === 403) return;
    reportPlaybackIncident(
      "page_error",
      {
        playbackId: crypto.randomUUID(),
        courseKey: courseSlug,
        lessonNumber: selectedLesson,
        mediaKey: `${courseSlug}-lesson-${selectedLesson}`,
        started: false,
        positionSeconds: null,
        durationSeconds: null,
        qualityHeight: null,
        bufferAheadSeconds: null,
      },
      {
        code: error.code,
        httpStatus: error.status > 0 ? error.status : null,
      },
    );
  }, [courseSlug, playbackBootstrapError, selectedLesson]);

  return {
    lessonStagePlan,
    playbackAccessError,
    lessonTextPending,
    audioSourcePending: audioLinkPending,
    playbackBootstrapPending,
    audioSource: requestsLessonAudio ? audioLink.source : null,
    retryAudioSource: audioLink.retry,
  };
}

/** An audio lesson's file, as the player plays it. */
export interface LessonAudioSource {
  /** Changes when a new address is given: the player loads it afresh. */
  key: string;
  url: string;
  mimeType: string;
  /**
   * Whether the file may be read across origins (storage's CORS allows
   * it), so the player can load it so and draw its live waveform. When
   * not, it is loaded as any file is and the waveform only moves.
   */
  analysable: boolean;
}

/** iPhone and iPad Safari stop audio sent through Web Audio when locked. */
function webAudioKeepsPlayingWhenLocked(): boolean {
  if (typeof navigator === "undefined") return false;
  const appleTouch =
    /iP(hone|ad|od)/u.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return !appleTouch;
}

/**
 * Asks storage for one byte of the file across origins: whether it may be
 * read so (and analysed). Never long: a slow answer is taken as no.
 */
async function canReadAcrossOrigins(url: string): Promise<boolean> {
  if (!webAudioKeepsPlayingWhenLocked() || typeof fetch !== "function") {
    return false;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, {
      headers: { Range: "bytes=0-0" },
      mode: "cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * An audio lesson's file address: asked for when the lesson opens, and
 * again on `retry` (it works for a short while, so an expired one is
 * replaced). `failure.status` is the server's answer when it refused:
 * 401 to sign in, 403 to get the course.
 */
function useLessonAudioLink(
  courseId: string | undefined,
  lessonId: string | undefined,
) {
  const [source, setSource] = useState<LessonAudioSource | null>(null);
  const [failure, setFailure] = useState<{ status: number } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setSource(null);
    setFailure(null);
    if (!courseId || !lessonId) return undefined;
    let active = true;
    coursesService
      .getLessonMediaLink(courseId, lessonId)
      .then(async (link) => {
        const analysable = await canReadAcrossOrigins(link.url);
        if (!active) return;
        setSource({
          key: `${lessonId}:${attempt}`,
          url: link.url,
          mimeType: link.mimeType,
          analysable,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFailure({
          status: (error as { status?: number } | null)?.status ?? 0,
        });
      });
    return () => {
      active = false;
    };
  }, [courseId, lessonId, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { source, failure, retry };
}
