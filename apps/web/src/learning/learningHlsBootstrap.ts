import { resolveLessonIdentifier } from "./courseContent";
import { serializeForInlineJson } from "../lib/serializeForInlineJson";

export const LEARNING_HLS_MANIFEST_META_NAME = "veo-hls-manifest";
export const LEARNING_HLS_MEDIA_KEY_META_NAME = "veo-hls-media-key";
export const LEARNING_COURSE_SLUG_META_NAME = "veo-learning-course-slug";
export const LEARNING_LESSON_NUMBER_META_NAME = "veo-learning-lesson-number";
/**
 * "1" on a built lesson page whose lesson has no video (a reading, a quiz):
 * the head script does not ask for its playback, which the API answers
 * with a 404 (MEDIA_NOT_FOUND) that only clutters the console.
 */
export const LEARNING_LESSON_NO_VIDEO_META_NAME =
  "veo-learning-lesson-no-video";
/**
 * The lessons of each course seen without a video, by number:
 * `{ [courseSlug]: number[] }`. Written once a course's lessons are known,
 * read by the head script on pages built without the lesson (the SPA
 * fallback) and before an in-app lesson change's early preload.
 */
export const LESSONS_WITHOUT_VIDEO_STORAGE_KEY = "veolms-lessons-without-video";
const LESSONS_WITHOUT_VIDEO_MAX_COURSES = 30;

/**
 * A lesson the API has no video to play for: the rule of
 * `resolveAuthorizedPlaybackLesson` in the API (a reading keeps an old
 * video's id, so its kind decides), and a quiz, which never has one.
 */
export function lessonKindHasNoVideo(contentType: string | undefined) {
  return contentType === "document" || contentType === "quiz";
}

function readLessonsWithoutVideo(): Record<string, number[]> {
  try {
    const parsed = JSON.parse(
      globalThis.localStorage?.getItem(LESSONS_WITHOUT_VIDEO_STORAGE_KEY) ||
        "{}",
    ) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, number[]>)
      : {};
  } catch {
    return {};
  }
}

/**
 * The lessons without a video in the course data this page loaded, by
 * course: fresh, unlike the stored copy, so trusted to answer a playback
 * request without asking (`getVideoPlaybackBootstrap`).
 */
const lessonsWithoutVideoThisPage = new Map<string, Set<number>>();

/** Notes this page's fresh course data (see the map above). */
export function noteLessonsWithoutVideo(
  courseSlug: string,
  lessons: readonly { contentType?: string }[],
): void {
  if (!courseSlug || lessons.length === 0) return;
  const numbers = new Set<number>();
  lessons.forEach((lesson, index) => {
    if (lessonKindHasNoVideo(lesson.contentType)) numbers.add(index + 1);
  });
  lessonsWithoutVideoThisPage.set(courseSlug, numbers);
}

/** Whether this page's course data shows the lesson without a video. */
export function isKnownWithoutVideo(
  courseSlug: string,
  lessonNumber: number,
): boolean {
  return (
    lessonsWithoutVideoThisPage.get(courseSlug)?.has(lessonNumber) ?? false
  );
}

/** Keeps which of a course's lessons (in order) have no video. */
export function rememberLessonsWithoutVideo(
  courseSlug: string,
  lessons: readonly { contentType?: string }[],
): void {
  if (!courseSlug || lessons.length === 0) return;
  const numbers: number[] = [];
  lessons.forEach((lesson, index) => {
    if (lessonKindHasNoVideo(lesson.contentType)) numbers.push(index + 1);
  });
  const stored = readLessonsWithoutVideo();
  const previous = stored[courseSlug];
  if (
    previous &&
    previous.length === numbers.length &&
    previous.every((value, index) => value === numbers[index])
  ) {
    return;
  }
  delete stored[courseSlug];
  const kept = Object.entries(stored).slice(
    -(LESSONS_WITHOUT_VIDEO_MAX_COURSES - 1),
  );
  try {
    globalThis.localStorage?.setItem(
      LESSONS_WITHOUT_VIDEO_STORAGE_KEY,
      JSON.stringify(Object.fromEntries([...kept, [courseSlug, numbers]])),
    );
  } catch {
    // Storage full or blocked: the early request is just sent, as before.
  }
}

/** Whether this course's lesson was seen without a video. */
export function isRememberedWithoutVideo(
  courseSlug: string,
  lessonNumber: number,
): boolean {
  const numbers = readLessonsWithoutVideo()[courseSlug];
  return Array.isArray(numbers) && numbers.includes(lessonNumber);
}
export const EARLY_HLS_PRELOAD_URL_PLACEHOLDER =
  "__VEO_EARLY_HLS_PRELOAD_URL__";

