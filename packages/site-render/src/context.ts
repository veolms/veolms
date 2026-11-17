import {
  SITE_SAFE_HREF,
  type SiteButton,
  type SiteCourseCard,
  type SiteLink,
} from "@veolms/contracts";
import { html, type Html } from "./html.ts";

/**
 * Everything a section may need besides its own settings. The API builds it
 * at publish time; the editor builds the same thing from what it fetched,
 * so the preview and the live page come out of the same code.
 */
export interface SiteRenderContext {
  /** "editor" shows placeholders for empty or hidden sections. */
  mode: "live" | "editor";
  academyName: string;
  year: number;
  /** Published courses by id, for picked course grids and course links. */
  courses: ReadonlyMap<string, SiteCourseCard>;
  /** The newest published courses, newest first. */
  latestCourses: readonly SiteCourseCard[];
  /** Page slugs by page id, for links between pages. */
  pageSlugs: ReadonlyMap<string, string>;
  urls: {
    course: (slug: string) => string;
    page: (slug: string) => string;
    catalog: string;
    legal: (slug: "terms" | "privacy" | "policies") => string;
  };
}

/**
 * Where a link goes, or null when it goes nowhere (no link, a removed
 * course or page). Every address is checked again here, so a row that
 * skipped validation still can't produce a `javascript:` link.
 */
export function resolveLink(
  link: SiteLink,
  context: SiteRenderContext,
): string | null {
  let href: string | null = null;
  switch (link.kind) {
    case "none":
      return null;
    case "url":
      href = link.href;
      break;
    case "courses":
      href = context.urls.catalog;
      break;
    case "course": {
      const course = context.courses.get(link.courseId);
      href = course ? context.urls.course(course.slug) : null;
      break;
    }
    case "page": {
      const slug = context.pageSlugs.get(link.pageId);
      href = slug ? context.urls.page(slug) : null;
      break;
    }
  }
  if (href === null) return null;
  // Our own URL builders may return relative paths ("./offer").
  const isOwnRelative = /^\.{1,2}\/[^\s<>"']*$/u.test(href);
  return isOwnRelative || SITE_SAFE_HREF.test(href) ? href : null;
}

function isExternal(href: string): boolean {
  return /^https?:\/\//u.test(href);
}

/** `<a>` attributes for a link: its address, and a new tab for other sites. */
export function linkAttributes(href: string): Html {
  return isExternal(href)
    ? html`href="${href}" rel="noopener noreferrer"`
    : html`href="${href}"`;
}

/** A button, or nothing when it has no words or nowhere to go. */
export function button(
  value: SiteButton,
  context: SiteRenderContext,
  variant: "primary" | "secondary" = "primary",
): Html | null {
  if (!value.label) return null;
  const href = resolveLink(value.link, context);
  if (!href) return null;
  return html`<a class="vp-btn vp-btn--${variant}" ${linkAttributes(href)}
    >${value.label}</a
  >`;
}

/** A note only the editor shows, for a section that visitors won't see. */
export function editorNote(
  context: SiteRenderContext,
  message: string,
): Html | null {
  return context.mode === "editor"
    ? html`<p class="vp-note">${message}</p>`
    : null;
}
