import { useId, useRef, useState, type KeyboardEvent } from "react";
import { DiscussionMarkdown } from "./discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "./discussion-editor/types";
import { SurfaceTopRightAccentGlow } from "./SurfaceTopRightAccentGlow";

const LESSON_DESCRIPTION_MARKDOWN = `## Description

UI and UX work together. You will practice \`empathy\` as a design tool, not a slogan, and leave with a short checklist you can reuse on the next product you touch.

## Why this matters

> Great interfaces start with people, not pixels.

Keep this nearby while you watch, then try the exercise at the end of the lesson.

### Goals

- Map a user journey in one sitting
- Spot three friction points in a real product
- Write a one-line problem statement

### Try this in code

\`\`\`javascript
const journey = ["discover", "decide", "delight"];
console.log(journey.join(" → "));
\`\`\`

See the [Nielsen Norman Group glossary](https://www.nngroup.com/articles/definition-user-experience/) for terms used in this lesson.
`;

const LESSON_DESCRIPTION_CONTENT = createDiscussionDraft(
  LESSON_DESCRIPTION_MARKDOWN,
);

export const DESCRIPTION_SURFACE_BASE =
  "bg-[color-mix(in_srgb,var(--surface)_94%,var(--canvas))] shadow-[0_14px_38px_color-mix(in_srgb,var(--canvas)_34%,transparent),0_1px_0_color-mix(in_srgb,var(--text)_6%,transparent)]";

export const DESCRIPTION_SURFACE = `rounded-xl ${DESCRIPTION_SURFACE_BASE}`;

const DESCRIPTION_PREVIEW_TYPOGRAPHY = "text-sm leading-6 sm:text-[15px]";

function handleCollapsedKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onExpand: () => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onExpand();
  }
}

function handleExpandedKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onCollapse: () => void,
) {
  if (event.key !== "Escape") {
    return;
  }

  if (!event.currentTarget.contains(document.activeElement)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  onCollapse();
}

export function LessonDescription() {
  const contentId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const showLessRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);

  const expand = () => {
    setExpanded(true);
    requestAnimationFrame(() => {
      showLessRef.current?.focus({ preventScroll: true });
    });
  };

  const collapse = (returnFocus = false) => {
    setExpanded(false);
    if (returnFocus) {
      requestAnimationFrame(() => {
        sectionRef.current?.focus({ preventScroll: true });
      });
    }
  };

  return (
    <section
      ref={sectionRef}
      data-lesson-description
      data-expanded={expanded ? "true" : "false"}
      aria-label={
        expanded
          ? "Lesson description"
          : "Show more of the lesson description"
      }
      aria-expanded={expanded}
      role={expanded ? undefined : "button"}
      tabIndex={expanded ? -1 : 0}
      onClick={expanded ? undefined : expand}
      onKeyDown={
        expanded
          ? (event) => handleExpandedKeyDown(event, () => collapse(true))
          : (event) => handleCollapsedKeyDown(event, expand)
      }
      className={`relative isolate overflow-hidden px-3.5 py-2.5 ${DESCRIPTION_SURFACE}${expanded ? "" : " cursor-pointer"}`}
    >
      <SurfaceTopRightAccentGlow />
      <div
        id={contentId}
        data-lesson-description-body
        aria-hidden={expanded ? undefined : true}
        className="relative z-10"
      >
        {expanded ? (
          <DiscussionMarkdown
            content={LESSON_DESCRIPTION_CONTENT}
            label="Lesson description content"
            className="[&>:first-child]:mt-0"
          />
        ) : (
          <div>
            <h2 className="mt-0 mb-2 text-lg font-bold leading-tight text-(--text)">
              Description
            </h2>
            <p
              data-lesson-description-preview
              className={`line-clamp-2 overflow-hidden ${DESCRIPTION_PREVIEW_TYPOGRAPHY} text-(--text-secondary) sm:line-clamp-3`}
            >
              <span className="inline sm:hidden">
                UI and UX work together. You will practice{" "}
                <code className="rounded bg-[color-mix(in_srgb,var(--text)_9%,transparent)] px-1.5 py-0.5 font-mono text-[0.9em] text-(--text)">
                  empathy
                </code>{" "}
                as a design tool...
              </span>
              <span className="hidden sm:inline">
                UI and UX work together. You will practice{" "}
                <code className="rounded bg-[color-mix(in_srgb,var(--text)_9%,transparent)] px-1.5 py-0.5 font-mono text-[0.9em] text-(--text)">
                  empathy
                </code>{" "}
                as a design tool, not a slogan, and leave with a short checklist
                you can reuse on the next product you touch...
              </span>{" "}
              <span
                data-lesson-description-more
                aria-hidden="true"
                className="text-(--accent-ink,var(--accent))"
              >
                more
              </span>
            </p>
          </div>
        )}
      </div>
      {expanded && (
        <p
          className={`relative z-10 mt-5 ${DESCRIPTION_PREVIEW_TYPOGRAPHY}`}
        >
          <button
            ref={showLessRef}
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            aria-label="Show less of the lesson description"
            onClick={() => collapse()}
            className="inline rounded-lg pl-0 ml-0 pr-1 font-normal text-(--accent-ink,var(--accent)) transition-colors hover:text-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          >
            Show less
          </button>
        </p>
      )}
    </section>
  );
}
