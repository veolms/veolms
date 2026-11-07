/**
 * Chat: course groups, team groups and private chats (CHAT_ROOM_PLAN.md).
 * Routes are autoloaded from the feature folders; this is what other
 * modules and the background jobs may use.
 */
export { createChatRetention } from "./retention/retention.service.ts";
export {
  CHAT_CHANNEL,
  decodeChatEvent,
  encodeChatEvent,
  type ChatBusEvent,
} from "./realtime/chat-bus.ts";
