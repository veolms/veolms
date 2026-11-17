import { editorNote } from "../context.ts";
import { html, lines } from "../html.ts";
import { frame, header, type SectionRenderer } from "./frame.ts";

export const testimonials: SectionRenderer<"testimonials"> = {
  css: `
.vp-quotes{list-style:none;margin:0;padding:0;display:grid;gap:20px}
.vp-quote{margin:0;padding:24px;display:flex;flex-direction:column;gap:16px}
.vp-quote blockquote{margin:0;font-size:1.02rem}
.vp-quote figcaption{color:var(--s-muted);font-size:.92rem}
.vp-quote figcaption strong{color:var(--s-text);display:block}
@media (min-width:760px){.vp-testimonials--grid .vp-quotes{grid-template-columns:repeat(2,1fr)}}
@media (min-width:1080px){.vp-testimonials--grid .vp-quotes{grid-template-columns:repeat(3,1fr)}}
.vp-site .vp-testimonials--spotlight .vp-quotes>li:first-child .vp-quote{background:none;border:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;transform:none;padding:0 0 12px;text-align:center;align-items:center}
.vp-testimonials--spotlight .vp-quotes>li:first-child blockquote{font-family:var(--font-heading);font-size:clamp(1.3rem,3.4vw,2rem);line-height:1.35;max-width:46rem;text-wrap:balance}
@media (min-width:760px){.vp-testimonials--spotlight .vp-quotes{grid-template-columns:repeat(2,1fr)}.vp-testimonials--spotlight .vp-quotes>li:first-child{grid-column:1/-1}}
`,
  render(section, context) {
    const { settings } = section;
    if (!settings.confirmedReal || settings.items.length === 0) {
      const note = editorNote(
        context,
        settings.items.length === 0
          ? "Add a student's words to show this section."
          : "Visitors see this once you confirm these are real students' words.",
      );
      return note
        ? frame(section, settings, html`${header(settings.heading)}${note}`)
        : null;
    }
    const items = settings.items.map(
      (item) =>
        html`<li>
          <figure class="vp-quote vp-card">
            <blockquote>${lines(item.quote)}</blockquote>
            <figcaption><strong>${item.name}</strong>${item.detail}</figcaption>
          </figure>
        </li>`,
    );
    return frame(
      section,
      settings,
      html`${header(settings.heading)}
        <ul class="vp-quotes">
          ${items}
        </ul>`,
    );
  },
};
