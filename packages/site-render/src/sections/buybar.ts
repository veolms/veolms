import { button } from "../context.ts";
import { html } from "../html.ts";
import type { SectionRenderer } from "./frame.ts";

/**
 * A bar fixed to the bottom of the screen with what is for sale, its price
 * and a button, so buying is one tap away wherever the visitor is. It
 * leaves room for itself at the end of the page.
 */
export const buybar: SectionRenderer<"buybar"> = {
  css: `
.vp-buybar-space{height:84px}
.vp-buybar{position:fixed;left:0;right:0;bottom:0;z-index:40;padding:10px 0 calc(10px + env(safe-area-inset-bottom,0px));background:color-mix(in srgb,var(--s-bg) 92%,transparent);color:var(--s-text);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-top:1px solid var(--s-border);box-shadow:0 -14px 40px -24px rgb(0 0 0/.5)}
.vp-buybar .vp-wrap{display:flex;align-items:center;gap:16px}
.vp-buybar-title{min-width:0;flex:1;display:grid}
.vp-buybar-title b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vp-buybar-price{display:flex;gap:8px;align-items:baseline}
.vp-buybar-price b{font-size:1.15rem}
.vp-buybar-price s{color:var(--s-muted);font-size:.9rem}
.vp-buybar .vp-btn{min-height:44px;padding:10px 20px;flex:none}
`,
  render(section, context) {
    const { settings } = section;
    const hidden =
      settings.hideOn && settings.hideOn !== "none"
        ? ` vp-hide-${settings.hideOn}`
        : "";
    return html`<div class="vp-buybar-space${hidden}" aria-hidden="true"></div>
      <aside
        id="${section.id}"
        class="vp-buybar vp-buybar--bar vp-tone-${settings.tone}${hidden}"
        aria-label="Buy"
      >
        <div class="vp-wrap">
          <span class="vp-buybar-title">
            <b>${settings.title}</b>
            ${settings.price ? html`<span class="vp-buybar-price"><b>${settings.price}</b>${settings.compareAt ? html`<s>${settings.compareAt}</s>` : null}</span>` : null}
          </span>
          ${button(settings.button, context)}
        </div>
      </aside>`;
  },
};
