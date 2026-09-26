import { COURSE_THUMBNAIL_SIZES } from "./courseThumbnailSizing";

export interface PrerenderedCourseLcp {
  src: string;
  srcSet: string;
  sizes: string;
  index: number;
}

// React Router prerenders the SPA shell with `X-React-Router-SPA-Mode` and a
// `/` URL. That document is reused for routes without their own HTML, so the
// course thumbnail must not be baked into it.
let prerenderSpaShell = false;

export function setCourseLcpPrerenderSpaShell(enabled: boolean) {
  prerenderSpaShell = enabled;
}

export function readPrerenderedCourseLcp(): PrerenderedCourseLcp | null {
  if (prerenderSpaShell) return null;

  const raw = import.meta.env.VITE_COURSE_LCP_PRELOAD;
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as {
      src?: unknown;
      srcSet?: unknown;
      index?: unknown;
    };
    if (typeof candidate.src !== "string" || candidate.src.length === 0) {
      return null;
    }
    const index =
      typeof candidate.index === "number" &&
      Number.isInteger(candidate.index) &&
      candidate.index >= 0
        ? candidate.index
        : 0;
    return {
      src: candidate.src,
      srcSet: typeof candidate.srcSet === "string" ? candidate.srcSet : "",
      sizes: COURSE_THUMBNAIL_SIZES,
      index,
    };
  } catch {
    return null;
  }
}

export function isCoursesDocumentPath(pathname: string) {
  // HTML prerender requests are `path + "/"`, so `/courses` arrives as
  // `/courses/`. The browser URL stays without that slash.
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return normalized === "/" || normalized === "/courses";
}
