import {
  getCourseVideoForLesson,
  resolveLessonIdentifier,
} from "./courseContent";

export const LEARNING_HLS_MANIFEST_META_NAME = "veo-hls-manifest";
export const LEARNING_HLS_MEDIA_KEY_META_NAME = "veo-hls-media-key";
export const EARLY_HLS_PRELOAD_URL_PLACEHOLDER = "__VEO_EARLY_HLS_PRELOAD_URL__";

export interface LearningHlsBootstrap {
  manifestUrl: string;
  mediaKey: string;
}

export function getLearningHlsBootstrap(params: {
  courseSlug?: string;
  lectureSlug?: string;
}): LearningHlsBootstrap | null {
  if (!params.courseSlug) return null;

  const lessonId = resolveLessonIdentifier(params.lectureSlug) ?? 1;
  const video = getCourseVideoForLesson(lessonId);
  if (!/\.m3u8(?:$|[?#])/i.test(video.src)) return null;

  return {
    manifestUrl: video.src,
    mediaKey: `${encodeURIComponent(params.courseSlug)}-lesson-${lessonId}`,
  };
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
  if (!manifestUrl) return null;
  const mediaKey =
    root
      .querySelector(`meta[name="${LEARNING_HLS_MEDIA_KEY_META_NAME}"]`)
      ?.getAttribute("content")
      ?.trim() || undefined;
  return { manifestUrl, mediaKey: mediaKey ?? "" };
}

export function getEarlyHlsPreloadInlineScript(moduleUrl: string): string {
  return `(()=>{try{performance.setResourceTimingBufferSize(2000)}catch{}const u=${JSON.stringify(moduleUrl)};if(!u)return;const m=document.querySelector('meta[name="${LEARNING_HLS_MANIFEST_META_NAME}"]');if(!m||!m.content)return;const g=globalThis;let resolve;let reject;const ready=new Promise((res,rej)=>{resolve=res;reject=rej});g.__VEO_SHAKA_PRELOAD__={manifestUrl:m.content,player:null,preloadPromise:null,consumed:false,ready};g.__VEO_SHAKA_PRELOAD_SETTLE__={resolve,reject};import(u).catch(reject)})();`;
}
