import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { ChatCenteredTextIcon as ChatCenteredText } from "@phosphor-icons/react/ChatCenteredText";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { ImageSquareIcon as ImageSquare } from "@phosphor-icons/react/ImageSquare";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { MagnifyingGlassMinusIcon as MagnifyingGlassMinus } from "@phosphor-icons/react/MagnifyingGlassMinus";
import { MagnifyingGlassPlusIcon as MagnifyingGlassPlus } from "@phosphor-icons/react/MagnifyingGlassPlus";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { ShareFatIcon as ShareFat } from "@phosphor-icons/react/ShareFat";
import { SmileyIcon as Smiley } from "@phosphor-icons/react/Smiley";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { ChatMessage } from "@veolms/contracts";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { cn } from "../lib/utils";
import { chatService } from "../services/chat";
import { canCopyImages } from "./copyImage";
import type { BubbleContext } from "./MessageBubble";
import type { ViewableMedia } from "./MessageAttachments";
import {
  messageAbilities,
  QUICK_REACTIONS,
  type MessageAction,
} from "./MessageMenu";

/** What the viewer's bar asks for: a message action, or to show the message in the chat. */
export type ViewerAction = MessageAction | "show-in-chat";

export interface PhotoZoomControls {
  zoomIn: () => void;
  zoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

/** A round icon button on the viewer's dark bar. */
const barButton =
  "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent aria-pressed:text-white";

function BarButton({
  label,
  onClick,
  pressed,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={barButton}
    >
      {children}
    </button>
  );
}

/**
 * The media viewer's actions, as WhatsApp's: on a computer, zoom out and in
 * (photos), show in chat, reply, star, pin, react, forward, download, more
 * (⋮) and close; on a phone, reply, forward, more and close, with the rest
 * in the ⋮ menu (a reaction row on top, as the message menu has). Each one
 * is the chat's own action on the file's message, with the same rights.
 * A file still sending (no message yet) offers download and close only.
 */
export function MediaViewerBar({
  item,
  ctx,
  phone,
  zoom,
  menuContainer,
  onAction,
  onClose,
}: {
  item: ViewableMedia;
  ctx?: BubbleContext;
  phone: boolean;
  /** Photos only. */
  zoom: PhotoZoomControls | null;
  /** The viewer: its menus open inside it, above the file. */
  menuContainer: HTMLElement | null;
  onAction: (action: ViewerAction) => void;
  onClose: () => void;
}) {
  const message: ChatMessage | undefined = item.message;
  const outgoing = Boolean(
    message && ctx && message.sender?.id === ctx.viewerId,
  );
  const can = message && ctx ? messageAbilities(message, ctx, outgoing) : null;
  const sent = Boolean(can?.sent);
  const download = (
    <a
      href={chatService.fileUrl(item.attachment, true)}
      className={barButton}
      aria-label="Download"
      title="Download"
      download={item.name}
    >
      <DownloadSimple size={21} />
    </a>
  );
  const close = (
    <BarButton label="Close" onClick={onClose}>
      <X size={21} />
    </BarButton>
  );
  if (!message || !can) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        {download}
        {close}
      </div>
    );
  }

  const reply = (
    <BarButton label="Reply" onClick={() => onAction("reply")}>
      <ArrowBendUpLeft size={21} />
    </BarButton>
  );
  const forward = sent ? (
    <BarButton label="Forward" onClick={() => onAction("forward")}>
      <ShareFat size={21} />
    </BarButton>
  ) : null;
  const more = (
    <MoreMenu
      message={message}
      item={item}
      can={can}
      outgoing={outgoing}
      phone={phone}
      container={menuContainer}
      onAction={onAction}
    />
  );

  if (phone) {
    return (
      <div className="flex shrink-0 items-center">
        {reply}
        {forward}
        {more}
        {close}
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Message actions"
      className="flex shrink-0 items-center gap-0.5"
    >
      {zoom ? (
        <>
          <BarButton
            label="Zoom out"
            onClick={zoom.zoomOut}
            disabled={!zoom.canZoomOut}
          >
            <MagnifyingGlassMinus size={21} />
          </BarButton>
          <BarButton
            label="Zoom in"
            onClick={zoom.zoomIn}
            disabled={!zoom.canZoomIn}
          >
            <MagnifyingGlassPlus size={21} />
          </BarButton>
        </>
      ) : null}
      {sent ? (
        <BarButton
          label="Show in chat"
          onClick={() => onAction("show-in-chat")}
        >
          <ChatCenteredText size={21} />
        </BarButton>
      ) : null}
      {reply}
      {sent ? (
        <BarButton
          label={can.starred ? "Unstar" : "Star"}
          pressed={can.starred}
          onClick={() => onAction(can.starred ? "unstar" : "star")}
        >
          <Star size={21} weight={can.starred ? "fill" : "regular"} />
        </BarButton>
      ) : null}
      {can.canPin ? (
        <BarButton
          label={message.pinned ? "Unpin" : "Pin"}
          pressed={message.pinned}
          onClick={() => onAction(message.pinned ? "unpin" : "pin")}
        >
          <PushPin size={21} weight={message.pinned ? "fill" : "regular"} />
        </BarButton>
      ) : null}
      {sent ? (
        <ReactMenu
          mine={can.myReaction}
          container={menuContainer}
          onAction={onAction}
        />
      ) : null}
      {forward}
      {download}
      {more}
      {close}
    </div>
  );
}

