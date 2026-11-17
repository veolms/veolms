import { html, lines } from "../html.ts";
import { frame, type SectionRenderer } from "./frame.ts";

/** Plain words: paragraphs split by an empty line. */
export const text: SectionRenderer<"text"> = {
  css: `
.vp-text .vp-wrap{max-width:760px}
.vp-text h2{margin:0 0 16px}
.vp-text-body p{margin:0 0 1em;font-size:1.06rem;color:var(--s-text)}
.vp-text-body p:last-child{margin-bottom:0}
.vp-text--columns .vp-wrap{max-width:var(--width)}
@media (min-width:860px){.vp-text--columns .vp-text-body{columns:2;column-gap:48px}}
`,
  render(section) {
    const { settings } = section;
    const paragraphs = settings.body
      .split(/\r?\n\s*\r?\n/u)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    return frame(
      section,
      settings,
      html`${settings.heading ? html`<h2 class="vp-h2">${settings.heading}</h2>` : null}
        <div class="vp-text-body">
          ${paragraphs.map((paragraph) => html`<p>${lines(paragraph)}</p>`)}
        </div>`,
    );
  },
};
