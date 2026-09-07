import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { NotepadIcon as Notepad } from "@phosphor-icons/react/Notepad";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { ShareNetworkIcon as ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import React, { useEffect, useRef, useState } from "react";
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

export interface CommentReply {
  id: number;
  name: string;
  time: string;
  avatar: string;
  text: string;
  content?: DiscussionContent;
  likes: number;
  role?: "Instructor";
  isOwn?: boolean;
}

export interface Comment {
  id: number;
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
  isOwn?: boolean;
}

interface CommentCardProps {
  comment: Comment;
  onLike: (id: number, liked: boolean) => void;
  onOpenThread?: (id: number, focusComposer?: boolean) => void;
  onEdit?: (comment: Comment) => void;
  onDelete?: (id: number) => void;
  onReport?: (id: number) => void;
}

export function CommentCard({
  comment,
  onLike,
  onOpenThread,
  onEdit = () => undefined,
  onDelete = () => undefined,
  onReport = () => undefined,
}: CommentCardProps) {
  const [liked, setLiked] = useState(Boolean(comment.liked));
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
  const deletion = useUndoableDeletion(() => onDelete(comment.id));
  const unloadedReplyCount = Math.max(
    0,
    (comment.replies ?? 0) - (comment.thread?.length ?? 0),
  );
  const replyCount = unloadedReplyCount + localReplies.length;
  const hasReplies = replyCount > 0;

  const toggleReplies = () => {
    if (!hasReplies) return;
    setRepliesOpen((open) => !open);
  };

  useEffect(() => {
    setLocalReplies(comment.thread ?? []);
  }, [comment.thread]);

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

  const updateReply = (id: number, draft: DiscussionDraft) => {
    const text = draft.plainText.trim();
    setLocalReplies((current) =>
      current.map((reply) =>
        reply.id === id
          ? { ...reply, text, content: draft, time: "Just now (edited)" }
          : reply,
      ),
    );
  };

  const entryKind =
    comment.entryKind ?? (comment.isQuestion ? "question" : "comment");
  const entryLabel =
    entryKind === "question"
      ? "Q&A"
      : entryKind === "note"
        ? "Note"
        : "Comment";

  return (
    <article
      id={`discussion-entry-${comment.id}`}
      data-discussion-entry={entryKind}
      data-deletion-pending={deletion.pending || undefined}
      className={`relative -mx-3 px-3 py-3.5 sm:-mx-4 sm:px-4 sm:py-4 ${hasReplies ? "cursor-pointer transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] active:bg-[color-mix(in_srgb,var(--text)_7%,transparent)]" : ""} ${deletion.pending ? "min-h-19" : ""}`}
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
        toggleReplies();
      }}
    >
      <div
        inert={deletion.pending ? true : undefined}
        className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${deletion.pending ? "pointer-events-none -translate-y-1 grid-rows-[0fr] opacity-0" : "translate-y-0 grid-rows-[1fr] opacity-100"}`}
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
                </div>
                <CommentActionMenu
                  name={comment.name}
                  kind={entryKind}
                  isOwn={Boolean(comment.isOwn)}
                  onEdit={() => onEdit(comment)}
                  onShare={() =>
                    void shareDiscussionEntry(
                      comment.id,
                      comment.name,
                      comment.text,
                    )
                  }
                  onDelete={deletion.begin}
                  onReport={() => onReport(comment.id)}
                  className="absolute -top-1 -right-1 z-20 shrink-0"
                />
              </div>

              <DiscussionMarkdown
                content={comment.content ?? createDiscussionDraft(comment.text)}
                label={`${entryLabel} by ${comment.name}`}
                className="mt-0.5 pr-9 sm:pr-10"
              />

              {comment.attachment && (
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
              )}

              <div
                data-comment-engagement
                className="mt-2 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--muted) sm:text-sm"
              >
                <button
                  type="button"
                  onClick={() => {
                    setLiked(!liked);
                    onLike(comment.id, !liked);
                  }}
                  aria-pressed={liked}
                  aria-label={liked ? "Unlike" : "Like"}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${liked ? "text-(--accent-ink,var(--accent))" : ""}`}
                >
                  <ThumbsUp size={19} weight={liked ? "fill" : "regular"} />
                  <span>{comment.likes}</span>
                </button>

                {replyCount > 0 && (
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

                <button
                  type="button"
                  aria-label="Reply"
                  title="Reply"
                  data-reply-action
                  data-discussion-thread-trigger={
                    onOpenThread ? "true" : undefined
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onOpenThread) onOpenThread(comment.id, true);
                    else setReplyComposerOpen((open) => !open);
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
              </div>

              {replyComposerOpen && !onOpenThread && (
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

          {repliesOpen && localReplies.length > 0 && (
            <div className="mt-2.5 space-y-2.5">
              {localReplies.map((reply) => (
                <ReplyCard
                  key={reply.id}
                  reply={reply}
                  onReply={() => {
                    if (onOpenThread) onOpenThread(comment.id, true);
                    else setReplyComposerOpen(true);
                  }}
                  onEdit={(text) => updateReply(reply.id, text)}
                  onDelete={() =>
                    setLocalReplies((current) =>
                      current.filter((item) => item.id !== reply.id),
                    )
                  }
                  onReport={() => onReport(reply.id)}
                />
              ))}
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
  reply: CommentReply;
  onReply: () => void;
  onEdit: (draft: DiscussionDraft) => void;
  onDelete: () => void;
  onReport: () => void;
}

function ReplyCard({
  reply,
  onReply,
  onEdit,
  onDelete,
  onReport,
}: ReplyCardProps) {
  const [liked, setLiked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<DiscussionDraft>(
    reply.content ?? createDiscussionDraft(reply.text),
  );
  const deletion = useUndoableDeletion(onDelete);

  const saveEdit = () => {
    if (!hasDiscussionDraftContent(editDraft)) return;
    onEdit(editDraft);
    setEditing(false);
  };

  return (
    <article
      id={`discussion-entry-${reply.id}`}
      data-deletion-pending={deletion.pending || undefined}
      className={`relative pl-8 sm:pl-14 ${deletion.pending ? "min-h-9" : ""}`}
    >
      <div
        inert={deletion.pending ? true : undefined}
        className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${deletion.pending ? "pointer-events-none -translate-y-1 grid-rows-[0fr] opacity-0" : "translate-y-0 grid-rows-[1fr] opacity-100"}`}
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
                  onEdit={() => {
                    setEditDraft(
                      reply.content ?? createDiscussionDraft(reply.text),
                    );
                    setEditing(true);
                  }}
                  onShare={() =>
                    void shareDiscussionEntry(reply.id, reply.name, reply.text)
                  }
                  onDelete={deletion.begin}
                  onReport={onReport}
                  className="absolute -top-1 -right-1 z-20 shrink-0"
                />
              </div>

              {editing ? (
                <InlineEditForm
                  documentId={`reply-edit-${reply.id}`}
                  label={`Edit reply by ${reply.name}`}
                  value={editDraft}
                  onChange={setEditDraft}
                  onCancel={() => {
                    setEditDraft(
                      reply.content ?? createDiscussionDraft(reply.text),
                    );
                    setEditing(false);
                  }}
                  onSave={saveEdit}
                />
              ) : (
                <DiscussionMarkdown
                  content={reply.content ?? createDiscussionDraft(reply.text)}
                  label={`Reply by ${reply.name}`}
                  className="mt-0.5 pr-9 sm:pr-10"
                />
              )}

              <div
                data-reply-engagement
                className="mt-1.5 flex min-h-9 items-center gap-4 text-xs text-(--muted) sm:text-sm"
              >
                <button
                  type="button"
                  onClick={() => setLiked((current) => !current)}
                  aria-pressed={liked}
                  aria-label={liked ? "Unlike reply" : "Like reply"}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${liked ? "text-(--accent-ink,var(--accent))" : ""}`}
                >
                  <ThumbsUp size={18} weight={liked ? "fill" : "regular"} />
                  <span>{reply.likes + (liked ? 1 : 0)}</span>
                </button>
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
  onChange: (value: DiscussionDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function InlineEditForm({
  documentId,
  label,
  value,
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
  onEdit,
  onShare,
  onDelete,
  onReport,
  className,
}: CommentActionMenuProps) {
  const [open, setOpen] = useState(false);
  const actionLabel =
    kind === "question" ? "Q&A" : kind === "note" ? "note" : kind;
  const menuLabel =
    actionLabel === "Q&A"
      ? actionLabel
      : actionLabel[0]?.toUpperCase() + actionLabel.slice(1);

  return (
    <CourseActionMenu
      open={open}
      onOpenChange={setOpen}
      ariaLabel={`More actions for ${name}`}
      menuLabel={`${menuLabel} actions for ${name}`}
      className={className}
      triggerClassName="size-9"
    >
      {isOwn ? (
        <>
          <MenuAction
            Icon={PencilSimple}
            label={`Edit ${actionLabel}`}
            onClick={onEdit}
          />
          <MenuAction
            Icon={ShareNetwork}
            label={`Share ${actionLabel}`}
            onClick={onShare}
          />
          <MenuDivider />
          <MenuAction
            Icon={Trash}
            label={`Delete ${actionLabel}`}
            destructive
            onClick={onDelete}
          />
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
      )}
    </CourseActionMenu>
  );
}

const UNDO_DELETE_TIMEOUT_MS = 10_000;

function useUndoableDeletion(onCommit: () => void) {
  const commitRef = useRef(onCommit);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(10);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    if (deadline === null) return;

    const updateSeconds = () => {
      setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    updateSeconds();
    const interval = window.setInterval(updateSeconds, 250);
    const timeout = window.setTimeout(
      () => {
        setDeadline(null);
        commitRef.current();
      },
      Math.max(0, deadline - Date.now()),
    );

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [deadline]);

  return {
    pending: deadline !== null,
    seconds,
    begin: () => {
      setSeconds(10);
      setDeadline(Date.now() + UNDO_DELETE_TIMEOUT_MS);
    },
    undo: () => setDeadline(null),
  };
}

interface UndoDeleteButtonProps {
  name: string;
  seconds: number;
  onUndo: () => void;
  className: string;
}

function UndoDeleteButton({
  name,
  seconds,
  onUndo,
  className,
}: UndoDeleteButtonProps) {
  return (
    <button
      type="button"
      data-undo-delete
      aria-label={`Undo deletion of ${name}'s entry`}
      onClick={onUndo}
      className={`${className} z-30 inline-flex h-9 items-center gap-2 rounded-full bg-(--surface-elevated,var(--surface)) px-3 text-xs font-semibold text-(--text) shadow-[0_10px_30px_rgba(0,0,0,0.28),0_0_0_1px_color-mix(in_srgb,var(--accent)_38%,transparent)] transition-[background-color,box-shadow] hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)`}
    >
      <ArrowCounterClockwise
        size={16}
        weight="bold"
        className="text-(--accent-ink,var(--accent))"
        aria-hidden="true"
      />
      <span>Undo</span>
      <span className="min-w-5 text-right font-medium tabular-nums text-(--muted)">
        {seconds}s
      </span>
    </button>
  );
}

export async function shareDiscussionEntry(
  entryId: number,
  name: string,
  text: string,
) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.hash = `discussion-entry-${entryId}`;
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
