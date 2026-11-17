import { button, linkAttributes, resolveLink } from "../context.ts";
import { html } from "../html.ts";
import { frame, type SectionRenderer } from "./frame.ts";

/**
 * The site's header: the academy's name, a few links and one button. On a
 * phone the links fold into a menu that opens without script (`<details>`).
 */
export const header: SectionRenderer<"header"> = {
  css: `
.vp-header{--s-pad:14px;overflow:visible;z-index:5}
.vp-header--sticky{position:sticky;top:0;z-index:50;overflow:visible;background:color-mix(in srgb,var(--s-bg) 86%,transparent);-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);border-bottom:1px solid color-mix(in srgb,var(--s-border) 70%,transparent)}
.vp-header .vp-wrap{display:flex;align-items:center;gap:clamp(16px,3vw,32px)}
.vp-brand{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);font-size:1.25rem;color:var(--s-text);text-decoration:none;white-space:nowrap}
.vp-nav{display:none;gap:clamp(16px,2.4vw,28px);margin-left:auto}
.vp-nav a{color:var(--s-muted);text-decoration:none;font-weight:600;font-size:.95rem;transition:color .15s}
.vp-nav a:hover{color:var(--s-text)}
.vp-header .vp-btn{min-height:42px;padding:8px 18px;font-size:.95rem}
.vp-nav-cta{display:none}
.vp-menu{margin-left:auto;position:relative}
.vp-menu summary{list-style:none;cursor:pointer;width:44px;height:44px;display:grid;place-content:center;gap:5px;border-radius:12px;border:1px solid var(--s-border);color:var(--s-text)}
.vp-menu summary::-webkit-details-marker{display:none}
.vp-menu summary span{display:block;width:18px;height:2px;border-radius:2px;background:currentColor}
.vp-menu-panel{position:absolute;right:0;top:calc(100% + 10px);min-width:230px;display:grid;gap:4px;padding:10px;background:var(--s-card);color:var(--s-text);border:1px solid var(--s-border);border-radius:var(--radius);box-shadow:0 24px 48px -24px rgb(0 0 0/.45);z-index:60}
.vp-menu-panel a:not(.vp-btn){padding:10px 12px;border-radius:8px;color:inherit;text-decoration:none;font-weight:600}
.vp-menu-panel a:not(.vp-btn):hover{background:color-mix(in srgb,var(--s-text) 6%,transparent)}
.vp-menu-panel .vp-btn{margin-top:6px}
@media (min-width:760px){.vp-nav{display:flex}.vp-nav-cta{display:inline-flex}.vp-menu{display:none}}
.vp-header--centered .vp-wrap{flex-direction:column;gap:12px}
@media (min-width:760px){.vp-header--centered .vp-nav{margin-left:0}.vp-header--centered .vp-nav-cta{display:none}}
.vp-header--minimal .vp-nav{display:none!important}
@media (min-width:760px){.vp-header--minimal .vp-nav-cta{margin-left:auto}.vp-header--minimal .vp-menu{display:block;margin-left:0}}
`,
  render(section, context) {
    const { settings } = section;
    const links = settings.links
      .map((item) => {
        const href = item.label ? resolveLink(item.link, context) : null;
        return href ? html`<a ${linkAttributes(href)}>${item.label}</a>` : null;
      })
      .filter(Boolean);
    const cta = button(settings.button, context, "primary");
    const menu =
      links.length > 0 || cta
        ? html`<details class="vp-menu">
            <summary aria-label="Menu">
              <span></span><span></span><span></span>
            </summary>
            <div class="vp-menu-panel">${links}${cta}</div>
          </details>`
        : null;
    return frame(
      section,
      settings,
      html`<a class="vp-brand" href="./">${context.academyName}</a>
        ${links.length ? html`<nav class="vp-nav" aria-label="Site">${links}</nav>` : null}
        ${cta ? html`<span class="vp-nav-cta">${cta}</span>` : null}${menu}`,
      "Site header",
      settings.sticky ? "vp-header--sticky" : "",
    );
  },
};
