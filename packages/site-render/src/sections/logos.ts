import { editorNote } from "../context.ts";
import { html, type Html } from "../html.ts";
import { frame, image, type SectionRenderer } from "./frame.ts";

/**
 * "As seen on" / "Our students work at": a row of logos, still or gliding
 * past endlessly (the marquee pauses under the mouse and stays still for
 * visitors who ask for less motion).
 */
export const logos: SectionRenderer<"logos"> = {
  css: `
.vp-logos .vp-logos-title{margin:0 0 clamp(18px,3vw,28px);text-align:center;color:var(--s-muted);font-size:.9rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.vp-logo-list{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:clamp(20px,4vw,48px)}
.vp-logo{display:flex;align-items:center;height:40px;color:var(--s-muted);font-family:var(--font-heading);font-weight:800;font-size:1.25rem;letter-spacing:-.02em;white-space:nowrap;opacity:.75;transition:opacity .2s}
.vp-logo:hover{opacity:1}
.vp-logo img{height:32px;width:auto;object-fit:contain;filter:grayscale(1);opacity:.8}
.vp-logos--marquee .vp-wrap{max-width:none;padding-inline:0}
.vp-marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent);mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)}
.vp-marquee-track{display:flex;width:max-content;animation:vp-marquee 32s linear infinite}
.vp-marquee:hover .vp-marquee-track{animation-play-state:paused}
.vp-marquee .vp-logo-list{flex-wrap:nowrap;padding-inline:clamp(10px,2vw,24px)}
@keyframes vp-marquee{to{transform:translateX(-50%)}}
`,
  render(section, context) {
    const { settings } = section;
    if (settings.items.length === 0) {
      const note = editorNote(
        context,
        "Add a logo or a name to show this section.",
      );
      return note ? frame(section, settings, note) : null;
    }
    const list = (hidden: boolean): Html =>
      html`<ul class="vp-logo-list" ${hidden ? html`aria-hidden="true"` : null}>
        ${settings.items.map(
          (item) =>
            html`<li class="vp-logo">
              ${
                image(
                  item.image.src
                    ? { ...item.image, alt: item.image.alt || item.name }
                    : item.image,
                  {
                    className: "vp-logo-img",
                    width: 160,
                    height: 64,
                  },
                ) ?? item.name
              }
            </li>`,
        )}
      </ul>`;
    const title = settings.heading
      ? html`<p class="vp-logos-title">${settings.heading}</p>`
      : null;
    const body =
      section.layout === "marquee"
        ? html`<div class="vp-marquee">
            <div class="vp-marquee-track">${list(false)}${list(true)}</div>
          </div>`
        : list(false);
    return frame(section, settings, html`${title}${body}`);
  },
};
