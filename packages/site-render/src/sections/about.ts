import { button } from "../context.ts";
import { html, lines } from "../html.ts";
import { frame, image, type SectionRenderer } from "./frame.ts";

/** The person behind the courses: a photo, a short story and a few facts. */
export const about: SectionRenderer<"about"> = {
  css: `
.vp-about .vp-wrap{display:grid;gap:clamp(24px,5vw,64px);align-items:center}
@media (min-width:860px){.vp-about--left .vp-wrap,.vp-about--right .vp-wrap{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}.vp-about--right .vp-about-photo{order:2}}
.vp-about-photo{width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:calc(var(--radius) + 6px);box-shadow:var(--shadow);background:var(--s-card)}
.vp-about h2{margin:0}
.vp-about-text{color:var(--s-muted);font-size:1.06rem;margin:16px 0 0}
.vp-facts{list-style:none;margin:22px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:10px}
.vp-facts li{padding:8px 14px;border-radius:999px;background:color-mix(in srgb,var(--s-accent) 12%,transparent);color:var(--s-text);font-weight:600;font-size:.92rem}
.vp-about .vp-actions{margin-top:26px}
.vp-about--centered .vp-wrap{text-align:center;justify-items:center;max-width:820px}
.vp-about--centered .vp-about-photo{width:160px;aspect-ratio:1;border-radius:50%}
.vp-about--centered .vp-facts,.vp-about--centered .vp-actions{justify-content:center}
`,
  render(section, context) {
    const { settings } = section;
    const photo = image(settings.image, {
      className: "vp-about-photo",
      width: 800,
      height: 1000,
    });
    const action = button(settings.button, context);
    return frame(
      section,
      settings,
      html`${photo}
        <div>
          ${settings.eyebrow ? html`<p class="vp-eyebrow">${settings.eyebrow}</p>` : null}
          <h2 class="vp-h2">${settings.heading}</h2>
          ${settings.text ? html`<p class="vp-about-text">${lines(settings.text)}</p>` : null}
          ${
            settings.facts.length
              ? html`<ul class="vp-facts">
                  ${settings.facts.map((fact) => html`<li>${fact.text}</li>`)}
                </ul>`
              : null
          }
          ${action ? html`<div class="vp-actions">${action}</div>` : null}
        </div>`,
    );
  },
};
