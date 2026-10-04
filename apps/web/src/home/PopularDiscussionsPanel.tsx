import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import type { PublicPopularDiscussion } from "@veolms/contracts";
import { HomeSectionHeader } from "./HomePresentation";
import { PublicDiscussionWorkspaceCard } from "../workspace/DiscussionsWorkspace";
import { DashboardDiscussionCardSkeletons } from "../workspace/DashboardDiscussionPreview";
import type { NavigateTo } from "../routing/navigation";

function PublicDiscussionState({
  title,
  message,
  onRetry,
  isRetrying = false,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}) {
  return (
    <div
      className="grid min-h-40 place-items-center px-3 py-6 text-center"
      role={onRetry ? "alert" : "status"}
    >
      <div>
        <strong className="block text-sm font-semibold text-(--text)">
          {title}
        </strong>
        <p className="mt-1 text-sm text-(--muted)">{message}</p>
        {onRetry ? (
          <button
            type="button"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-(--control-radius-action) border border-(--border) bg-(--surface-strong) px-3.5 text-sm font-semibold text-(--text) transition-colors hover:border-(--accent) hover:text-(--accent-ink,var(--accent)) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            onClick={onRetry}
            disabled={isRetrying}
            aria-busy={isRetrying}
          >
            {isRetrying ? "Retrying…" : "Try again"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function PopularDiscussionsPanel({
  isLoading,
  isError,
  isFetching,
  discussions,
  onRetry,
  className,
  action,
  onAction,
  accessibleCourseIds,
  onDiscussionNavigatePage,
  onDiscussionAccessDenied,
}: {
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  discussions: readonly PublicPopularDiscussion[];
  onRetry: () => void;
  className?: string;
  action?: string;
  onAction?: () => void;
  accessibleCourseIds?: ReadonlySet<string>;
  onDiscussionNavigatePage?: NavigateTo;
  onDiscussionAccessDenied?: () => void;
}) {
  return (
    <section
      aria-labelledby="popular-discussions-title"
      className={["dashboard-panel home-discussions-panel", className]
        .filter(Boolean)
        .join(" ")}
    >
      <HomeSectionHeader
        icon={ChatCircleDots}
        title="Popular Discussions"
        id="popular-discussions-title"
        action={action}
        onAction={onAction}
      />

      {isLoading ? (
        <DashboardDiscussionCardSkeletons />
      ) : isError ? (
        <PublicDiscussionState
          title="Discussions are unavailable"
          message="Courses are still available to explore."
          onRetry={onRetry}
          isRetrying={isFetching}
        />
      ) : discussions.length === 0 ? (
        <PublicDiscussionState
          title="No public discussions yet"
          message="Check back soon for learner conversations."
        />
      ) : (
        <div
          className="home-discussion-workspace-list creator-discussion-list discussion-hub"
          data-dashboard-discussion-preview
        >
          {discussions.slice(0, 20).map((discussion) => (
            <PublicDiscussionWorkspaceCard
              key={discussion.id}
              discussion={discussion}
              onNavigatePage={onDiscussionNavigatePage}
              allowPublicRead
              hasCourseAccess={
                accessibleCourseIds?.has(discussion.courseId) ?? false
              }
              onAccessDenied={onDiscussionAccessDenied}
            />
          ))}
        </div>
      )}
    </section>
  );
}
