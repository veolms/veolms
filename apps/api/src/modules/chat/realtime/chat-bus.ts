/**
 * Chat events between API processes, over Postgres LISTEN/NOTIFY on
 * `veolms_chat` (CHAT_ROOM_PLAN.md §5, §13–14).
 *
 * Always published AFTER the change has committed, by a separate statement
 * (never inside the change's transaction: a NOTIFY inside a transaction
 * makes every NOTIFY-ing commit in the database wait behind one lock, held
 * through the disk flush and the synchronous-copy wait — measured as a hard
 * ceiling of ~340 messages/s locally, ~20–40/s with the Delhi copy).
 *
 * Delivery is best-effort: a process that is not listening misses events.
 * Clients never rely on it: messages carry gapless numbers and a client
 * catches up over REST.
 *
 * Payloads are plain text so a process can drop an event for a chat none
 * of its streams has open WITHOUT parsing JSON:
 *
 *   m|<roomId>|<seq>|<eventSeq>|<message json>     new message
 *   p|<roomId>|<seq>|<eventSeq>                    new message, too big: fetch it
 *   u|<roomId>|<seq>|<eventSeq>|<message json>     message changed
 *   q|<roomId>|<seq>|<eventSeq>                    message changed, too big
 *   t|<roomId>|<userId>|<name>                     typing (private/team chats)
 *   g|<roomId>|<eventSeq>                          chat settings changed
 *   a|<roomId>|<userId>,<userId>,…                 users gained this chat
 *   r|<roomId>|<userId>,<userId>,…                 users lost this chat
 *   d|-|<json [[roomId,userId,readSeq,deliveredSeq,isDirect],…]>  receipts
 */

export const CHAT_CHANNEL = "veolms_chat";

/** NOTIFY payloads are limited to 8000 bytes. */
export const MAX_CHAT_PAYLOAD_BYTES = 7_800;

export type ChatBusEvent =
  | {
      type: "message" | "update";
      roomId: string;
      seq: number;
      eventSeq: number;
      /** The client JSON, already serialised; null when it was too big. */
      json: string | null;
    }
  | { type: "typing"; roomId: string; userId: string; name: string }
  | { type: "room"; roomId: string; eventSeq: number }
  | { type: "added" | "removed"; roomId: string; userIds: string[] }
  | {
      type: "receipts";
      receipts: Array<{
        roomId: string;
        userId: string;
        readSeq: number;
        deliveredSeq: number;
        direct: boolean;
      }>;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One or more payloads (long user lists and receipts are split). */
export function encodeChatEvent(event: ChatBusEvent): string[] {
  switch (event.type) {
    case "message":
    case "update": {
      const full = `${event.type === "message" ? "m" : "u"}|${event.roomId}|${event.seq}|${event.eventSeq}|${event.json ?? ""}`;
      if (
        event.json !== null &&
        Buffer.byteLength(full) <= MAX_CHAT_PAYLOAD_BYTES
      ) {
        return [full];
      }
      return [
        `${event.type === "message" ? "p" : "q"}|${event.roomId}|${event.seq}|${event.eventSeq}`,
      ];
    }
    case "typing":
      return [
        `t|${event.roomId}|${event.userId}|${event.name.replaceAll("|", " ").slice(0, 80)}`,
      ];
    case "room":
      return [`g|${event.roomId}|${event.eventSeq}`];
    case "added":
    case "removed": {
      const head = `${event.type === "added" ? "a" : "r"}|${event.roomId}|`;
      return chunk(event.userIds, (ids) => head + ids.join(","));
    }
    case "receipts": {
      const rows = event.receipts.map((r) => [
        r.roomId,
        r.userId,
        r.readSeq,
        r.deliveredSeq,
        r.direct ? 1 : 0,
      ]);
      return chunk(rows, (part) => `d|-|${JSON.stringify(part)}`);
    }
  }
}

function chunk<T>(
  items: readonly T[],
  render: (part: T[]) => string,
): string[] {
  const payloads: string[] = [];
  let part: T[] = [];
  for (const item of items) {
    if (
      part.length > 0 &&
      Buffer.byteLength(render([...part, item])) > MAX_CHAT_PAYLOAD_BYTES
    ) {
      payloads.push(render(part));
      part = [];
    }
    part.push(item);
  }
  if (part.length > 0) payloads.push(render(part));
  return payloads;
}

/**
 * The cheap first look at a payload: its type and chat, so a process that
 * has no stream for the chat can stop here.
 */
export function peekChatEvent(
  payload: string,
): { kind: string; roomId: string } | null {
  if (payload.length < 3 || payload[1] !== "|") return null;
  const end = payload.indexOf("|", 2);
  const roomId = end === -1 ? payload.slice(2) : payload.slice(2, end);
  return { kind: payload[0]!, roomId };
}

/** The whole event, or null when the payload is not one of ours. */
export function decodeChatEvent(payload: string): ChatBusEvent | null {
  const head = peekChatEvent(payload);
  if (!head) return null;
  const { kind, roomId } = head;
  const parts = (count: number) => payload.split("|", count);
  try {
    switch (kind) {
      case "m":
      case "u":
      case "p":
      case "q": {
        if (!UUID.test(roomId)) return null;
        // The JSON may itself contain "|": take it as the rest.
        const [, , seq, eventSeq] = parts(4);
        const prefixLength =
          2 + roomId.length + 1 + seq!.length + 1 + eventSeq!.length;
        const json =
          kind === "m" || kind === "u" ? payload.slice(prefixLength + 1) : null;
        const numbers = [Number(seq), Number(eventSeq)];
        if (numbers.some((n) => !Number.isSafeInteger(n) || n < 0)) return null;
        return {
          type: kind === "m" || kind === "p" ? "message" : "update",
          roomId,
          seq: numbers[0]!,
          eventSeq: numbers[1]!,
          json: json === "" ? null : json,
        };
      }
      case "t": {
        const [, , userId, ...rest] = payload.split("|");
        if (!UUID.test(roomId) || !userId || !UUID.test(userId)) return null;
        return { type: "typing", roomId, userId, name: rest.join("|") };
      }
      case "g": {
        const [, , eventSeq] = parts(3);
        const n = Number(eventSeq);
        if (!UUID.test(roomId) || !Number.isSafeInteger(n)) return null;
        return { type: "room", roomId, eventSeq: n };
      }
      case "a":
      case "r": {
        const [, , list] = parts(3);
        const userIds = (list ?? "").split(",").filter((id) => UUID.test(id));
        if (!UUID.test(roomId)) return null;
        return { type: kind === "a" ? "added" : "removed", roomId, userIds };
      }
      case "d": {
        const json = payload.slice(4);
        const rows = JSON.parse(json) as unknown;
        if (!Array.isArray(rows)) return null;
        const receipts = [];
        for (const row of rows) {
          if (!Array.isArray(row) || row.length !== 5) continue;
          const [r, u, read, delivered, direct] = row as unknown[];
          if (typeof r !== "string" || typeof u !== "string") continue;
          if (!UUID.test(r) || !UUID.test(u)) continue;
          receipts.push({
            roomId: r,
            userId: u,
            readSeq: Number(read) || 0,
            deliveredSeq: Number(delivered) || 0,
            direct: direct === 1,
          });
        }
        return { type: "receipts", receipts };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
