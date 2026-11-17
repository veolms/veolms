import { button } from "../context.ts";
import { html } from "../html.ts";
import { frame, image, type SectionRenderer } from "./frame.ts";

export const hero: SectionRenderer<"hero"> = {
  css: `
.vp-hero .vp-wrap{display:grid;gap:clamp(24px,5vw,56px);align-items:center}
.vp-hero h1{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);font-size:clamp(2rem,6vw,3.6rem);line-height:1.08;margin:0;text-wrap:balance}
.vp-hero .vp-sub{font-size:clamp(1.05rem,2.4vw,1.25rem);color:var(--s-muted);margin:16px 0 0;max-width:42rem}
.vp-hero .vp-actions{margin-top:28px}
.vp-hero-img{width:100%;height:auto;border-radius:var(--radius);object-fit:cover;aspect-ratio:4/3;background:var(--s-card)}
.vp-hero--centered .vp-wrap{text-align:center;justify-items:center}
.vp-hero--centered .vp-sub{margin-inline:auto}
.vp-hero--centered .vp-actions{justify-content:center}
.vp-hero--centered .vp-hero-img{max-width:960px;aspect-ratio:16/9}
@media (min-width:860px){.vp-hero--split .vp-wrap{grid-template-columns:1.1fr 1fr}}
.vp-hero--banner h1{font-size:clamp(2.4rem,8vw,5.2rem)}
.vp-hero--banner .vp-hero-img{aspect-ratio:21/9}
`,
  render(section, context) {
    const { settings } = section;
    const actions = [
      button(settings.primary, context, "primary"),
      button(settings.secondary, context, "secondary"),
    ].filter(Boolean);
    const text = html`<div class="vp-hero-text">
      ${settings.eyebrow ? html`<p class="vp-eyebrow">${settings.eyebrow}</p>` : null}
      <h1>${settings.heading}</h1>
      ${settings.subheading ? html`<p class="vp-sub">${settings.subheading}</p>` : null}${actions.length ? html`<div class="vp-actions">${actions}</div>` : null}
    </div>`;
    const picture = image(settings.image, {
      className: "vp-hero-img",
      width: 1200,
      height: 900,
      eager: true,
    });
    return frame(section, settings, html`${text}${picture}`);
  },
};
