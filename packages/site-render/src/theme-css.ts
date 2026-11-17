import type { SiteTheme, SiteThemeColours } from "@veolms/contracts";

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
  square: "6px",
  outline: "2px",
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
    `--radius:${theme.radius}px`,
    `--btn-radius:${BUTTON_RADIUS[theme.buttonStyle]}`,
  ].join(";");
  const dark = `${colourVariables(theme.dark)};color-scheme:dark`;
  return [
    `.vp-site{${shared};${colourVariables(theme.light)};color-scheme:light}`,
    `.vp-site[data-mode="dark"]{${dark}}`,
    `@media (prefers-color-scheme:dark){.vp-site[data-mode="system"]{${dark}}}`,
  ].join("\n");
}

/** What every page needs, whatever its sections. */
export const BASE_CSS = `
.vp-site{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:1rem;line-height:1.6;-webkit-text-size-adjust:100%;text-rendering:optimizeLegibility}
.vp-site *,.vp-site *::before,.vp-site *::after{box-sizing:border-box}
.vp-site img{max-width:100%}
.vp-s{background:var(--s-bg);color:var(--s-text);padding-block:var(--s-pad)}
.vp-wrap{max-width:1160px;margin-inline:auto;padding-inline:clamp(16px,4vw,32px)}
.vp-sp-sm{--s-pad:clamp(28px,5vw,40px)}
.vp-sp-md{--s-pad:clamp(44px,8vw,72px)}
.vp-sp-lg{--s-pad:clamp(64px,11vw,112px)}
.vp-tone-default{--s-bg:var(--bg);--s-text:var(--text);--s-muted:var(--muted);--s-card:var(--surface);--s-border:var(--border);--s-accent:var(--accent)}
.vp-tone-muted{--s-bg:var(--surface);--s-text:var(--text);--s-muted:var(--muted);--s-card:var(--bg);--s-border:var(--border);--s-accent:var(--accent)}
.vp-tone-accent{--s-bg:var(--soft);--s-text:var(--text);--s-muted:var(--muted);--s-card:var(--surface);--s-border:var(--border);--s-accent:var(--text)}
.vp-tone-inverse{--s-bg:var(--inverse-bg);--s-text:var(--inverse-text);--s-muted:var(--inverse-muted);--s-card:color-mix(in srgb,var(--inverse-text) 8%,var(--inverse-bg));--s-border:color-mix(in srgb,var(--inverse-text) 20%,var(--inverse-bg));--s-accent:var(--inverse-text)}
.vp-head{margin-bottom:clamp(24px,4vw,40px);max-width:46rem}
.vp-h2{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);font-size:clamp(1.6rem,4vw,2.4rem);line-height:1.15;margin:0;text-wrap:balance}
.vp-lead{color:var(--s-muted);font-size:1.08rem;margin:12px 0 0}
.vp-eyebrow{font-family:var(--font-eyebrow);color:var(--s-accent);font-weight:700;font-size:.85rem;letter-spacing:.08em;text-transform:uppercase;margin:0 0 14px}
.vp-actions{display:flex;flex-wrap:wrap;gap:12px}
.vp-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 24px;border-radius:var(--btn-radius);font-weight:700;line-height:1.2;text-align:center;text-decoration:none;border:2px solid var(--accent);transition:filter .15s}
.vp-btn--primary{background:var(--accent);color:var(--on-accent)}
.vp-btn--secondary{background:transparent;color:var(--s-text);border-color:var(--s-border)}
.vp-tone-inverse .vp-btn--primary{background:var(--inverse-text);color:var(--inverse-bg);border-color:var(--inverse-text)}
.vp-btn:hover{filter:brightness(1.08)}
.vp-btn:focus-visible{outline:3px solid var(--s-accent);outline-offset:3px}
.vp-note{border:1px dashed var(--s-border);border-radius:var(--radius);padding:16px;color:var(--s-muted);margin:0;text-align:center}
@media (prefers-reduced-motion:reduce){.vp-site *{transition:none!important;scroll-behavior:auto!important}}
`;
