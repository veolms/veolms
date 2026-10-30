import type { InteractionCapabilities } from "../discussionFeed";
import { createEmptyDiscussionDraft } from "../discussion-editor/types";

export const DEFAULT_CAPABILITIES: InteractionCapabilities = {
  allowComments: true,
  allowNotes: true,
  allowQa: true,
};

export const DISCUSSION_COMMENT_CHARACTER_LIMIT = 10_000;
export const COMMENT_LENGTH_NOTICE = `Comments, Q&As, and notes can be up to ${DISCUSSION_COMMENT_CHARACTER_LIMIT.toLocaleString("en-US")} characters.`;
export const initialDraft = createEmptyDiscussionDraft();
export const countCharacters = (value: string) => Array.from(value).length;
