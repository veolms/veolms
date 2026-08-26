import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type { JSONContent } from "@tiptap/core";
import React, { useState } from "react";
import { CourseActionMenu, MenuAction, MenuDivider } from "../courses";
import type {
  DiscussionEntryKind,
  DiscussionVisibility,
} from "./commentEditor";
import { RichTextContent } from "./RichTextContent";

export interface CommentReply {
  id: number;
  name: string;
  time: string;
  avatar: string;
  text: string;
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
  content?: JSONContent;
  visibility?: DiscussionVisibility;
  likes: number;
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
  onEdit?: (id: number, text: string) => void;
  onDelete?: (id: number) => void;
  onReport?: (id: number) => void;
}

export function CommentCard({
  comment,
  onLike,
  onEdit = () => undefined,
  onDelete = () => undefined,
  onReport = () => undefined,
}: CommentCardProps) {
  const [liked, setLiked] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(
    comment.repliesExpanded ?? false,
  );
  const [replyComposerOpen, setReplyComposerOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(comment.text);
  const [localReplies, setLocalReplies] = useState<CommentReply[]>(
    comment.thread ?? [],
  );
  const replyCount = Math.max(comment.replies ?? 0, localReplies.length);

  const addReply = () => {
    const text = replyDraft.trim();
    if (!text) return;
    setLocalReplies((current) => [
      ...current,
      {
        id: Date.now(),
        name: "Ashi Singh",
        time: "Just now",
        avatar: "/assets/sofia-avatar-160.webp",
        text,
        likes: 0,
        isOwn: true,
      },
    ]);
    setReplyDraft("");
    setReplyComposerOpen(false);
    setRepliesOpen(true);
  };

  const saveEdit = () => {
    const text = editDraft.trim();
    if (!text) return;
    onEdit(comment.id, text);
    setEditing(false);
  };

  const updateReply = (id: number, text: string) => {
    setLocalReplies((current) =>
      current.map((reply) =>
        reply.id === id ? { ...reply, text, time: "Just now (edited)" } : reply,
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
      data-discussion-entry={entryKind}
      className="relative border-b py-5 [border-color:color-mix(in_srgb,var(--text)_10%,transparent)] sm:py-5"
    >
      <div className="relative flex gap-3 sm:gap-3.5">
        <img
          src={comment.avatar}
          alt=""
          className="relative z-10 size-10 shrink-0 rounded-full object-cover sm:size-11"
        />

        <div className="min-w-0 flex-1">
          <div className="flex min-h-6 flex-wrap items-center gap-2 pr-2">
            <h2 className="text-[15px] font-semibold text-(--text) sm:text-base">
              {comment.name}
            </h2>
            <span className="rounded-lg bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-(--accent-ink,var(--accent)) sm:text-xs">
              {entryLabel}
            </span>
            {comment.visibility && comment.visibility !== "public" && (
              <span className="rounded-lg bg-(--hover) px-2 py-1 text-[11px] font-medium capitalize text-(--muted)">
                {comment.visibility}
              </span>
            )}
          </div>

          {editing ? (
            <InlineEditForm
              label={`Edit comment by ${comment.name}`}
              value={editDraft}
              onChange={setEditDraft}
              onCancel={() => {
                setEditDraft(comment.text);
                setEditing(false);
              }}
              onSave={saveEdit}
            />
          ) : comment.content ? (
            <RichTextContent
              content={comment.content}
              fallback={comment.text}
              label={`${entryLabel} by ${comment.name}`}
              className="mt-1.5 max-w-[72ch]"
            />
          ) : (
            <p className="mt-1.5 max-w-[72ch] text-sm leading-6 text-(--text-secondary) sm:text-[15px]">
              {comment.text}
            </p>
          )}

          {comment.attachment && !editing && (
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

          <div className="mt-2.5 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--muted) sm:text-sm">
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
                onClick={() => setRepliesOpen((open) => !open)}
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
              onClick={() => setReplyComposerOpen((open) => !open)}
              aria-expanded={replyComposerOpen}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
            >
              <ChatCenteredDots size={18} />
              <span>Reply</span>
            </button>

            <span className="ml-auto pl-2 text-xs text-(--muted) sm:text-sm">
              {comment.time}
            </span>
            <CommentActionMenu
              name={comment.name}
              kind={entryKind}
              isOwn={Boolean(comment.isOwn)}
              onEdit={() => {
                setEditDraft(comment.text);
                setEditing(true);
              }}
              onDelete={() => onDelete(comment.id)}
              onReport={() => onReport(comment.id)}
              className="relative z-20 shrink-0"
            />
          </div>

          {replyComposerOpen && (
            <div className="mt-3 flex max-w-2xl items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Reply to {comment.name}</span>
                <textarea
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      (event.ctrlKey || event.metaKey) &&
                      event.key === "Enter"
                    ) {
                      event.preventDefault();
                      addReply();
                    }
                  }}
                  placeholder={`Reply to ${comment.name}…`}
                  className="block min-h-12 w-full resize-y rounded-lg border bg-(--surface) px-3 py-2 text-sm leading-5 text-(--text) outline-none [border-color:color-mix(in_srgb,var(--text)_14%,transparent)] placeholder:text-(--muted) focus:[border-color:color-mix(in_srgb,var(--accent)_70%,transparent)]"
                />
              </label>
              <button
                type="button"
                onClick={addReply}
                disabled={!replyDraft.trim()}
                className="h-10 rounded-lg bg-(--accent) px-3 text-xs font-semibold text-(--on-accent) transition-colors hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              >
                Reply
              </button>
            </div>
          )}
        </div>
      </div>

      {repliesOpen && localReplies.length > 0 && (
        <div className="mt-4 space-y-4">
          {localReplies.map((reply) => (
            <ReplyCard
              key={reply.id}
              reply={reply}
              onReply={() => setReplyComposerOpen(true)}
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
    </article>
  );
}

interface ReplyCardProps {
  reply: CommentReply;
  onReply: () => void;
  onEdit: (text: string) => void;
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
  const [editDraft, setEditDraft] = useState(reply.text);

  const saveEdit = () => {
    const text = editDraft.trim();
    if (!text) return;
    onEdit(text);
    setEditing(false);
  };

  return (
    <article className="relative flex gap-3 pl-8 sm:pl-14">
      <img
        src={reply.avatar}
        alt=""
        className="relative z-10 size-9 shrink-0 rounded-full object-cover sm:size-10"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-2">
          <h3 className="text-sm font-semibold text-(--text) sm:text-[15px]">
            {reply.name}
          </h3>
        </div>

        {editing ? (
          <InlineEditForm
            label={`Edit reply by ${reply.name}`}
            value={editDraft}
            onChange={setEditDraft}
            onCancel={() => {
              setEditDraft(reply.text);
              setEditing(false);
            }}
            onSave={saveEdit}
          />
        ) : (
          <p className="mt-1 max-w-[72ch] text-sm leading-6 text-(--text-secondary) sm:text-[15px]">
            {reply.text}
          </p>
        )}

        <div className="mt-2 flex min-h-9 items-center gap-4 text-xs text-(--muted) sm:text-sm">
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
            onClick={onReply}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
          >
            <ChatCenteredDots size={17} />
            <span>Reply</span>
          </button>
          <span className="ml-auto pl-2 text-xs text-(--muted) sm:text-sm">
            {reply.time}
          </span>
          <CommentActionMenu
            name={reply.name}
            kind="reply"
            isOwn={Boolean(reply.isOwn)}
            onEdit={() => {
              setEditDraft(reply.text);
              setEditing(true);
            }}
            onDelete={onDelete}
            onReport={onReport}
            className="relative z-20 shrink-0"
          />
        </div>
      </div>
    </article>
  );
}

interface InlineEditFormProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

function InlineEditForm({
  label,
  value,
  onChange,
  onCancel,
  onSave,
}: InlineEditFormProps) {
  return (
    <div className="mt-2 max-w-2xl">
      <label>
        <span className="sr-only">{label}</span>
        <textarea
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              onSave();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          className="block min-h-18 w-full resize-y rounded-lg border bg-(--surface) px-3 py-2 text-sm leading-6 text-(--text) outline-none [border-color:color-mix(in_srgb,var(--text)_18%,transparent)] focus:[border-color:color-mix(in_srgb,var(--accent)_70%,transparent)]"
        />
      </label>
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
          disabled={!value.trim()}
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
  onDelete: () => void;
  onReport: () => void;
  className: string;
}

function CommentActionMenu({
  name,
  kind,
  isOwn,
  onEdit,
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
          <MenuDivider />
          <MenuAction
            Icon={Trash}
            label={`Delete ${actionLabel}`}
            destructive
            onClick={onDelete}
          />
        </>
      ) : (
        <MenuAction
          Icon={Flag}
          label={`Report ${actionLabel}`}
          onClick={onReport}
        />
      )}
    </CourseActionMenu>
  );
}
