import { button } from "../context.ts";
import { html } from "../html.ts";
import { frame, image, type SectionRenderer } from "./frame.ts";

export const hero: SectionRenderer<"hero"> = {
  css: `
.vp-hero .vp-wrap{display:grid;gap:clamp(24px,5vw,56px);align-items:center}
.vp-hero h1{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);font-size:calc(clamp(2rem,6vw,3.6rem)*var(--hs));line-height:1.08;margin:0;text-wrap:balance}
.vp-hero .vp-sub{font-size:clamp(1.05rem,2.4vw,1.25rem);color:var(--s-muted);margin:16px 0 0;max-width:42rem}
.vp-hero .vp-actions{margin-top:28px}
.vp-hero-img{width:100%;height:auto;border-radius:var(--radius);object-fit:cover;aspect-ratio:4/3;background:var(--s-card)}
.vp-hero--centered .vp-wrap{text-align:center;justify-items:center}
.vp-hero--centered .vp-sub{margin-inline:auto}
.vp-hero--centered .vp-actions{justify-content:center}
.vp-hero--centered .vp-hero-img{max-width:960px;aspect-ratio:16/9}
@media (min-width:860px){.vp-hero--split .vp-wrap{grid-template-columns:1.1fr 1fr}}
.vp-hero--banner h1{font-size:calc(clamp(2.4rem,8vw,5.2rem)*var(--hs))}
.vp-hero--banner .vp-hero-img{aspect-ratio:21/9}
.vp-hero--gradient{background:radial-gradient(55% 70% at 18% 8%,color-mix(in srgb,var(--s-accent) 26%,transparent),transparent 70%),radial-gradient(45% 60% at 88% 18%,color-mix(in srgb,var(--s-accent) 16%,transparent),transparent 70%),radial-gradient(60% 60% at 50% 110%,color-mix(in srgb,var(--s-accent) 12%,transparent),transparent 70%),var(--s-bg)}
.vp-hero--gradient .vp-wrap{text-align:center;justify-items:center}
.vp-hero--gradient h1{font-size:calc(clamp(2.4rem,7vw,4.6rem)*var(--hs));max-width:16ch}
.vp-hero--gradient .vp-sub{margin-inline:auto}
.vp-hero--gradient .vp-actions{justify-content:center}
.vp-hero--gradient .vp-hero-img{max-width:1000px;aspect-ratio:16/9;box-shadow:0 40px 90px -40px color-mix(in srgb,var(--s-accent) 55%,#000)}
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
