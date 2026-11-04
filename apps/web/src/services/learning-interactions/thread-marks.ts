import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  CreatorHeart,
  LearningThread,
  LessonDiscussionsListResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { useCurrentUser } from "../auth/auth.queries";
import { updateDiscussionsWorkspaceItem } from "./cache-updaters";
import { learningInteractionKeys } from "./learning-interactions.keys";
import { learningInteractionsService } from "./learning-interactions.service";

/** The marks staff put on a thread: its pin and the creator's heart. */
export interface ThreadMarks {
  pinnedAt?: string | null;
  creatorHeart?: CreatorHeart | null;
}

export type ThreadMarkAction = "pin" | "unpin" | "heart" | "unheart";

/**
 * Puts new marks on the thread wherever it is cached: the lesson's
 * discussion, the open thread, and the Discussions page.
 */
function patchThreadMarks(
  queryClient: QueryClient,
  threadId: string,
  marks: ThreadMarks,
) {
  queryClient.setQueriesData<InfiniteData<LessonDiscussionsListResponse>>(
    { queryKey: learningInteractionKeys.lessonDiscussionsRoot() },
    (old) => {
      if (!old?.pages) return old;
      let changed = false;
      const pages = old.pages.map((page) => {
        let pageChanged = false;
        const items = page.items.map((item) => {
          if (item.sourceType !== "thread" || item.thread.id !== threadId) {
            return item;
          }
          pageChanged = true;
          return { ...item, thread: { ...item.thread, ...marks } };
        });
        changed ||= pageChanged;
        return pageChanged ? { ...page, items } : page;
      });
      return changed ? { ...old, pages } : old;
    },
  );
  queryClient.setQueryData<LearningThread>(
    learningInteractionKeys.threadDetails(threadId),
    (old) => (old ? { ...old, ...marks } : old),
  );
  updateDiscussionsWorkspaceItem(
    queryClient,
    { itemType: "thread", id: threadId },
    (item) => ({ ...item, ...marks }),
  );
}

/**
 * Pin a comment or question to the top of its lesson, or give it the
 * creator's heart. The change shows at once and is put back if the server
 * refuses it. Course owners and moderators only; the server checks.
 */
export function useThreadMarkMutation(options?: {
  onError?: (error: ApiError) => void;
}) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();

  return useMutation<
    unknown,
    ApiError,
    {
      thread: {
        id: string;
        courseId: string;
        lessonId?: string | null;
      } & ThreadMarks;
      action: ThreadMarkAction;
    },
    { previous: ThreadMarks }
  >({
    mutationFn: ({ thread, action }) =>
      learningInteractionsService.markThread(
        thread.courseId,
        thread.id,
        action,
      ),
    onMutate: ({ thread, action }) => {
      const previous: ThreadMarks = {
        pinnedAt: thread.pinnedAt ?? null,
        creatorHeart: thread.creatorHeart ?? null,
      };
      const next: ThreadMarks =
        action === "pin"
          ? { pinnedAt: new Date().toISOString() }
          : action === "unpin"
            ? { pinnedAt: null }
            : action === "heart"
              ? {
                  creatorHeart: {
                    displayName:
                      currentUser?.displayName?.trim() ||
                      currentUser?.username ||
                      "Creator",
                    avatarUrl: currentUser?.avatarDataUrl ?? null,
                  },
                }
              : { creatorHeart: null };
      patchThreadMarks(queryClient, thread.id, next);
      return { previous };
    },
    onError: (error, { thread }, context) => {
      if (context) patchThreadMarks(queryClient, thread.id, context.previous);
      options?.onError?.(error);
    },
    onSuccess: (_result, { thread, action }) => {
      // A pin moves the comment to the top of its lesson's discussion.
      if ((action === "pin" || action === "unpin") && thread.lessonId) {
        void queryClient.invalidateQueries({
          queryKey: learningInteractionKeys.lessonDiscussionsRoot(
            thread.courseId,
            thread.lessonId,
          ),
        });
      }
    },
  });
}
