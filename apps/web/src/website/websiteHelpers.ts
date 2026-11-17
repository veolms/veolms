import type {
  SiteCourseCard,
  SitePageSummary,
  SitePageType,
} from "@veolms/contracts";
import type { SiteRenderContext } from "@veolms/site-render";
import { getApiRequestUrl } from "../lib/api-client";

export const WEBSITE_PATH = "/website";

export const websitePagePath = (pageId: string) =>
  `${WEBSITE_PATH}/pages/${pageId}`;

/** The live page's full address, served by the API for now. */
export function livePageUrl(page: Pick<SitePageSummary, "livePath">) {
  return page.livePath ? getApiRequestUrl(page.livePath) : null;
}

export const PAGE_TYPE_CHOICES: ReadonlyArray<{
  type: SitePageType;
  title: string;
  description: string;
}> = [
  {
    type: "home",
    title: "Home page",
    description:
      "Your courses, why to learn with you, questions, and a call to join.",
  },
  {
    type: "landing",
    title: "Landing page",
    description: "One offer, workshop or free lesson, with a clear button.",
  },
  {
    type: "link_in_bio",
    title: "Link in bio",
    description:
      "Your photo and a short list of links for Instagram or YouTube.",
  },
  {
    type: "blank",
    title: "Blank page",
    description: "Start empty and add the sections you want.",
  },
];

export function pageStatusLabel(status: SitePageSummary["status"]): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "published":
      return "Live";
    case "changed":
      return "Live, with changes";
  }
}

export function pageStatusClass(status: SitePageSummary["status"]): string {
  switch (status) {
    case "published":
      return "bg-emerald-500/12 text-emerald-500 border border-emerald-500/20";
    case "changed":
      return "bg-(--accent)/12 text-(--accent) border border-(--accent)/20";
    case "draft":
      return "bg-(--canvas) text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]";
  }
}

/** `My Diwali offer!` becomes `my-diwali-offer`. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60)
    .replace(/-+$/u, "");
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * The editor's render context: the same shape the API builds at publish,
 * from what the editor fetched, so the preview matches the live page.
 */
export function editorRenderContext(input: {
  academyName: string;
  courses: readonly SiteCourseCard[];
  pages: ReadonlyArray<{ id: string; slug: string }>;
}): SiteRenderContext {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return {
    mode: "editor",
    academyName: input.academyName,
    year: new Date().getFullYear(),
    courses: new Map(input.courses.map((course) => [course.id, course])),
    latestCourses: input.courses,
    pageSlugs: new Map(input.pages.map((page) => [page.id, page.slug])),
    urls: {
      course: (slug) => `${origin}/courses/${encodeURIComponent(slug)}`,
      page: (slug) => `./${encodeURIComponent(slug)}`,
      catalog: `${origin}/courses`,
      legal: (slug) => `${origin}/${slug}`,
    },
  };
}
