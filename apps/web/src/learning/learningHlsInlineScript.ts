import { serializeForInlineJson } from "../lib/serializeForInlineJson";

export const LEARNING_HLS_MANIFEST_META_NAME = "veo-hls-manifest";
export const LEARNING_HLS_MEDIA_KEY_META_NAME = "veo-hls-media-key";
export const LEARNING_COURSE_SLUG_META_NAME = "veo-learning-course-slug";
export const LEARNING_LESSON_NUMBER_META_NAME = "veo-learning-lesson-number";
export const EARLY_HLS_PRELOAD_URL_PLACEHOLDER =
  "__VEO_EARLY_HLS_PRELOAD_URL__";

export function getEarlyHlsPreloadInlineScript(moduleUrl: string): string {
  return `(()=>{const u=${serializeForInlineJson(moduleUrl)};if(!u)return;const m=document.querySelector('meta[name="${LEARNING_HLS_MANIFEST_META_NAME}"]');const manifestUrl=m?.content?.trim();const c=document.querySelector('meta[name="${LEARNING_COURSE_SLUG_META_NAME}"]')?.content?.trim();const l=Number(document.querySelector('meta[name="${LEARNING_LESSON_NUMBER_META_NAME}"]')?.content?.trim());if(!manifestUrl&&(!c||!Number.isInteger(l)||l<1))return;try{performance.setResourceTimingBufferSize(2000)}catch{}try{performance.mark('veo:learning-bootstrap-start')}catch{}if(manifestUrl){const g=globalThis;let resolve;let reject;const ready=new Promise((res,rej)=>{resolve=res;reject=rej});g.__VEO_SHAKA_PRELOAD__={manifestUrl,player:null,preloadPromise:null,consumed:false,ready};g.__VEO_SHAKA_PRELOAD_SETTLE__={resolve,reject}}import(u).then((module)=>module.startEarlyHlsPreload()).catch((error)=>{const settle=globalThis.__VEO_SHAKA_PRELOAD_SETTLE__;if(settle?.reject)settle.reject(error)})})();`;
}
