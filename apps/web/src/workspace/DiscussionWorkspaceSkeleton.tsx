import type { DiscussionTab } from "../routing/tabSessionState";

export type DiscussionWorkspaceSkeletonMode = "loading" | "preview";

export const DISCUSSION_LOADING_SKELETON_COUNT = 4;
export const DISCUSSION_PREVIEW_SKELETON_COUNT = 5;

export interface DiscussionWorkspaceSkeletonProps {
  mode: DiscussionWorkspaceSkeletonMode;
  variant: DiscussionTab;
}

export interface DiscussionWorkspaceSkeletonListProps extends DiscussionWorkspaceSkeletonProps {
  label?: string;
  previewCount?: number;
  withinFeed?: boolean;
}

/** A row of the Discussions list while it loads: the same shape, in bars. */
export function DiscussionWorkspaceSkeleton({
  mode,
}: DiscussionWorkspaceSkeletonProps) {
  const isLoading = mode === "loading";

  return (
    <article
      className={`relative flex gap-4 px-4 py-5 after:absolute after:inset-x-4 after:-bottom-px after:h-px after:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] after:content-[""] ${
        isLoading ? "animate-pulse motion-reduce:animate-none" : ""
      }`}
      aria-hidden="true"
      data-discussion-skeleton={mode}
    >
      <span className="size-10 shrink-0 rounded-full bg-(--track)" />
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1">
        <div className="flex items-center gap-2">
          <span className="h-3 w-28 rounded bg-(--track)" />
          <span className="h-3 w-16 rounded bg-(--track)" />
        </div>
        <span className="h-3.5 w-4/5 rounded bg-(--track)" />
        <span className="h-3 w-1/2 rounded bg-(--track)" />
        <div className="flex gap-2 pt-1">
          <span className="h-6 w-12 rounded-lg bg-(--track)" />
          <span className="h-6 w-16 rounded-lg bg-(--track)" />
        </div>
      </div>
    </article>
  );
}

export function DiscussionWorkspaceSkeletonList({
  mode,
  variant,
  label = "Loading discussions",
  previewCount,
  withinFeed = false,
}: DiscussionWorkspaceSkeletonListProps) {
  const isLoading = mode === "loading";
  const count = isLoading
    ? DISCUSSION_LOADING_SKELETON_COUNT
    : Math.min(
        DISCUSSION_PREVIEW_SKELETON_COUNT,
        Math.max(0, previewCount ?? DISCUSSION_PREVIEW_SKELETON_COUNT),
      );

  return (
    <div
      className={withinFeed ? "grid" : "discussion-hub__thread-list"}
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
