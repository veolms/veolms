import { DiscussionAvatar } from "./DiscussionAvatar";
import {
  COMPACT_COMPOSER_SURFACE,
  MOBILE_COMPOSER_SURFACE_BASE,
} from "./discussionSurfaceStyles";
import { createEmptyDiscussionDraft } from "./discussion-editor/types";
import type { DiscussionDraft } from "./discussion-editor/types";

export interface CompactComposerProps {
  draft: DiscussionDraft;
  attachmentCount: number;
  promptText?: string;
  avatar?: string | null;
  disabled?: boolean;
  onOpen: () => void;
}

export function CompactComposer({
  draft,
  attachmentCount,
  promptText = "Write something…",
  avatar,
  disabled = false,
  onOpen,
}: CompactComposerProps) {
  const preview =
    draft.plainText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const attachmentPreview = `${attachmentCount} ${attachmentCount === 1 ? "attachment" : "attachments"}`;

  return (
    <div
      role="button"
      data-compact-comment-composer
      aria-label="Open discussion composer"
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onOpen}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`flex w-full cursor-pointer items-center gap-2 p-1.5 text-left ${COMPACT_COMPOSER_SURFACE} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)${disabled ? " pointer-events-none opacity-60" : ""}`}
    >
      <DiscussionAvatar src={avatar} className="pointer-events-none size-9" />
      <span className="learning-discussion__composer-prompt min-w-0 flex-1 truncate px-2 py-1.5 text-(--muted)">
        {preview || (attachmentCount > 0 ? attachmentPreview : promptText)}
      </span>
    </div>
  );
}

export function PrerenderedMobileCommentComposer() {
  return (
    <div
      data-learning-mobile-composer-prerender
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(58px+var(--app-viewport-safe-area-bottom))] z-130 box-border hidden min-w-0 max-w-full overflow-x-clip [[data-navigation-layout=compact]_&]:block [[data-learning-mobile-composer-ready=true]_&]:hidden!"
    >
      <div
        className={`relative box-border min-w-0 max-w-full overflow-x-clip ${MOBILE_COMPOSER_SURFACE_BASE}`}
      >
        <CompactComposer
          draft={createEmptyDiscussionDraft()}
          attachmentCount={0}
          avatar={null}
          disabled
          onOpen={() => undefined}
        />
      </div>
    </div>
  );
}
