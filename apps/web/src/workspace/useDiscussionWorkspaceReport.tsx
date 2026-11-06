import { useCallback } from "react";
import { useNavigate } from "react-router";

import {
  discussionCommentPath,
  reportPostPath,
} from "../learning/discussionLinks";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";

/**
 * "Report" from the Discussions page's menus: the Report a problem form,
 * about this post, with a link to it, so the report reaches the team's
 * Support page (as on the lesson page).
 */
export function useDiscussionWorkspaceReport() {
  const navigate = useNavigate();
  const openReport = useCallback(
    (card: DiscussionWorkspaceCard) => {
      const isReply = card.itemType === "reply";
      const threadId =
        isReply && card.parentThreadId ? card.parentThreadId : card.id;
      const postPath = card.courseId
        ? discussionCommentPath({
            courseId: card.courseId,
            lessonId: card.lessonId,
            threadId,
          })
        : "/discussions";
      navigate(
        reportPostPath({
          postPath,
          kind: isReply ? "reply" : "comment",
          authorName: card.author,
          courseId: card.courseId,
        }),
      );
    },
    [navigate],
  );
  return { openReport };
}
