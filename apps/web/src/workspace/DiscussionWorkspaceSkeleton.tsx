import type { DiscussionTab } from "../routing/tabSessionState";

export type DiscussionWorkspaceSkeletonMode = "loading" | "preview";

export const DISCUSSION_LOADING_SKELETON_COUNT = 5;
export const DISCUSSION_PREVIEW_SKELETON_COUNT = 5;

const skeletonVariantClassNames: Readonly<Record<DiscussionTab, string>> = {
  "q-and-a": "discussion-thread--question",
  comments: "discussion-thread--comment",
  notes: "discussion-thread--note",
  mentions: "discussion-thread--mention",
  following: "discussion-thread--following",
  saved: "discussion-thread--bookmark",
};

export interface DiscussionWorkspaceSkeletonProps {
  mode: DiscussionWorkspaceSkeletonMode;
  variant: DiscussionTab;
}

export interface DiscussionWorkspaceSkeletonListProps extends DiscussionWorkspaceSkeletonProps {
  label?: string;
  withinFeed?: boolean;
}

export function DiscussionWorkspaceSkeleton({
  mode,
  variant,
}: DiscussionWorkspaceSkeletonProps) {
  const isLoading = mode === "loading";

  return (
    <article
      className={[
        "discussion-thread",
        "discussion-thread--workspace-card",
        "discussion-workspace-skeleton",
        skeletonVariantClassNames[variant],
        "is-static",
        "is-collapsed",
        isLoading ? "animate-pulse motion-reduce:animate-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
      data-discussion-skeleton={mode}
    >
      <div className="discussion-thread__open discussion-thread__open--overview">
        <div className="discussion-thread__avatar">
          <span className="block rounded-full bg-(--track)" />
        </div>

        <div className="discussion-thread__body">
          <div className="discussion-thread__author">
            <span className="h-3 w-24 rounded bg-(--track)" />
            <span className="discussion-thread__author-activity h-3 w-12 rounded bg-(--track)" />
          </div>

          <div className="discussion-hub__card-content">
            <div className="discussion-hub__card-preview-row">
              <div className="discussion-hub__card-preview">
                <span className="block h-3.5 w-4/5 rounded bg-(--track)" />
              </div>
              <div className="discussion-hub__card-content-utility">
                <span className="block h-3 w-16 rounded bg-(--track)" />
              </div>
            </div>
          </div>

          <div className="discussion-thread__context">
            <span className="h-3 w-20 rounded bg-(--track)" />
            <span
              aria-hidden="true"
              className="size-1 rounded-full bg-(--track)"
            />
            <small className="h-3 w-14 rounded bg-(--track)" />
          </div>
        </div>

        <div className="discussion-thread__meta">
          <div className="discussion-thread__rail-inner">
            <span className="discussion-thread__rail-slot--top inline-flex">
              <span className="h-5 w-18 rounded bg-(--track)" />
            </span>
            <span className="discussion-thread__rail-slot--middle">
              <span className="h-3 w-15 rounded bg-(--track)" />
            </span>
            <time className="discussion-thread__rail-slot--bottom">
              <span className="block h-3 w-12 rounded bg-(--track)" />
            </time>
          </div>
        </div>
      </div>
    </article>
  );
}

export function DiscussionWorkspaceSkeletonList({
  mode,
  variant,
  label = "Loading discussions",
  withinFeed = false,
}: DiscussionWorkspaceSkeletonListProps) {
  const isLoading = mode === "loading";
  const count = isLoading
    ? DISCUSSION_LOADING_SKELETON_COUNT
    : DISCUSSION_PREVIEW_SKELETON_COUNT;

  return (
    <div
      className={withinFeed ? "grid gap-2.5" : "discussion-hub__thread-list"}
      role={isLoading ? "status" : undefined}
      aria-busy={isLoading ? true : undefined}
      aria-live={isLoading ? "polite" : undefined}
      aria-label={isLoading ? label : undefined}
      aria-hidden={isLoading ? undefined : true}
    >
      {isLoading && <span className="sr-only">{label}</span>}
      {Array.from({ length: count }, (_, index) => (
        <DiscussionWorkspaceSkeleton
          key={`${mode}-${index}`}
          mode={mode}
          variant={variant}
        />
      ))}
    </div>
  );
}
