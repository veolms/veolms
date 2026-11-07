export const chatKeys = {
  all: ["chat"] as const,
  rooms: () => [...chatKeys.all, "rooms"] as const,
  room: (roomId: string) => [...chatKeys.all, "room", roomId] as const,
  messages: (roomId: string) => [...chatKeys.all, "messages", roomId] as const,
  members: (roomId: string, search: string) =>
    [...chatKeys.all, "members", roomId, search] as const,
  candidates: (search: string) =>
    [...chatKeys.all, "candidates", search] as const,
  blocks: () => [...chatKeys.all, "blocks"] as const,
  stars: () => [...chatKeys.all, "stars"] as const,
  profile: () => [...chatKeys.all, "profile"] as const,
  search: (roomId: string, q: string) =>
    [...chatKeys.all, "search", roomId, q] as const,
  messageInfo: (roomId: string, seq: number) =>
    [...chatKeys.all, "message-info", roomId, seq] as const,
  messageReactions: (roomId: string, seq: number, version: string) =>
    [...chatKeys.all, "message-reactions", roomId, seq, version] as const,
  reports: (roomId: string | null) =>
    [...chatKeys.all, "reports", roomId ?? "all"] as const,
  restrictions: (roomId: string | null) =>
    [...chatKeys.all, "restrictions", roomId ?? "platform"] as const,
};
