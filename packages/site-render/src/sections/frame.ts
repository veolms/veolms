import type {
  SiteAnimation,
  SiteHideOn,
  SiteImage,
  SiteSectionOf,
  SiteSectionType,
  SiteSpacing,
  SiteTone,
} from "@veolms/contracts";
import type { SiteRenderContext } from "../context.ts";
import { html, raw, type Html } from "../html.ts";

export interface SectionRenderer<Type extends SiteSectionType> {
  /** The section's own styles, sent only on pages that use it. */
  css: string;
  /** Null when there is nothing for a visitor to see. */
  render: (
    section: SiteSectionOf<Type>,
    context: SiteRenderContext,
  ) => Html | null;
}

/**
 * The outer `<section>` every section shares: tone, spacing, layout, where
 * it is hidden, and how it comes into view ("auto" follows the theme).
 */
export function frame(
  section: { id: string; type: string; layout: string },
  look: {
    tone: SiteTone;
    spacing: SiteSpacing;
    animation?: SiteAnimation | undefined;
    hideOn?: SiteHideOn | undefined;
  },
  inner: Html,
  label?: string,
): Html {
  const animation = look.animation ?? "auto";
  const hidden =
    look.hideOn && look.hideOn !== "none" ? ` vp-hide-${look.hideOn}` : "";
  return html`<section
    id="${section.id}"
    class="vp-s vp-tone-${look.tone} vp-sp-${look.spacing} vp-${section.type} vp-${section.type}--${section.layout}${hidden}"
    ${animation === "none" ? null : html` data-anim="${animation}"`}
    ${label ? html` aria-label="${label}"` : null}
  >
    <div class="vp-wrap">${inner}</div>
  </section>`;
}

/** A section heading with its optional introduction. */
export function header(heading: string, intro = ""): Html | null {
  if (!heading && !intro) return null;
  return html`<header class="vp-head">
    ${heading ? html`<h2 class="vp-h2">${heading}</h2>` : null}${intro ? html`<p class="vp-lead">${intro}</p>` : null}
  </header>`;
}

/**
 * An image, lazy unless it is the first thing on the page. Width and height
 * reserve its space so the page doesn't jump while it loads.
 */
export function image(
  value: SiteImage,
  options: {
    className: string;
    width: number;
    height: number;
    eager?: boolean;
  },
): Html | null {
  if (!value.src) return null;
  return html`<img
    class="${options.className}"
    src="${value.src}"
    alt="${value.alt}"
    width="${options.width}"
    height="${options.height}"
    ${options.eager ? raw('fetchpriority="high"') : raw('loading="lazy"')}
    decoding="async"
  />`;
}
