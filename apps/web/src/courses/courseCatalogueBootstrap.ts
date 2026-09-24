import type { CourseListResponse } from "@veolms/contracts";
import { serializeForInlineJson } from "../lib/serializeForInlineJson";
import { COURSE_THUMBNAIL_SIZES } from "./courseThumbnailSizing";

declare global {
  interface Window {
    __veoPublicCoursesPrefetch?: Promise<CourseListResponse | null>;
  }
}

export function getEarlyCourseCatalogueScript(requestUrl: string): string {
  return `(()=>{if(location.pathname!=="/courses"&&location.pathname!=="/")return;const g=window;if(g.__veoPublicCoursesPrefetch)return;const p=fetch(${serializeForInlineJson(requestUrl)},{credentials:"include",headers:{Accept:"application/json"}}).then(async r=>{if(!r.ok)return null;const e=await r.json();const d=e&&typeof e==="object"&&"success" in e&&"data" in e?e.data:e;if(!d||!Array.isArray(d.courses))return null;const count=innerWidth<560?2:innerWidth<1280?4:innerWidth<1536?6:8;for(const c of d.courses.slice(0,count)){if(!c||typeof c.thumbnailUrl!=="string")continue;const i=new Image();i.fetchPriority="high";i.loading="eager";i.sizes=${serializeForInlineJson(COURSE_THUMBNAIL_SIZES)};i.srcset=Array.isArray(c.thumbnailSrcSet)?c.thumbnailSrcSet.filter(v=>v&&typeof v.url==="string"&&typeof v.width==="number").map(v=>v.url+" "+v.width+"w").join(", "):"";i.src=c.thumbnailUrl}return d}).catch(()=>null);g.__veoPublicCoursesPrefetch=p})();`;
}

export function takeEarlyCourseCataloguePrefetch(): Promise<CourseListResponse | null> | null {
  if (typeof window === "undefined") return null;
  const request = window.__veoPublicCoursesPrefetch ?? null;
  delete window.__veoPublicCoursesPrefetch;
  return request;
}
