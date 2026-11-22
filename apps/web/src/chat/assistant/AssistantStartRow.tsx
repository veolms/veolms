import { getApiError } from "../../lib/api-error";
import { useAssistantInfo, useOpenAssistant } from "../../services/assistant";
import { ChatAvatar } from "../ChatAvatar";

/**
 * The top row of Chats for people who may use the assistant but have not
 * opened its chat yet. One tap opens their private chat with it (pinned,
 * so it stays at the top afterwards like any pinned chat).
 */
export function AssistantStartRow({
  onOpen,
  onError,
}: {
  onOpen: (roomId: string) => void;
  onError: (message: string) => void;
}) {
  const info = useAssistantInfo();
  const open = useOpenAssistant();
  if (!info.data?.available || info.data.roomId) return null;
  const name = info.data.assistant?.name ?? "Claude";
  return (
    <button
      type="button"
      disabled={open.isPending}
      onClick={() =>
        open.mutate(undefined, {
          onSuccess: (result) => onOpen(result.roomId),
          onError: (error) => onError(getApiError(error).message),
        })
      }
      className="flex h-16 w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-2.5 text-left text-(--text) hover:bg-(--chat-hover) disabled:cursor-default"
    >
      <ChatAvatar name={name} assistant />
      <span className="min-w-0">
        <span className="block truncate text-[0.98rem]">{name}</span>
        <span className="block truncate text-[0.8rem] text-(--muted)">
          Fix bugs, build, research · tap to start
        </span>
      </span>
    </button>
  );
}
