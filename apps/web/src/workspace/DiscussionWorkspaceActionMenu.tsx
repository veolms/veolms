import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellSimpleIcon as BellSimple } from "@phosphor-icons/react/BellSimple";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { CourseActionMenu, MenuAction, MenuDivider } from "../courses";
import {
  desiredStateCoordinator,
  learningInteractionKeys,
  learningInteractionsService,
  optimisticallyUpdateDiscussionsWorkspaceMembership,
  restoreDiscussionsWorkspaceCacheSnapshot,
} from "../services/learning-interactions";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";

interface DiscussionWorkspaceActionMenuProps {
  card: DiscussionWorkspaceCard;
  destination: string | null;
  setNotice?: (message: string) => void;
}

export function DiscussionWorkspaceActionMenu({
  card,
  destination,
  setNotice,
}: DiscussionWorkspaceActionMenuProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const noteBookmarkRevision = useRef(0);
  const isNote = card.itemType === "note" || card.kind === "note";
  const isReply = card.itemType === "reply";
  const sourceId = isReply ? card.parentThreadId : card.id;
  const canUseSourceActions = Boolean(sourceId) && card.itemType !== "report";
  const canFollow = canUseSourceActions && !isNote;
  const desiredBookmarked = !Boolean(card.isBookmarked);
  const desiredFollowed = !Boolean(card.isFollowing);

  const handleBookmark = () => {
    if (!sourceId) return;

    const snapshot = optimisticallyUpdateDiscussionsWorkspaceMembership(
      queryClient,
      {
        sourceType: isNote ? "note" : "thread",
        sourceId,
        sourceItem: card.workspaceItem,
        bookmarked: desiredBookmarked,
      },
    );
    if (isNote) {
      const revision = ++noteBookmarkRevision.current;
      void learningInteractionsService
        .toggleNoteBookmark(sourceId)
        .then((response) => {
          if (revision !== noteBookmarkRevision.current) return;
          const bookmarked =
            typeof response.bookmarked === "boolean"
              ? response.bookmarked
              : desiredBookmarked;
          if (bookmarked !== desiredBookmarked) {
            restoreDiscussionsWorkspaceCacheSnapshot(queryClient, snapshot);
            optimisticallyUpdateDiscussionsWorkspaceMembership(queryClient, {
              sourceType: "note",
              sourceId,
              sourceItem: card.workspaceItem,
              bookmarked,
            });
          }
          setNotice?.(
            bookmarked ? "Added to bookmarks" : "Removed from bookmarks",
          );
          void queryClient.invalidateQueries({
            queryKey: learningInteractionKeys.notesRoot(),
          });
        })
        .catch(() => {
          if (revision !== noteBookmarkRevision.current) return;
          restoreDiscussionsWorkspaceCacheSnapshot(queryClient, snapshot);
          setNotice?.("Couldn't update bookmark");
        });
      return;
    }

    desiredStateCoordinator.setBookmarked({
      threadId: sourceId,
      desiredBookmarked,
      currentBaseline: Boolean(card.isBookmarked),
      lessonContext:
        card.courseId && card.lessonId
          ? { courseId: card.courseId, lessonId: card.lessonId }
          : undefined,
      queryClient,
      onSuccess: (bookmarked) => {
        setNotice?.(
          bookmarked ? "Added to bookmarks" : "Removed from bookmarks",
        );
      },
      onFailure: () => {
        restoreDiscussionsWorkspaceCacheSnapshot(queryClient, snapshot);
        setNotice?.("Couldn't update bookmark");
      },
    });
  };

  const handleFollow = () => {
    if (!sourceId || !canFollow) return;

    const snapshot = optimisticallyUpdateDiscussionsWorkspaceMembership(
      queryClient,
      {
        sourceType: "thread",
        sourceId,
        sourceItem: card.workspaceItem,
        following: desiredFollowed,
      },
    );
    desiredStateCoordinator.setFollowed({
      threadId: sourceId,
      desiredFollowed,
      currentBaseline: Boolean(card.isFollowing),
      lessonContext:
        card.courseId && card.lessonId
          ? { courseId: card.courseId, lessonId: card.lessonId }
          : undefined,
      queryClient,
      onSuccess: (followed) => {
        setNotice?.(
          followed ? "Following discussion" : "Unfollowed discussion",
        );
      },
      onFailure: () => {
        restoreDiscussionsWorkspaceCacheSnapshot(queryClient, snapshot);
        setNotice?.("Couldn't update follow");
      },
    });
  };

  const handleCopyLink = async () => {
    if (!destination || typeof window === "undefined") return;

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(
        new URL(destination, window.location.origin).toString(),
      );
      setNotice?.("Link copied");
    } catch {
      setNotice?.("Couldn't copy link");
    }
  };

  const sourceLabel = isNote ? "note" : "discussion";

  return (
    <CourseActionMenu
      open={open}
      onOpenChange={setOpen}
      dismissOnScroll
      ariaLabel={`More actions for ${sourceLabel}`}
      menuLabel={`${isNote ? "Note" : "Discussion"} actions`}
      className="relative z-20 ml-auto shrink-0"
      triggerClassName="size-9"
      triggerVisualClassName="size-7"
    >
      {canUseSourceActions && (
        <MenuAction
          Icon={BookmarkSimple}
          label={desiredBookmarked ? "Bookmark" : "Remove bookmark"}
          onClick={handleBookmark}
        />
      )}
      {canFollow && (
        <MenuAction
          Icon={BellSimple}
          label={desiredFollowed ? "Follow" : "Unfollow"}
          onClick={handleFollow}
        />
      )}
      {canUseSourceActions && destination && <MenuDivider />}
      {destination && (
        <MenuAction
          Icon={LinkSimple}
          label="Copy link"
          onClick={() => {
            void handleCopyLink();
          }}
        />
      )}
    </CourseActionMenu>
  );
}