export interface LearningHlsBootstrap {
  manifestUrl: string;
  mediaKey: string;
  segmentToken?: string;
  segmentTokenExpiresAt?: number;
  /** The master playlist, when the playback bootstrap carried it. */
  inlinedMasterManifest?: string;
}

export interface LearningPlaybackRequestMetadata {
  courseSlug: string;
  lessonNumber: number;
}

export function getLearningPlaybackRequestMetadata(params: {
  courseSlug?: string;
  lectureSlug?: string;
}): LearningPlaybackRequestMetadata | null {
  if (!params.courseSlug) return null;
  const lessonNumber = resolveLessonIdentifier(params.lectureSlug) ?? 1;
  return { courseSlug: params.courseSlug, lessonNumber };
}

export function getLearningHlsPreconnectHref(
  manifestUrl: string,
): string | null {
  try {
    if (manifestUrl.startsWith("/") || manifestUrl.startsWith(".")) {
      return null;
    }
    const url = new URL(manifestUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function readLearningHlsBootstrapFromDocument(
  root: ParentNode | null = typeof document === "undefined" ? null : document,
): LearningHlsBootstrap | null {
  if (!root) return null;
  const manifestUrl = root
    .querySelector(`meta[name="${LEARNING_HLS_MANIFEST_META_NAME}"]`)
    ?.getAttribute("content")
    ?.trim();
  if (!manifestUrl || !/\.(?:m3u8|mpd)(?:$|[?#])/i.test(manifestUrl))
    return null;
  const mediaKey =
    root
      .querySelector(`meta[name="${LEARNING_HLS_MEDIA_KEY_META_NAME}"]`)
      ?.getAttribute("content")
      ?.trim() || undefined;
  return { manifestUrl, mediaKey: mediaKey ?? "" };
}

export function readLearningPlaybackRequestMetadataFromDocument(
  root: ParentNode | null = typeof document === "undefined" ? null : document,
): LearningPlaybackRequestMetadata | null {
  if (!root) return null;
  const courseSlug = root
    .querySelector(`meta[name="${LEARNING_COURSE_SLUG_META_NAME}"]`)
    ?.getAttribute("content")
    ?.trim();
  const lessonNumber = Number(
    root
      .querySelector(`meta[name="${LEARNING_LESSON_NUMBER_META_NAME}"]`)
      ?.getAttribute("content")
      ?.trim(),
  );
  if (!courseSlug || !Number.isInteger(lessonNumber) || lessonNumber < 1) {
    return null;
  }
  return { courseSlug, lessonNumber };
}

/**
 * A lesson page's address names its course and lesson
 * (`/learn/<course>/lecture-3`). Only prerendered pages carry them as meta
 * tags; every other lesson page is the SPA fallback, so the address is how
 * its document-start script knows which bootstrap to ask for. Without an
 * explicit lesson (`/learn/<course>`) the page picks one itself; nothing is
 * guessed.
 */
const LESSON_PATH = /^\/learn\/([^/]+)\/((?:lesson-|lecture-)?\d+)\/?$/i;

export function readLearningPlaybackRequestMetadataFromPath(
  pathname: string,
): LearningPlaybackRequestMetadata | null {
  const match = LESSON_PATH.exec(pathname);
  if (!match?.[1] || !match[2]) return null;
  let courseSlug: string;
  try {
    courseSlug = decodeURIComponent(match[1]).trim();
  } catch {
    return null;
  }
  const lessonNumber = resolveLessonIdentifier(match[2]);
  if (!courseSlug || lessonNumber === null) return null;
  return { courseSlug, lessonNumber };
}

export function getEarlyHlsPreloadInlineScript(moduleUrl: string): string {
  return `(()=>{const u=${serializeForInlineJson(moduleUrl)};if(!u)return;const m=document.querySelector('meta[name="${LEARNING_HLS_MANIFEST_META_NAME}"]');const manifestUrl=m?.content?.trim();const courseSlug=document.querySelector('meta[name="${LEARNING_COURSE_SLUG_META_NAME}"]')?.content?.trim();if(!manifestUrl&&!courseSlug&&!${LESSON_PATH.toString()}.test(location.pathname))return;try{performance.setResourceTimingBufferSize(2000);performance.mark('veo:learning-bootstrap-start')}catch{}if(manifestUrl){const g=globalThis;let resolve;let reject;const ready=new Promise((res,rej)=>{resolve=res;reject=rej});g.__VEO_SHAKA_PRELOAD__={manifestUrl,player:null,preloadPromise:null,consumed:false,ready};g.__VEO_SHAKA_PRELOAD_SETTLE__={resolve,reject}}import(u).then((module)=>module.startEarlyHlsPreload()).catch((error)=>{const settle=globalThis.__VEO_SHAKA_PRELOAD_SETTLE__;if(settle?.reject)settle.reject(error)})})();`;
}
