/**
 * Chat assistants (PRD "Claude Assistant in VeoLMS Chat"): a chat member
 * admins and instructors talk to in a private chat, backed by an outside
 * agent service that reads and writes through `/assistant/agent/*`. Routes
 * are autoloaded from the feature folders; nothing here is needed by other
 * modules today.
 */
export { renderCardBody } from "./shared/assistant.cards.ts";
