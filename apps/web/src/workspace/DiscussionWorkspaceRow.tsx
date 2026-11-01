import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChatCircleIcon as ChatCircle } from "@phosphor-icons/react/ChatCircle";
import { PaperclipIcon as Paperclip } from "@phosphor-icons/react/Paperclip";
import { DiscussionAvatar } from "../learning/DiscussionAvatar";
import type { NavigateTo } from "../routing/navigation";
import { DiscussionLikeButton } from "./DiscussionLikeButton";
import { DiscussionRowAction } from "./DiscussionRowAction";
import { DiscussionWorkspaceActionMenu } from "./DiscussionWorkspaceActionMenu";
import { useDiscussionWorkspaceCardLongPress } from "./useDiscussionWorkspaceCardLongPress";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";
import { useDiscussionWorkspaceCardActions } from "./useDiscussionWorkspaceCardActions";
import { TimeAgo } from "../components/TimeAgo";
import {
  DiscussionCourseThumbnail,
  useDiscussionCourseThumbnail,
} from "./DiscussionCourseThumbnail";
import { renderContentWithMentions } from "../learning/discussion-editor/MentionLink";
import { requestDiscussionReplyFocus } from "./discussionReplyFocus";

/** What the row's small label says next to the time, if anything. */
function getKindLabel(card: DiscussionWorkspaceCard): string | null {
  if (card.itemType === "note" || card.kind === "note") return "Note";
  if (card.itemType === "reply") return "Reply";
  if (card.kind === "question" || card.kind === "qna") {
    if (card.status === "solved") return "Q&A · Solved";
    if (card.status === "answered") return "Q&A · Answered";
    return "Q&A";
  }
  return null;
}

export function getDiscussionAttachmentLabel(
  summary: DiscussionWorkspaceCard["attachmentSummary"],
): string | null {
  if (summary.count === 0) return null;
  if (summary.count > 1) return `${summary.count} attachments`;
  if (summary.hasImages && !summary.hasVideos && !summary.hasFiles)
    return "1 image";
  if (summary.hasVideos && !summary.hasImages && !summary.hasFiles)
    return "1 video";
  if (summary.hasFiles && !summary.hasImages && !summary.hasVideos)
    return "1 file";
  return "1 attachment";
}

/**
 * One discussion on the Discussions page: a flat row in a list split by thin
 * lines. Pressing it opens the discussion beside the list; its course and
 * lesson, and its menu, lead to the lesson itself.
 */
