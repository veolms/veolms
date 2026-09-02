import { httpError } from "../../../../lib/errors.ts";

export const DiscussionErrors = {
  notFound(resource: string = "Discussion thread") {
    return httpError(404, "NOT_FOUND", `${resource} not found`);
  },
  unauthorized() {
    return httpError(401, "UNAUTHORIZED", "Authentication required");
  },
  courseAccessDenied() {
    return httpError(
      403,
      "COURSE_ACCESS_DENIED",
      "You do not have access to this course.",
    );
  },
  forbidden(
    message: string = "You do not have permission to perform this action",
  ) {
    return httpError(403, "FORBIDDEN", message);
  },
  suspended(reason: string, scope?: string) {
    return httpError(
      403,
      "PARTICIPATION_SUSPENDED",
      `Your participation${scope ? ` for ${scope}` : ""} is suspended. Reason: ${reason}`,
    );
  },
  threadLocked() {
    return httpError(
      400,
      "THREAD_LOCKED",
      "This discussion thread is locked and cannot receive modifications or new replies",
    );
  },
  notAQuestion() {
    return httpError(
      400,
      "NOT_A_QUESTION",
      "Only Q&A questions can have accepted answers",
    );
  },
  invalidReply() {
    return httpError(
      400,
      "INVALID_REPLY",
      "The specified reply does not belong to this discussion thread",
    );
  },
  maxNestingExceeded() {
    return httpError(
      400,
      "MAX_NESTING_EXCEEDED",
      "Nested replies are limited to 1 level. Reply directly to the root comment or answer.",
    );
  },
  duplicateReport() {
    return httpError(
      400,
      "DUPLICATE_REPORT",
      "You already have a pending report for this item. Our moderation team is reviewing it.",
    );
  },
};
