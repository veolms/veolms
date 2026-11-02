import { CreatorHeartButton } from "../learning/CreatorHeartButton";
import type { useThreadStaffActions } from "../learning/useThreadStaffActions";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";

/**
 * The creator's heart under a post on the Discussions page and in its side
 * panel: a button for staff, the badge for everyone once it is given. Pin
 * and "Add to home page" are in the post's menu.
 */
export function DiscussionStaffActions({
  card,
  staff,
}: {
  card: DiscussionWorkspaceCard;
  staff: ReturnType<typeof useThreadStaffActions>;
}) {
  if (card.itemType !== "thread" || card.kind === "note") return null;
  return (
    <CreatorHeartButton
      heart={card.workspaceItem.creatorHeart}
      canGive={staff.canMark}
      onToggle={staff.setHeart}
      size="sm"
    />
  );
}
