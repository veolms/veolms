import type { SiteCourseCard } from "@veolms/contracts";
import { editorNote, type SiteRenderContext } from "../context.ts";
import { html } from "../html.ts";
import { frame, header, image, type SectionRenderer } from "./frame.ts";

function pickCourses(
  settings: { source: "latest" | "picked"; courseIds: string[]; limit: number },
  context: SiteRenderContext,
): SiteCourseCard[] {
  if (settings.source === "latest") {
    return context.latestCourses.slice(0, settings.limit);
  }
  // A picked course that is no longer published is left out.
  return settings.courseIds
    .map((id) => context.courses.get(id))
    .filter((course): course is SiteCourseCard => course !== undefined)
    .slice(0, settings.limit);
}

function card(
  course: SiteCourseCard,
  showPrice: boolean,
  context: SiteRenderContext,
) {
  const price =
    showPrice && course.priceLabel
      ? html`<p class="vp-price">
          ${course.priceLabel}${course.compareAtLabel ? html` <s>${course.compareAtLabel}</s>` : null}
        </p>`
      : null;
  const thumb =
    image(
      { src: course.imageUrl ?? "", alt: "" },
      { className: "vp-course-img", width: 640, height: 360 },
    ) ??
    html`<span
      class="vp-course-img vp-course-img--empty"
      aria-hidden="true"
    ></span>`;
  return html`<li class="vp-course">
    <a class="vp-course-link vp-card" href="${context.urls.course(course.slug)}"
      >${thumb}<span class="vp-course-body"
        ><span class="vp-course-title">${course.title}</span
        >${course.summary ? html`<span class="vp-course-summary">${course.summary}</span>` : null}${course.lessons > 0 ? html`<span class="vp-course-meta">${course.lessons} ${course.lessons === 1 ? "lesson" : "lessons"}</span>` : null}${price}</span
      ></a
    >
  </li>`;
}

export const courses: SectionRenderer<"courses"> = {
  css: `
.vp-course-list{list-style:none;margin:0;padding:0;display:grid;gap:20px}
.vp-course-link{display:flex;flex-direction:column;height:100%;color:inherit;text-decoration:none;overflow:hidden}
.vp-course-link:hover .vp-course-title{text-decoration:underline}
.vp-course-link:focus-visible{outline:3px solid var(--s-accent);outline-offset:2px}
.vp-course-img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;background:var(--s-border)}
.vp-course-body{display:flex;flex-direction:column;gap:6px;padding:16px 18px 18px;flex:1}
.vp-course-title{font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:1.1rem;line-height:1.3}
.vp-course-summary{color:var(--s-muted);font-size:.95rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.vp-course-meta{color:var(--s-muted);font-size:.85rem}
.vp-price{margin:auto 0 0;padding-top:8px;font-weight:700}
.vp-price s{color:var(--s-muted);font-weight:400;margin-left:6px}
@media (min-width:640px){.vp-courses--grid .vp-course-list{grid-template-columns:repeat(2,1fr)}}
@media (min-width:1000px){.vp-courses--grid .vp-course-list{grid-template-columns:repeat(3,1fr)}}
@media (min-width:640px){.vp-courses--list .vp-course-link{flex-direction:row}.vp-courses--list .vp-course-img{width:280px;flex:none}}
.vp-courses--row .vp-course-list{grid-auto-flow:column;grid-auto-columns:min(78%,300px);overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px;overscroll-behavior-x:contain}
.vp-courses--row .vp-course{scroll-snap-align:start}
`,
  render(section, context) {
    const { settings } = section;
    const picked = pickCourses(settings, context);
    if (picked.length === 0) {
      const note = editorNote(
        context,
        settings.source === "picked"
          ? "Pick published courses to show them here."
          : "Your published courses will show here.",
      );
      return note
        ? frame(
            section,
            settings,
            html`${header(settings.heading, settings.intro)}${note}`,
          )
        : null;
    }
    return frame(
      section,
      settings,
      html`${header(settings.heading, settings.intro)}
        <ul class="vp-course-list">
          ${picked.map((course) => card(course, settings.showPrice, context))}
        </ul>`,
    );
  },
};
