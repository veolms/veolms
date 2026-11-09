import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ChatCircleIcon as ChatCircle } from "@phosphor-icons/react/ChatCircle";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { SpeakerSlashIcon as SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { CHAT_EDIT_WINDOW_MINUTES, type ChatMessage } from "@veolms/contracts";
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
import type { BubbleContext } from "./MessageBubble";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export type MessageAction =
  | "reply"
  | "info"
  | "copy"
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

/** WhatsApp's message menu: a reaction bar, then the actions this person may take. */
export function MessageMenu({
  message,
  ctx,
  outgoing,
  open,
  onOpenChange,
  onAction,
  trigger,
}: {
  message: ChatMessage;
  ctx: BubbleContext;
  outgoing: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: MessageAction) => void;
  trigger: ReactNode;
}) {
  const editable =
    outgoing &&
    message.body !== "" &&
    Date.now() - new Date(message.createdAt).getTime() <
      CHAT_EDIT_WINDOW_MINUTES * 60_000;
  const senderLevel = ROLE_LEVEL[message.sender?.role ?? "learner"] ?? 1;
  const canActOnSender =
    !outgoing && (ctx.canModerate || (ctx.isHelper && senderLevel === 1));
  const canPin = ctx.isDirect || ctx.canModerate;
  const mine = ctx.myReactions.get(message.id) ?? null;
  const starred = ctx.starred.has(message.id);

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
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {outgoing && message.seq > 0 ? (
            <DropdownMenuItem onClick={() => onAction("info")}>
              <Info size={16} aria-hidden="true" /> Message info
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => onAction("reply")}>
            <ArrowBendUpLeft size={16} aria-hidden="true" /> Reply
          </DropdownMenuItem>
          {message.body ? (
            <DropdownMenuItem onClick={() => onAction("copy")}>
              <Copy size={16} aria-hidden="true" /> Copy
            </DropdownMenuItem>
          ) : null}
          {editable ? (
            <DropdownMenuItem onClick={() => onAction("edit")}>
              <PencilSimple size={16} aria-hidden="true" /> Edit
            </DropdownMenuItem>
          ) : null}
          {canPin ? (
            <DropdownMenuItem
              onClick={() => onAction(message.pinned ? "unpin" : "pin")}
            >
              <PushPin size={16} aria-hidden="true" />{" "}
              {message.pinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => onAction(starred ? "unstar" : "star")}
          >
            <Star size={16} aria-hidden="true" /> {starred ? "Unstar" : "Star"}
          </DropdownMenuItem>
          {ctx.isGroup && !outgoing && message.sender ? (
            <DropdownMenuItem onClick={() => onAction("message-sender")}>
              <ChatCircle size={16} aria-hidden="true" /> Message{" "}
              {message.sender.name.split(" ")[0]}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {canActOnSender && ctx.isGroup ? (
            <DropdownMenuItem onClick={() => onAction("mute-sender")}>
              <SpeakerSlash size={16} aria-hidden="true" /> Mute{" "}
              {message.sender?.name.split(" ")[0] ?? "sender"}…
            </DropdownMenuItem>
          ) : null}
          {!outgoing ? (
            <DropdownMenuItem onClick={() => onAction("report")}>
              <Flag size={16} aria-hidden="true" /> Report
            </DropdownMenuItem>
          ) : null}
          {message.deleted?.restorable && ctx.canModerate ? (
            <DropdownMenuItem onClick={() => onAction("restore")}>
              <ArrowCounterClockwise size={16} aria-hidden="true" /> Restore
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
