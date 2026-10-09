import { useMemo } from "react";
import { DiscussionMarkdown } from "../../learning/discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "../../learning/discussion-editor/types";

/**
 * Text an author wrote in the quiz editor, shown the way it was formatted.
 *
 * The editor saves bold, lists and code as Markdown. The quiz used to print
 * that source as it was, so a question with a bold phrase reached learners
 * with asterisks around it. This draws it with the renderer the lesson
 * description and discussions use: raw HTML in the text is dropped and links
 * are limited to ordinary web addresses.
 *
 * `className` sets the size and colour of the text; the classes need the
 * important modifier, because the renderer brings sizes of its own.
 */
export function QuizFormattedText({
  text,
  label,
  className = "",
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const content = useMemo(() => createDiscussionDraft(text), [text]);

  return (
    <DiscussionMarkdown
      content={content}
      label={label}
      // A link in a question is a reference, not a card to preview.
      enableLinkPreview={false}
      className={`max-w-none! ${className}`}
    />
  );
}
