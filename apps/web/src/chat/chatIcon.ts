import type { ChatRoomSummary } from "@veolms/contracts";

import { chatService } from "../services/chat";

/**
 * The picture a chat shows: the person's photo in a private chat; in a
 * group, its picture as the API serves it (the icon its admins set, else
 * the course's picture), else none (the group glyph).
 */
export function roomAvatarUrl(
  room: Pick<ChatRoomSummary, "kind" | "peer" | "iconUrl">,
): string | null {
  if (room.kind === "direct") return room.peer?.avatarUrl ?? null;
  return room.iconUrl ? chatService.fileUrl({ url: room.iconUrl }) : null;
}
