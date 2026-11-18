import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { PaperPlaneRightIcon as PaperPlaneRight } from "@phosphor-icons/react/PaperPlaneRight";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import type {
  SupportAttachment,
  SupportMessage,
  SupportTicketDetail,
} from "@veolms/contracts/support";
import { useState } from "react";

import { TimeAgo } from "../components/TimeAgo";
import { DiscussionAvatar } from "../learning/DiscussionAvatar";
import { DiscussionAttachmentsList } from "../learning/discussion-attachments/DiscussionAttachmentsList";
import type { DiscussionAttachmentItem } from "../learning/discussion-attachments/types";
import { DiscussionMarkdown } from "../learning/discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "../learning/discussion-editor/types";
import { supportFileUrl, usePostSupportMessage } from "../services/support";
import { SupportComposer } from "./SupportComposer";
import { useSupportDraft } from "./useSupportDraft";

export function toAttachmentItems(
  attachments: readonly SupportAttachment[],
): DiscussionAttachmentItem[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    fileName: attachment.fileName,
    fileUrl: supportFileUrl(attachment.url),
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    width: attachment.width,
    height: attachment.height,
    mediaType: attachment.mimeType.startsWith("image/")
      ? "image"
      : attachment.mimeType.startsWith("video/")
        ? "video"
        : "document",
  }));
}

/** A message's text and files. */
export function SupportMessageBody({
  content,
  attachments,
  label,
}: {
  content: string;
  attachments: readonly SupportAttachment[];
  label: string;
}) {
  return (
    <>
      <DiscussionMarkdown
        content={createDiscussionDraft(content)}
        preserveSoftBreaks
        label={label}
        className="text-[0.92rem] leading-7 text-(--text-secondary) [overflow-wrap:anywhere]"
      />
      {attachments.length > 0 ? (
        <DiscussionAttachmentsList
          attachments={toAttachmentItems(attachments)}
          className="mt-3"
        />
      ) : null}
    </>
  );
}

function MessageItem({
  message,
  viewerIsStaff,
}: {
  message: SupportMessage;
  viewerIsStaff: boolean;
}) {
  const fromTeam = message.authorRole === "staff";
  // Staff see who in the team wrote it; the learner sees a team member's
  // name with the team badge.
  const name =
    fromTeam && !viewerIsStaff
      ? message.author.name.split(" ")[0] || message.author.name
      : message.author.name;
  return (
    <li
      className={`flex gap-3 rounded-2xl p-4 ${
        message.internal
          ? "bg-amber-400/8 ring-1 ring-amber-400/25 ring-inset"
          : fromTeam
            ? "bg-(--accent)/7 ring-1 ring-(--accent)/15 ring-inset"
            : "bg-(--surface-strong)"
      }`}
    >
      <DiscussionAvatar
        src={message.author.avatarUrl}
        className="size-9"
        width={36}
        height={36}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-(--text)">{name}</span>
          {fromTeam ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-(--accent)/14 px-2 py-0.5 text-[0.68rem] font-bold tracking-wide text-(--accent) uppercase">
              <SealCheck size={12} weight="fill" aria-hidden="true" />
              ProCodrr team
            </span>
          ) : null}
          {message.internal ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/16 px-2 py-0.5 text-[0.68rem] font-bold tracking-wide text-amber-600 uppercase [:root[data-theme=dark]_&]:text-amber-300">
              <LockSimple size={12} weight="fill" aria-hidden="true" />
              Internal note
            </span>
          ) : null}
          <TimeAgo
            value={message.createdAt}
            className="text-xs text-(--muted)"
          />
        </div>
        <div className="mt-1.5">
          <SupportMessageBody
            content={message.content}
            attachments={message.attachments}
            label={`Message from ${message.author.name}`}
          />
        </div>
      </div>
    </li>
  );
}

export function SupportMessageList({
  ticket,
  emptyText,
}: {
  ticket: SupportTicketDetail;
  emptyText: string;
}) {
  if (ticket.messages.length === 0) {
    return <p className="m-0 text-sm text-(--muted)">{emptyText}</p>;
  }
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {ticket.messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          viewerIsStaff={ticket.viewerIsStaff}
        />
      ))}
    </ol>
  );
}

const sendButtonClasses =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-(--accent) px-4 text-sm font-semibold text-(--on-accent) transition-[background-color,opacity] hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";

