import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { BellSimpleIcon as BellSimple } from "@phosphor-icons/react/BellSimple";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { LockOpenIcon as LockOpen } from "@phosphor-icons/react/LockOpen";
import { NotepadIcon as Notepad } from "@phosphor-icons/react/Notepad";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { ShareNetworkIcon as ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { CourseActionMenu, MenuAction, MenuDivider } from "../courses";
import type {
  DiscussionContent,
  DiscussionDraft,
  DiscussionEntryKind,
  DiscussionVisibility,
} from "./discussion-editor/types";
import {
  createDiscussionDraft,
  createEmptyDiscussionDraft,
  hasDiscussionDraftContent,
} from "./discussion-editor/types";
import { DiscussionMarkdown } from "./discussion-editor/DiscussionMarkdown";
import { DiscussionEditor } from "./discussion-editor/DiscussionEditor";
import { UndoDeleteButton } from "./useUndoableDeletion";
import { QueryClientContext } from "@tanstack/react-query";
import {
  useDeleteReply,
  useThreadReplies,
  useUpdateReply,
  desiredStateCoordinator,
} from "../services/learning-interactions";
import {
  optimisticDeletionCoordinator,
  useOptimisticDeletion,
} from "../services/learning-interactions/optimistic-deletion-coordinator";
import { optimisticEditCoordinator } from "../services/learning-interactions/optimistic-edit-coordinator";
import { adaptLearningReplyToCommentReply } from "./learning-replies.adapter";
import { useCurrentUser } from "../services/auth";
import {
  DiscussionAttachmentsList,
  type DiscussionAttachmentItem,
} from "./discussion-attachments";
import {
  getClientEntityId,
  getServerEntityId,
} from "../services/learning-interactions/interaction-entities";

export interface CommentReply {
  id: string | number;
  clientId?: string;
  serverId?: string;
  creationStatus?: "pending" | "confirmed";
  name: string;
  time: string;
  avatar: string;
  text: string;
  content?: DiscussionContent;
  likes: number;
  liked?: boolean;
  role?: "Instructor";
  isOwn?: boolean;
  isAccepted?: boolean;
  attachments?: DiscussionAttachmentItem[];
}

export interface Comment {
  id: string | number;
  clientId?: string;
  serverId?: string;
  creationStatus?: "pending" | "confirmed";
  name: string;
  time: string;
  avatar: string;
  text: string;
  content?: DiscussionContent;
  visibility?: DiscussionVisibility;
  likes: number;
  liked?: boolean;
  replies?: number;
  thread?: CommentReply[];
  repliesExpanded?: boolean;
  isQuestion?: boolean;
  entryKind?: DiscussionEntryKind;
  attachment?: {
    name: string;
    meta: string;
  };
  attachments?: DiscussionAttachmentItem[];
  isOwn?: boolean;
  createdAt?: string | number;
  timestampSeconds?: number | null;
  role?: "Student" | "Instructor" | "Admin";
  acceptedAnswerId?: string | null;
  isSolved?: boolean;
  isLocked?: boolean;
  isBookmarked?: boolean;
  isFollowing?: boolean;
}

interface CommentCardProps {
  comment: Comment;
  onLike: (id: string | number, liked: boolean) => void;
  onOpenThread?: (id: string | number, focusComposer?: boolean) => void;
  onEdit?: (comment: Comment) => void;
  onDelete?: (id: string | number) => void;
  onEditFailure?: () => void;
  onDeleteFailure?: (message: string) => void;
  onReport?: (
    target:
      | {
          targetType: "thread" | "reply";
          targetId: string | number;
          authorName?: string;
          serverId?: string;
        }
      | (string | number),
  ) => void;
  onToggleAcceptReply?: (
    threadId: string | number,
    replyId: string | number,
    accepted: boolean,
    serverReplyId?: string,
  ) => Promise<boolean> | void;
  onToggleLockThread?: (
    threadId: string | number,
    isLocked: boolean,
  ) => Promise<boolean> | void;
  onToggleBookmark?: (
    id: string | number,
    bookmarked: boolean,
  ) => Promise<boolean> | void;
  onToggleFollow?: (
    id: string | number,
    following: boolean,
  ) => Promise<boolean> | void;
  isBackendMode?: boolean;
  currentUserId?: string;
  userRole?: string;
  courseId?: string;
}

export function CommentCard({
  comment,
  onLike,
  onOpenThread,
  onEdit = () => undefined,
  onDelete = () => undefined,
  onEditFailure = () => undefined,
  onDeleteFailure = () => undefined,
  onReport = () => undefined,
  onToggleAcceptReply,
  onToggleLockThread,
  onToggleBookmark,
  onToggleFollow,
  isBackendMode = false,
  currentUserId,
  userRole,
  courseId,
}: CommentCardProps) {
  const queryClient = useContext(QueryClientContext);
  const [localLiked, setLocalLiked] = useState(comment.liked ?? false);
  const isCommentLiked = isBackendMode ? Boolean(comment.liked) : localLiked;
  const [repliesOpen, setRepliesOpen] = useState(
    comment.repliesExpanded ?? false,
  );
  const [replyComposerOpen, setReplyComposerOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState<DiscussionDraft>(
    createEmptyDiscussionDraft,
  );
  const [localReplies, setLocalReplies] = useState<CommentReply[]>(
    comment.thread ?? [],
  );
  const entryKind =
    comment.entryKind ?? (comment.isQuestion ? "question" : "comment");
  const isNote = entryKind === "note";
  const showEngagement = !isNote || comment.visibility === "public";
  const entryLabel =
    entryKind === "question" ? "Q&A" : isNote ? "Note" : "Comment";

  const clientId = getClientEntityId(comment);
  const serverId = getServerEntityId(comment);
  const deletion = useOptimisticDeletion(
    isNote ? "note" : "thread",
    clientId,
    serverId,
  );
  const isEditing = optimisticEditCoordinator.isEditing(
    isNote ? "note" : "thread",
    clientId,
  );
  const isBackendEntity = Boolean(isBackendMode && serverId);
  const threadId = serverId;
  const { data: authUser } = useCurrentUser();
  const effectiveUserId = currentUserId ?? authUser?.id;
  const isQuestion = entryKind === "question" || Boolean(comment.isQuestion);
  const isModerator = Boolean(
    userRole === "Instructor" ||
    userRole === "Admin" ||
    authUser?.roles?.some(
      (r) =>
        r.toLowerCase() === "admin" ||
        r.toLowerCase() === "instructor" ||
        r.toLowerCase() === "creator",
    ) ||
    (authUser as any)?.role === "Instructor" ||
    (authUser as any)?.role === "Admin",
  );
  const canLock = !isNote && (Boolean(comment.isOwn) || isModerator);
  const canAcceptAnswer = isQuestion && (Boolean(comment.isOwn) || isModerator);

  const {
    data: repliesData,
    isLoading: isRepliesLoading,
    isError: isRepliesError,
    refetch: refetchReplies,
  } = useThreadReplies(threadId, undefined, {
    enabled: isBackendEntity && repliesOpen && !isNote,
  });

  const updateReplyMutation = useUpdateReply(threadId);
  const deleteReplyMutation = useDeleteReply(threadId);

  const backendReplies = useMemo<CommentReply[]>(() => {
    if (!repliesData?.replies) return [];
    return repliesData.replies.map((reply) =>
      adaptLearningReplyToCommentReply(reply, effectiveUserId),
    );
  }, [repliesData?.replies, effectiveUserId]);

  const effectiveReplies = isBackendEntity ? backendReplies : localReplies;

  const unloadedReplyCount = Math.max(
    0,
    (comment.replies ?? 0) - (comment.thread?.length ?? 0),
  );
  const backendCount =
    repliesData?.totalCount !== undefined
      ? repliesData.totalCount
      : repliesData?.replies?.length;
  const replyCount = isBackendEntity
    ? backendCount !== undefined
      ? backendCount
      : (comment.replies ?? 0)
    : unloadedReplyCount + localReplies.length;
  const hasReplies = !isNote && replyCount > 0;

  const toggleReplies = () => {
    if (!hasReplies) return;
    setRepliesOpen((open) => !open);
  };

  useEffect(() => {
    if (!isBackendMode) {
      setLocalReplies(comment.thread ?? []);
    }
  }, [isBackendMode, comment.thread]);

  const addReply = () => {
    const text = replyDraft.plainText.trim();
    if (!hasDiscussionDraftContent(replyDraft)) return;
    setLocalReplies((current) => [
      ...current,
      {
        id: Date.now(),
        name: "Ashi Singh",
        time: "Just now",
        avatar: "/assets/sofia-avatar-160.webp",
        text,
        content: replyDraft,
        likes: 0,
        isOwn: true,
      },
    ]);
    setReplyDraft(createEmptyDiscussionDraft());
    setReplyComposerOpen(false);
    setRepliesOpen(true);
  };

  const updateReply = (id: string | number, draft: DiscussionDraft) => {
    const text = draft.plainText.trim();
    setLocalReplies((current) =>
      current.map((reply) =>
        reply.id === id
          ? { ...reply, text, content: draft, time: "Just now (edited)" }
          : reply,
      ),
    );
  };

  const handleEditReply = async (
    replyId: string | number,
    draft: DiscussionDraft,
  ): Promise<boolean> => {
    if (isBackendEntity) {
      const reply = effectiveReplies.find(
        (candidate) => getClientEntityId(candidate) === String(replyId),
      );
      const serverReplyId = reply ? getServerEntityId(reply) : undefined;
      if (!reply || !serverReplyId) return false;
      try {
        const request = updateReplyMutation.mutateAsync({
          replyId: serverReplyId,
          payload: {
            content: draft.markdown || draft.plainText.trim(),
          },
          __optimistic: {
            clientId: getClientEntityId(reply),
            serverId: serverReplyId,
            baseline: {
              content: reply.content?.markdown ?? reply.text,
              plainText: reply.content?.plainText ?? reply.text,
            },
            optimistic: {
              content: draft.markdown || draft.plainText.trim(),
              plainText: draft.plainText,
            },
          },
        });
        void request.catch(() => onEditFailure());
        return true;
      } catch {
        return false;
      }
    } else if (isBackendMode) {
      return false;
    } else {
      updateReply(replyId, draft);
      return true;
    }
  };

  const handleDeleteReply = async (
    replyId: string | number,
  ): Promise<boolean> => {
    if (isBackendEntity) {
      const reply = effectiveReplies.find(
        (candidate) => getClientEntityId(candidate) === String(replyId),
      );
      const serverReplyId = reply ? getServerEntityId(reply) : undefined;
      const replyClientId = reply ? getClientEntityId(reply) : undefined;
      if (
        !serverReplyId ||
        !replyClientId ||
        optimisticEditCoordinator.isEditing("reply", replyClientId)
      ) {
        return false;
      }
      return Boolean(
        optimisticDeletionCoordinator.begin({
          kind: "reply",
          clientId: replyClientId,
          serverId: serverReplyId,
          parentClientId: clientId,
          parentServerId: serverId,
          parentRepliesCount: replyCount,
          queryClient,
          commit: () => deleteReplyMutation.mutateAsync(serverReplyId),
          onFailure: () =>
            onDeleteFailure("Couldn't delete this reply. Please try again."),
        }),
      );
    } else if (isBackendMode) {
      return false;
    } else {
      setLocalReplies((current) =>
        current.filter((item) => item.id !== replyId),
      );
      return true;
    }
  };

  const handleLikeReply = (replyId: string | number) => {
    if (isBackendEntity) {
      const reply = effectiveReplies.find(
        (r) => getClientEntityId(r) === String(replyId),
      );
      if (!reply) return;
      const currentLiked = Boolean(reply?.liked);
      const nextLiked = !currentLiked;
      desiredStateCoordinator.setLiked({
        targetType: "reply",
        targetId: String(replyId),
        serverId: getServerEntityId(reply),
        threadId: threadId!,
        desiredLiked: nextLiked,
        currentBaseline: currentLiked,
        lessonContext: courseId ? { courseId, lessonId: "" } : undefined,
        queryClient,
        pendingTarget: !getServerEntityId(reply),
      });
    } else if (isBackendMode) {
      return;
    } else {
      setLocalReplies((current) =>
        current.map((r) => {
          if (r.id !== replyId) return r;
          const nextLiked = !Boolean(r.liked);
          return {
            ...r,
            liked: nextLiked,
            likes: Math.max(0, r.likes + (nextLiked ? 1 : -1)),
          };
        }),
      );
    }
  };

  if (deletion.phase === "deleting" || deletion.phase === "deleted") {
    return null;
  }

  return (
    <article
      id={`discussion-entry-${clientId}`}
      data-discussion-entry={entryKind}
      data-deletion-pending={deletion.hidden || undefined}
      className={`relative -mx-3 px-3 py-3.5 sm:-mx-4 sm:px-4 sm:py-4 ${hasReplies ? "cursor-pointer transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] active:bg-[color-mix(in_srgb,var(--text)_7%,transparent)]" : ""} ${deletion.hidden ? "min-h-19" : ""}`}
      onClick={(event) => {
        if (!hasReplies) return;
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest(
            "button,a,input,textarea,select,[contenteditable=true],[role=menu],[role=menuitem],[data-discussion-atomic-editor]",
          )
        ) {
          return;
        }
        event.stopPropagation();
        toggleReplies();
      }}
    >
      <div
        inert={deletion.hidden ? true : undefined}
        className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${deletion.hidden ? "pointer-events-none -translate-y-1 grid-rows-[0fr] opacity-0" : "translate-y-0 grid-rows-[1fr] opacity-100"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="relative flex gap-3 sm:gap-3.5">
            <img
              src={comment.avatar}
              alt=""
              className="relative z-10 size-10 shrink-0 rounded-full object-cover sm:size-11"
            />

            <div className="min-w-0 flex-1">
              <div
                data-comment-meta
                className="relative flex items-start gap-2 pr-9"
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <h2 className="text-sm font-semibold text-(--text) sm:text-[15px]">
                    {comment.name}
                  </h2>
                  {comment.role === "Instructor" && (
                    <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                      Instructor
                    </span>
                  )}
                  {comment.visibility && comment.visibility !== "public" && (
                    <span className="rounded-lg bg-(--hover) px-2 py-1 text-[11px] font-medium capitalize text-(--muted)">
                      {comment.visibility}
                    </span>
                  )}
                  <span
                    data-comment-time-separator
                    aria-hidden="true"
                    className="text-xs text-(--muted) sm:text-sm"
                  >
                    ·
                  </span>
                  <span className="text-xs text-(--muted) sm:text-sm">
                    {comment.time}
                  </span>
                  <span
                    role="img"
                    aria-label={entryLabel}
                    title={entryLabel}
                    data-entry-kind-icon={entryKind}
                    className={`inline-flex size-5 items-center justify-center ${
                      entryKind === "note"
                        ? "text-amber-700 [[data-theme=dark]_&]:text-amber-300"
                        : entryKind === "question"
                          ? "text-violet-700 [[data-theme=dark]_&]:text-violet-400"
                          : "text-sky-700 [[data-theme=dark]_&]:text-sky-400"
                    }`}
                  >
                    {entryKind === "note" ? (
                      <Notepad size={17} weight="bold" aria-hidden="true" />
                    ) : entryKind === "question" ? (
                      <Question size={17} weight="bold" aria-hidden="true" />
                    ) : (
                      <ChatCenteredDots
                        data-comment-entry-icon
                        size={17}
                        weight="bold"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  {isQuestion && Boolean(comment.isSolved) && (
                    <span
                      data-testid="qa-solved-badge"
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                    >
                      <CheckCircle size={13} weight="bold" aria-hidden="true" />
                      <span>Solved</span>
                    </span>
                  )}
                  {Boolean(comment.isLocked) && (
                    <span
                      data-testid="thread-locked-badge"
                      className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
                      title="Locked"
                    >
                      <Lock size={12} weight="bold" aria-hidden="true" />
                      <span>Locked</span>
                    </span>
                  )}
                  {!isNote && Boolean(comment.isBookmarked) && (
                    <span
                      data-testid="thread-bookmarked-badge"
                      className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--text)_6%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-(--text-secondary)"
                      title="Bookmarked"
                    >
                      <BookmarkSimple
                        size={12}
                        weight="bold"
                        aria-hidden="true"
                      />
                      <span>Bookmarked</span>
                    </span>
                  )}
                  {!isNote && Boolean(comment.isFollowing) && (
                    <span
                      data-testid="thread-following-badge"
                      className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--text)_6%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-(--text-secondary)"
                      title="Following"
                    >
                      <BellSimple size={12} weight="bold" aria-hidden="true" />
                      <span>Following</span>
                    </span>
                  )}
                </div>
                <CommentActionMenu
                  name={comment.name}
                  kind={entryKind}
                  isOwn={Boolean(comment.isOwn)}
                  canEdit={!isBackendMode || (Boolean(serverId) && !isEditing)}
                  canDelete={
                    !isBackendMode || (Boolean(serverId) && !isEditing)
                  }
                  onEdit={() => onEdit(comment)}
                  onShare={() =>
                    serverId
                      ? void shareDiscussionEntry(
                          serverId,
                          comment.name,
                          comment.text,
                          { isNote: comment.entryKind === "note" },
                        )
                      : undefined
                  }
                  onDelete={() => {
                    void onDelete(comment.id);
                  }}
                  onReport={() =>
                    onReport?.({
                      targetType: "thread",
                      targetId: comment.id,
                      authorName: comment.name,
                    })
                  }
                  canLock={canLock}
                  isLocked={Boolean(comment.isLocked)}
                  onToggleLock={() => {
                    if (onToggleLockThread) {
                      void onToggleLockThread(comment.id, !comment.isLocked);
                    }
                  }}
                  isBookmarked={Boolean(comment.isBookmarked)}
                  onToggleBookmark={
                    onToggleBookmark
                      ? () => {
                          void Promise.resolve(
                            onToggleBookmark(comment.id, !comment.isBookmarked),
                          ).catch(() => {});
                        }
                      : undefined
                  }
                  isFollowing={Boolean(comment.isFollowing)}
                  onToggleFollow={
                    onToggleFollow
                      ? () => {
                          void Promise.resolve(
                            onToggleFollow(comment.id, !comment.isFollowing),
                          ).catch(() => {});
                        }
                      : undefined
                  }
                  className="absolute -top-1 -right-1 z-20 shrink-0"
                />
              </div>

              <DiscussionMarkdown
                content={comment.content ?? createDiscussionDraft(comment.text)}
                label={`${entryLabel} by ${comment.name}`}
                className="mt-0.5 pr-9 sm:pr-10"
              />

              {comment.attachments && comment.attachments.length > 0 ? (
                <DiscussionAttachmentsList attachments={comment.attachments} />
              ) : comment.attachment && !isNote ? (
                <div className="mt-3 flex w-fit max-w-full items-center gap-3 rounded-xl bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-3.5 py-2.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)]">
                  <FileText
                    size={26}
                    weight="light"
                    className="shrink-0 text-(--text)"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-(--text)">
                      {comment.attachment.name}
                    </p>
                    <p className="mt-0.5 text-xs text-(--muted)">
                      {comment.attachment.meta}
                    </p>
                  </div>
                </div>
              ) : null}

              {showEngagement && (
                <div
                  data-comment-engagement
                  className="mt-2 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--muted) sm:text-sm"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!isBackendMode) {
                        setLocalLiked((current) => !current);
                      }
                      onLike(comment.id, !isCommentLiked);
                    }}
                    aria-pressed={isCommentLiked}
                    aria-label={isCommentLiked ? "Unlike" : "Like"}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${isCommentLiked ? "text-(--accent-ink,var(--accent))" : ""}`}
                  >
                    <ThumbsUp
                      size={19}
                      weight={isCommentLiked ? "fill" : "regular"}
                    />
                    <span>{comment.likes}</span>
                  </button>

                  {!isNote && replyCount > 0 && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleReplies();
                      }}
                      aria-expanded={repliesOpen}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-1.5 font-medium text-(--accent-ink,var(--accent)) transition-colors hover:text-(--accent) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
                    >
                      View {replyCount} {replyCount === 1 ? "reply" : "replies"}
                      <CaretDown
                        size={16}
                        className={`transition-transform duration-200 ${repliesOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  )}

                  {!isNote && comment.isLocked && (
                    <span
                      data-testid="inline-locked-indicator"
                      className="inline-flex min-h-9 items-center gap-1.5 px-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                      title="Discussion is locked"
                    >
                      <Lock size={14} weight="bold" aria-hidden="true" />
                      <span>Locked</span>
                    </span>
                  )}

                  {!isNote && (!comment.isLocked || onOpenThread) && (
                    <button
                      type="button"
                      aria-label={comment.isLocked ? "View thread" : "Reply"}
                      title={comment.isLocked ? "View thread" : "Reply"}
                      data-reply-action={!comment.isLocked ? "" : undefined}
                      data-discussion-thread-trigger={
                        onOpenThread ? "true" : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        if (onOpenThread)
                          onOpenThread(comment.id, !comment.isLocked);
                        else if (!comment.isLocked)
                          setReplyComposerOpen((open) => !open);
                      }}
                      aria-expanded={replyComposerOpen}
                      className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
                    >
                      <ArrowBendUpLeft
                        data-reply-icon
                        size={20}
                        weight="bold"
                        className="origin-center scale-x-[1.16]"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              )}

              {replyComposerOpen &&
                !onOpenThread &&
                !isNote &&
                !comment.isLocked && (
                  <div className="mt-3 flex max-w-2xl items-end gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Reply to {comment.name}</span>
                      <span className="block min-h-12 overflow-hidden rounded-lg border bg-(--surface) [border-color:color-mix(in_srgb,var(--text)_14%,transparent)] focus-within:[border-color:color-mix(in_srgb,var(--accent)_70%,transparent)]">
                        <DiscussionEditor
                          value={replyDraft}
                          documentId={`reply-new-${comment.id}`}
                          label={`Reply to ${comment.name}`}
                          placeholderText={`Reply to ${comment.name}…`}
                          className="min-h-12 max-h-40"
                          courseId={courseId}
                          mentionsEnabled={true}
                          onChange={setReplyDraft}
                        />
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={addReply}
                      disabled={!hasDiscussionDraftContent(replyDraft)}
                      className="h-10 rounded-lg bg-(--accent) px-3 text-xs font-semibold text-(--on-accent) transition-colors hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                    >
                      Reply
                    </button>
                  </div>
                )}
            </div>
          </div>

          {repliesOpen && !isNote && (
            <div
              className="mt-2.5 space-y-2.5"
              data-testid="inline-replies-container"
            >
              {isBackendEntity && isRepliesLoading ? (
                <div
                  className="py-4 text-center"
                  data-testid="learning-replies-loading"
                >
                  <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
                  <p className="text-xs font-medium text-(--muted)">
                    Loading replies…
                  </p>
                </div>
              ) : isBackendEntity && isRepliesError ? (
                <div
                  className="py-4 text-center"
                  data-testid="learning-replies-error"
                >
                  <p className="text-sm font-semibold text-(--text)">
                    Failed to load replies
                  </p>
                  <button
                    type="button"
                    onClick={() => refetchReplies()}
                    className="mt-2 inline-flex items-center rounded-lg bg-(--surface) px-2.5 py-1 text-xs font-semibold text-(--text) shadow-sm ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:bg-(--hover)"
                  >
                    Retry
                  </button>
                </div>
              ) : effectiveReplies.length > 0 ? (
                effectiveReplies.map((reply) => (
                  <ReplyCard
                    key={reply.clientId ?? reply.id}
                    reply={reply}
                    isBackendMode={isBackendMode}
                    isQuestion={isQuestion}
                    canAcceptAnswer={canAcceptAnswer}
                    onToggleAccept={(replyId, accepted) =>
                      onToggleAcceptReply?.(
                        comment.id,
                        replyId,
                        accepted,
                        getServerEntityId(reply),
                      )
                    }
                    onReply={() => {
                      if (onOpenThread) onOpenThread(comment.id, true);
                      else setReplyComposerOpen(true);
                    }}
                    onEdit={handleEditReply}
                    onDelete={handleDeleteReply}
                    onLike={handleLikeReply}
                    onReport={() =>
                      onReport?.({
                        targetType: "reply",
                        targetId: reply.id,
                        authorName: reply.name,
                        serverId: getServerEntityId(reply),
                      })
                    }
                    parentThreadId={comment.id}
                    courseId={courseId}
                  />
                ))
              ) : (
                <div
                  className="py-4 text-center text-xs text-(--muted)"
                  data-testid="learning-replies-empty"
                >
                  No replies yet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {deletion.pending && (
        <UndoDeleteButton
          name={comment.name}
          seconds={deletion.seconds}
          onUndo={deletion.undo}
          className="absolute top-5 right-0"
        />
      )}
    </article>
  );
}

interface ReplyCardProps {
  parentThreadId?: string | number;
  reply: CommentReply;
  isBackendMode?: boolean;
  isQuestion?: boolean;
  canAcceptAnswer?: boolean;
  onToggleAccept?: (
    replyId: string | number,
    accepted: boolean,
    serverReplyId?: string,
  ) => void;
  onReply: () => void;
  onEdit: (
    replyId: string | number,
    draft: DiscussionDraft,
  ) => Promise<boolean> | void;
  onDelete: (replyId: string | number) => Promise<boolean> | void;
  onLike: (replyId: string | number) => void;
  onReport: () => void;
  courseId?: string;
}

function ReplyCard({
  parentThreadId,
  reply,
  isBackendMode = false,
  isQuestion = false,
  canAcceptAnswer = false,
  onToggleAccept,
  onReply,
  onEdit,
  onDelete,
  onLike,
  onReport,
  courseId,
}: ReplyCardProps) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<DiscussionDraft>(
    reply.content ?? createDiscussionDraft(reply.text),
  );
  const [editError, setEditError] = useState("");
  const [localLiked, setLocalLiked] = useState(reply.liked ?? false);
  const isReplyLiked = isBackendMode ? Boolean(reply.liked) : localLiked;
  const replyLikesCount = isBackendMode
    ? reply.likes
    : reply.likes + (localLiked ? 1 : 0);
  const canAcceptReply =
    Boolean(getServerEntityId(reply)) && reply.creationStatus !== "pending";
  const replyClientId = getClientEntityId(reply);
  const replyServerId = getServerEntityId(reply);
  const deletion = useOptimisticDeletion("reply", replyClientId, replyServerId);
  const isEditing = optimisticEditCoordinator.isEditing("reply", replyClientId);

  const saveEdit = async () => {
    if (!hasDiscussionDraftContent(editDraft)) return;
    setEditError("");
    const result = await onEdit(reply.id, editDraft);
    if (result !== false) {
      setEditing(false);
    } else {
      setEditError("Failed to update reply. Please try again.");
    }
  };

  if (deletion.phase === "deleting" || deletion.phase === "deleted") {
    return null;
  }

  return (
    <article
      id={`discussion-entry-${reply.id}`}
      data-deletion-pending={deletion.hidden || undefined}
      className={`relative pl-8 sm:pl-14 ${deletion.hidden ? "min-h-9" : ""}`}
    >
      <div
        inert={deletion.hidden ? true : undefined}
        className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${deletion.hidden ? "pointer-events-none -translate-y-1 grid-rows-[0fr] opacity-0" : "translate-y-0 grid-rows-[1fr] opacity-100"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="relative flex gap-3">
            <img
              src={reply.avatar}
              alt=""
              className="relative z-10 size-9 shrink-0 rounded-full object-cover sm:size-10"
            />

            <div className="min-w-0 flex-1">
              <div
                data-reply-meta
                className="relative flex items-start gap-2 pr-9"
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-sm font-semibold text-(--text) sm:text-[15px]">
                    {reply.name}
                  </h3>
                  {reply.role === "Instructor" && (
                    <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                      Instructor
                    </span>
                  )}
                  {reply.isAccepted && (
                    <span
                      data-testid="accepted-answer-badge"
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      <CheckCircle size={13} weight="fill" />
                      Accepted Answer
                    </span>
                  )}
                  <span
                    data-reply-time-separator
                    aria-hidden="true"
                    className="text-xs text-(--muted) sm:text-sm"
                  >
                    ·
                  </span>
                  <span className="text-xs text-(--muted) sm:text-sm">
                    {reply.time}
                  </span>
                </div>
                <CommentActionMenu
                  name={reply.name}
                  kind="reply"
                  isOwn={Boolean(reply.isOwn)}
                  canEdit={!isBackendMode || Boolean(getServerEntityId(reply))}
                  canAcceptAnswer={
                    isQuestion && canAcceptAnswer && canAcceptReply
                  }
                  isAccepted={Boolean(reply.isAccepted)}
                  onToggleAccept={
                    isQuestion && canAcceptAnswer && onToggleAccept
                      ? () =>
                          onToggleAccept(
                            reply.id,
                            !reply.isAccepted,
                            getServerEntityId(reply),
                          )
                      : undefined
                  }
                  onEdit={() => {
                    setEditDraft(
                      reply.content ?? createDiscussionDraft(reply.text),
                    );
                    setEditing(true);
                  }}
                  onShare={() =>
                    void shareDiscussionEntry(
                      reply.id,
                      reply.name,
                      reply.text,
                      {
                        parentThreadId,
                      },
                    )
                  }
                  canDelete={
                    !isBackendMode || (Boolean(replyServerId) && !isEditing)
                  }
                  onDelete={() => {
                    void onDelete(reply.id);
                  }}
                  onReport={onReport}
                  className="absolute -top-1 -right-1 z-20 shrink-0"
                />
              </div>

              {editing ? (
                <div>
                  <InlineEditForm
                    documentId={`reply-edit-${reply.id}`}
                    label={`Edit reply by ${reply.name}`}
                    value={editDraft}
                    courseId={courseId}
                    mentionsEnabled={true}
                    onChange={setEditDraft}
                    onCancel={() => {
                      setEditDraft(
                        reply.content ?? createDiscussionDraft(reply.text),
                      );
                      setEditing(false);
                      setEditError("");
                    }}
                    onSave={saveEdit}
                  />
                  {editError && (
                    <p role="alert" className="mt-1 text-xs text-red-500">
                      {editError}
                    </p>
                  )}
                </div>
              ) : (
                <DiscussionMarkdown
                  content={reply.content ?? createDiscussionDraft(reply.text)}
                  label={`Reply by ${reply.name}`}
                  className="mt-0.5 pr-9 sm:pr-10"
                />
              )}

              {reply.attachments && reply.attachments.length > 0 && (
                <DiscussionAttachmentsList attachments={reply.attachments} />
              )}

              <div
                data-reply-engagement
                className="mt-1.5 flex min-h-9 items-center gap-4 text-xs text-(--muted) sm:text-sm"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!isBackendMode) {
                      setLocalLiked((current) => !current);
                    }
                    onLike(reply.id);
                  }}
                  aria-pressed={isReplyLiked}
                  aria-label={isReplyLiked ? "Unlike reply" : "Like reply"}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${isReplyLiked ? "text-(--accent-ink,var(--accent))" : ""}`}
                >
                  <ThumbsUp
                    size={18}
                    weight={isReplyLiked ? "fill" : "regular"}
                  />
                  <span>{replyLikesCount}</span>
                </button>
                {isQuestion && canAcceptAnswer && onToggleAccept && (
                  <button
                    type="button"
                    data-testid={`accept-reply-btn-${reply.id}`}
                    disabled={
                      reply.creationStatus === "pending" ||
                      !getServerEntityId(reply)
                    }
                    aria-label={
                      reply.isAccepted ? "Unaccept answer" : "Accept answer"
                    }
                    title={
                      reply.isAccepted ? "Unaccept answer" : "Accept answer"
                    }
                    onClick={() => {
                      if (
                        reply.creationStatus === "pending" ||
                        !getServerEntityId(reply)
                      ) {
                        return;
                      }
                      onToggleAccept(
                        reply.id,
                        !reply.isAccepted,
                        getServerEntityId(reply),
                      );
                    }}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-(--accent) ${
                      reply.isAccepted
                        ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                        : "text-(--muted) hover:bg-(--hover) hover:text-(--text)"
                    }`}
                  >
                    <CheckCircle
                      size={16}
                      weight={reply.isAccepted ? "fill" : "bold"}
                    />
                    <span>{reply.isAccepted ? "Accepted" : "Accept"}</span>
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Reply"
                  title="Reply"
                  data-reply-action
                  onClick={onReply}
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
                >
                  <ArrowBendUpLeft
                    data-reply-icon
                    size={20}
                    weight="bold"
                    className="origin-center scale-x-[1.16]"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {deletion.pending && (
        <UndoDeleteButton
          name={reply.name}
          seconds={deletion.seconds}
          onUndo={deletion.undo}
          className="absolute top-0 right-0"
        />
      )}
    </article>
  );
}

