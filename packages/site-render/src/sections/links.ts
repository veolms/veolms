import { button, editorNote } from "../context.ts";
import { html } from "../html.ts";
import { frame, image, type SectionRenderer } from "./frame.ts";

/** A link-in-bio block: a photo, a name, a line, and the links. */
export const links: SectionRenderer<"links"> = {
  css: `
.vp-links .vp-wrap{max-width:560px;text-align:center}
.vp-links-photo{width:112px;height:112px;border-radius:50%;object-fit:cover;margin:0 auto 16px;display:block;background:var(--s-card)}
.vp-links h1{font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:1.6rem;margin:0}
.vp-links .vp-bio{color:var(--s-muted);margin:8px 0 0}
.vp-links-list{list-style:none;margin:28px 0 0;padding:0;display:grid;gap:12px}
.vp-links-list .vp-btn{width:100%}
.vp-links--pills .vp-links-list{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
.vp-links--pills .vp-links-list .vp-btn{width:auto;border-radius:999px}
`,
  render(section, context) {
    const { settings } = section;
    const items = settings.items
      .map((item, index) =>
        button(item, context, index === 0 ? "primary" : "secondary"),
      )
      .filter(Boolean);
    const photo = image(settings.image, {
      className: "vp-links-photo",
      width: 224,
      height: 224,
      eager: true,
    });
    return frame(
      section,
      settings,
      html`${photo}${settings.name ? html`<h1>${settings.name}</h1>` : null}${settings.bio ? html`<p class="vp-bio">${settings.bio}</p>` : null}${
        items.length
          ? html`<ul class="vp-links-list">
              ${items.map((item) => html`<li>${item}</li>`)}
            </ul>`
          : editorNote(context, "Add a link to show it here.")
      }`,
    );
  },
};
