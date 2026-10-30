import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { useDashboardRecentDiscussions } from "../../services/learning-interactions";
import { adaptDiscussionWorkspaceItem } from "../../workspace/discussions-workspace.adapter";
import {
  DashboardDiscussionCardSkeletons,
  DashboardDiscussionRetryContent,
} from "../../workspace/DashboardDiscussionPreview";
import { DiscussionWorkspaceCard } from "../../workspace/DiscussionsWorkspace";
import { DashboardPanel } from "./DashboardPanel";
import type { NavigateProps } from "./dashboardTypes";

export function DiscussionsPanel({
  onNavigatePage,
  isManualRefresh,
}: NavigateProps & { isManualRefresh: boolean }) {
  const {
    data: discussionsResponse,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useDashboardRecentDiscussions();
  const hasDiscussionData = discussionsResponse !== undefined;
  const showInitialLoading =
    isManualRefresh || (isLoading && !hasDiscussionData);
  const showInitialError = isError && !hasDiscussionData;
  const discussionCards =
    discussionsResponse?.items.map((item) =>
      adaptDiscussionWorkspaceItem(item),
    ) ?? [];

  return (
    <DashboardPanel
      className="creator-discussions-panel"
      icon={ChatCircleDots}
      title="Recent Discussions"
      action="Open discussions"
      onAction={() => onNavigatePage?.("Discussions")}
    >
      <div
        className="creator-discussion-list discussion-hub"
        data-dashboard-discussion-preview
        aria-busy={showInitialLoading || isFetching}
      >
        {showInitialLoading ? (
          <DashboardDiscussionCardSkeletons />
        ) : showInitialError ? (
          <div className="creator-discussion-state" role="alert">
            <DashboardDiscussionRetryContent
              title="Couldn't load discussions"
              message="Something went wrong while loading recent discussions."
              isRetrying={isFetching}
              onRetry={() => void refetch()}
            />
          </div>
        ) : discussionCards.length === 0 ? (
          <div className="creator-discussion-state" role="status">
            <strong>No discussions yet</strong>
            <small>Learner questions and comments will appear here.</small>
          </div>
        ) : (
          discussionCards.map((item) => (
            <DiscussionWorkspaceCard
              key={`${item.itemType}:${item.id}`}
              card={item}
              onNavigatePage={onNavigatePage}
              variant="compact"
              expandable={false}
            />
          ))
        )}
      </div>
    </DashboardPanel>
  );
}
