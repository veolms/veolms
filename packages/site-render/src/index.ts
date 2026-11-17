import {
  SITE_THEMES,
  type SiteLook,
  type SitePageDocument,
  type SiteSection,
  type SiteSectionType,
} from "@veolms/contracts";
import type { SiteRenderContext } from "./context.ts";
import { html, raw, type Html } from "./html.ts";
import { about } from "./sections/about.ts";
import { courses } from "./sections/courses.ts";
import { cta } from "./sections/cta.ts";
import { faq } from "./sections/faq.ts";
import { features } from "./sections/features.ts";
import { footer } from "./sections/footer.ts";
import type { SectionRenderer } from "./sections/frame.ts";
import { header } from "./sections/header.ts";
import { hero } from "./sections/hero.ts";
import { links } from "./sections/links.ts";
import { logos } from "./sections/logos.ts";
import { pricing } from "./sections/pricing.ts";
import { stats } from "./sections/stats.ts";
import { testimonials } from "./sections/testimonials.ts";
import {
  BASE_CSS,
  MOTION_SCRIPT,
  motionLevel,
  siteAttributes,
  themeCss,
} from "./theme-css.ts";

export { MOTION_SCRIPT, motionLevel, siteAttributes } from "./theme-css.ts";

export type { SiteRenderContext } from "./context.ts";
export { resolveLink } from "./context.ts";
export { escapeHtml } from "./html.ts";
export {
  SECTION_DEFAULTS,
  newSection,
  newSectionId,
  pageTemplate,
} from "./defaults.ts";

/**
 * Page JSON to HTML (creator-features/40 §4.5). Plain TypeScript with no
 * React, so the API can run it at publish time and the editor can run the
 * same code for its preview. Visitors get HTML and CSS only: no script.
 */

const RENDERERS: { [Type in SiteSectionType]: SectionRenderer<Type> } = {
  hero,
  features,
  courses,
  testimonials,
  faq,
  cta,
  links,
  footer,
  header,
  logos,
  stats,
  pricing,
  about,
};

function renderSection(
  section: SiteSection,
  context: SiteRenderContext,
): Html | null {
  const renderer = RENDERERS[section.type] as SectionRenderer<
    typeof section.type
  >;
  return renderer.render(section as never, context);
}

/** One section's HTML; empty when visitors would see nothing. */
export function renderSectionHtml(
  section: SiteSection,
  context: SiteRenderContext,
): string {
  return renderSection(section, context)?.value ?? "";
}

/**
 * The page's CSS: the theme, the shared base, and only the sections the
 * page uses (all of them when `types` is left out, as in the editor).
 */
export function siteCss(
  look: Pick<SiteLook, "themeId">,
  types?: Iterable<SiteSectionType>,
): string {
  const used = new Set(types ?? (Object.keys(RENDERERS) as SiteSectionType[]));
  const sectionCss = [...used].sort().map((type) => RENDERERS[type].css.trim());
  return [themeCss(SITE_THEMES[look.themeId]), BASE_CSS.trim(), ...sectionCss]
    .join("\n")
    .replace(/\n{2,}/gu, "\n");
}

/**
 * The motion script's tag, byte for byte: the live page's security policy
 * allows it by its hash. Kept out of the `html` template so formatting can
 * never add a space inside it.
 */
const MOTION_TAG = raw("<script>" + MOTION_SCRIPT + "</script>");

export interface RenderedSitePage {
  html: string;
  /** Course ids the page shows, to re-render it when one changes. */
  courseIds: string[];
}

/** A whole published page: one HTML file with its CSS inline. */
export function renderSitePage(input: {
  document: SitePageDocument;
  look: SiteLook;
  context: SiteRenderContext;
  /** The page's address, for its canonical and share tags. */
  canonicalUrl?: string;
}): RenderedSitePage {
  const { document, look, context } = input;
  const theme = SITE_THEMES[look.themeId];
  const body: Html[] = [];
  const footers: Html[] = [];
  const headers: Html[] = [];
  const types = new Set<SiteSectionType>();
  const courseIds = new Set<string>();
  for (const section of document.sections) {
    const rendered = renderSection(section, { ...context, mode: "live" });
    if (!rendered) continue;
    types.add(section.type);
    if (section.type === "footer") footers.push(rendered);
    else if (section.type === "header") headers.push(rendered);
    else body.push(rendered);
    if (section.type === "courses") {
      const shown =
        section.settings.source === "picked"
          ? section.settings.courseIds
          : context.latestCourses
              .slice(0, section.settings.limit)
              .map((course) => course.id);
      shown.forEach((id) => courseIds.add(id));
    }
  }
  const title = document.seo.title || context.academyName;
  const description = document.seo.description;
  const themeColour =
    look.colourMode === "dark" ? theme.dark.bg : theme.light.bg;
  // Our own fixed values only (enum members), so they need no escaping.
  const attributes = Object.entries(siteAttributes(look))
    .map(([name, value]) => `${name}="${value}"`)
    .join(" ");
  const page = html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${title}</title>
        ${description ? html`<meta name="description" content="${description}" />` : null}
        <meta property="og:title" content="${title}" />
        ${description ? html`<meta property="og:description" content="${description}" />` : null}
        <meta property="og:site_name" content="${context.academyName}" />
        ${input.canonicalUrl ? html`<link rel="canonical" href="${input.canonicalUrl}" /><meta property="og:url" content="${input.canonicalUrl}" />` : null}
        <meta
          name="color-scheme"
          content="${look.colourMode === "system" ? "light dark" : look.colourMode}"
        />
        <meta name="theme-color" content="${themeColour}" />
        <style>
          ${raw(siteCss(look, types))}
        </style>
      </head>
      <body class="vp-site" ${raw(attributes)}>
        ${headers}
        <main>${body}</main>
        ${footers} ${motionLevel(look) === "off" ? null : MOTION_TAG}
      </body>
    </html>`;
  return { html: page.value, courseIds: [...courseIds] };
}
