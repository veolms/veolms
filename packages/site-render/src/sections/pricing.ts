import { button, editorNote } from "../context.ts";
import { html } from "../html.ts";
import { frame, header, type SectionRenderer } from "./frame.ts";

const CHECK = html`<svg
  viewBox="0 0 20 20"
  width="18"
  height="18"
  aria-hidden="true"
>
  <path
    d="M5 10.5l3.2 3.2L15 7"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;

/**
 * Plans side by side (one drawn bigger, with its badge) or a single offer,
 * each with its price, what it includes and a button.
 */
export const pricing: SectionRenderer<"pricing"> = {
  css: `
.vp-pricing .vp-head{margin-inline:auto;text-align:center}
.vp-plans{list-style:none;margin:0 auto;padding:0;display:grid;gap:clamp(16px,3vw,24px);max-width:1040px;align-items:stretch}
@media (min-width:760px){.vp-plans{grid-template-columns:repeat(var(--n,2),minmax(0,1fr))}}
.vp-plan{position:relative;display:flex;flex-direction:column;gap:18px;padding:clamp(22px,4vw,34px)}
.vp-plan--highlight{border:2px solid var(--s-accent)!important}
.vp-plan-badge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--accent);color:var(--on-accent);font-size:.78rem;font-weight:800;padding:5px 12px;border-radius:999px;white-space:nowrap}
.vp-plan-name{margin:0;font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:1.2rem}
.vp-plan-price{margin:0;display:flex;align-items:baseline;flex-wrap:wrap;gap:8px}
.vp-plan-price b{font-family:var(--font-heading);font-size:calc(clamp(2.1rem,5vw,2.8rem)*var(--hs));font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);line-height:1}
.vp-plan-price s{color:var(--s-muted);font-size:1.05rem}
.vp-plan-price span{color:var(--s-muted);font-size:.92rem}
.vp-plan-features{list-style:none;margin:0;padding:0;display:grid;gap:10px;flex:1}
.vp-plan-features li{display:flex;gap:10px;align-items:flex-start}
.vp-plan-features svg{flex:none;color:var(--s-accent);margin-top:3px}
.vp-plan .vp-btn{width:100%}
.vp-plans-note{text-align:center;color:var(--s-muted);margin:clamp(18px,3vw,28px) 0 0;font-size:.95rem}
.vp-pricing--single .vp-plans{max-width:640px}
@media (min-width:760px){.vp-pricing--single .vp-plans{grid-template-columns:1fr}.vp-pricing--single .vp-plan-features{grid-template-columns:1fr 1fr}}
`,
  render(section, context) {
    const { settings } = section;
    const plans =
      section.layout === "single" ? settings.plans.slice(0, 1) : settings.plans;
    if (plans.length === 0) {
      const note = editorNote(context, "Add a plan to show this section.");
      return note ? frame(section, settings, note) : null;
    }
    const items = plans.map((plan) => {
      const features = plan.features
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
      return html`<li
        class="vp-plan vp-card${plan.highlight ? " vp-plan--highlight" : ""}"
      >
        ${plan.highlight && plan.badge ? html`<span class="vp-plan-badge">${plan.badge}</span>` : null}
        <h3 class="vp-plan-name">${plan.name}</h3>
        <p class="vp-plan-price">
          <b>${plan.price}</b
          >${plan.compareAt ? html`<s>${plan.compareAt}</s>` : null}${plan.period ? html`<span>${plan.period}</span>` : null}
        </p>
        ${
          features.length
            ? html`<ul class="vp-plan-features">
                ${features.map((line) => html`<li>${CHECK}<span>${line}</span></li>`)}
              </ul>`
            : null
        }
        ${button(plan.button, context, plan.highlight ? "primary" : "secondary")}
      </li>`;
    });
    return frame(
      section,
      settings,
      html`${header(settings.heading, settings.intro)}
        <ul class="vp-plans" style="--n:${String(Math.min(plans.length, 3))}">
          ${items}
        </ul>
        ${settings.note ? html`<p class="vp-plans-note">${settings.note}</p>` : null}`,
    );
  },
};
