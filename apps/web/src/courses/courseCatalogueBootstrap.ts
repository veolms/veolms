import type { CourseListResponse } from "@veolms/contracts";
import { serializeForInlineJson } from "../lib/serializeForInlineJson";
import { COURSE_THUMBNAIL_SIZES } from "./courseThumbnailSizing";

declare global {
  interface Window {
    __veoPublicCoursesPrefetch?: Promise<CourseListResponse | null>;
  }
}

export function getEarlyCourseCatalogueScript(requestUrl: string): string {
  return `(()=>{if(location.pathname!=="/courses"&&location.pathname!=="/")return;const g=window;if(g.__veoPublicCoursesPrefetch)return;const p=fetch(${serializeForInlineJson(requestUrl)},{credentials:"include",headers:{Accept:"application/json"}}).then(async r=>{if(!r.ok)return null;const e=await r.json();const d=e&&typeof e==="object"&&"success" in e&&"data" in e?e.data:e;if(!d||!Array.isArray(d.courses))return null;const count=innerWidth<560?1:innerWidth<1280?4:innerWidth<1536?6:8;for(const c of d.courses.slice(0,count)){if(!c||typeof c.thumbnailUrl!=="string")continue;const set=Array.isArray(c.thumbnailSrcSet)?c.thumbnailSrcSet.filter(v=>v&&typeof v.url==="string"&&typeof v.width==="number"&&v.width>0):[];const slot=innerWidth<560?0.85:innerWidth<1280?0.47:innerWidth<1536?0.31:0.23;const target=Math.ceil(innerWidth*(devicePixelRatio||1)*slot);const chosen=set.filter(v=>v.width>=target).sort((a,b)=>a.width-b.width)[0]||set.slice().sort((a,b)=>b.width-a.width)[0];const i=new Image();i.fetchPriority="high";i.loading="eager";i.sizes=${serializeForInlineJson(COURSE_THUMBNAIL_SIZES)};i.srcset=set.map(v=>v.url+" "+v.width+"w").join(", ");i.src=(chosen&&chosen.url)||c.thumbnailUrl}return d}).catch(()=>null);g.__veoPublicCoursesPrefetch=p})();`;
}

export function takeEarlyCourseCataloguePrefetch(): Promise<CourseListResponse | null> | null {
  if (typeof window === "undefined") return null;
  const request = window.__veoPublicCoursesPrefetch ?? null;
  delete window.__veoPublicCoursesPrefetch;
  return request;
}
