import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ChatCircleIcon as ChatCircle } from "@phosphor-icons/react/ChatCircle";
import { CheckSquareIcon as CheckSquare } from "@phosphor-icons/react/CheckSquare";
import { ShareFatIcon as ShareFat } from "@phosphor-icons/react/ShareFat";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { ImageSquareIcon as ImageSquare } from "@phosphor-icons/react/ImageSquare";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { SpeakerSlashIcon as SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { CHAT_EDIT_WINDOW_MINUTES, type ChatMessage } from "@veolms/contracts";
import type { ComponentType, ReactNode } from "react";

import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  type ContextMenuAnchor,
} from "../components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { cn } from "../lib/utils";
import { canCopyImages } from "./copyImage";
import type { BubbleContext } from "./MessageBubble";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export type MessageAction =
  | "reply"
  | "info"
  | "copy"
  | "copy-link"
  | "forward"
  | "select"
  | "copy-image"
  | "download"
  | "edit"
  | "pin"
  | "unpin"
  | "star"
  | "unstar"
  | "report"
  | "delete"
  | "restore"
  | "mute-sender"
  | "message-sender"
  | "reply-privately"
  | "react-toggle"
  | "react-more"
  | "react-remove"
  | `react:${string}`;

const ROLE_LEVEL: Record<string, number> = {
  admin: 4,
  instructor: 3,
  staff: 3,
  helper: 2,
  learner: 1,
};

/**
 * What this person may do with a message, wherever its actions are offered
 * (the message's menu, the media viewer's bar).
 */
export function messageAbilities(
  message: ChatMessage,
  ctx: BubbleContext,
  outgoing: boolean,
) {
  // A message still on its way (no number yet) can't be reacted to,
  // starred, pinned or edited: the server doesn't have it.
  const sent = message.seq > 0;
  const senderLevel = ROLE_LEVEL[message.sender?.role ?? "learner"] ?? 1;
  return {
    sent,
    editable:
      sent &&
      outgoing &&
      message.body !== "" &&
      Date.now() - new Date(message.createdAt).getTime() <
        CHAT_EDIT_WINDOW_MINUTES * 60_000,
    canActOnSender:
      !outgoing && (ctx.canModerate || (ctx.isHelper && senderLevel === 1)),
    canPin: sent && (ctx.isDirect || ctx.canModerate),
    canReplyPrivately:
      ctx.isGroup && !outgoing && Boolean(message.sender) && !message.deleted,
    myReaction: ctx.myReactions.get(message.id) ?? null,
    starred: ctx.starred.has(message.id),
  };
}

interface MessageMenuRow {
  id: string;
  icon?: ReactNode;
  label: ReactNode;
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
  /** The last group holds the actions that change or remove the message. */
  danger?: boolean;
}

type MenuRowComponent = ComponentType<{
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  "aria-label"?: string;
}>;

/**
 * The actions that apply to this message, in the order WhatsApp shows them.
 * The chevron menu (opened by a click) and the context menu (opened by a right
 * click) draw this same list with their own primitives.
 */
