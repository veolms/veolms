import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";

export function DashboardDiscussionCardSkeletons() {
  return (
    <div
      className="creator-discussion-skeleton-list"
      role="status"
      aria-label="Loading recent discussions"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div
          className="creator-discussion-skeleton-card"
          key={`discussion-skeleton-${index}`}
          aria-hidden="true"
        >
          <span className="creator-discussion-skeleton-avatar" />
          <span className="creator-discussion-skeleton-body">
            <i className="creator-discussion-skeleton-author" />
            <i className="creator-discussion-skeleton-preview" />
            <i className="creator-discussion-skeleton-context" />
          </span>
          <span className="creator-discussion-skeleton-rail">
            <i className="creator-discussion-skeleton-badge" />
            <i className="creator-discussion-skeleton-meta" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function DashboardDiscussionRetryContent({
  title,
  message,
  isRetrying,
  onRetry,
}: {
  title: string;
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <span className="creator-dashboard-state-content">
      <strong>{title}</strong>
      <small>{message}</small>
      <button
        type="button"
        className="creator-dashboard-state-retry"
        onClick={onRetry}
        disabled={isRetrying}
        aria-busy={isRetrying}
      >
        <ArrowClockwise
          size={14}
          aria-hidden="true"
          className={
            isRetrying
              ? "creator-dashboard-state-retry-icon is-retrying"
              : "creator-dashboard-state-retry-icon"
          }
        />
        {isRetrying ? "Retrying…" : "Retry"}
      </button>
    </span>
  );
}
