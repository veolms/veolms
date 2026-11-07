/**
 * One live stream per tab. The chat stream (GET /chat/stream) also carries
 * "notifications changed", so while it is connected the notification
 * stream steps aside; when chat is off or unreachable it takes over again.
 * Kept here so neither service imports the other.
 */

let chatCarries = false;
const listeners = new Set<() => void>();

export function setChatStreamCarriesNotifications(next: boolean) {
  if (chatCarries === next) return;
  chatCarries = next;
  for (const listener of listeners) listener();
}

export function chatStreamCarriesNotifications(): boolean {
  return chatCarries;
}

export function onChatStreamCarriesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
