/**
 * The guest home page spacing, shared by its sections so they stay aligned.
 *
 * It scales with the width of the page itself (container units of
 * `@container/home`), not the viewport: the sidebar changes how much room
 * the page has. Narrow pages use the application shell page padding, the
 * same as every other screen; wide pages open up to a roomier layout.
 */
export const guestHomeGutter =
  "px-[clamp(var(--application-page-inline-gutter,25px),3.6cqw,3rem)]";

export const guestHomeBlockStart =
  "pt-[clamp(var(--application-page-block-start,22px),2.8cqw,2.5rem)]";

/** Space between the stacked sections. */
export const guestHomeSectionGap = "gap-y-[clamp(2.25rem,4cqw,3rem)]";

/**
 * On a phone the cards run to both edges of the screen, as they do on the
 * Courses page: while a section shows one card per row, its cards are pulled
 * out over the page gutter. The gutter is 3.6% of the page's width and these
 * rules measure the section inside it, which is narrower by two gutters, so
 * the same length is 3.879% here (0.036 / (1 - 2 * 0.036)).
 */
export const guestHomeCourseRowBleed =
  "@max-lg/courses:-mx-[clamp(var(--application-page-inline-gutter,25px),3.879cqw,3rem)]";

export const guestHomeCommentGridBleed =
  "@max-xl/comments:-mx-[clamp(var(--application-page-inline-gutter,25px),3.879cqw,3rem)]";