/** The quick reactions and "more", as on the message menu. */
function ReactionRow({
  mine,
  onAction,
}: {
  mine: string | null;
  onAction: (action: ViewerAction) => void;
}) {
  return (
    <div
      role="group"
      aria-label="React"
      className="flex items-center gap-0.5 px-1 pb-1"
    >
      {QUICK_REACTIONS.map((emoji) => (
        <DropdownMenuItem
          key={emoji}
          aria-label={`React ${emoji}`}
          onClick={() => onAction(`react:${emoji}`)}
          className={cn(
            "size-8 justify-center rounded-full p-0 text-lg",
            mine === emoji && "bg-(--chat-selected)",
          )}
        >
          {emoji}
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem
        aria-label="More reactions"
        onClick={() => onAction("react-more")}
        className="size-8 justify-center rounded-full p-0"
      >
        <Plus size={16} />
      </DropdownMenuItem>
    </div>
  );
}

/** The bar's React button: your reaction, if any, in place of the smiley. */
function ReactMenu({
  mine,
  container,
  onAction,
}: {
  mine: string | null;
  container: HTMLElement | null;
  onAction: (action: ViewerAction) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={mine ? `React (you reacted ${mine})` : "React"}
        title="React"
        className={barButton}
      >
        {mine ? (
          <span className="text-lg leading-none">{mine}</span>
        ) : (
          <Smiley size={21} />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        portalContainer={container}
        aria-label="React"
        align="end"
        className="w-auto min-w-0 pb-0"
      >
        <ReactionRow mine={mine} onAction={onAction} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** ⋮: everything the bar has no room for (more of it on a phone). */
function MoreMenu({
  message,
  item,
  can,
  outgoing,
  phone,
  container,
  onAction,
}: {
  message: ChatMessage;
  item: ViewableMedia;
  can: ReturnType<typeof messageAbilities>;
  outgoing: boolean;
  phone: boolean;
  container: HTMLElement | null;
  onAction: (action: ViewerAction) => void;
}) {
  const { sent } = can;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More options"
        title="More options"
        className={barButton}
      >
        <DotsThreeVertical size={21} weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        portalContainer={container}
        aria-label="More options"
        align="end"
        className="w-60 min-w-0"
      >
        {phone && sent ? (
          <>
            <ReactionRow mine={can.myReaction} onAction={onAction} />
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          {phone && sent ? (
            <DropdownMenuItem onClick={() => onAction("show-in-chat")}>
              <ChatCenteredText size={16} aria-hidden="true" /> Show in chat
            </DropdownMenuItem>
          ) : null}
          {phone && sent ? (
            <DropdownMenuItem
              onClick={() => onAction(can.starred ? "unstar" : "star")}
            >
              <Star size={16} aria-hidden="true" />{" "}
              {can.starred ? "Unstar" : "Star"}
            </DropdownMenuItem>
          ) : null}
          {phone && can.canPin ? (
            <DropdownMenuItem
              onClick={() => onAction(message.pinned ? "unpin" : "pin")}
            >
              <PushPin size={16} aria-hidden="true" />{" "}
              {message.pinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
          ) : null}
          {phone ? (
            <DropdownMenuItem onClick={() => onAction("download")}>
              <DownloadSimple size={16} aria-hidden="true" /> Download
            </DropdownMenuItem>
          ) : null}
          {outgoing && sent ? (
            <DropdownMenuItem onClick={() => onAction("info")}>
              <Info size={16} aria-hidden="true" /> Message info
            </DropdownMenuItem>
          ) : null}
          {message.body ? (
            <DropdownMenuItem onClick={() => onAction("copy")}>
              <Copy size={16} aria-hidden="true" /> Copy caption
            </DropdownMenuItem>
          ) : null}
          {item.kind === "image" && sent && canCopyImages() ? (
            <DropdownMenuItem onClick={() => onAction("copy-image")}>
              <ImageSquare size={16} aria-hidden="true" /> Copy image
            </DropdownMenuItem>
          ) : null}
          {sent ? (
            <DropdownMenuItem onClick={() => onAction("copy-link")}>
              <LinkSimple size={16} aria-hidden="true" /> Copy link
            </DropdownMenuItem>
          ) : null}
          {can.editable ? (
            <DropdownMenuItem onClick={() => onAction("edit")}>
              <PencilSimple size={16} aria-hidden="true" /> Edit caption
            </DropdownMenuItem>
          ) : null}
          {can.canReplyPrivately ? (
            <DropdownMenuItem onClick={() => onAction("reply-privately")}>
              <ArrowBendUpLeft size={16} aria-hidden="true" /> Reply privately
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {!outgoing ? (
            <DropdownMenuItem onClick={() => onAction("report")}>
              <Flag size={16} aria-hidden="true" /> Report
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => onAction("delete")}
            className="text-red-500"
          >
            <Trash size={16} aria-hidden="true" /> Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