export function DiscussionWorkspaceRow({
  card,
  destination,
  selected,
  onOpen,
  onClose,
  menu,
  setNotice,
  onLongPressHandlers,
  onNavigatePage,
}: {
  card: DiscussionWorkspaceCard;
  destination: string | null;
  /** Opens the lesson from the course box. */
  onNavigatePage?: NavigateTo;
  selected: boolean;
  onOpen: (card: DiscussionWorkspaceCard) => void;
  /** Closes the panel when the selected row is pressed again. */
  onClose?: () => void;
  /** The three-dot menu, already built for this card. */
  menu?: ReactNode;
  setNotice?: (message: string) => void;
  /** Touch long-press, which opens the phone action sheet. */
  onLongPressHandlers?: Record<string, unknown>;
}) {
  const courseThumbnail = useDiscussionCourseThumbnail(card.courseId);
  const actions = useDiscussionWorkspaceCardActions({
    card,
    destination,
    setNotice,
  });
  const kindLabel = getKindLabel(card);
  const attachmentLabel = getDiscussionAttachmentLabel(card.attachmentSummary);
  const text = card.excerpt || card.title || "";
  const isNote = card.itemType === "note" || card.kind === "note";
  const username = card.authorUsername.replace(/^@+/, "");

  // The row, its name and Enter select it; pressed again while it is the
  // open discussion, they close the panel. "Reply" always opens it.
  const select = () => {
    if (selected && onClose) onClose();
    else onOpen(card);
  };
  const open = (event: MouseEvent<HTMLElement>) => {
    // A double click acts as one: the first click opens (or closes) and
    // the second is ignored, instead of undoing it.
    if (event.detail > 1) return;
    // Selecting text in a row must not open it.
    if (window.getSelection()?.toString()) return;
    if ((event.target as HTMLElement).closest("a,button,[role=menu]")) return;
    select();
  };
  const openFromKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    select();
  };

  return (
    <article
      {...onLongPressHandlers}
      aria-current={selected ? "true" : undefined}
      // As the comments under a lesson video: the row's background runs
      // out through the tab panel's side padding to the frame's edges while its
      // content stays in line with the search bar, no corners, no dividers
      // (the gap between rows separates them). The open row is marked like
      // a linked comment there: an accent tint and a straight accent bar.
      className={`group/row relative -ms-(--swipeable-tab-panel-inline-start) -me-(--swipeable-tab-panel-inline-end) flex cursor-pointer gap-4 ps-(--swipeable-tab-panel-inline-start) pe-(--swipeable-tab-panel-inline-end) py-5 transition-colors max-[48.75rem]:grid max-[48.75rem]:grid-cols-[2.5rem_minmax(0,1fr)] max-[48.75rem]:gap-x-3 max-[48.75rem]:gap-y-2 ${
        selected
          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[inset_3px_0_0_var(--accent)]"
          : "hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
      }`}
      onClick={open}
    >
      <DiscussionAvatar
        src={card.avatar || null}
        className="size-10 shrink-0 rounded-full object-cover"
        loading="lazy"
      />
      {/* On a phone the name line sits beside the picture and the rest
          runs under both, from the picture's left edge (the list's phone
          width, as in DiscussionWorkspaceVirtualFeed). */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 max-[48.75rem]:contents max-[48.75rem]:[&>*:not(:first-child)]:col-span-2">
        <div
          className={`flex min-w-0 flex-col max-[48.75rem]:self-center ${menu ? "pr-10" : ""}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {/* The row's own keyboard target: the name opens it. */}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (event.detail > 1) return;
                select();
              }}
              onKeyDown={openFromKey}
              className="rounded text-[0.9375rem] font-bold text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
              aria-label={`Open ${isNote ? "note" : "discussion"} by ${
                card.isOwn ? "you" : card.author
              }`}
            >
              {card.isOwn ? `${card.author || "You"} (You)` : card.author}
            </button>
            <span
              className="text-[0.8125rem] text-(--muted)"
              aria-hidden="true"
            >
              ·
            </span>
            <TimeAgo
              value={card.activityAt}
              label={card.activity}
              className="text-[0.8125rem] text-(--muted)"
            />
            {kindLabel && (
              <span className="self-center rounded-md bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-1.5 py-0.5 text-[0.6875rem] font-bold tracking-wide text-(--muted) uppercase">
                {kindLabel}
              </span>
            )}
          </div>
          {username && (
            <span className="truncate text-[0.8125rem] text-(--muted)">
              @{username}
            </span>
          )}
        </div>

        {card.itemType === "reply" && card.parentThreadTitle && (
          <p className="m-0 truncate text-[0.8125rem] text-(--muted)">
            In reply to “{card.parentThreadTitle}”
          </p>
        )}

        {text && (
          <p className="m-0 line-clamp-4 max-w-180 text-base leading-relaxed max-[48.75rem]:text-[0.9375rem] wrap-anywhere text-(--text) select-text">
            {renderContentWithMentions(text)}
          </p>
        )}

        {attachmentLabel && (
          <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-(--muted)">
            <Paperclip size={15} aria-hidden="true" />
            {attachmentLabel}
          </span>
        )}

        {(card.course || card.lesson) &&
          (() => {
            // Course above, lecture below, beside the course's picture (the
            // book while there is none), in a box that opens the lesson with
            // this comment highlighted.
            const lessonInfo = (
              <>
                <DiscussionCourseThumbnail
                  thumbnail={courseThumbnail}
                  className="aspect-video h-11 w-auto shrink-0 rounded-md object-cover"
                  fallback={
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)"
                      aria-hidden="true"
                    >
                      <BookOpen size={22} weight="duotone" />
                    </span>
                  }
                />
                <div className="min-w-0 flex-1 leading-snug">
                  {card.course && (
                    <p className="m-0 truncate text-[0.8125rem] font-semibold text-(--muted)">
                      {card.course}
                    </p>
                  )}
                  {card.lesson && (
                    <p className="m-0 truncate text-[0.9375rem] font-semibold text-(--text)">
                      {card.lesson}
                    </p>
                  )}
                </div>
              </>
            );
            const boxClass =
              "flex max-w-120 min-w-0 items-center gap-3 self-start rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-2 pr-4 no-underline";
            return destination ? (
              <a
                href={destination}
                draggable={false}
                title="Open lesson"
                onClick={(event) => {
                  event.stopPropagation();
                  if (
                    !onNavigatePage ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onNavigatePage(destination, { exact: true });
                }}
                className={`${boxClass} transition-colors hover:bg-[color-mix(in_srgb,var(--text)_7%,transparent)] focus-visible:outline-2 focus-visible:outline-(--accent)`}
              >
                {lessonInfo}
              </a>
            ) : (
              <div className={boxClass}>{lessonInfo}</div>
            );
          })()}

        <div className="-ml-2.5 flex items-center gap-1">
          {actions.canLike && (
            <DiscussionLikeButton
              liked={Boolean(card.isLiked)}
              count={card.likes}
              onToggle={actions.like}
            />
          )}
          {!isNote && (
            <DiscussionRowAction
              icon={<ChatCircle size={15} aria-hidden="true" />}
              label={
                card.replies > 0
                  ? `${card.replies} ${card.replies === 1 ? "reply" : "replies"}`
                  : "Reply"
              }
              onClick={() => {
                // Opens the panel when it is not already this discussion's,
                // then takes the learner to its reply box.
                if (!selected) onOpen(card);
                // Opening is enough to show where to type; asked again
                // while it is open, the reply area pulses once as well.
                requestDiscussionReplyFocus(card.id, { pulse: selected });
              }}
            />
          )}
        </div>
      </div>

      {menu && (
        <div className="absolute top-4 right-[calc(var(--swipeable-tab-panel-inline-end,0px)-0.5rem)] opacity-60 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
          {menu}
        </div>
      )}
    </article>
  );
}

/**
 * A row as the list draws it: with its three-dot menu where there is a
 * pointer, and a long press that opens the action sheet on touch screens.
 */
export function DiscussionWorkspaceListRow({
  card,
  destination,
  selected,
  onOpen,
  onClose,
  onNavigatePage,
  showActions,
  onRequestMobileActions,
  setNotice,
  onEdit,
  onReport,
}: {
  card: DiscussionWorkspaceCard;
  destination: string | null;
  selected: boolean;
  onOpen: (card: DiscussionWorkspaceCard) => void;
  onClose?: () => void;
  onNavigatePage?: NavigateTo;
  onEdit?: (card: DiscussionWorkspaceCard) => void;
  onReport?: (card: DiscussionWorkspaceCard) => void;
  showActions: boolean;
  onRequestMobileActions?: (
    card: DiscussionWorkspaceCard,
    destination: string | null,
  ) => void;
  setNotice?: (message: string) => void;
}) {
  const { isPressed: _isPressed, ...longPressHandlers } =
    useDiscussionWorkspaceCardLongPress({
      enabled: Boolean(onRequestMobileActions),
      onLongPress: () => onRequestMobileActions?.(card, destination),
    });

  return (
    <DiscussionWorkspaceRow
      card={card}
      destination={destination}
      selected={selected}
      onOpen={onOpen}
      onClose={onClose}
      setNotice={setNotice}
      onNavigatePage={onNavigatePage}
      onLongPressHandlers={longPressHandlers}
      menu={
        showActions ? (
          <DiscussionWorkspaceActionMenu
            card={card}
            destination={destination}
            setNotice={setNotice}
            onNavigatePage={onNavigatePage}
            onEdit={onEdit}
            onReport={onReport}
          />
        ) : undefined
      }
    />
  );
}
