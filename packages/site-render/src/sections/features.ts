import { editorNote } from "../context.ts";
import { html } from "../html.ts";
import { frame, header, type SectionRenderer } from "./frame.ts";

export const features: SectionRenderer<"features"> = {
  css: `
.vp-feat-list{list-style:none;margin:0;padding:0;display:grid;gap:clamp(16px,3vw,28px)}
.vp-feat-mark{font-size:1.6rem;line-height:1;display:block;margin-bottom:12px}
.vp-feat-list h3{font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:1.15rem;margin:0}
.vp-feat-list p{margin:8px 0 0;color:var(--s-muted)}
@media (min-width:700px){.vp-features--grid .vp-feat-list,.vp-features--cards .vp-feat-list{grid-template-columns:repeat(2,1fr)}}
@media (min-width:1000px){.vp-features--grid .vp-feat-list,.vp-features--cards .vp-feat-list{grid-template-columns:repeat(3,1fr)}}
.vp-features--cards .vp-feat-list li{padding:24px}
.vp-features--list .vp-feat-list{gap:0;max-width:760px}
.vp-features--list .vp-feat-list li{display:grid;grid-template-columns:auto 1fr;column-gap:16px;padding:20px 0;border-top:1px solid var(--s-border)}
.vp-features--list .vp-feat-mark{grid-row:span 2;margin:0}
`,
  render(section, context) {
    const { settings } = section;
    if (settings.items.length === 0) {
      const note = editorNote(context, "Add a point to show this section.");
      return note ? frame(section, settings, note) : null;
    }
    const items = settings.items.map(
      (item) =>
        html`<li class="${section.layout === "cards" ? "vp-card" : ""}">
          ${item.mark ? html`<span class="vp-feat-mark" aria-hidden="true">${item.mark}</span>` : null}
          <h3>${item.title}</h3>
          ${item.text ? html`<p>${item.text}</p>` : null}
        </li>`,
    );
    return frame(
      section,
      settings,
      html`${header(settings.heading, settings.intro)}
        <ul class="vp-feat-list">
          ${items}
        </ul>`,
    );
  },
};
