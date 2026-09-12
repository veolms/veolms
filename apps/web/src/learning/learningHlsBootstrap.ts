import {
  getCourseVideoForLesson,
  resolveLessonIdentifier,
} from "./courseContent";
import { serializeForInlineJson } from "../lib/serializeForInlineJson";
import { PRERENDERED_LEARNING_COURSE_SLUGS } from "./prerenderLearningPaths";

export const LEARNING_HLS_MANIFEST_META_NAME = "veo-hls-manifest";
export const LEARNING_HLS_MEDIA_KEY_META_NAME = "veo-hls-media-key";
export const LEARNING_COURSE_SLUG_META_NAME = "veo-learning-course-slug";
export const LEARNING_LESSON_NUMBER_META_NAME = "veo-learning-lesson-number";
export const EARLY_HLS_PRELOAD_URL_PLACEHOLDER =
  "__VEO_EARLY_HLS_PRELOAD_URL__";

export interface LearningHlsBootstrap {
  manifestUrl: string;
  mediaKey: string;
}

export interface LearningPlaybackRequestMetadata {
  courseSlug: string;
  lessonNumber: number;
}

// Only routes explicitly included in the static learning build may embed a
// public manifest. Runtime/API-created courses use the authenticated path.
const PUBLIC_SSG_COURSE_SLUGS = new Set<string>(
  PRERENDERED_LEARNING_COURSE_SLUGS,
);

export function getLearningHlsBootstrap(params: {
  courseSlug?: string;
  lectureSlug?: string;
}): LearningHlsBootstrap | null {
  if (!params.courseSlug || !PUBLIC_SSG_COURSE_SLUGS.has(params.courseSlug)) {
    return null;
  }

  const lessonId = resolveLessonIdentifier(params.lectureSlug) ?? 1;
  const video = getCourseVideoForLesson(lessonId);
  if (!/\.m3u8(?:$|[?#])/i.test(video.src)) return null;

  return {
    manifestUrl: video.src,
    mediaKey: `${encodeURIComponent(params.courseSlug)}-lesson-${lessonId}`,
  };
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
  if (!manifestUrl || !/\.m3u8(?:$|[?#])/i.test(manifestUrl)) return null;
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

export function getEarlyHlsPreloadInlineScript(moduleUrl: string): string {
  return `(()=>{try{performance.setResourceTimingBufferSize(2000)}catch{}const u=${serializeForInlineJson(moduleUrl)};if(!u)return;const m=document.querySelector('meta[name="${LEARNING_HLS_MANIFEST_META_NAME}"]');const manifestUrl=m?.content?.trim();try{performance.mark('veo:learning-bootstrap-start')}catch{}if(manifestUrl){const g=globalThis;let resolve;let reject;const ready=new Promise((res,rej)=>{resolve=res;reject=rej});g.__VEO_SHAKA_PRELOAD__={manifestUrl,player:null,preloadPromise:null,consumed:false,ready};g.__VEO_SHAKA_PRELOAD_SETTLE__={resolve,reject}}import(u).then((module)=>module.startEarlyHlsPreload()).catch((error)=>{const settle=globalThis.__VEO_SHAKA_PRELOAD_SETTLE__;if(settle?.reject)settle.reject(error)})})();`;
}
