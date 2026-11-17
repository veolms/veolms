import { button, linkAttributes, resolveLink } from "../context.ts";
import { html } from "../html.ts";
import { frame, header, image, type SectionRenderer } from "./frame.ts";

const PLAY = html`<svg
  viewBox="0 0 24 24"
  width="28"
  height="28"
  aria-hidden="true"
>
  <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
</svg>`;

/**
 * A video to watch: its picture with a play button that opens it (YouTube,
 * Vimeo, a free lesson). Nothing plays inside the page, so it stays fast
 * and loads nothing from other sites.
 */
export const video: SectionRenderer<"video"> = {
  css: `
.vp-video-frame{position:relative;display:block;overflow:hidden;border-radius:calc(var(--radius) + 4px);aspect-ratio:16/9;background:radial-gradient(80% 90% at 30% 20%,color-mix(in srgb,var(--s-accent) 30%,transparent),transparent 70%),var(--s-card);box-shadow:var(--shadow)}
.vp-video-frame img{width:100%;height:100%;object-fit:cover;display:block}
.vp-video-play{position:absolute;inset:0;margin:auto;width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:var(--on-accent);box-shadow:0 0 0 10px color-mix(in srgb,var(--accent) 25%,transparent);transition:transform .25s var(--ease)}
a.vp-video-frame:hover .vp-video-play{transform:scale(1.08)}
.vp-video--wide .vp-head{margin-inline:auto;text-align:center}
.vp-video--wide .vp-video-frame{max-width:980px;margin-inline:auto}
.vp-video--split .vp-wrap{display:grid;gap:clamp(20px,4vw,48px);align-items:center}
@media (min-width:860px){.vp-video--split .vp-wrap{grid-template-columns:1fr 1.3fr}}
.vp-video .vp-actions{margin-top:22px}
.vp-video--wide .vp-actions{justify-content:center}
`,
  render(section, context) {
    const { settings } = section;
    const href = settings.url
      ? resolveLink({ kind: "url", href: settings.url }, context)
      : null;
    const poster = image(settings.poster, {
      className: "vp-video-img",
      width: 1280,
      height: 720,
    });
    const inner = html`${poster}<span class="vp-video-play">${PLAY}</span>`;
    const player = href
      ? html`<a
          class="vp-video-frame"
          ${linkAttributes(href)}
          aria-label="Play the video"
          >${inner}</a
        >`
      : html`<div class="vp-video-frame">${inner}</div>`;
    const action = button(settings.button, context);
    const words = html`${header(settings.heading, settings.text)}${action ? html`<div class="vp-actions">${action}</div>` : null}`;
    return frame(
      section,
      settings,
      section.layout === "split"
        ? html`<div>${words}</div>
            ${player}`
        : html`${words}${player}`,
    );
  },
};
