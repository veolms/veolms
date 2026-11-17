import { editorNote } from "../context.ts";
import { html, lines } from "../html.ts";
import { frame, header, type SectionRenderer } from "./frame.ts";

/** Questions open and close with `<details>`: no script on the page. */
export const faq: SectionRenderer<"faq"> = {
  css: `
.vp-faq .vp-faq-list{max-width:820px}
.vp-faq details{border-bottom:1px solid var(--s-border)}
.vp-faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:16px;padding:18px 0;font-weight:600;font-size:1.05rem}
.vp-faq summary::-webkit-details-marker{display:none}
.vp-faq summary::after{content:"+";font-size:1.4rem;line-height:1;color:var(--s-muted)}
.vp-faq details[open] summary::after{content:"\\2212"}
.vp-faq summary:focus-visible{outline:3px solid var(--s-accent);outline-offset:2px}
.vp-faq .vp-answer{margin:0 0 18px;color:var(--s-muted)}
.vp-faq-cols{display:grid;gap:28px}
.vp-faq-cols h3{font-size:1.05rem;margin:0 0 8px}
.vp-faq-cols p{margin:0;color:var(--s-muted)}
@media (min-width:760px){.vp-faq-cols{grid-template-columns:repeat(2,1fr);column-gap:48px}}
`,
  render(section, context) {
    const { settings } = section;
    if (settings.items.length === 0) {
      const note = editorNote(context, "Add a question to show this section.");
      return note
        ? frame(section, settings, html`${header(settings.heading)}${note}`)
        : null;
    }
    const body =
      section.layout === "columns"
        ? html`<div class="vp-faq-cols">
            ${settings.items.map(
              (item) =>
                html`<div>
                  <h3>${item.question}</h3>
                  <p>${lines(item.answer)}</p>
                </div>`,
            )}
          </div>`
        : html`<div class="vp-faq-list">
            ${settings.items.map(
              (item) =>
                html`<details>
                  <summary>${item.question}</summary>
                  <p class="vp-answer">${lines(item.answer)}</p>
                </details>`,
            )}
          </div>`;
    return frame(section, settings, html`${header(settings.heading)}${body}`);
  },
};
