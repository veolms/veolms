import type { ChatMessage } from "@veolms/contracts";

/**
 * WhatsApp's "Reply privately" (group staff only): the group message a
 * private chat is about to open replying to. Its `roomId` is the group's,
 * which is what makes the reply a private one.
 */
export interface PrivateReply {
  message: ChatMessage;
  groupName: string | null;
}

const pending = new Map<string, PrivateReply>();

/** Kept for the private chat `roomId` until it opens and takes it. */
export function setPendingPrivateReply(roomId: string, reply: PrivateReply) {
  pending.set(roomId, reply);
}

/**
 * The reply waiting for this chat. Dropped just after, not at once: an
 * effect that runs twice in a row (React's development check) finds it both
 * times instead of clearing the quote on the second.
 */
export function takePendingPrivateReply(roomId: string): PrivateReply | null {
  const reply = pending.get(roomId) ?? null;
  if (reply) {
    setTimeout(() => {
      if (pending.get(roomId) === reply) pending.delete(roomId);
    }, 0);
  }
  return reply;
}