const quietButtonClasses =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-(--surface) px-3.5 text-sm font-semibold text-(--text-secondary) ring-1 ring-[color-mix(in_srgb,var(--text)_10%,transparent)] ring-inset transition-colors hover:bg-(--hover) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-45";

/**
 * Where a reply is written: the learner answers the team; staff answer the
 * learner, or leave an internal note only staff see.
 */
export function SupportReplyBox({
  ticket,
  canReply = true,
}: {
  ticket: SupportTicketDetail;
  /** False for staff who may read reports but not answer them. */
  canReply?: boolean;
}) {
  const draft = useSupportDraft();
  const post = usePostSupportMessage(ticket.id, ticket.viewerIsStaff);
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const staff = ticket.viewerIsStaff;
  const note = staff && mode === "note";
  const canSend =
    draft.hasText && !draft.uploading && !draft.failed && !post.isPending;
  // Replying can close it in the same step: a report is resolved, feedback
  // is marked reviewed.
  const closingStatus =
    ticket.kind === "problem"
      ? ticket.status !== "resolved"
        ? ("resolved" as const)
        : null
      : ticket.status === "new"
        ? ("reviewed" as const)
        : null;
  const studentFirstName = ticket.requester.name.split(" ")[0] || "The student";

  const send = (close = false) => {
    if (!canSend) return;
    post.mutate(
      {
        content: draft.draft.markdown,
        attachmentIds: draft.attachmentIds,
        internal: note,
        ...(close && closingStatus ? { status: closingStatus } : {}),
      },
      { onSuccess: () => draft.reset() },
    );
  };

  if (staff && !canReply) {
    return (
      <p className="m-0 rounded-xl bg-(--surface-strong) px-4 py-3 text-sm text-(--muted)">
        You can read reports and feedback, but your role does not include
        answering them.
      </p>
    );
  }

  return (
    <section
      aria-label={staff ? "Answer" : "Reply"}
      className="flex flex-col gap-2.5"
    >
      {staff ? (
        <div
          role="tablist"
          aria-label="Kind of message"
          className="flex w-fit gap-1 rounded-lg bg-(--surface-strong) p-1"
        >
          {(
            [
              ["reply", "Reply to student"],
              ["note", "Internal note"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className="h-8 rounded-md px-3 text-[0.8rem] font-semibold text-(--text-secondary) transition-colors hover:text-(--text) aria-selected:bg-(--surface) aria-selected:text-(--text) aria-selected:shadow-sm"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {staff ? (
        <p className="m-0 text-xs text-(--muted)">
          {note
            ? "Only the team sees internal notes."
            : ticket.kind === "feedback" && !ticket.contactAllowed
              ? `${studentFirstName} asked not to be emailed; they'll see this in the app.`
              : `${studentFirstName} will get this by email.`}
        </p>
      ) : null}
      <SupportComposer
        state={draft}
        documentId={`support-reply-${ticket.id}-${mode}`}
        label={note ? "Internal note" : "Your reply"}
        placeholder={
          note
            ? "Only the team sees this note…"
            : staff
              ? `Reply to ${ticket.requester.name.split(" ")[0] || "the student"}…`
              : "Write a reply…"
        }
        minHeightClassName="min-h-24"
        className={note ? "ring-amber-400/40" : ""}
        actions={
          <>
            {staff && !note && closingStatus ? (
              <button
                type="button"
                className={quietButtonClasses}
                disabled={!canSend}
                onClick={() => send(true)}
              >
                <CheckCircle size={17} weight="bold" aria-hidden="true" />
                <span className="max-sm:sr-only">
                  {closingStatus === "resolved"
                    ? "Reply & resolve"
                    : "Reply & mark reviewed"}
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className={sendButtonClasses}
              disabled={!canSend}
              onClick={() => send(false)}
            >
              <PaperPlaneRight size={17} weight="fill" aria-hidden="true" />
              {post.isPending ? "Sending…" : note ? "Add note" : "Send"}
            </button>
          </>
        }
      />
      {post.error ? (
        <p role="alert" className="m-0 text-xs font-medium text-rose-500">
          {post.error.message}
        </p>
      ) : null}
      {!staff && ticket.status === "resolved" ? (
        <p className="m-0 text-xs text-(--muted)">
          This report is resolved. Reply if it&apos;s still happening and
          we&apos;ll open it again.
        </p>
      ) : null}
    </section>
  );
}
