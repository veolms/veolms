import { lazy, Suspense } from "react";
import type { DiscussionContent } from "./types";

export interface DeferredDiscussionMarkdownProps {
  content?: DiscussionContent;
  text: string;
  label: string;
  className?: string;
}

const LazyDiscussionMarkdown = lazy(async () => {
  const module = await import("./DiscussionMarkdown");
  return { default: module.DiscussionMarkdown };
});

/**
 * Keeps the Markdown parser out of the common seeded-comment path. Rich posts
 * retain readable content while their full renderer is fetched on demand.
 */
export function DeferredDiscussionMarkdown({
  content,
  text,
  label,
  className = "",
}: DeferredDiscussionMarkdownProps) {
  const plainText = content?.plainText ?? text;
  const fallback = (
    <PlainDiscussionContent
      text={plainText}
      label={label}
      className={className}
    />
  );

  if (!content) return fallback;

  return (
    <Suspense fallback={fallback}>
      <LazyDiscussionMarkdown
        content={content}
        label={label}
        className={className}
      />
    </Suspense>
  );
}

interface PlainDiscussionContentProps {
  text: string;
  label: string;
  className: string;
}

function PlainDiscussionContent({
  text,
  label,
  className,
}: PlainDiscussionContentProps) {
  const paragraphs = text.trim() ? text.split(/\r?\n(?:[\t ]*\r?\n)+/) : [];

  return (
    <div
      role="document"
      aria-label={label}
      className={`max-w-[72ch] text-sm leading-6 text-(--text-secondary) sm:text-[15px] ${className}`}
    >
      {paragraphs.map((paragraph, index) => (
        <p
          // The source text is stable within one discussion entry.
          key={`${index}-${paragraph}`}
          className="my-1.5 first:mt-0 last:mb-0"
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}