interface InlineEditFormProps {
  documentId: string;
  label: string;
  value: DiscussionDraft;
  courseId?: string;
  mentionsEnabled?: boolean;
  onChange: (value: DiscussionDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function InlineEditForm({
  documentId,
  label,
  value,
  courseId,
  mentionsEnabled = true,
  onChange,
  onCancel,
  onSave,
}: InlineEditFormProps) {
  return (
    <div
      className="mt-2 max-w-2xl"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <div className="min-h-18 overflow-hidden rounded-lg border bg-(--surface) [border-color:color-mix(in_srgb,var(--text)_18%,transparent)] focus-within:[border-color:color-mix(in_srgb,var(--accent)_70%,transparent)]">
        <DiscussionEditor
          value={value}
          documentId={documentId}
          label={label}
          placeholderText="Write a reply…"
          autoFocus
          className="min-h-18 max-h-56"
          courseId={courseId}
          mentionsEnabled={mentionsEnabled}
          onChange={onChange}
        />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg px-3 text-xs font-semibold text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!hasDiscussionDraftContent(value)}
          className="h-9 rounded-lg bg-(--accent) px-3 text-xs font-semibold text-(--on-accent) transition-colors hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        >
          Save
        </button>
      </div>
    </div>
  );
}

interface CommentActionMenuProps {
  name: string;
  kind: DiscussionEntryKind | "reply";
  isOwn: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canLock?: boolean;
  isLocked?: boolean;
  onToggleLock?: () => void;
  canAcceptAnswer?: boolean;
  isAccepted?: boolean;
  onToggleAccept?: () => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  isFollowing?: boolean;
  onToggleFollow?: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
  onReport: () => void;
  className: string;
}

export function CommentActionMenu({
  name,
  kind,
  isOwn,
  canEdit = true,
  canDelete = true,
  canLock = false,
  isLocked = false,
  onToggleLock,
  canAcceptAnswer = false,
  isAccepted = false,
  onToggleAccept,
  isBookmarked = false,
  onToggleBookmark,
  isFollowing = false,
  onToggleFollow,
  onEdit,
  onShare,
  onDelete,
  onReport,
  className,
}: CommentActionMenuProps) {
  const [open, setOpen] = useState(false);
  const isNote = kind === "note";
  const actionLabel = kind === "question" ? "Q&A" : isNote ? "note" : kind;
  const menuLabel =
    actionLabel === "Q&A"
      ? actionLabel
      : actionLabel[0]?.toUpperCase() + actionLabel.slice(1);
  const canBookmark =
    (kind === "comment" || kind === "question") && Boolean(onToggleBookmark);
  const canFollow =
    (kind === "comment" || kind === "question") && Boolean(onToggleFollow);

  return (
    <CourseActionMenu
      open={open}
      onOpenChange={setOpen}
      ariaLabel={`More actions for ${name}`}
      menuLabel={`${menuLabel} actions for ${name}`}
      className={className}
      triggerClassName="size-9"
    >
      {isNote ? (
        isOwn ? (
          <>
            {canEdit && (
              <MenuAction
                Icon={PencilSimple}
                label="Edit note"
                onClick={onEdit}
              />
            )}
            <MenuDivider />
            {canDelete && (
              <MenuAction
                Icon={Trash}
                label="Delete note"
                destructive
                onClick={onDelete}
              />
            )}
          </>
        ) : (
          <>
            <MenuAction
              Icon={ShareNetwork}
              label={`Share ${actionLabel}`}
              onClick={onShare}
            />
            <MenuDivider />
            <MenuAction
              Icon={Flag}
              label={`Report ${actionLabel}`}
              onClick={onReport}
            />
          </>
        )
      ) : isOwn ? (
        <>
          {canEdit && (
            <MenuAction
              Icon={PencilSimple}
              label={`Edit ${actionLabel}`}
              onClick={onEdit}
            />
          )}
          {canBookmark && onToggleBookmark && (
            <MenuAction
              Icon={BookmarkSimple}
              label={isBookmarked ? "Remove bookmark" : "Bookmark"}
              onClick={onToggleBookmark}
            />
          )}
          {canFollow && onToggleFollow && (
            <MenuAction
              Icon={BellSimple}
              label={isFollowing ? "Unfollow discussion" : "Follow discussion"}
              onClick={onToggleFollow}
            />
          )}
          <MenuAction
            Icon={ShareNetwork}
            label={`Share ${actionLabel}`}
            onClick={onShare}
          />
          {canLock && onToggleLock && (
            <MenuAction
              Icon={isLocked ? LockOpen : Lock}
              label={isLocked ? `Unlock ${actionLabel}` : `Lock ${actionLabel}`}
              onClick={onToggleLock}
            />
          )}
          {canAcceptAnswer && onToggleAccept && (
            <MenuAction
              Icon={CheckCircle}
              label={isAccepted ? "Unaccept answer" : "Accept as answer"}
              onClick={onToggleAccept}
            />
          )}
          <MenuDivider />
          {canDelete && (
            <MenuAction
              Icon={Trash}
              label={`Delete ${actionLabel}`}
              destructive
              onClick={onDelete}
            />
          )}
        </>
      ) : (
        <>
          {canBookmark && onToggleBookmark && (
            <MenuAction
              Icon={BookmarkSimple}
              label={isBookmarked ? "Remove bookmark" : "Bookmark"}
              onClick={onToggleBookmark}
            />
          )}
          {canFollow && onToggleFollow && (
            <MenuAction
              Icon={BellSimple}
              label={isFollowing ? "Unfollow discussion" : "Follow discussion"}
              onClick={onToggleFollow}
            />
          )}
          <MenuAction
            Icon={ShareNetwork}
            label={`Share ${actionLabel}`}
            onClick={onShare}
          />
          {canLock && onToggleLock && (
            <MenuAction
              Icon={isLocked ? LockOpen : Lock}
              label={isLocked ? `Unlock ${actionLabel}` : `Lock ${actionLabel}`}
              onClick={onToggleLock}
            />
          )}
          {canAcceptAnswer && onToggleAccept && (
            <MenuAction
              Icon={CheckCircle}
              label={isAccepted ? "Unaccept answer" : "Accept as answer"}
              onClick={onToggleAccept}
            />
          )}
          <MenuDivider />
          <MenuAction
            Icon={Flag}
            label={`Report ${actionLabel}`}
            onClick={onReport}
          />
        </>
      )}
    </CourseActionMenu>
  );
}

export async function shareDiscussionEntry(
  entryId: string | number,
  name: string,
  text: string,
  options?: { parentThreadId?: string | number; isNote?: boolean },
) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (options?.isNote) {
    url.hash = `discussion-entry-${entryId}`;
  } else if (options?.parentThreadId) {
    url.searchParams.set("thread", String(options.parentThreadId));
    url.hash = `discussion-entry-${entryId}`;
  } else {
    url.searchParams.set("thread", String(entryId));
    url.hash = "";
  }
  const shareText = text.trim();

  try {
    if (navigator.share) {
      await navigator.share({
        title: `${name}'s discussion entry`,
        text: shareText || undefined,
        url: url.toString(),
      });
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(
        [shareText, url.toString()].filter(Boolean).join("\n\n"),
      );
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
  }
}
