/**
 * "These users' notifications changed", told to every API process over
 * Postgres LISTEN/NOTIFY (the same way the cache bus keeps caches in step).
 * Each process that holds open notification streams listens on this channel
 * (notification-stream.ts) and tells the matching browsers to refetch.
 *
 * Only user ids travel: the browser asks the REST endpoints for the actual
 * notifications, so nothing private passes through the channel and nothing
 * is lost if a message is — a stream that reconnects simply refetches.
 *
 * Published by notifications.repository.ts (publishSignal) through the
 * service's signalUsersChanged, always after the change has committed: a
 * browser told earlier would refetch and miss it.
 */
export const NOTIFICATION_SIGNAL_CHANNEL = "veolms_notifications";

/** NOTIFY payloads are limited to 8000 bytes; ids are split below this. */
const MAX_PAYLOAD_BYTES = 7_500;

interface NotificationSignalMessage {
  /** Format version. */
  v: 1;
  /** The users whose notifications changed. */
  u: string[];
}

/** One NOTIFY payload per chunk of user ids that fits the limit. */
export function encodeNotificationSignal(userIds: readonly string[]): string[] {
  const payloads: string[] = [];
  const encode = (ids: string[]) =>
    JSON.stringify({ v: 1, u: ids } satisfies NotificationSignalMessage);
  let chunk: string[] = [];
  for (const userId of new Set(userIds)) {
    if (Buffer.byteLength(encode([...chunk, userId])) > MAX_PAYLOAD_BYTES) {
      if (chunk.length > 0) payloads.push(encode(chunk));
      chunk = [];
    }
    chunk.push(userId);
  }
  if (chunk.length > 0) payloads.push(encode(chunk));
  return payloads;
}

/** The user ids in a payload, or null when it is not one of ours. */
export function decodeNotificationSignal(
  payload: string | undefined,
): string[] | null {
  if (!payload) return null;
  try {
    const message = JSON.parse(payload) as Partial<NotificationSignalMessage>;
    if (
      message.v === 1 &&
      Array.isArray(message.u) &&
      message.u.every((id) => typeof id === "string")
    ) {
      return message.u;
    }
  } catch {
    // Not ours, or corrupted: ignored.
  }
  return null;
}
