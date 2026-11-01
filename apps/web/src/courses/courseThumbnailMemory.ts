import { useSyncExternalStore } from "react";

/**
 * Course images this tab has already shown, kept for the session.
 *
 * The images themselves are kept by the browser (the CDN serves them
 * `immutable` for a year), but the prerendered page has no image for a
 * card below the first ones: `CourseCardThumbnail` waits until the card
 * nears the screen, so a first visit does not spend bandwidth on images
 * nobody sees. On a reload that meant a shimmer until the page's script
 * ran, for an image the browser already had. A URL in this list is shown
 * at once instead: by the inline script below before the page hydrates,
 * and by the card itself after.
 */
const STORAGE_KEY = "veolms-course-thumbnails-shown";
const MAX_REMEMBERED = 200;

/** Attributes a waiting image keeps its source in, for the inline script. */
export const COURSE_THUMBNAIL_SRC_ATTRIBUTE = "data-course-thumbnail-src";
export const COURSE_THUMBNAIL_SRCSET_ATTRIBUTE = "data-course-thumbnail-srcset";
export const COURSE_THUMBNAIL_ALT_ATTRIBUTE = "data-course-thumbnail-alt";

let remembered: Set<string> | null = null;

function readRemembered(): Set<string> {
  if (remembered) return remembered;
  remembered = new Set();
  try {
    const stored: unknown = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    if (Array.isArray(stored)) {
      for (const url of stored) {
        if (typeof url === "string") remembered.add(url);
      }
    }
  } catch {
    // Storage blocked or unreadable: every image waits as on a first visit.
  }
  return remembered;
}

export function rememberShownCourseThumbnail(url: string) {
  const urls = readRemembered();
  if (urls.has(url)) return;
  urls.add(url);
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...urls].slice(-MAX_REMEMBERED)),
    );
  } catch {
    // Not remembered; the next visit waits for the card to near the screen.
  }
}

const subscribeToNothing = () => () => {};

/**
 * Whether this tab has shown the image before. False while hydrating, as
 * the prerendered page was built without knowing.
 */
export function useCourseThumbnailShownBefore(url: string): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => readRemembered().has(url),
    () => false,
  );
}

/**
 * Runs where it stands in the prerendered page, after the cards: gives each
 * waiting image this tab has shown before its source, so a reload paints
 * it from the browser's cache at once rather than after hydration. Eager:
 * Chrome never started a lazy image given its source this early, and one
 * already in the cache costs nothing. One that fails is hidden until the
 * card, hydrated, tries it again.
 */
export function getShownCourseThumbnailsScript() {
  return `(function(){try{var l=JSON.parse(sessionStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"[]");if(!l.length)return;var s=new Set(l);document.querySelectorAll("img[${COURSE_THUMBNAIL_SRC_ATTRIBUTE}]").forEach(function(i){var u=i.getAttribute("${COURSE_THUMBNAIL_SRC_ATTRIBUTE}");if(i.getAttribute("src")||!s.has(u))return;var ss=i.getAttribute("${COURSE_THUMBNAIL_SRCSET_ATTRIBUTE}");if(ss)i.setAttribute("srcset",ss);i.setAttribute("alt",i.getAttribute("${COURSE_THUMBNAIL_ALT_ATTRIBUTE}")||"");i.setAttribute("loading","eager");i.onerror=function(){i.style.visibility="hidden"};i.setAttribute("src",u)})}catch(e){}})()`;
}
