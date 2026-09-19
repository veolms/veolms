import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DiscussionMarkdown } from "./discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "./discussion-editor/types";
import { SurfaceTopRightAccentGlow } from "./SurfaceTopRightAccentGlow";

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

export interface LessonDescriptionProps {
  description?: string | null;
  isLoading?: boolean;
}

export function LessonDescription({
  description,
  isLoading = false,
}: LessonDescriptionProps = {}) {
  const contentId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const showLessRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);

  const rawMarkdown = (description ?? "").trim();
  const draftContent = useMemo(
    () => createDiscussionDraft(rawMarkdown),
    [rawMarkdown],
  );
  const hasDescription = rawMarkdown.length > 0;

  if (!isLoading && !hasDescription) {
    return null;
  }

  const expand = () => {
    if (isLoading || !hasDescription) return;
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
        expanded ? "Lesson description" : "Show more of the lesson description"
      }
      aria-expanded={expanded}
      role={expanded || isLoading || !hasDescription ? undefined : "button"}
      tabIndex={expanded || isLoading || !hasDescription ? -1 : 0}
      onClick={expanded || isLoading || !hasDescription ? undefined : expand}
      onKeyDown={
        expanded
          ? (event) => handleExpandedKeyDown(event, () => collapse(true))
          : isLoading || !hasDescription
            ? undefined
            : (event) => handleCollapsedKeyDown(event, expand)
      }
      className={`relative isolate overflow-hidden px-3.5 py-2.5 ${DESCRIPTION_SURFACE}${expanded || isLoading || !hasDescription ? "" : " cursor-pointer"}`}
    >
      <SurfaceTopRightAccentGlow />
      <div
        id={contentId}
        data-lesson-description-body
        aria-hidden={expanded ? undefined : true}
        className="relative z-10"
      >
        {isLoading ? (
          <div>
            <h2 className="mt-0 mb-2 text-lg font-bold leading-tight text-(--text)">
              Description
            </h2>
            <p
              data-lesson-description-loading
              className="m-0 text-(--muted) text-sm italic"
            >
              Loading lesson description...
            </p>
          </div>
        ) : expanded ? (
          hasDescription ? (
            <DiscussionMarkdown
              content={draftContent}
              label="Lesson description content"
              className="[&>:first-child]:mt-0"
            />
          ) : (
            <p className="m-0 text-(--muted) text-sm italic">
              No description provided for this lesson.
            </p>
          )
        ) : (
          <div>
            <h2 className="mt-0 mb-2 text-lg font-bold leading-tight text-(--text)">
              Description
            </h2>
            <p
              data-lesson-description-preview
              className={`line-clamp-2 overflow-hidden ${DESCRIPTION_PREVIEW_TYPOGRAPHY} text-(--text-secondary) sm:line-clamp-3`}
            >
              <span>
                {hasDescription
                  ? rawMarkdown
                      .replace(/^[#\s>*-]+/gm, "")
                      .replace(/[`*_[\]()]/g, "")
                      .trim()
                  : "No description provided for this lesson."}
              </span>{" "}
              {hasDescription ? (
                <span
                  data-lesson-description-more
                  aria-hidden="true"
                  className="text-(--accent-ink,var(--accent))"
                >
                  more
                </span>
              ) : null}
            </p>
          </div>
        )}
      </div>
      {expanded && !isLoading && hasDescription && (
        <p className={`relative z-10 mt-5 ${DESCRIPTION_PREVIEW_TYPOGRAPHY}`}>
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
