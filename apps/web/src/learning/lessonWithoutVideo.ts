import type { CourseLesson } from "@veolms/contracts";

/**
 * A lesson with no video.
 *
 * Deleting a quiz (or its assignment), or changing a quiz lesson's type,
 * leaves the lesson published as a video lesson with no video attached. The
 * lesson page used to treat it as any other video: it asked the server for
 * playback, was told `MEDIA_NOT_FOUND`, and showed the answer as a failure.
 * Nothing ever played, so the lesson could not be finished and the course
 * could not reach 100%.
 *
 * The course overview already says which lessons have a video
 * (`contentMediaId`). From it the page decides here, for every way a lesson
 * can come to have none: it asks for no playback, says plainly that the
 * lesson has no video, and counts the lesson finished once a learner who has
 * the course opens it, since its title, description and resources are all
 * there is to it.
 */

type LessonContent = Pick<CourseLesson, "contentType" | "contentMediaId">;

/**
 * What a lesson that is not a video is called where a video's length would
 * stand: in the lessons list, and on the end screen's "Up next".
 */
export const NON_VIDEO_LESSON_LABELS: Partial<Record<string, string>> = {
  document: "Reading",
  audio: "Audio",
  image: "Image",
  quiz: "Quiz",
};
type LessonReadingContent = LessonContent &
  Pick<CourseLesson, "description"> &
  Partial<Pick<CourseLesson, "id">>;

/**
 * True when the course lists the lesson with no video: no media (`null` is
 * the server's "none attached"), or a reading, whose media is a PDF to read
 * and never a video to play. A lesson whose record is not known yet (the
 * course is still loading) or does not say is treated as having a video.
 */
export function lessonHasNoVideo(
  lesson: LessonContent | null | undefined,
): boolean {
  return (
    lesson !== null &&
    lesson !== undefined &&
    (lesson.contentMediaId === null ||
      lesson.contentType === "document" ||
      // An audio or image file is drawn by the page, never played as video.
      lesson.contentType === "audio" ||
      lesson.contentType === "image")
  );
}

/** An audio lesson with its file: played in the video player. */
export function isAudioLessonWithFile(
  lesson: LessonContent | null | undefined,
): boolean {
  return Boolean(lesson?.contentType === "audio" && lesson.contentMediaId);
}

/**
 * Whether the open lesson's description is known. A lesson with no video is
 * its description: until that is known the page can neither say "there is
 * nothing here" nor count the lesson as read. `login` and `locked` are the
 * server refusing it, as it refuses the video of a lesson the viewer may not
 * open: a visitor has to sign in, a learner has to get the course.
 */
export type LessonDescriptionState =
  "known" | "loading" | "failed" | "login" | "locked";

/**
 * The description comes with the course overview, or from the lesson's own
 * request. The overview leaves it out of a lesson the viewer may not open,
 * and may leave out every lesson's, so a lesson it gives no text for waits
 * for its own request. A refusal from that request is final whatever the
 * overview held, as it is the server's word on this viewer now.
 */
export function resolveLessonDescriptionState(input: {
  /** The overview gives this lesson a description. */
  overviewHasDescription: boolean;
  /**
   * The lesson's own request: `idle` when none is made (no lesson yet),
   * `answered` once it has come back, with or without a text, `login` or
   * `locked` when the server refused it (401 or 403).
   */
  request: "idle" | "loading" | "answered" | "failed" | "login" | "locked";
}): LessonDescriptionState {
  if (input.request === "login") return "login";
  if (input.request === "locked") return "locked";
  if (input.overviewHasDescription) return "known";
  if (input.request === "loading") return "loading";
  if (input.request === "failed") return "failed";
  return "known";
}

export interface LessonStagePlan {
  /**
   * What stands where the lesson's video goes. A lesson with no video waits
   * for its description (`description-loading`), or says that it could not
   * be loaded (`description-failed`), before it says it has no video.
   */
  stage:
    | "quiz"
    | "video"
    | "no-video-notice"
    | "description-loading"
    | "description-failed"
    | "description-locked"
    | "audio";
  /** Whether the page asks the server for the lesson's video. */
  requestsPlayback: boolean;
  /**
   * Whether the page asks for the lesson's audio file: an audio lesson plays
   * in the video player, from its file, and is finished by listening.
   */
  requestsAudio: boolean;
  /** Whether opening the lesson is all there is to finishing it. */
  completesWhenOpened: boolean;
}

