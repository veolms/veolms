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
.vp-features--bento .vp-feat-list{grid-template-columns:1fr}
@media (min-width:700px){.vp-features--bento .vp-feat-list{grid-template-columns:repeat(2,1fr)}}
@media (min-width:1000px){.vp-features--bento .vp-feat-list{grid-template-columns:repeat(4,1fr);grid-auto-rows:minmax(150px,auto)}.vp-features--bento .vp-feat-list li:nth-child(6n+1){grid-column:span 2;grid-row:span 2}.vp-features--bento .vp-feat-list li:nth-child(6n+4){grid-column:span 2}}
.vp-features--bento .vp-feat-list li{padding:clamp(20px,3vw,30px);display:flex;flex-direction:column;justify-content:flex-end}
.vp-features--bento .vp-feat-list li:nth-child(6n+1){background:linear-gradient(160deg,color-mix(in srgb,var(--s-accent) 18%,var(--s-card)),var(--s-card))}
.vp-features--bento .vp-feat-list li:nth-child(6n+1) h3{font-size:1.5rem}
.vp-features--steps .vp-feat-list{counter-reset:vp-step;max-width:760px;gap:0}
.vp-features--steps .vp-feat-list li{counter-increment:vp-step;position:relative;padding:0 0 32px 72px}
.vp-features--steps .vp-feat-list li::before{content:counter(vp-step);position:absolute;left:0;top:-4px;width:48px;height:48px;display:grid;place-items:center;border-radius:50%;background:var(--accent);color:var(--on-accent);font-weight:800;font-size:1.1rem}
.vp-features--steps .vp-feat-list li:not(:last-child)::after{content:"";position:absolute;left:23px;top:52px;bottom:4px;width:2px;background:var(--s-border)}
.vp-features--steps .vp-feat-mark,.vp-features--checklist .vp-feat-mark{display:none}
.vp-features--checklist .vp-feat-list{gap:16px 32px}
@media (min-width:700px){.vp-features--checklist .vp-feat-list{grid-template-columns:repeat(2,1fr)}}
.vp-features--checklist .vp-feat-list li{position:relative;padding-left:40px}
.vp-features--checklist .vp-feat-list li::before{content:"";position:absolute;left:0;top:2px;width:26px;height:26px;border-radius:50%;background:color-mix(in srgb,var(--s-accent) 16%,transparent)}
.vp-features--checklist .vp-feat-list li::after{content:"";position:absolute;left:5px;top:7px;width:16px;height:16px;background:var(--s-accent);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M5 10.5l3.2 3.2L15 7' fill='none' stroke='%23000' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/16px no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M5 10.5l3.2 3.2L15 7' fill='none' stroke='%23000' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/16px no-repeat}
.vp-features--checklist .vp-feat-list h3{font-size:1.05rem}
`,
  render(section, context) {
    const { settings } = section;
    if (settings.items.length === 0) {
      const note = editorNote(context, "Add a point to show this section.");
      return note ? frame(section, settings, note) : null;
    }
    const items = settings.items.map(
      (item) =>
        html`<li
          class="${section.layout === "cards" || section.layout === "bento" ? "vp-card" : ""}"
        >
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
