import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  parseChapterDeclarationsFromDescription,
  resolveChapters,
} from "@veolms/video-player";
import { DiscussionMarkdown } from "./discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "./discussion-editor/types";
import { SurfaceTopRightAccentGlow } from "./SurfaceTopRightAccentGlow";

export const DESCRIPTION_SURFACE_BASE =
  "bg-[color-mix(in_srgb,var(--surface)_94%,var(--canvas))] shadow-[0_14px_38px_color-mix(in_srgb,var(--canvas)_34%,transparent),0_1px_0_color-mix(in_srgb,var(--text)_6%,transparent)]";

export const DESCRIPTION_SURFACE = `rounded-xl ${DESCRIPTION_SURFACE_BASE}`;

const DESCRIPTION_PREVIEW_TYPOGRAPHY = "text-sm leading-6 sm:text-[15px]";

const DESCRIPTION_LINK_TEXT = "font-normal text-(--accent-ink,var(--accent))";

const DESCRIPTION_PREVIEW_LINE_COUNT = 2;

/**
 * The collapsed preview keeps the description's own line breaks: each
 * written line gets one row, and only the first couple are shown.
 */
function getDescriptionPreviewLines(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^[#\s>*-]+/, "")
        .replace(/[`*_[\]()]/g, "")
        .trim(),
    )
    .filter((line) => line.length > 0);
}

function LessonDescriptionHeading() {
  return (
    <h2 className="mt-0 mb-2 text-lg font-bold leading-tight text-(--text)">
      Description
    </h2>
  );
}

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
  onSeekToTimestamp?: (seconds: number) => void;
  onExpandedChange?: (expanded: boolean) => void;
}

export function LessonDescription({
  description,
  isLoading = false,
  onSeekToTimestamp,
  onExpandedChange,
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
  const chapterDeclarations = useMemo(() => {
    const resolved = resolveChapters({ description: rawMarkdown });
    if (resolved.source !== "description") return [];

    const accepted = new Set(
      resolved.chapters.map(
        (chapter) => `${chapter.startTime}\u0000${chapter.title}`,
      ),
    );

    return parseChapterDeclarationsFromDescription(rawMarkdown).filter(
      (declaration) =>
        declaration.isPlainText &&
        accepted.has(`${declaration.startTime}\u0000${declaration.title}`),
    );
  }, [rawMarkdown]);
  const previewLines = useMemo(
    () => getDescriptionPreviewLines(rawMarkdown),
    [rawMarkdown],
  );
  const hasDescription = rawMarkdown.length > 0;

  if (!isLoading && !hasDescription) {
    return null;
  }

  const visiblePreviewLines = previewLines.slice(
    0,
    DESCRIPTION_PREVIEW_LINE_COUNT,
  );
  const hasHiddenPreviewLines =
    previewLines.length > visiblePreviewLines.length;

  const expand = () => {
    if (isLoading || !hasDescription) return;
    setExpanded(true);
    onExpandedChange?.(true);
    requestAnimationFrame(() => {
      showLessRef.current?.focus({ preventScroll: true });
    });
  };

  const collapse = (returnFocus = false) => {
    setExpanded(false);
    onExpandedChange?.(false);
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
        <LessonDescriptionHeading />
        {isLoading ? (
          // Two placeholder lines the size of the collapsed description, so
          // the text takes their place without the panel changing height.
          <div
            role="status"
            aria-busy="true"
            aria-label="Loading lesson description"
            className={`animate-pulse ${DESCRIPTION_PREVIEW_TYPOGRAPHY}`}
          >
            <div className="flex h-[1lh] items-center">
              <span className="h-3.5 w-full rounded-full bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
            </div>
            <div className="mt-1.5 flex h-[1lh] items-center">
              <span className="h-3.5 w-3/5 rounded-full bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
            </div>
          </div>
        ) : expanded ? (
          <DiscussionMarkdown
            content={draftContent}
            label="Lesson description content"
            chapterDeclarations={chapterDeclarations}
            onSeekToTimestamp={onSeekToTimestamp}
            preserveSoftBreaks
            className="wrap-anywhere [&>:first-child]:mt-0"
          />
        ) : (
          <div
            data-lesson-description-preview
            className={`${DESCRIPTION_PREVIEW_TYPOGRAPHY} text-(--text-secondary)`}
          >
            {/* The lines are spaced as the expanded description spaces its
                paragraphs (my-1.5), so opening it does not move them. */}
            {visiblePreviewLines.map((line, index) =>
              index < visiblePreviewLines.length - 1 ? (
                <p key={index} className="m-0 truncate not-first:mt-1.5">
                  {line}
                </p>
              ) : (
                <p key={index} className="m-0 flex min-w-0 not-first:mt-1.5">
                  <span className="min-w-0 truncate">
                    {hasHiddenPreviewLines ? `${line}…` : line}
                  </span>
                  <span
                    data-lesson-description-more
                    className={`ml-1 shrink-0 ${DESCRIPTION_LINK_TEXT}`}
                  >
                    more
                  </span>
                </p>
              ),
            )}
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
            className={`inline rounded-lg pl-0 ml-0 pr-1 ${DESCRIPTION_LINK_TEXT} transition-colors hover:text-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)`}
          >
            Show less
          </button>
        </p>
      )}
    </section>
  );
}
