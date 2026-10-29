import type { CreatorHeart } from "@veolms/contracts";
import { useCapabilities } from "../services/authorization/authorization.queries";
import { useUpdateHomePageDiscussion } from "../services/home/home.mutations";
import { useHomePageDiscussionList } from "../services/home/home.queries";
import { useThreadMarkMutation } from "../services/learning-interactions/thread-marks";

export interface StaffActionThread {
  /** The server id; actions are offered only once the post is saved. */
  id: string | undefined;
  courseId: string | undefined;
  lessonId?: string | null;
  isPublic: boolean;
  pinnedAt?: string | null;
  creatorHeart?: CreatorHeart | null;
}

/**
 * What staff can do to a comment or question wherever it is shown (under a
 * lesson, on the Discussions page, in its side panel): pin it to the top of
 * its lesson, give it the creator's heart, and put it on the home page's
 * "What students say". Pins and hearts are the course moderators'; the home
 * page is the admins' who can change it.
 */
export function useThreadStaffActions({
  thread,
  canModerate,
  onNotice,
}: {
  thread: StaffActionThread;
  canModerate: boolean;
  onNotice?: (message: string) => void;
}) {
  const { can } = useCapabilities();
  const canFeature =
    can("platform.homepage.update") && Boolean(thread.id) && thread.isPublic;
  const homeList = useHomePageDiscussionList({ enabled: canFeature });
  const markMutation = useThreadMarkMutation({
    onError: (error) =>
      onNotice?.(error.message || "That change could not be saved."),
  });
  const homeMutation = useUpdateHomePageDiscussion({
    onError: (error) =>
      onNotice?.(error.message || "The home page could not be changed."),
  });

  const { id, courseId } = thread;
  const canMark = canModerate && Boolean(id && courseId) && thread.isPublic;
  const isPinned = Boolean(thread.pinnedAt);
  const onHomePage = Boolean(id && homeList.data?.pinnedThreadIds.includes(id));
  const hiddenOnHome = Boolean(
    id && homeList.data?.hiddenThreadIds.includes(id),
  );

  const mark = (action: "pin" | "unpin" | "heart" | "unheart") => {
    if (!id || !courseId) return;
    markMutation.mutate({
      thread: {
        id,
        courseId,
        lessonId: thread.lessonId,
        pinnedAt: thread.pinnedAt,
        creatorHeart: thread.creatorHeart,
      },
      action,
    });
  };

  return {
    canMark,
    canPin: canMark && Boolean(thread.lessonId),
    isPinned,
    togglePin: () => {
      mark(isPinned ? "unpin" : "pin");
      onNotice?.(
        isPinned
          ? "Unpinned from the lesson."
          : "Pinned to the top of the lesson's discussion.",
      );
    },
    setHeart: (give: boolean) => mark(give ? "heart" : "unheart"),
    canFeature: canFeature && homeList.isSuccess,
    onHomePage: onHomePage && !hiddenOnHome,
    toggleHomePage: () => {
      if (!id) return;
      const showing = onHomePage && !hiddenOnHome;
      homeMutation.mutate({
        threadId: id,
        action: showing ? "remove" : "add",
      });
      onNotice?.(
        showing ? "Removed from the home page." : "Added to the home page.",
      );
    },
  };
}
