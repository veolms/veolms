import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  desiredStateCoordinator,
  learningInteractionKeys,
  learningInteractionsService,
  optimisticallyUpdateDiscussionsWorkspaceMembership,
  restoreDiscussionsWorkspaceCacheSnapshot,
} from "../services/learning-interactions";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";

interface UseDiscussionWorkspaceCardActionsOptions {
  card: DiscussionWorkspaceCard;
  destination: string | null;
  setNotice?: (message: string) => void;
}

export function useDiscussionWorkspaceCardActions({
  card,
  destination,
  setNotice,
}: UseDiscussionWorkspaceCardActionsOptions) {
  const queryClient = useQueryClient();
  const noteBookmarkRevision = useRef(0);
  const isNote = card.itemType === "note" || card.kind === "note";
  const isReply = card.itemType === "reply";
  const sourceId = isReply ? card.parentThreadId : card.id;
  const canUseSourceActions = Boolean(sourceId) && card.itemType !== "report";
  const canFollow = canUseSourceActions && !isNote;
  const bookmarkLabel = card.isBookmarked ? "Remove bookmark" : "Bookmark";
  const followLabel = card.isFollowing ? "Unfollow" : "Follow";
  const copyTextValue = [
    card.title?.trim(),
    card.plainText.trim() || card.excerpt.trim() || card.content.replace(/\s+/g, " ").trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  const bookmark = () => {
    if (!sourceId) return;

    const desiredBookmarked = !Boolean(card.isBookmarked);
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

  const follow = () => {
    if (!sourceId || !canFollow) return;

    const desiredFollowed = !Boolean(card.isFollowing);
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

  const copyLink = async () => {
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

  const copyText = async () => {
    if (!copyTextValue) return;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(copyTextValue);
      setNotice?.("Text copied");
    } catch {
      setNotice?.("Couldn't copy text");
    }
  };

  return {
    bookmark,
    bookmarkLabel,
    canBookmark: canUseSourceActions,
    canCopyLink: Boolean(destination),
    canCopyText: Boolean(copyTextValue),
    canFollow,
    copyLink,
    copyText,
    follow,
    followLabel,
    isNote,
  } as const;
}
