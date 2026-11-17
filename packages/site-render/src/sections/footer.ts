import {
  linkAttributes,
  resolveLink,
  type SiteRenderContext,
} from "../context.ts";
import { html } from "../html.ts";
import type { SectionRenderer } from "./frame.ts";

function linkList(
  items: Array<{ label: string; href: string }>,
  label: string,
) {
  if (items.length === 0) return null;
  return html`<nav aria-label="${label}">
    <ul class="vp-foot-links">
      ${items.map((item) => html`<li><a ${linkAttributes(item.href)}>${item.label}</a></li>`)}
    </ul>
  </nav>`;
}

function legalLinks(context: SiteRenderContext) {
  return [
    { label: "Terms", href: context.urls.legal("terms") },
    { label: "Privacy", href: context.urls.legal("privacy") },
    { label: "Refunds", href: context.urls.legal("policies") },
  ];
}

export const footer: SectionRenderer<"footer"> = {
  css: `
.vp-footer{font-size:.92rem}
.vp-footer .vp-wrap{display:grid;gap:20px}
.vp-foot-brand{font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:1.1rem;margin:0}
.vp-foot-tag{color:var(--s-muted);margin:6px 0 0;max-width:32rem}
.vp-foot-links{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px 20px}
.vp-foot-links a{color:inherit;text-decoration:none}
.vp-foot-links a:hover{text-decoration:underline}
.vp-foot-copy{color:var(--s-muted);margin:0}
.vp-footer--simple .vp-wrap{justify-items:center;text-align:center}
.vp-footer--simple .vp-foot-links{justify-content:center}
@media (min-width:760px){.vp-footer--columns .vp-wrap{grid-template-columns:2fr 1fr 1fr}.vp-footer--columns .vp-foot-links{flex-direction:column}.vp-footer--columns .vp-foot-copy{grid-column:1/-1;border-top:1px solid var(--s-border);padding-top:16px}}
`,
  render(section, context) {
    const { settings } = section;
    const own = settings.links.flatMap((item) => {
      const href = resolveLink(item.link, context);
      return item.label && href ? [{ label: item.label, href }] : [];
    });
    const legal = settings.showLegal ? legalLinks(context) : [];
    const brand = html`<div>
      <p class="vp-foot-brand">${context.academyName}</p>
      ${settings.tagline ? html`<p class="vp-foot-tag">${settings.tagline}</p>` : null}
    </div>`;
    const copy = html`<p class="vp-foot-copy">
      © ${context.year} ${context.academyName}
    </p>`;
    const inner =
      section.layout === "columns"
        ? html`${brand}${linkList(own, "Site") ?? html`<span></span>`}${linkList(legal, "Legal") ?? html`<span></span>`}${copy}`
        : html`${brand}${linkList([...own, ...legal], "Footer")}${copy}`;
    return html`<footer
      id="${section.id}"
      class="vp-s vp-tone-${settings.tone} vp-sp-${settings.spacing} vp-footer vp-footer--${section.layout}"
    >
      <div class="vp-wrap">${inner}</div>
    </footer>`;
  },
};
