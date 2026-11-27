import type { ChatMessage } from "@veolms/contracts";

/**
 * Which messages of one page (after the agent's read position) go to the
 * agent: people's live messages with text or files. The assistant's own
 * messages, system lines and deleted messages are never delivered. When a
 * page holds nothing to deliver, the read position can move to its end
 * (`skipTo`), so the same page is not read again on every poll.
 */
export function planInboxPage(
  messages: readonly ChatMessage[],
  assistantId: string,
): { deliver: ChatMessage[]; skipTo: number | null } {
  const deliver = messages.filter(
    (message) =>
      message.kind === "text" &&
      message.sender !== null &&
      message.sender.id !== assistantId &&
      !message.deleted &&
      (message.body.trim().length > 0 || message.attachments.length > 0),
  );
  if (deliver.length > 0 || messages.length === 0) {
    return { deliver, skipTo: null };
  }
  return { deliver: [], skipTo: messages[messages.length - 1]!.seq };
}

/** Whether an acknowledged position is believable: after nothing newer than the room has. */
export function isValidAck(
  seq: number,
  roomLastSeq: number | undefined,
): boolean {
  return roomLastSeq !== undefined && seq >= 1 && seq <= roomLastSeq;
}
