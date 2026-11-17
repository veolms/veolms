import { editorNote } from "../context.ts";
import { html } from "../html.ts";
import { frame, header, image, type SectionRenderer } from "./frame.ts";

/** Pictures: a tidy grid, a masonry wall, or a row that swipes. */
export const gallery: SectionRenderer<"gallery"> = {
  css: `
.vp-gallery-list{list-style:none;margin:0;padding:0;display:grid;gap:clamp(10px,2vw,18px);grid-template-columns:repeat(2,1fr)}
@media (min-width:860px){.vp-gallery-list{grid-template-columns:repeat(3,1fr)}}
.vp-gallery-list figure{margin:0}
.vp-gallery-list img{width:100%;height:auto;display:block;border-radius:var(--radius);object-fit:cover;background:var(--s-card)}
.vp-gallery--grid .vp-gallery-list img{aspect-ratio:4/3}
.vp-gallery-list figcaption{margin-top:8px;color:var(--s-muted);font-size:.9rem}
.vp-gallery--masonry .vp-gallery-list{display:block;columns:2;column-gap:clamp(10px,2vw,18px)}
@media (min-width:860px){.vp-gallery--masonry .vp-gallery-list{columns:3}}
.vp-gallery--masonry .vp-gallery-list li{break-inside:avoid;margin-bottom:clamp(10px,2vw,18px)}
.vp-gallery--row .vp-gallery-list{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
.vp-gallery--row .vp-gallery-list li{flex:0 0 min(78%,420px);scroll-snap-align:start}
.vp-gallery--row .vp-gallery-list img{aspect-ratio:4/3}
`,
  render(section, context) {
    const { settings } = section;
    const pictures = settings.items.filter((item) => item.image.src);
    if (pictures.length === 0) {
      const note = editorNote(context, "Add pictures to show this section.");
      return note
        ? frame(section, settings, html`${header(settings.heading)}${note}`)
        : null;
    }
    return frame(
      section,
      settings,
      html`${header(settings.heading)}
        <ul class="vp-gallery-list">
          ${pictures.map(
            (item) =>
              html`<li>
                <figure>
                  ${image(item.image, { className: "vp-gallery-img", width: 900, height: 675 })}
                  ${item.caption ? html`<figcaption>${item.caption}</figcaption>` : null}
                </figure>
              </li>`,
          )}
        </ul>`,
    );
  },
};
