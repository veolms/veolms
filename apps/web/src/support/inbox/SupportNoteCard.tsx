import { ArrowBendUpRightIcon as ArrowBendUpRight } from "@phosphor-icons/react/ArrowBendUpRight";
import { DotsThreeIcon as DotsThree } from "@phosphor-icons/react/DotsThree";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type { SupportMessage } from "@veolms/contracts/support";
import { useState, type KeyboardEvent } from "react";

import { TimeAgo } from "../../components/TimeAgo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { copyTextToClipboard } from "../../lib/clipboard";
import { useSupportNoteAction } from "../../services/support";
import { SupportMessageBody } from "../SupportConversation";
import { AssigneeAvatar } from "./supportQueueCatalog";

const barButton =
  "grid size-7 place-items-center rounded-md text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent) disabled:opacity-40";

/** The address that opens this ticket scrolled to the note. */
export function noteLink(ticketId: string, messageId: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("ticket", ticketId);
  url.searchParams.set("note", messageId);
  return url.toString();
}

/**
 * An internal note: amber, with a lock, for the team only. On hover (or
 * focus) its actions appear: edit, pin, copy link, and a menu with hand off
 * and delete. Edited in place; deleted after a confirmation inside it.
 */
export function SupportNoteCard({
  ticketId,
  note,
  canChange,
  canPin,
  highlighted,
  onHandOff,
}: {
  ticketId: string;
  note: SupportMessage;
  /** Its author or an admin: may edit and delete it. */
  canChange: boolean;
  /** Anyone who can manage support may pin it. */
  canPin: boolean;
  /** Opened from a link to this note. */
  highlighted: boolean;
  onHandOff: () => void;
}) {
  const action = useSupportNoteAction(ticketId);
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [draft, setDraft] = useState(note.content);
  const [copied, setCopied] = useState(false);

  const startEdit = () => {
    setDraft(note.content);
    setMode("edit");
  };
  const save = () => {
    const content = draft.trim();
    if (!content) return;
    if (content === note.content) {
      setMode("view");
      return;
    }
    action.mutate(
      { type: "edit", messageId: note.id, content },
      { onSuccess: () => setMode("view") },
    );
  };
  const togglePin = () =>
    action.mutate({ type: "pin", messageId: note.id, pinned: !note.pinned });
  const copyLink = async () => {
    if (await copyTextToClipboard(noteLink(ticketId, note.id))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };
  const onEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMode("view");
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  };
  // E edits and P pins while the note has the keyboard.
  const onCardKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (mode !== "view" || event.target !== event.currentTarget) return;
    if (event.key === "e" && canChange) {
      event.preventDefault();
      startEdit();
    } else if (event.key === "p" && canPin) {
      event.preventDefault();
      togglePin();
    }
  };

  const deleting = mode === "delete";
  return (
    <li
      id={`support-note-${note.id}`}
      tabIndex={-1}
      onKeyDown={onCardKeyDown}
      className={`group relative flex gap-3 rounded-2xl p-3.5 ring-1 ring-inset transition-shadow outline-none ${
        deleting
          ? "bg-rose-500/8 ring-rose-500/35"
          : "bg-amber-400/8 ring-amber-400/30"
      } ${highlighted ? "ring-2 ring-amber-400/70" : ""}`}
    >
      <AssigneeAvatar person={note.author} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-28 text-xs max-sm:pr-8">
          <span className="text-sm font-semibold text-(--text)">
            {note.author.name}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-amber-600 [:root[data-theme=dark]_&]:text-amber-300">
            <LockSimple size={12} weight="fill" aria-hidden="true" />
            Internal note
          </span>
          {note.pinned ? (
            <span className="inline-flex items-center gap-1 text-(--muted)">
              <PushPin size={12} weight="fill" aria-hidden="true" />
              Pinned
            </span>
          ) : null}
          <span className="text-(--muted)">
            <TimeAgo value={note.createdAt} />
            {note.editedAt ? " (edited)" : ""}
          </span>
        </div>

        {mode === "edit" ? (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onEditorKeyDown}
              aria-label="Edit note"
              rows={3}
              className="w-full resize-y rounded-lg bg-(--surface) px-3 py-2 text-sm text-(--text) ring-1 ring-amber-400/40 outline-none ring-inset focus:ring-amber-400/80"
            />
            <div className="flex items-center justify-end gap-2">
              {/* Keyboard hints, where there is a keyboard. */}
              <span className="mr-auto text-xs text-(--muted) pointer-coarse:invisible">
                Esc to cancel
              </span>
              <button
                type="button"
                onClick={() => setMode("view")}
                className="h-8 rounded-lg px-3 text-[0.8rem] font-semibold text-(--text-secondary) hover:bg-(--hover)"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!draft.trim() || action.isPending}
                className="h-8 rounded-lg bg-amber-400 px-3 text-[0.8rem] font-semibold whitespace-nowrap text-black hover:bg-amber-300 disabled:opacity-50"
              >
                {action.isPending ? "Saving…" : "Save changes"}
                <kbd className="ml-1.5 font-sans text-[0.68rem] opacity-70 pointer-coarse:hidden">
                  ⌘↵
                </kbd>
              </button>
            </div>
          </div>
        ) : (
          <div className={`mt-1 ${deleting ? "opacity-60" : ""}`}>
            <SupportMessageBody
              content={note.content}
              attachments={note.attachments}
              label={`Internal note from ${note.author.name}`}
            />
          </div>
        )}

        {deleting ? (
          <div
            role="alertdialog"
            aria-label="Delete this note?"
            className="mt-3 flex flex-wrap items-center justify-end gap-2 rounded-lg bg-rose-500/10 px-3 py-2.5"
          >
            <span className="w-full text-[0.8rem] text-(--text-secondary)">
              Delete this note? Only your team can see it; this can&apos;t be
              undone.
            </span>
            <button
              type="button"
              autoFocus
              onClick={() => setMode("view")}
              className="h-8 rounded-lg px-3 text-[0.8rem] font-semibold text-(--text-secondary) hover:bg-(--hover)"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={action.isPending}
              onClick={() =>
                action.mutate({ type: "delete", messageId: note.id })
              }
              className="h-8 rounded-lg bg-rose-500 px-3 text-[0.8rem] font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
            >
              {action.isPending ? "Deleting…" : "Delete note"}
            </button>
          </div>
        ) : null}

        {action.error ? (
          <p role="alert" className="m-0 mt-2 text-xs text-rose-500">
            {action.error.message}
          </p>
        ) : null}
      </div>

      {mode === "view" ? (
        // Shown on hover or focus; always on a touch screen, which has no
        // hover. A phone has room only for the menu, which holds them all.
        <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5 rounded-lg bg-(--surface) p-0.5 opacity-0 shadow-sm ring-1 ring-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 has-data-popup-open:opacity-100 pointer-coarse:opacity-100 max-sm:opacity-100">
          {canChange ? (
            <button
              type="button"
              onClick={startEdit}
              aria-label="Edit note"
              title="Edit (E)"
              className={`${barButton} max-sm:hidden`}
            >
              <PencilSimple size={15} aria-hidden="true" />
            </button>
          ) : null}
          {canPin ? (
            <button
              type="button"
              onClick={togglePin}
              disabled={action.isPending}
              aria-label={note.pinned ? "Unpin note" : "Pin to top"}
              aria-pressed={note.pinned}
              title={note.pinned ? "Unpin (P)" : "Pin to top (P)"}
              className={`${barButton} max-sm:hidden`}
            >
              <PushPin
                size={15}
                weight={note.pinned ? "fill" : "regular"}
                aria-hidden="true"
              />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void copyLink()}
            aria-label="Copy link"
            title={copied ? "Link copied" : "Copy link"}
            className={`${barButton} max-sm:hidden`}
          >
            <LinkSimple size={15} aria-hidden="true" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="More" className={barButton}>
              <DotsThree size={16} weight="bold" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-48">
              {canChange ? (
                <DropdownMenuItem onClick={startEdit}>
                  <PencilSimple size={15} aria-hidden="true" />
                  <span className="flex-1">Edit note</span>
                  <kbd className="font-sans text-[0.68rem] text-(--muted) pointer-coarse:hidden">
                    E
                  </kbd>
                </DropdownMenuItem>
              ) : null}
              {canPin ? (
                <DropdownMenuItem onClick={togglePin}>
                  <PushPin size={15} aria-hidden="true" />
                  <span className="flex-1">
                    {note.pinned ? "Unpin" : "Pin to top"}
                  </span>
                  <kbd className="font-sans text-[0.68rem] text-(--muted) pointer-coarse:hidden">
                    P
                  </kbd>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => void copyLink()}>
                <LinkSimple size={15} aria-hidden="true" />
                Copy link
              </DropdownMenuItem>
              {canPin ? (
                <DropdownMenuItem onClick={onHandOff}>
                  <ArrowBendUpRight size={15} aria-hidden="true" />
                  Hand off to…
                </DropdownMenuItem>
              ) : null}
              {canChange ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setMode("delete")}
                    className="text-rose-500 data-highlighted:text-rose-500"
                  >
                    <Trash size={15} aria-hidden="true" />
                    Delete note
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied" : ""}
      </span>
    </li>
  );
}
