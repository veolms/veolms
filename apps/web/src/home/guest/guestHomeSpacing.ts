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
