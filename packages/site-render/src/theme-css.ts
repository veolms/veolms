import type {
  SiteLook,
  SiteMotionLevel,
  SiteTheme,
  SiteThemeColours,
} from "@veolms/contracts";
import { SITE_THEMES } from "@veolms/contracts";

function colourVariables(colours: SiteThemeColours): string {
  return [
    `--bg:${colours.bg}`,
    `--surface:${colours.surface}`,
    `--text:${colours.text}`,
    `--muted:${colours.muted}`,
    `--border:${colours.border}`,
    `--accent:${colours.accent}`,
    `--on-accent:${colours.onAccent}`,
    `--soft:${colours.soft}`,
    `--inverse-bg:${colours.inverseBg}`,
    `--inverse-text:${colours.inverseText}`,
    `--inverse-muted:${colours.inverseMuted}`,
  ].join(";");
}

const BUTTON_RADIUS: Record<SiteTheme["buttonStyle"], string> = {
  pill: "999px",
  square: "8px",
  outline: "4px",
  soft: "12px",
  gradient: "999px",
};

const SHADOW: Record<SiteTheme["shadow"], string> = {
  none: "none",
  soft: "0 12px 32px -14px rgb(15 23 42/.22)",
  strong: "0 26px 56px -22px rgb(15 23 42/.42)",
};

/**
 * The theme as CSS variables on `.vp-site`. `data-mode` picks light, dark,
 * or (for "system") whatever the visitor's device prefers, with no script.
 */
export function themeCss(theme: SiteTheme): string {
  const shared = [
    `--font-heading:${theme.fonts.heading}`,
    `--font-body:${theme.fonts.body}`,
    `--font-eyebrow:${theme.fonts.eyebrow}`,
    `--heading-weight:${theme.headingWeight}`,
    `--heading-tracking:${theme.headingTracking}`,
    `--hs:${theme.headingScale}`,
    `--radius:${theme.radius}px`,
    `--btn-radius:${BUTTON_RADIUS[theme.buttonStyle]}`,
    `--shadow:${SHADOW[theme.shadow]}`,
    `--width:${theme.width}px`,
  ].join(";");
  const dark = `${colourVariables(theme.dark)};color-scheme:dark`;
  return [
    `.vp-site{${shared};${colourVariables(theme.light)};color-scheme:light}`,
    `.vp-site[data-mode="dark"]{${dark}}`,
    `@media (prefers-color-scheme:dark){.vp-site[data-mode="system"]{${dark}}}`,
  ].join("\n");
}

/** The motion a page uses: the site's own choice, else its theme's. */
export function motionLevel(look: SiteLook): SiteMotionLevel {
  return look.motion ?? SITE_THEMES[look.themeId].motion;
}

/**
 * The attributes the page's outer element carries, which pick the theme's
 * button, card and motion styles. The editor puts the same ones on its
 * preview, so both look alike.
 */
export function siteAttributes(look: SiteLook): Record<string, string> {
  const theme = SITE_THEMES[look.themeId];
  return {
    "data-mode": look.colourMode,
    "data-btn": theme.buttonStyle,
    "data-card": theme.cardStyle,
    "data-motion": motionLevel(look),
  };
}