export interface LessonStageInput {
  /** The lesson as the course overview lists it; absent while that loads. */
  lesson: LessonContent | null | undefined;
  /** The quiz view is open in place of the video. */
  showingQuiz: boolean;
  /**
   * Whether a quiz is attached to the lesson; `undefined` while the course's
   * quiz assignments are not known yet.
   */
  hasQuiz: boolean | undefined;
  /** See `viewerMayRecordProgress`. */
  viewerMayRecordProgress: boolean;
  /** See `resolveLessonDescriptionState`. A lesson with a video ignores it. */
  descriptionState: LessonDescriptionState;
}

export function planLessonStage({
  lesson,
  showingQuiz,
  hasQuiz,
  viewerMayRecordProgress,
  descriptionState,
}: LessonStageInput): LessonStagePlan {
  const noVideo = lessonHasNoVideo(lesson);
  const audio = isAudioLessonWithFile(lesson);
  return {
    stage: showingQuiz
      ? "quiz"
      : audio
        ? "audio"
        : !noVideo
          ? "video"
          : descriptionState === "loading"
            ? "description-loading"
            : descriptionState === "failed"
              ? "description-failed"
              : descriptionState === "login" || descriptionState === "locked"
                ? "description-locked"
                : "no-video-notice",
    // A lesson with no media has nothing to play whichever view is open, a
    // quiz lesson included: the request could only come back "not found".
    requestsPlayback: !noVideo,
    requestsAudio: audio && !showingQuiz,
    // A quiz is finished by passing it, and the server checks that. A
    // lesson that still has a quiz attached is not finished by looking at
    // it either, so nothing is recorded until it is known to have none.
    // Nor is a lesson finished whose text has not reached the learner yet.
    completesWhenOpened:
      noVideo &&
      !audio &&
      descriptionState === "known" &&
      lesson?.contentType !== "quiz" &&
      !showingQuiz &&
      hasQuiz === false &&
      viewerMayRecordProgress,
  };
}

/**
 * Whether the server accepts lesson progress from this viewer, by the rule
 * its progress endpoint applies: the course's creator and an admin always;
 * anyone else must be signed in, and must hold the course when it is sold
 * or access-restricted. False while any of that is still loading, so
 * nothing is recorded on a guess and then refused.
 */
export function viewerMayRecordProgress(input: {
  isAuthenticated: boolean;
  managesCourse: boolean;
  /** `undefined` while the viewer's courses are loading. */
  holdsCourse: boolean | undefined;
  /** The overview's pricing type; absent for a course with no pricing. */
  pricingType: "free" | "paid" | null | undefined;
  /** The overview's `canSelfEnroll`: false for a restricted free course. */
  canSelfEnroll: boolean | undefined;
}): boolean {
  if (!input.isAuthenticated) return false;
  if (input.managesCourse) return true;
  if (input.holdsCourse === true) return true;
  const needsGrant =
    input.pricingType === "paid" || input.canSelfEnroll === false;
  return !needsGrant;
}

/**
 * The statement shown where the video would be. It is not a failure: there
 * is nothing to retry and nothing wrong with the lesson. It is drawn with
 * the octopus that has not found something, as the other "not found"
 * screens are.
 */
export const NO_VIDEO_NOTICE = {
  kind: "notice",
  illustration: "not-found",
  title: "No video",
  message: "This lesson has no video.",
  actionLabel: "",
} as const;

/**
 * Shown where the video would be when a lesson with no video could not get
 * its description. The page adds the action that asks again.
 */
export const LESSON_TEXT_FAILED_NOTICE = {
  kind: "retry",
  title: "Couldn't load this lesson",
  message: "Check your connection and try again.",
  actionLabel: "Try again",
} as const;

/**
 * The text of a reading lesson: a document lesson with no file attached
 * keeps what there is to read in its description, the only text field a
 * lesson has. `null` for any other lesson, and for a reading left empty.
 */
export function getLessonReading(
  lesson: LessonReadingContent | null | undefined,
): string | null {
  if (!lesson || lesson.contentType !== "document") return null;
  if (lesson.contentMediaId !== null) return null;
  return lesson.description?.trim() || null;
}

/**
 * A reading lesson whose text is a PDF file (one brought over from another
 * platform, say) rather than its description. It used to be taken for a
 * video lesson: its file was asked for as a video, the server found no
 * video, and the page said "No video". Such a lesson is read in the page's
 * own PDF reader (`LessonPdfReading`).
 *
 * The reading travels through the player as its text does, as one string
 * (see `lessonPdfReadingRef`). Null for any other lesson, and until the
 * course's id is known.
 */
