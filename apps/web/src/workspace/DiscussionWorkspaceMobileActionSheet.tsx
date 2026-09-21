import { useCallback, useRef, useState } from "react";
import { BellSimpleIcon as BellSimple } from "@phosphor-icons/react/BellSimple";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { CopySimpleIcon as CopySimple } from "@phosphor-icons/react/CopySimple";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../components/ui/drawer";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";
import { useDiscussionWorkspaceCardActions } from "./useDiscussionWorkspaceCardActions";

function getPreviewTypeLabel(card: DiscussionWorkspaceCard): string {
  if (card.itemType === "note" || card.kind === "note") return "Note";

  const isQuestion = card.kind === "question" || card.kind === "qna";
  if (card.itemType === "reply") return isQuestion ? "Q&A reply" : "Comment reply";
  return isQuestion ? "Q&A" : "Comment";
}

function getPreviewText(card: DiscussionWorkspaceCard): string {
  return (
    card.title?.trim() ||
    card.plainText.trim() ||
    card.excerpt.trim() ||
    card.content.replace(/\s+/g, " ").trim() ||
    "Discussion"
  );
}

function DiscussionWorkspaceActionPreview({
  card,
}: {
  card: DiscussionWorkspaceCard;
}) {
  const authorLabel = card.isOwn ? "You" : card.author || card.authorUsername;
  const avatarFallback = (authorLabel || "?").slice(0, 1).toUpperCase();
  const previewText = getPreviewText(card);

  return (
    <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-(--border) bg-(--surface-strong) px-2.5 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-(--surface) text-xs font-semibold text-(--text-muted)">
        {card.avatar ? (
          <img
            src={card.avatar}
            alt=""
            className="size-full object-cover"
            aria-hidden="true"
          />
        ) : (
          avatarFallback
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-(--text-muted)">
          <span className="truncate font-medium text-(--text)">{authorLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{getPreviewTypeLabel(card)}</span>
          {card.activity && (
            <>
              <span aria-hidden="true">·</span>
              <time className="shrink-0">{card.activity}</time>
            </>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-(--text-muted)" title={previewText}>
          {previewText}
        </p>
      </div>
    </div>
  );
}

interface DiscussionWorkspaceMobileActionSheetProps {
  card: DiscussionWorkspaceCard;
  destination: string | null;
  onClose: () => void;
  setNotice?: (message: string) => void;
}

export function DiscussionWorkspaceMobileActionSheet({
  card,
  destination,
  onClose,
  setNotice,
}: DiscussionWorkspaceMobileActionSheetProps) {
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  const actions = useDiscussionWorkspaceCardActions({
    card,
    destination,
    setNotice,
  });
  const sourceLabel = actions.isNote ? "note" : "discussion";
  const title = `Actions for ${card.title?.trim() || sourceLabel}`;
  const closeSheet = useCallback(() => {
    setOpen(false);
  }, []);
  const runAndClose = (action: () => void) => {
    closeSheet();
    action();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeSheet();
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      showSwipeHandle
    >
      <DrawerContent
        aria-labelledby="discussion-mobile-actions-title"
        aria-describedby="discussion-mobile-actions-description"
        initialFocus={firstActionRef}
        finalFocus={false}
        className="[--drawer-content-max-height:min(480px,calc(100dvh-16px))] bg-(--surface)"
      >
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 pb-[max(16px,var(--app-safe-area-bottom,0px))]">
          <DrawerTitle
            id="discussion-mobile-actions-title"
            className="px-1 text-left text-base font-semibold"
          >
            {title}
          </DrawerTitle>
          <DrawerDescription
            id="discussion-mobile-actions-description"
            className="sr-only"
          >
            Choose an action for this {sourceLabel}.
          </DrawerDescription>
          <DiscussionWorkspaceActionPreview card={card} />
          <div className="mt-3 overflow-hidden rounded-xl border border-(--border) bg-(--surface-strong)">
            {actions.canBookmark && (
              <button
                ref={firstActionRef}
                type="button"
                className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-(--text) transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
                onClick={() => runAndClose(actions.bookmark)}
              >
                <BookmarkSimple size={19} weight="regular" aria-hidden="true" />
                <span>{actions.bookmarkLabel}</span>
              </button>
            )}
            {actions.canFollow && (
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 border-t border-(--border) px-4 text-left text-sm font-medium text-(--text) transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
                onClick={() => runAndClose(actions.follow)}
              >
                <BellSimple size={19} weight="regular" aria-hidden="true" />
                <span>{actions.followLabel}</span>
              </button>
            )}
            {actions.canCopyLink && (
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 border-t border-(--border) px-4 text-left text-sm font-medium text-(--text) transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
                onClick={() => {
                  closeSheet();
                  void actions.copyLink();
                }}
              >
                <LinkSimple size={19} weight="regular" aria-hidden="true" />
                <span>Copy link</span>
              </button>
            )}
            {actions.canCopyText && (
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 border-t border-(--border) px-4 text-left text-sm font-medium text-(--text) transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
                onClick={() => {
                  closeSheet();
                  void actions.copyText();
                }}
              >
                <CopySimple size={19} weight="regular" aria-hidden="true" />
                <span>Copy text</span>
              </button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
