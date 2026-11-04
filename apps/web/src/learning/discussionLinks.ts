import { getCoursePlayerPath } from "./coursePlayerNavigation";

/**
 * A comment's address: its lesson, with the comment at the top of the
 * discussion and highlighted (a reply shows within its comment).
 */
export function discussionCommentPath({
  courseId,
  lessonId,
  threadId,
}: {
  courseId: string;
  lessonId?: string | null;
  threadId: string;
}): string {
  const basePath = getCoursePlayerPath(courseId, 1, {
    threadId,
    threadFocus: "comment",
  });
  if (!lessonId) return basePath;
  const [pathname, query = ""] = basePath.split("?", 2);
  const search = new URLSearchParams(query);
  search.set("lessonId", lessonId);
  return `${pathname}?${search.toString()}`;
}

/**
 * "Report" on a comment, reply or question: the Report a problem form, about
 * that post, with a link to it.
 */
export function reportPostPath({
  postPath,
  kind,
  authorName,
  courseId,
}: {
  postPath: string;
  kind: "comment" | "reply";
  authorName?: string | null;
  courseId?: string | null;
}): string {
  const label = `${kind === "reply" ? "Reply" : "Comment"}${authorName ? ` by ${authorName}` : ""}`;
  const params = new URLSearchParams({
    type: "problem",
    category: "post",
    from: postPath,
    fromLabel: label,
  });
  if (courseId) params.set("courseId", courseId);
  return `/support/new?${params.toString()}`;
}