export function getLessonPdfReading(
  lesson: LessonReadingContent | null | undefined,
  courseId: string | null | undefined,
): string | null {
  if (!lesson || lesson.contentType !== "document") return null;
  if (!lesson.contentMediaId || !lesson.id || !courseId) return null;
  return lessonPdfReadingRef(courseId, lesson.id);
}

/** Whether the lesson is read rather than watched: its text or its PDF. */
export function lessonIsReading(
  lesson: LessonReadingContent | null | undefined,
): boolean {
  return (
    getLessonReading(lesson) !== null ||
    (lesson?.contentType === "document" && Boolean(lesson.contentMediaId))
  );
}

const PDF_READING_PREFIX = "lesson-pdf:";

/**
 * A PDF reading, as the reading string the player carries: a reading is
 * otherwise its Markdown text, which never starts this way (it is trimmed
 * text a person wrote).
 */
export function lessonPdfReadingRef(courseId: string, lessonId: string) {
  return `${PDF_READING_PREFIX}${courseId}/${lessonId}`;
}

/** The course and lesson a PDF reading names; null for a text reading. */
export function parseLessonPdfReading(
  reading: string,
): { courseId: string; lessonId: string } | null {
  if (!reading.startsWith(PDF_READING_PREFIX)) return null;
  const [courseId, lessonId, ...rest] = reading
    .slice(PDF_READING_PREFIX.length)
    .split("/");
  if (!courseId || !lessonId || rest.length) return null;
  return { courseId, lessonId };
}

const MEDIA_READING_PREFIXES = {
  audio: "lesson-audio:",
  image: "lesson-image:",
} as const;

/**
 * An audio or image lesson's file, as the string the player carries where a
 * reading's text goes (as a PDF reading is; see `lessonPdfReadingRef`): the
 * stage draws the file in place of text. Null for any other lesson, one with
 * no file, and until the course's id is known.
 */
export function getLessonMediaReading(
  lesson: LessonReadingContent | null | undefined,
  courseId: string | null | undefined,
): string | null {
  if (!lesson || !lesson.id || !courseId || !lesson.contentMediaId) {
    return null;
  }
  // An audio lesson plays in the video player instead (see
  // `isAudioLessonWithFile`).
  if (lesson.contentType !== "image") return null;
  return `${MEDIA_READING_PREFIXES[lesson.contentType]}${courseId}/${lesson.id}`;
}

/** The kind, course and lesson an audio or image reading names. */
export function parseLessonMediaReading(
  reading: string,
): { kind: "audio" | "image"; courseId: string; lessonId: string } | null {
  for (const kind of ["audio", "image"] as const) {
    const prefix = MEDIA_READING_PREFIXES[kind];
    if (!reading.startsWith(prefix)) continue;
    const [courseId, lessonId, ...rest] = reading
      .slice(prefix.length)
      .split("/");
    if (!courseId || !lessonId || rest.length) return null;
    return { kind, courseId, lessonId };
  }
  return null;
}

/**
 * What stands where the video would be for a lesson with none: its reading
 * when it is a reading lesson, the plain statement otherwise. The small
 * player has no room for a text and names the lesson's kind instead.
 */
export function noVideoNoticeFor(
  lesson: LessonReadingContent | null | undefined,
  courseId?: string | null,
) {
  const media = getLessonMediaReading(lesson, courseId);
  if (media) {
    return {
      kind: "notice",
      title: "Image",
      message: "This lesson is an image.",
      actionLabel: "",
      article: media,
    } as const;
  }
  const article =
    getLessonPdfReading(lesson, courseId) ?? getLessonReading(lesson);
  return article
    ? ({
        kind: "notice",
        title: "Reading",
        message: "This lesson is a reading.",
        actionLabel: "",
        article,
      } as const)
    : NO_VIDEO_NOTICE;
}

/**
 * What stands where the video would be for a lesson with none, by what is
 * known of its description: a loader while it is on its way, the failure
 * with a retry when it did not arrive, the server's refusal (`locked`, for
 * the page to ask the viewer to sign in or get the course, as for a locked
 * video), and `noVideoNoticeFor` once it is known.
 */
export function noVideoStageFor(
  lesson: LessonReadingContent | null | undefined,
  descriptionState: LessonDescriptionState,
  courseId?: string | null,
) {
  if (descriptionState === "loading") return { kind: "pending" } as const;
  if (descriptionState === "failed") return LESSON_TEXT_FAILED_NOTICE;
  if (descriptionState === "login" || descriptionState === "locked") {
    return { kind: "locked", reason: descriptionState } as const;
  }
  return noVideoNoticeFor(lesson, courseId);
}