function getMessageMenuRows(
  message: ChatMessage,
  ctx: BubbleContext,
  outgoing: boolean,
  onAction: (action: MessageAction) => void,
): MessageMenuRow[] {
  const { sent, editable, canActOnSender, canPin, canReplyPrivately, starred } =
    messageAbilities(message, ctx, outgoing);
  const rows: MessageMenuRow[] = [];
  if (outgoing && message.seq > 0) {
    rows.push({
      id: "info",
      icon: <Info size={16} aria-hidden="true" />,
      label: "Message info",
      onClick: () => onAction("info"),
    });
  }
  rows.push({
    id: "reply",
    icon: <ArrowBendUpLeft size={16} aria-hidden="true" />,
    label: "Reply",
    onClick: () => onAction("reply"),
  });
  if (sent) {
    rows.push({
      id: "forward",
      icon: <ShareFat size={16} aria-hidden="true" />,
      label: "Forward",
      onClick: () => onAction("forward"),
    });
    rows.push({
      id: "select",
      icon: <CheckSquare size={16} aria-hidden="true" />,
      label: "Select",
      onClick: () => onAction("select"),
    });
  }
  if (
    sent &&
    canCopyImages() &&
    message.attachments.filter((a) => a.kind === "image").length === 1
  ) {
    rows.push({
      id: "copy-image",
      icon: <ImageSquare size={16} aria-hidden="true" />,
      label: "Copy image",
      onClick: () => onAction("copy-image"),
    });
  }
  if (message.body) {
    rows.push({
      id: "copy",
      icon: <Copy size={16} aria-hidden="true" />,
      label: "Copy",
      onClick: () => onAction("copy"),
    });
  }
  if (sent && message.attachments.length > 0) {
    rows.push({
      id: "download",
      icon: <DownloadSimple size={16} aria-hidden="true" />,
      label: `Download${message.attachments.length > 1 ? ` all (${message.attachments.length})` : ""}`,
      onClick: () => onAction("download"),
    });
  }
  if (sent) {
    rows.push({
      id: "copy-link",
      icon: <LinkSimple size={16} aria-hidden="true" />,
      label: "Copy link",
      onClick: () => onAction("copy-link"),
    });
  }
  if (editable) {
    rows.push({
      id: "edit",
      icon: <PencilSimple size={16} aria-hidden="true" />,
      label: "Edit",
      onClick: () => onAction("edit"),
    });
  }
  if (canPin) {
    rows.push({
      id: "pin",
      icon: <PushPin size={16} aria-hidden="true" />,
      label: message.pinned ? "Unpin" : "Pin",
      onClick: () => onAction(message.pinned ? "unpin" : "pin"),
    });
  }
  if (sent) {
    rows.push({
      id: "star",
      icon: <Star size={16} aria-hidden="true" />,
      label: starred ? "Unstar" : "Star",
      onClick: () => onAction(starred ? "unstar" : "star"),
    });
  }
  if (canReplyPrivately) {
    // WhatsApp's "Reply privately", for every member of the group.
    rows.push({
      id: "reply-privately",
      icon: <ArrowBendUpLeft size={16} aria-hidden="true" />,
      label: "Reply privately",
      onClick: () => onAction("reply-privately"),
    });
  }
  if (ctx.isGroup && !outgoing && message.sender) {
    rows.push({
      id: "message-sender",
      icon: <ChatCircle size={16} aria-hidden="true" />,
      label: `Message ${message.sender.name.split(" ")[0]}`,
      onClick: () => onAction("message-sender"),
    });
  }
  if (canActOnSender && ctx.isGroup) {
    rows.push({
      id: "mute-sender",
      icon: <SpeakerSlash size={16} aria-hidden="true" />,
      label: `Mute ${message.sender?.name.split(" ")[0] ?? "sender"}…`,
      onClick: () => onAction("mute-sender"),
      danger: true,
    });
  }
  if (!outgoing) {
    rows.push({
      id: "report",
      icon: <Flag size={16} aria-hidden="true" />,
      label: "Report",
      onClick: () => onAction("report"),
      danger: true,
    });
  }
  if (message.deleted?.restorable && ctx.canModerate) {
    rows.push({
      id: "restore",
      icon: <ArrowCounterClockwise size={16} aria-hidden="true" />,
      label: "Restore",
      onClick: () => onAction("restore"),
      danger: true,
    });
  }
  rows.push({
    id: "delete",
    icon: <Trash size={16} aria-hidden="true" />,
    label: "Delete",
    onClick: () => onAction("delete"),
    className: "text-red-500",
    danger: true,
  });
  return rows;
}

