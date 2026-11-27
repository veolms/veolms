/**
 * A built-in legal document's rendered introduction and body as the Markdown
 * Platform → Legal pages edits: each numbered section becomes
 * `## Heading {#anchor}`, with any old anchors kept beside it
 * (`{#refund-policy #refund-and-cancellation-policy}`), and the rest goes
 * through the converter comments use for pasted HTML (lists, links, tables).
 */
export async function builtInLegalMarkdown(
  intro: HTMLElement,
  body: HTMLElement,
): Promise<string> {
  const { htmlToDiscussionMarkdown } =
    await import("../../learning/discussion-editor/clipboard");
  const bodyCopy = body.cloneNode(true) as HTMLElement;

  for (const section of Array.from(bodyCopy.querySelectorAll("section[id]"))) {
    const heading = section.querySelector(":scope > h2");
    if (!heading) continue;
    // The section number is added again when the page is shown.
    heading.querySelector(":scope > span")?.remove();
    const anchors = [section.id];
    // Old anchors are empty elements just before the section.
    let previous = section.previousElementSibling;
    while (previous && previous.id && !previous.textContent?.trim()) {
      anchors.push(previous.id);
      const older = previous.previousElementSibling;
      previous.remove();
      previous = older;
    }
    const title = heading.textContent?.trim() ?? "";
    heading.textContent = `${title} {#${anchors.join(" #")}}`;
  }

  return [
    htmlToDiscussionMarkdown(intro.innerHTML),
    htmlToDiscussionMarkdown(bodyCopy.innerHTML),
  ]
    .filter(Boolean)
    .join("\n\n");
}
