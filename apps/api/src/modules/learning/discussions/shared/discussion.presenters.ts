import type {
  DiscussionAuthor,
  QuestionFilterStatus,
  WorkspaceDiscussionAuthor,
} from "@veolms/contracts";
import { mapAuthorRole, toDate } from "./discussion.utils.ts";

const ANONYMOUS_AUTHOR_NAME = "Anonymous Learner";

/**
 * The author columns every discussion query selects. They are all null when
 * the account behind a post is no longer active: the queries join active
 * users only, so the post stays visible while its author does not.
 */
export interface DiscussionAuthorRow {
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
}

export function presentWorkspaceAuthor(
  row: DiscussionAuthorRow,
): WorkspaceDiscussionAuthor {
  if (!row.authorUsername) {
    return {
      displayName: ANONYMOUS_AUTHOR_NAME,
      username: null,
      avatarUrl: null,
    };
  }
  return {
    displayName: row.authorName || ANONYMOUS_AUTHOR_NAME,
    username: row.authorUsername,
    avatarUrl: row.authorAvatarUrl,
  };
}

export function presentDiscussionAuthor(
  row: DiscussionAuthorRow & { authorRole: string | null },
): DiscussionAuthor {
  return {
    ...presentWorkspaceAuthor(row),
    role: row.authorUsername ? mapAuthorRole(row.authorRole) : "Student",
  };
}

/** Where a question stands. Undefined for anything that is not a question. */
export function threadQaStatus(row: {
  kind: string;
  acceptedAnswerId: string | null;
  repliesCount: number | null;
}): QuestionFilterStatus | undefined {
  if (row.kind !== "question" && row.kind !== "qna") return undefined;
  if (row.acceptedAnswerId) return "solved";
  return Number(row.repliesCount || 0) > 0 ? "answered" : "open";
}

export function toIsoString(value: Date | string): string {
  return toDate(value).toISOString();
}
