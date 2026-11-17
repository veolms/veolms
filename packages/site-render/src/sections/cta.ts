import { button } from "../context.ts";
import { html } from "../html.ts";
import { frame, type SectionRenderer } from "./frame.ts";

export const cta: SectionRenderer<"cta"> = {
  css: `
.vp-cta h2{margin:0}
.vp-cta .vp-cta-text{margin:12px 0 0;color:var(--s-muted);max-width:40rem}
.vp-cta .vp-actions{margin-top:24px}
.vp-cta--banner .vp-cta-box{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px}
.vp-cta--banner .vp-actions{margin:0}
.vp-cta--card .vp-cta-box{background:var(--s-card);border:1px solid var(--s-border);border-radius:var(--radius);padding:clamp(28px,6vw,56px);text-align:center;display:flex;flex-direction:column;align-items:center}
.vp-cta--card .vp-cta-text{margin-inline:auto}
.vp-cta--card .vp-actions{justify-content:center}
.vp-cta--split .vp-cta-box{display:grid;gap:20px;align-items:end}
.vp-cta--split h2{font-size:clamp(1.9rem,5vw,3rem)}
@media (min-width:860px){.vp-cta--split .vp-cta-box{grid-template-columns:1.2fr 1fr}}
`,
  render(section, context) {
    const { settings } = section;
    const action = button(settings.button, context);
    const words = html`<div>
      <h2 class="vp-h2">${settings.heading}</h2>
      ${settings.text && section.layout !== "split" ? html`<p class="vp-cta-text">${settings.text}</p>` : null}
    </div>`;
    const side =
      section.layout === "split"
        ? html`<div>
            ${settings.text ? html`<p class="vp-cta-text">${settings.text}</p>` : null}${action ? html`<div class="vp-actions">${action}</div>` : null}
          </div>`
        : action
          ? html`<div class="vp-actions">${action}</div>`
          : null;
    return frame(
      section,
      settings,
      html`<div class="vp-cta-box">${words}${side}</div>`,
    );
  },
};
