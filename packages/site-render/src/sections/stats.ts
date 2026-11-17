import { editorNote } from "../context.ts";
import { html } from "../html.ts";
import { frame, header, type SectionRenderer } from "./frame.ts";

/**
 * Big numbers: students, rating, lessons. A value that starts with a number
 * counts up when it comes into view (the motion script reads `data-count`).
 */
export const stats: SectionRenderer<"stats"> = {
  css: `
.vp-stat-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,1fr);gap:clamp(16px,3vw,28px)}
@media (min-width:860px){.vp-stat-list{grid-template-columns:repeat(var(--n,4),1fr)}}
.vp-stat-value{display:block;font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);font-size:calc(clamp(2rem,5vw,3.2rem)*var(--hs));line-height:1.05;color:var(--s-accent);font-variant-numeric:tabular-nums}
.vp-stat-label{display:block;margin-top:8px;color:var(--s-muted);font-weight:600}
.vp-stats--inline .vp-stat{text-align:center}
.vp-stats--cards .vp-stat{padding:clamp(18px,3vw,28px)}
.vp-stats--band .vp-stat-list{gap:0}
.vp-stats--band .vp-stat{text-align:center;padding:12px 16px}
@media (min-width:860px){.vp-stats--band .vp-stat+.vp-stat{border-left:1px solid var(--s-border)}}
`,
  render(section, context) {
    const { settings } = section;
    if (settings.items.length === 0) {
      const note = editorNote(context, "Add a number to show this section.");
      return note ? frame(section, settings, note) : null;
    }
    const cards = section.layout === "cards";
    const items = settings.items.map(
      (item) =>
        html`<li class="vp-stat${cards ? " vp-card" : ""}">
          <span class="vp-stat-value" data-count>${item.value}</span>
          <span class="vp-stat-label">${item.label}</span>
        </li>`,
    );
    return frame(
      section,
      settings,
      html`${header(settings.heading, settings.intro)}
        <ul class="vp-stat-list" style="--n:${String(settings.items.length)}">
          ${items}
        </ul>`,
    );
  },
};
