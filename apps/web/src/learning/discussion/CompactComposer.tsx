import { createPortal } from "react-dom";
import { GuestProfileIcon } from "../../icons/GuestProfileIcon";
import { DiscussionAvatar } from "../DiscussionAvatar";
import { DESCRIPTION_SURFACE_BASE } from "../LessonDescription";
import {
  createEmptyDiscussionDraft,
  type DiscussionDraft,
} from "../discussion-editor/types";

const EMPTY_MOBILE_COMPOSER_DRAFT = createEmptyDiscussionDraft();

interface CompactComposerProps {
  draft: DiscussionDraft;
  attachmentCount: number;
  promptText?: string;
  avatar?: string | null;
  disabled?: boolean;
  /** What the box is announced as; it opens the composer by default. */
  label?: string;
  /**
   * A key that would type a character opens it too. For a box that leads
   * somewhere else (logging in), where nothing typed could be kept.
   */
  opensOnTyping?: boolean;
  /**
   * Nobody is signed in: the avatar is the sidebar's signed-out profile
   * mark, in the theme's accent.
   */
  guest?: boolean;
  onOpen: () => void;
  /**
   * The signed-in viewer before the session check has said who they are:
   * the picture this tab remembers (the profile hint the document's head
   * hands to the style, see shell/profileHintEarlyState.ts), drawn before
   * any script has run.
   */
  rememberedViewer?: boolean;
  /**
   * The phone's slimmer box, under the bottom navigation: a 36px avatar
   * with 4px around it, about seven tenths of the regular height.
   */
  slim?: boolean;
}

// Rounded like the description card it sits under.
const COMPACT_COMPOSER_SURFACE = `${DESCRIPTION_SURFACE_BASE} rounded-xl transition-[background-color,box-shadow] hover:bg-[color-mix(in_srgb,var(--surface)_96%,var(--hover))]`;

// Slim: 4px above and below the box (the box itself is slim too).
const MOBILE_COMPOSER_SURFACE_BASE =
  "border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-transparent backdrop-blur-xl px-3 pt-1 pb-[max(4px,var(--app-safe-area-bottom))]";
const MOBILE_BOTTOM_ACTION_OFFSET_CLASS =
  "bottom-[calc(58px+var(--app-viewport-safe-area-bottom))]";

interface MobileCompactComposerPortalProps {
  draft: DiscussionDraft;
  attachmentCount: number;
  promptText?: string;
  avatar?: string | null;
  label?: string;
  opensOnTyping?: boolean;
  guest?: boolean;
  mobileBottomNavigation: boolean;
  scrollHidden: boolean;
  onOpen: () => void;
}

export function MobileCompactComposerPortal({
  draft,
  attachmentCount,
  promptText,
  avatar,
  label,
  opensOnTyping,
  guest,
  mobileBottomNavigation,
  scrollHidden,
  onOpen,
}: MobileCompactComposerPortalProps) {
  const layerTarget = document.querySelector<HTMLElement>(
    "[data-learning-motion-stage]",
  );

  return createPortal(
    <div
      data-learning-mobile-composer-layer
      className={`pointer-events-none fixed inset-x-0 z-130 box-border min-w-0 max-w-full overflow-x-clip transition-[transform,opacity] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
        mobileBottomNavigation ? MOBILE_BOTTOM_ACTION_OFFSET_CLASS : "bottom-0"
      }`}
      style={{
        opacity: "var(--learning-player-content-opacity, 1)",
        transform:
          "translate3d(0, var(--learning-player-content-offset-y, 0px), 0)",
        transitionDuration:
          "var(--learning-player-content-motion-duration, 0ms)",
      }}
    >
      <div
        data-learning-mobile-composer-surface
        data-testid="mobile-discussion-composer"
        data-scroll-hidden={scrollHidden}
        aria-hidden={scrollHidden}
        className={`pointer-events-auto relative box-border min-w-0 max-w-full overflow-x-clip ${MOBILE_COMPOSER_SURFACE_BASE} transition-[transform,opacity,visibility] will-change-transform motion-reduce:transition-none ${scrollHidden ? "pointer-events-none invisible translate-y-[calc(100%+58px+var(--app-viewport-safe-area-bottom)+4px)] opacity-0 duration-180 ease-[cubic-bezier(0.4,0,1,1)]" : "visible translate-y-0 opacity-100 duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)]"}`}
      >
        <CompactComposer
          draft={draft}
          attachmentCount={attachmentCount}
          promptText={promptText}
          avatar={avatar}
          label={label}
          opensOnTyping={opensOnTyping}
          guest={guest}
          slim
          onOpen={onOpen}
        />
      </div>
    </div>,
    layerTarget ?? document.body,
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
          draft={EMPTY_MOBILE_COMPOSER_DRAFT}
          attachmentCount={0}
          avatar={null}
          disabled
          slim
          onOpen={() => undefined}
        />
      </div>
    </div>
  );
}

/**
 * The viewer's picture as this tab remembers it, or the viewer's mark
 * without one, the same box as `DiscussionAvatar` draws for the viewer.
 */
function RememberedViewerAvatar({ sizeClass }: { sizeClass: string }) {
  return (
    <span className={`pointer-events-none relative shrink-0 ${sizeClass}`}>
      <span
        aria-hidden="true"
        className="absolute inset-0 hidden rounded-full border border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-(image:--profile-hint-avatar) bg-cover bg-center [:root[data-profile-hint-avatar]_&]:block"
      />
      <span className="[:root[data-profile-hint-avatar]_&]:hidden">
        <DiscussionAvatar src={null} viewer className={sizeClass} />
      </span>
    </span>
  );
}

export function CompactComposer({
  draft,
  attachmentCount,
  promptText = "Write something…",
  avatar,
  disabled = false,
  label = "Open discussion composer",
  opensOnTyping = false,
  guest = false,
  rememberedViewer = false,
  slim = false,
  onOpen,
}: CompactComposerProps) {
  const avatarSize = slim ? "size-9" : "size-10";
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
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onOpen}
      onKeyDown={(event) => {
        if (disabled) return;
        const typesCharacter =
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey;
        if (
          event.key === "Enter" ||
          event.key === " " ||
          (opensOnTyping && typesCharacter)
        ) {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`flex w-full cursor-pointer items-center gap-2 text-left ${slim ? "p-1" : "p-2"} ${COMPACT_COMPOSER_SURFACE} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)${disabled ? " pointer-events-none opacity-60" : ""}`}
    >
      {guest ? (
        // Drawn at the sidebar's size (its ring is three quarters of the
        // mark, 39px), overflowing the 40px avatar box evenly; in the slim
        // box the mark is scaled with it (47px, a 35px ring in a 36px box).
        // It is pinned to the box's centre: left to the grid, the oversized
        // mark was laid at the box's top-left corner, 6px off each way.
        <span
          className={`pointer-events-none relative shrink-0 text-(--accent) ${avatarSize}`}
          aria-hidden="true"
        >
          <GuestProfileIcon
            size={slim ? 47 : 52}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          />
        </span>
      ) : rememberedViewer ? (
        <RememberedViewerAvatar sizeClass={avatarSize} />
      ) : (
        <DiscussionAvatar
          src={avatar}
          viewer
          className={`pointer-events-none ${avatarSize}`}
        />
      )}
      <span className="learning-discussion__composer-prompt min-w-0 flex-1 truncate px-2 py-1.5 text-(--muted)">
        {preview || (attachmentCount > 0 ? attachmentPreview : promptText)}
      </span>
    </div>
  );
}