/** The menu's contents, drawn with either menu primitive's parts. */
function MessageMenuBody({
  rows,
  sent,
  mine,
  onAction,
  Item,
  Group,
  Separator,
}: {
  rows: readonly MessageMenuRow[];
  sent: boolean;
  mine: string | null;
  onAction: (action: MessageAction) => void;
  Item: MenuRowComponent;
  Group: ComponentType<{ children?: ReactNode }>;
  Separator: ComponentType;
}) {
  const row = ({
    id,
    icon,
    label,
    onClick,
    className,
    ariaLabel,
  }: MessageMenuRow) => (
    <Item
      key={id}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
    >
      {icon}
      {label}
    </Item>
  );
  return (
    <>
      {sent ? (
        <div
          role="group"
          aria-label="React"
          className="flex items-center gap-0.5 px-1 pb-1"
        >
          {QUICK_REACTIONS.map((emoji) => (
            <Item
              key={emoji}
              aria-label={`React ${emoji}`}
              onClick={() => onAction(`react:${emoji}`)}
              className={cn(
                "size-8 justify-center rounded-full p-0 text-lg",
                mine === emoji && "bg-(--chat-selected)",
              )}
            >
              {emoji}
            </Item>
          ))}
          <Item
            aria-label="More reactions"
            onClick={() => onAction("react-more")}
            className="size-8 justify-center rounded-full p-0"
          >
            <Plus size={16} />
          </Item>
        </div>
      ) : null}
      {sent ? <Separator /> : null}
      <Group>{rows.filter((item) => !item.danger).map(row)}</Group>
      <Separator />
      <Group>{rows.filter((item) => item.danger).map(row)}</Group>
    </>
  );
}

interface MessageMenuProps {
  message: ChatMessage;
  ctx: BubbleContext;
  outgoing: boolean;
  onAction: (action: MessageAction) => void;
}

/** WhatsApp's message menu: a reaction bar, then the actions this person may take. */
export function MessageMenu({
  message,
  ctx,
  outgoing,
  open,
  onOpenChange,
  onAction,
  trigger,
}: MessageMenuProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
}) {
  const { sent, myReaction: mine } = messageAbilities(message, ctx, outgoing);
  const rows = getMessageMenuRows(message, ctx, outgoing, onAction);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label="Message options"
        className="cursor-pointer border-0 bg-transparent p-0"
      >
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        aria-label="Message options"
        align={outgoing ? "end" : "start"}
        className="w-60 min-w-0"
      >
        <MessageMenuBody
          rows={rows}
          sent={sent}
          mine={mine}
          onAction={onAction}
          Item={DropdownMenuItem}
          Group={DropdownMenuGroup}
          Separator={DropdownMenuSeparator}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The same actions on right click, at the pointer: below it while there is
 * room, above it otherwise, always kept inside the message viewport (clear
 * of the header and composer).
 */
export function MessageContextMenu({
  message,
  ctx,
  outgoing,
  anchor,
  boundary,
  onAction,
}: MessageMenuProps & {
  anchor?: ContextMenuAnchor;
  boundary?: HTMLElement | null;
}) {
  const { sent, myReaction: mine } = messageAbilities(message, ctx, outgoing);
  const rows = getMessageMenuRows(message, ctx, outgoing, onAction);

  return (
    <ContextMenuContent
      aria-label="Message options"
      align="start"
      alignOffset={4}
      anchor={anchor}
      className="w-60 min-w-0"
      collisionAvoidance={{
        side: "flip",
        align: "shift",
        fallbackAxisSide: "none",
      }}
      collisionBoundary={boundary ?? undefined}
      collisionPadding={8}
      side="bottom"
      sideOffset={4}
    >
      <MessageMenuBody
        rows={rows}
        sent={sent}
        mine={mine}
        onAction={onAction}
        Item={ContextMenuItem}
        Group={ContextMenuGroup}
        Separator={ContextMenuSeparator}
      />
    </ContextMenuContent>
  );
}
