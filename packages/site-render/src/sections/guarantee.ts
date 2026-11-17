import { html } from "../html.ts";
import { frame, type SectionRenderer } from "./frame.ts";

/** The promise that removes the risk: a seal, its words, and trust points. */
export const guarantee: SectionRenderer<"guarantee"> = {
  css: `
.vp-guarantee--badge .vp-wrap{display:grid;gap:clamp(20px,4vw,40px);align-items:center;max-width:920px}
@media (min-width:760px){.vp-guarantee--badge .vp-wrap{grid-template-columns:auto 1fr}}
.vp-seal{width:clamp(120px,18vw,160px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;text-align:center;padding:18px;background:radial-gradient(circle at 30% 25%,color-mix(in srgb,var(--on-accent) 22%,transparent),transparent 60%),var(--accent);color:var(--on-accent);font-weight:800;line-height:1.2;font-size:.95rem;box-shadow:0 0 0 6px color-mix(in srgb,var(--accent) 25%,transparent),var(--shadow);justify-self:center}
.vp-guarantee h2{margin:0}
.vp-guarantee-text{margin:12px 0 0;color:var(--s-muted);font-size:1.05rem}
.vp-trust{list-style:none;margin:20px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:10px 22px}
.vp-trust li{display:flex;align-items:center;gap:8px;font-weight:600;font-size:.95rem}
.vp-guarantee--row .vp-wrap{text-align:center}
.vp-guarantee--row .vp-seal{display:none}
.vp-guarantee--row .vp-badge-line{display:inline-block;margin:0 0 12px;padding:8px 16px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:800;font-size:.9rem}
.vp-guarantee--row .vp-trust{justify-content:center}
.vp-guarantee--badge .vp-badge-line{display:none}
`,
  render(section) {
    const { settings } = section;
    return frame(
      section,
      settings,
      html`<div class="vp-seal" aria-hidden="true">${settings.badge}</div>
        <div>
          <p class="vp-badge-line">${settings.badge}</p>
          ${settings.heading ? html`<h2 class="vp-h2">${settings.heading}</h2>` : null}
          ${settings.text ? html`<p class="vp-guarantee-text">${settings.text}</p>` : null}
          ${
            settings.items.length
              ? html`<ul class="vp-trust">
                  ${settings.items.map((item) => html`<li>${item.mark ? html`<span aria-hidden="true">${item.mark}</span>` : null}${item.text}</li>`)}
                </ul>`
              : null
          }
        </div>`,
      settings.badge,
    );
  },
};
