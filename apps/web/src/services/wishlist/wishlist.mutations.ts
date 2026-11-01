import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WishlistItem, WishlistResponse } from "@veolms/contracts";
import { useCallback, useMemo } from "react";

import type { ApiError } from "../../lib/api-error";
import { wishlistKeys } from "./wishlist.keys";
import { wishlistService } from "./wishlist.service";

const COURSE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A course as a page knows it: its id, or only its slug before it has loaded. */
export interface WishlistCourseRef {
  id: string;
  slug?: string;
}

interface WishlistChange {
  course: WishlistCourseRef;
  /** The saved item to remove; none when the course is being saved. */
  saved: WishlistItem | undefined;
}

/**
 * Wishlist requests of one learner run one after another. Each answers with
 * the whole list, so two in flight together would have the older answer
 * undo what the newer click showed.
 */
const wishlistMutationScope = { id: "wishlist" };

function findWishlistItem(
  items: readonly WishlistItem[],
  course: WishlistCourseRef,
): WishlistItem | undefined {
  const slug = course.slug?.trim();
  return items.find(
    (item) =>
      item.courseId === course.id ||
      item.courseSlug === course.id ||
      Boolean(slug && item.courseSlug === slug),
  );
}

/**
 * Returns a function that saves a course if it is not in the learner's
 * wishlist and removes it if it is. The list changes at once and is put back
 * if the server refuses.
 */
export function useToggleWishlistItem(userId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => wishlistKeys.items(userId ?? ""), [userId]);

  const { mutate } = useMutation<
    WishlistResponse,
    ApiError,
    WishlistChange,
    { previous: WishlistResponse | undefined }
  >({
    scope: wishlistMutationScope,
    mutationFn: ({ course, saved }) => {
      if (saved) {
        // The item as the list has it now: one clicked off before its save
        // was answered is known here only by what the page called it.
        const current =
          findWishlistItem(
            queryClient.getQueryData<WishlistResponse>(queryKey)?.items ?? [],
            course,
          ) ?? saved;
        return COURSE_ID_PATTERN.test(current.courseId)
          ? wishlistService.remove(current.courseId)
          : wishlistService.list();
      }
      // A page that knows only the slug saves by it; the server finds the id.
      return COURSE_ID_PATTERN.test(course.id)
        ? wishlistService.add(course.id)
        : wishlistService.importCourses([course.slug?.trim() || course.id]);
    },
    onMutate: async ({ course, saved }) => {
      // A list still on its way would put the old state back over this one.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<WishlistResponse>(queryKey);
      const items = previous?.items ?? [];

      queryClient.setQueryData<WishlistResponse>(queryKey, {
        items: saved
          ? items.filter((item) => item.courseId !== saved.courseId)
          : [
              {
                courseId: course.id,
                courseSlug: course.slug?.trim() ?? "",
                addedAt: new Date().toISOString(),
              },
              ...items,
            ],
      });
      return { previous };
    },
    onSuccess: (wishlist) => {
      queryClient.setQueryData(queryKey, wishlist);
    },
    onError: (_error, _change, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return useCallback(
    (course: WishlistCourseRef) => {
      const items =
        queryClient.getQueryData<WishlistResponse>(queryKey)?.items ?? [];
      mutate({ course, saved: findWishlistItem(items, course) });
    },
    [mutate, queryClient, queryKey],
  );
}

/** Sends the courses a browser had saved, and shows the list that results. */
export function useImportWishlistCourses(
  userId: string | undefined,
  /** Called with what was sent, also when the caller has left the page. */
  onImported?: (courses: string[]) => void,
) {
  const queryClient = useQueryClient();
  const queryKey = wishlistKeys.items(userId ?? "");

  return useMutation<WishlistResponse, ApiError, string[]>({
    scope: wishlistMutationScope,
    mutationFn: wishlistService.importCourses,
    onSuccess: async (wishlist, courses) => {
      onImported?.(courses);
      // A list asked for before the import would not have these courses.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, wishlist);
    },
  });
}
