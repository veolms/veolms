import type { ChatRoomSummary } from "@veolms/contracts";

import { chatService } from "../services/chat";

/**
 * The picture a chat shows: the person's photo in a private chat; in a
 * group, the icon its admins set (read through the API, like any chat
 * file), else the course's picture, else none (the group glyph).
 */
export function roomAvatarUrl(
  room: Pick<
    ChatRoomSummary,
    "kind" | "peer" | "iconUrl" | "courseThumbnailUrl"
  >,
): string | null {
  if (room.kind === "direct") return room.peer?.avatarUrl ?? null;
  if (room.iconUrl) {
    return room.iconUrl.startsWith("/v1/")
      ? chatService.fileUrl({ url: room.iconUrl })
      : room.iconUrl;
  }
  return room.courseThumbnailUrl;
}
