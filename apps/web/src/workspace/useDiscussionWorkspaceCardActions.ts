import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "../services/auth";
import { useCapabilities } from "../services/authorization";
import { useThreadStaffActions } from "../learning/useThreadStaffActions";
import {
  desiredStateCoordinator,
  learningInteractionKeys,
  learningInteractionsService,
  optimisticallyUpdateDiscussionsWorkspaceMembership,
  refetchDiscussionsWorkspace,
  removeFromDiscussionsWorkspaceCache,
  restoreDiscussionsWorkspaceCacheSnapshot,
  updateDiscussionsWorkspaceItem,
} from "../services/learning-interactions";
import { copyTextToClipboard } from "../lib/clipboard";
import { markdownToPlainText } from "../learning/discussion-editor/types";
import {
  markDiscussionPostHidden,
  useDiscussionPostHidden,
} from "./discussionHiddenPosts";
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
  const canUseSourceActions = Boolean(sourceId);
  const canFollow = canUseSourceActions && !isNote;
  const bookmarkLabel = card.isBookmarked ? "Remove bookmark" : "Bookmark";
  const followLabel = card.isFollowing ? "Unfollow" : "Follow";
  const copyTextValue = card.content || card.plainText;
  // Authors may delete their own posts; moderators of every course
  // (discussion.moderate through an academy-wide role) anyone's.
  const { data: currentUser } = useCurrentUser();
  const moderatesEveryCourse = useCapabilities({
    enabled: Boolean(currentUser),
  }).canOnCourse("discussion.moderate", null);
  const staff = useThreadStaffActions({
    thread: {
      id:
        isNote || isReply || card.id.startsWith("client-")
          ? undefined
          : card.id,
      courseId: card.courseId,
      lessonId: card.lessonId,
      isPublic: card.visibility === "public",
      pinnedAt: card.workspaceItem.pinnedAt,
      creatorHeart: card.workspaceItem.creatorHeart,
    },
    canModerate: moderatesEveryCourse,
    onNotice: setNotice,
  });
  const canDelete =
    Boolean(card.id) &&
    !card.id.startsWith("client-") &&
    (Boolean(card.isOwn) || moderatesEveryCourse);
  const deleteNoun = isNote
    ? "note"
    : isReply
      ? "reply"
      : card.kind === "question" || card.kind === "qna"
        ? "Q&A"
        : "comment";
  // There is no undo on this page, so Delete asks to be pressed again.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(
        new URL(destination, window.location.origin).toString(),
      );
      setNotice?.("Link copied");
    } catch {
      setNotice?.("Couldn't copy link");
    }
  };

  // "Copy text" is readable text (no Markdown signs, a table as tab-separated
  // rows); "Copy Markdown" is the post as written.
  const copyText = async () => {
    await copyTextToClipboard(markdownToPlainText(copyTextValue), setNotice);
  };
  const copyMarkdown = async () => {
    await copyTextToClipboard(copyTextValue, setNotice);
  };

  const likeTargetType = isNote ? "note" : isReply ? "reply" : "thread";
  const canLike = Boolean(card.id) && !card.id.startsWith("client-");
  const like = () => {
    if (!canLike) return;
    const desiredLiked = !card.isLiked;
    const target = { itemType: likeTargetType, id: card.id } as const;
    const snapshot = updateDiscussionsWorkspaceItem(
      queryClient,
      target,
      (item) => ({
        ...item,
        isLiked: desiredLiked,
        likesCount: Math.max(0, item.likesCount + (desiredLiked ? 1 : -1)),
      }),
    );
    void learningInteractionsService
      .toggleLike({ targetType: likeTargetType, targetId: card.id })
      .then((response) => {
        if (response.liked !== desiredLiked) {
          restoreDiscussionsWorkspaceCacheSnapshot(queryClient, snapshot);
        }
        // The lesson's own lists show likes too; they fetch again when
        // next shown.
        void queryClient.invalidateQueries({
          queryKey: learningInteractionKeys.all,
          refetchType: "none",
        });
      })
      .catch(() => {
        restoreDiscussionsWorkspaceCacheSnapshot(queryClient, snapshot);
        setNotice?.("Couldn't update like");
      });
  };

  // As on the lesson page: authors edit their own posts, and anyone reports
  // somebody else's comment, Q&A or reply (notes are not reported).
  const isSaved = Boolean(card.id) && !card.id.startsWith("client-");
  const canEdit = isSaved && Boolean(card.isOwn);
  const canReport = isSaved && !card.isOwn && !isNote;

  // Moderators of every course can take a comment, Q&A or reply out of view
  // (it can be shown again from moderation, so this asks for no confirmation).
  const canHide = moderatesEveryCourse && !isNote && canDelete;
  const isHidden = useDiscussionPostHidden(card.id);
  const capitalNoun =
    deleteNoun === "Q&A"
      ? deleteNoun
      : deleteNoun[0]!.toUpperCase() + deleteNoun.slice(1);
  const hide = () => {
    if (!canHide) return;
    const itemType = isReply ? "reply" : "thread";
    const snapshot = removeFromDiscussionsWorkspaceCache(queryClient, {
      itemType,
      id: card.id,
    });
    const request =
      itemType === "reply"
        ? learningInteractionsService.hideReply(card.id)
        : learningInteractionsService.hideThread(card.id);
    void request
      .then(() => {
        markDiscussionPostHidden(card.id, true);
        setNotice?.(`${capitalNoun} hidden`);
        void queryClient.invalidateQueries({
          queryKey: learningInteractionKeys.all,
          refetchType: "none",
        });
      })
      .catch(() => {
        restoreDiscussionsWorkspaceCacheSnapshot(queryClient, snapshot);
        setNotice?.(`Couldn't hide ${deleteNoun}`);
      });
  };

  // Shows a post hidden in this visit again; it returns to the lists.
  const unhide = () => {
    if (!canHide || !isHidden) return;
    const request = isReply
      ? learningInteractionsService.unhideReply(card.id)
      : learningInteractionsService.unhideThread(card.id);
    void request
      .then(() => {
        markDiscussionPostHidden(card.id, false);
        setNotice?.(`${capitalNoun} shown again`);
        refetchDiscussionsWorkspace(queryClient);
        void queryClient.invalidateQueries({
          queryKey: learningInteractionKeys.all,
          refetchType: "none",
        });
      })
      .catch(() => {
        setNotice?.(`Couldn't show the ${deleteNoun} again`);
      });
  };

  const deleteItem = () => {
    if (!canDelete) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);

    const itemType = isNote ? "note" : isReply ? "reply" : "thread";
    const snapshot = removeFromDiscussionsWorkspaceCache(queryClient, {
      itemType,
      id: card.id,
    });
    const request =
      itemType === "note"
        ? learningInteractionsService.deleteNote(card.id)
        : itemType === "reply"
          ? learningInteractionsService.deleteReply(card.id)
          : learningInteractionsService.deleteThread(card.id);
    void request
      .then(() => {
        setNotice?.(
          `${deleteNoun === "Q&A" ? deleteNoun : deleteNoun[0]!.toUpperCase() + deleteNoun.slice(1)} deleted`,
        );
        // Lesson discussions, counts and the dashboard fetch again when next
        // shown; the feed here has already dropped the item.
        void queryClient.invalidateQueries({
          queryKey: learningInteractionKeys.all,
          refetchType: "none",
        });
      })
      .catch(() => {
        restoreDiscussionsWorkspaceCacheSnapshot(queryClient, snapshot);
        setNotice?.(`Couldn't delete ${deleteNoun}`);
      });
  };

  return {
    staff,
    bookmark,
    bookmarkLabel,
    canBookmark: canUseSourceActions,
    canCopyLink: Boolean(destination),
    canCopyText: Boolean(copyTextValue.trim()),
    canDelete,
    canEdit,
    canFollow,
    canHide,
    canLike,
    canReport,
    editLabel: `Edit ${deleteNoun}`,
    reportLabel: `Report ${deleteNoun}`,
    hide,
    unhide,
    isHidden,
    hideLabel: isHidden ? `Unhide ${deleteNoun}` : `Hide ${deleteNoun}`,
    like,
    confirmingDelete,
    copyLink,
    copyMarkdown,
    deleteItem,
    deleteLabel: confirmingDelete ? "Confirm delete" : `Delete ${deleteNoun}`,
    resetDelete: () => setConfirmingDelete(false),
    copyText,
    follow,
    followLabel,
    isNote,
  } as const;
}
