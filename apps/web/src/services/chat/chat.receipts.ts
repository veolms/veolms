import { chatService } from "./chat.service";

/**
 * Read and delivered positions, sent in one request every few seconds
 * (CHAT_ROOM_PLAN §14.5): scrolling through a busy group never becomes a
 * request per message. Positions only move forward.
 */

const FLUSH_MS = 3_000;

const pending = new Map<string, { readSeq: number; deliveredSeq: number }>();
let timer: ReturnType<typeof setTimeout> | undefined;

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flushReceipts();
  }, FLUSH_MS);
}

export async function flushReceipts() {
  if (pending.size === 0) return;
  const receipts = [...pending.entries()].slice(0, 50).map(([roomId, r]) => ({
    roomId,
    ...(r.readSeq > 0 ? { readSeq: r.readSeq } : {}),
    ...(r.deliveredSeq > 0 ? { deliveredSeq: r.deliveredSeq } : {}),
  }));
  for (const r of receipts) pending.delete(r.roomId);
  try {
    await chatService.receipts(receipts);
  } catch {
    // Lost positions come back with the next one; counts stay a little high.
  }
  if (pending.size > 0) schedule();
}

export function queueReceipt(
  roomId: string,
  receipt: { readSeq?: number; deliveredSeq?: number },
) {
  const current = pending.get(roomId) ?? { readSeq: 0, deliveredSeq: 0 };
  current.readSeq = Math.max(current.readSeq, receipt.readSeq ?? 0);
  current.deliveredSeq = Math.max(
    current.deliveredSeq,
    receipt.deliveredSeq ?? 0,
    current.readSeq,
  );
  pending.set(roomId, current);
  schedule();
}

if (typeof window !== "undefined") {
  // Leaving the page: send what is waiting.
  window.addEventListener("pagehide", () => void flushReceipts());
}
