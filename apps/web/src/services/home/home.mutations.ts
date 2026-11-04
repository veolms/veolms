import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  HomePageDiscussionListResponse,
  HomePageSettings,
  HomePageSettingsResponse,
  UpdateHomePageDiscussionRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { homeKeys } from "./home.keys";
import { homeService } from "./home.service";
import { clearSessionGuestHomePage } from "./home.session";

export function useUpdateHomePageSettings() {
  const queryClient = useQueryClient();

  return useMutation<HomePageSettingsResponse, ApiError, HomePageSettings>({
    mutationFn: (settings) => homeService.updatePageSettings(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(homeKeys.pageSettings(), saved);
      queryClient.setQueryData(homeKeys.discussionList(), {
        pinnedThreadIds: saved.settings.discussions.pinnedThreadIds,
        hiddenThreadIds: saved.settings.discussions.hiddenThreadIds,
      });
      // The public page is resolved from these settings, and this tab may
      // be holding the page as it was before them.
      clearSessionGuestHomePage();
      void queryClient.invalidateQueries({ queryKey: homeKeys.guestPage() });
    },
  });
}

/**
 * Adds a comment to the home page's "What students say", or hides or
 * removes it, from wherever the comment is shown. Saved at once.
 */
export function useUpdateHomePageDiscussion(options?: {
  onError?: (error: ApiError) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation<
    HomePageDiscussionListResponse,
    ApiError,
    { threadId: string; action: UpdateHomePageDiscussionRequest["action"] },
    { previous: HomePageDiscussionListResponse | undefined }
  >({
    mutationFn: ({ threadId, action }) =>
      homeService.updateDiscussion(threadId, action),
    onMutate: ({ threadId, action }) => {
      const key = homeKeys.discussionList();
      const previous =
        queryClient.getQueryData<HomePageDiscussionListResponse>(key);
      if (previous) {
        const without = (ids: string[]) => ids.filter((id) => id !== threadId);
        queryClient.setQueryData<HomePageDiscussionListResponse>(key, {
          pinnedThreadIds:
            action === "add"
              ? previous.pinnedThreadIds.includes(threadId)
                ? previous.pinnedThreadIds
                : [threadId, ...previous.pinnedThreadIds]
              : action === "remove"
                ? without(previous.pinnedThreadIds)
                : previous.pinnedThreadIds,
          hiddenThreadIds:
            action === "hide"
              ? [...without(previous.hiddenThreadIds), threadId]
              : without(previous.hiddenThreadIds),
        });
      }
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(homeKeys.discussionList(), context.previous);
      }
      options?.onError?.(error);
    },
    onSuccess: (list) => {
      queryClient.setQueryData(homeKeys.discussionList(), list);
      // The settings editor and the public page read the same list.
      void queryClient.invalidateQueries({
        queryKey: homeKeys.pageSettings(),
        predicate: (query) =>
          query.queryKey[query.queryKey.length - 1] !== "discussions",
      });
      clearSessionGuestHomePage();
      void queryClient.invalidateQueries({ queryKey: homeKeys.guestPage() });
    },
  });
}
