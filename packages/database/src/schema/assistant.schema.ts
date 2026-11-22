import type { ColumnType, Generated } from "kysely";

/** The built-in assistant ("Claude"): a chat member that can never sign in. */
export const CLAUDE_ASSISTANT_USER_ID = "00000000-0000-4000-a000-000000000001";

/** Every assistant user. Chat hides these from people search and pickers. */
export const ASSISTANT_USER_IDS: readonly string[] = [CLAUDE_ASSISTANT_USER_ID];

export function isAssistantUserId(userId: string | null | undefined): boolean {
  return Boolean(userId) && ASSISTANT_USER_IDS.includes(userId!);
}

type BigintColumn = ColumnType<
  string,
  string | number | undefined,
  string | number
>;

/** One person's private chat with an assistant. */
export interface AssistantConversationTable {
  room_id: string;
  assistant_id: string;
  user_id: string;
  /** The last message number the agent confirmed it has read. */
  delivered_seq: Generated<BigintColumn>;
  created_at: Generated<Date>;
}

export type AssistantCardKind = "fix" | "build" | "research" | "ask" | "review";
export type AssistantCardState =
  "queued" | "running" | "waiting" | "done" | "failed" | "stopped";

export interface AssistantCardStep {
  label: string;
  state: "pending" | "active" | "done" | "failed" | "skipped";
}

export interface AssistantCardLink {
  label: string;
  url: string;
}

/** The status card of one request (what people see; nothing about how it runs). */
export interface AssistantCardTable {
  id: string;
  room_id: string;
  message_seq: ColumnType<
    string | null,
    string | number | null | undefined,
    string | number | null
  >;
  request_seq: ColumnType<string, string | number, string | number>;
  requester_id: string;
  kind: AssistantCardKind;
  title: string;
  state: Generated<AssistantCardState>;
  steps: ColumnType<AssistantCardStep[], string | undefined, string>;
  links: ColumnType<AssistantCardLink[], string | undefined, string>;
  stop_requested_at: Date | null;
  stop_delivered_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  finished_at: Date | null;
}

export interface AssistantHeartbeatTable {
  assistant_id: string;
  seen_at: Generated<Date>;
  version: string | null;
  info: ColumnType<Record<string, unknown>, string | undefined, string>;
}