/** What every page needs, whatever its sections. */
export const BASE_CSS = `
.vp-site{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:1rem;line-height:1.6;-webkit-text-size-adjust:100%;text-rendering:optimizeLegibility;--ease:cubic-bezier(.16,1,.3,1)}
.vp-site *,.vp-site *::before,.vp-site *::after{box-sizing:border-box}
.vp-site img{max-width:100%}
.vp-s{background:var(--s-bg);color:var(--s-text);padding-block:var(--s-pad);position:relative;overflow:clip}
.vp-wrap{max-width:var(--width);margin-inline:auto;padding-inline:clamp(16px,4vw,32px)}
.vp-sp-sm{--s-pad:clamp(28px,5vw,40px)}
.vp-sp-md{--s-pad:clamp(48px,8vw,80px)}
.vp-sp-lg{--s-pad:clamp(68px,11vw,120px)}
.vp-tone-default{--s-bg:var(--bg);--s-text:var(--text);--s-muted:var(--muted);--s-card:var(--surface);--s-border:var(--border);--s-accent:var(--accent)}
.vp-tone-muted{--s-bg:var(--surface);--s-text:var(--text);--s-muted:var(--muted);--s-card:var(--bg);--s-border:var(--border);--s-accent:var(--accent)}
.vp-tone-accent{--s-bg:var(--soft);--s-text:var(--text);--s-muted:var(--muted);--s-card:var(--surface);--s-border:var(--border);--s-accent:var(--text)}
.vp-tone-brand{--s-bg:var(--accent);--s-text:var(--on-accent);--s-muted:color-mix(in srgb,var(--on-accent) 84%,var(--accent));--s-card:color-mix(in srgb,var(--on-accent) 9%,var(--accent));--s-border:color-mix(in srgb,var(--on-accent) 26%,var(--accent));--s-accent:var(--on-accent)}
.vp-tone-inverse{--s-bg:var(--inverse-bg);--s-text:var(--inverse-text);--s-muted:var(--inverse-muted);--s-card:color-mix(in srgb,var(--inverse-text) 8%,var(--inverse-bg));--s-border:color-mix(in srgb,var(--inverse-text) 20%,var(--inverse-bg));--s-accent:var(--inverse-text)}
.vp-head{margin-bottom:clamp(24px,4vw,44px);max-width:46rem}
.vp-h2{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);font-size:calc(clamp(1.6rem,4vw,2.5rem)*var(--hs));line-height:1.12;margin:0;text-wrap:balance}
.vp-lead{color:var(--s-muted);font-size:1.08rem;margin:12px 0 0}
.vp-eyebrow{font-family:var(--font-eyebrow);color:var(--s-accent);font-weight:700;font-size:.85rem;letter-spacing:.08em;text-transform:uppercase;margin:0 0 14px}
.vp-actions{display:flex;flex-wrap:wrap;gap:12px}
.vp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 24px;border-radius:var(--btn-radius);font-weight:700;line-height:1.2;text-align:center;text-decoration:none;border:2px solid var(--accent);transition:filter .15s,transform .2s var(--ease),box-shadow .2s,background-color .15s,color .15s}
.vp-btn--primary{background:var(--accent);color:var(--on-accent)}
.vp-btn--secondary{background:transparent;color:var(--s-text);border-color:var(--s-border)}
.vp-site[data-btn="outline"] .vp-btn--primary{background:transparent;color:var(--s-text);border-color:var(--s-text)}
.vp-site[data-btn="outline"] .vp-btn--primary:hover{background:var(--s-text);color:var(--s-bg)}
.vp-site[data-btn="soft"] .vp-btn--primary{background:color-mix(in srgb,var(--s-accent) 16%,var(--s-bg));color:var(--s-text);border-color:transparent}
.vp-site[data-btn="gradient"] .vp-btn--primary{background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 78%,var(--text)));border-color:transparent;box-shadow:0 10px 24px -12px var(--accent)}
.vp-tone-inverse .vp-btn--primary,.vp-tone-brand .vp-btn--primary,.vp-site[data-btn] .vp-tone-inverse .vp-btn--primary,.vp-site[data-btn] .vp-tone-brand .vp-btn--primary{background:var(--s-text);color:var(--s-bg);border-color:var(--s-text)}
.vp-btn:hover{filter:brightness(1.08)}
.vp-btn:focus-visible{outline:3px solid var(--s-accent);outline-offset:3px}
.vp-card{border-radius:var(--radius);background:var(--s-card);border:1px solid var(--s-border);box-shadow:none;transition:transform .35s var(--ease),box-shadow .35s var(--ease),border-color .2s}
.vp-site[data-card="flat"] .vp-card{border-color:transparent}
.vp-site[data-card="elevated"] .vp-card{border-color:color-mix(in srgb,var(--s-border) 55%,transparent);box-shadow:var(--shadow)}
.vp-site[data-card="glass"] .vp-card{background:color-mix(in srgb,var(--s-card) 72%,transparent);border-color:color-mix(in srgb,var(--s-text) 11%,transparent);box-shadow:var(--shadow);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.vp-site[data-card="gradient"] .vp-card{border-color:transparent;background:linear-gradient(var(--s-card),var(--s-card)) padding-box,linear-gradient(135deg,var(--s-accent),var(--s-border)) border-box}
.vp-site[data-card="minimal"] .vp-card{background:transparent;border-color:transparent}
.vp-note{border:1px dashed var(--s-border);border-radius:var(--radius);padding:16px;color:var(--s-muted);margin:0;text-align:center}
@media (max-width:719px){.vp-hide-phone{display:none}}
@media (min-width:720px){.vp-hide-desktop{display:none}}
.vp-site[data-motion="lively"] .vp-card:hover{transform:translateY(-6px);box-shadow:0 22px 44px -22px rgb(15 23 42/.45)}
.vp-site[data-motion="lively"] .vp-btn:hover{transform:translateY(-2px)}
.vp-site[data-motion="subtle"] a.vp-card:hover{transform:translateY(-3px)}
.vp-js .vp-site:not([data-motion="off"]) [data-anim] .vp-wrap{transition:opacity .8s var(--ease),transform .8s var(--ease),filter .8s var(--ease)}
.vp-js .vp-site:not([data-motion="off"]) [data-anim]:not(.vp-in) .vp-wrap{opacity:0}
.vp-js .vp-site:not([data-motion="off"]) [data-anim="auto"]:not(.vp-in) .vp-wrap,.vp-js .vp-site:not([data-motion="off"]) [data-anim="fade-up"]:not(.vp-in) .vp-wrap{transform:translateY(28px)}
.vp-js .vp-site:not([data-motion="off"]) [data-anim="zoom"]:not(.vp-in) .vp-wrap{transform:scale(.94)}
.vp-js .vp-site:not([data-motion="off"]) [data-anim="slide-left"]:not(.vp-in) .vp-wrap{transform:translateX(48px)}
.vp-js .vp-site:not([data-motion="off"]) [data-anim="slide-right"]:not(.vp-in) .vp-wrap{transform:translateX(-48px)}
.vp-js .vp-site:not([data-motion="off"]) [data-anim="blur"]:not(.vp-in) .vp-wrap{filter:blur(12px)}
.vp-js .vp-site[data-motion="lively"] [data-anim] .vp-card{transition:opacity .7s var(--ease),transform .7s var(--ease),box-shadow .35s var(--ease);transition-delay:calc(var(--i,0)*90ms + 120ms)}
.vp-js .vp-site[data-motion="lively"] [data-anim]:not(.vp-in) .vp-card{opacity:0;transform:translateY(22px)}
@media (prefers-reduced-motion:reduce){.vp-site *{transition:none!important;scroll-behavior:auto!important;animation:none!important}}
`;

/**
 * The page's only script: it reveals sections as they scroll into view and
 * staggers their cards. Without it (blocked, old browser, reduced motion)
 * everything is simply shown.
 */
export const MOTION_SCRIPT = `(function(){var d=document.documentElement;if(!("IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion: reduce)").matches)return;var s=document.querySelector(".vp-site");if(!s||s.getAttribute("data-motion")==="off")return;d.classList.add("vp-js");var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("vp-in");io.unobserve(e.target)}})},{rootMargin:"0px 0px -6% 0px"});document.querySelectorAll("[data-anim]").forEach(function(el){el.querySelectorAll(".vp-card").forEach(function(c,i){c.style.setProperty("--i",String(i%6))});io.observe(el)})})();`;
