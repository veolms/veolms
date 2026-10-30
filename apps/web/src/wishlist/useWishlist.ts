import { WISHLIST_IMPORT_MAX_COURSES } from "@veolms/contracts/wishlist";
import { useCallback, useEffect, useMemo } from "react";

import { courseMatchesWishlist, type Course } from "../courses/catalogue";
import {
  markBrowserWishlistImported,
  readBrowserWishlistToImport,
  toggleWishlistCourse as toggleBrowserWishlistCourse,
  useBrowserWishlistIds,
} from "../courses/wishlistStorage";
import {
  useImportWishlistCourses,
  useToggleWishlistItem,
  useWishlist,
} from "../services/wishlist";
import { useAuthStore } from "../store/auth.store";

const EMPTY_WISHLIST: ReadonlySet<string> = new Set<string>();

/**
 * Accounts whose browser list is on its way, or could not be sent since the
 * page loaded. Several components use the wishlist at once; one sends it.
 */
const importStartedFor = new Set<string>();

/**
 * Sends what this browser had saved for the account to its server wishlist,
 * once. If the request fails nothing is marked, and it is tried again the
 * next time the page is loaded.
 */
function useBrowserWishlistImport(userId: string | undefined) {
  const markImported = useCallback(
    (courses: string[]) => {
      if (!userId) return;
      markBrowserWishlistImported(userId, courses);
      // Sent and recorded: what a visitor saves later in this page load,
      // signed out, is sent when they sign in again.
      importStartedFor.delete(userId);
    },
    [userId],
  );
  const { mutate: importCourses } = useImportWishlistCourses(
    userId,
    markImported,
  );

  useEffect(() => {
    if (!userId || importStartedFor.has(userId)) return;

    const courses = readBrowserWishlistToImport(userId).slice(
      0,
      WISHLIST_IMPORT_MAX_COURSES,
    );
    if (courses.length === 0) return;
    importStartedFor.add(userId);
    importCourses(courses);
  }, [importCourses, userId]);
}

/**
 * The ids and slugs of the courses in the wishlist: the signed-in learner's
 * own, from the server, or the one this browser keeps for a visitor.
 */
export function useWishlistIds(): ReadonlySet<string> {
  const userId = useAuthStore((state) => state.user?.id);
  const browserWishlist = useBrowserWishlistIds();
  const { data } = useWishlist(userId);
  useBrowserWishlistImport(userId);

  const accountWishlist = useMemo(() => {
    if (!data) return EMPTY_WISHLIST;
    const entries = new Set<string>();
    for (const item of data.items) {
      if (item.courseId) entries.add(item.courseId);
      if (item.courseSlug) entries.add(item.courseSlug);
    }
    return entries;
  }, [data]);

  return userId ? accountWishlist : browserWishlist;
}

export function useCourseWishlisted(
  course: Pick<Course, "id" | "slug">,
): boolean {
  return courseMatchesWishlist(course, useWishlistIds());
}

/** Saves the course, or removes it if it is saved already. */
export function useToggleWishlistCourse() {
  const userId = useAuthStore((state) => state.user?.id);
  const toggleAccountWishlistCourse = useToggleWishlistItem(userId);

  return useCallback(
    (course: Pick<Course, "id" | "slug">) => {
      if (userId) toggleAccountWishlistCourse(course);
      else toggleBrowserWishlistCourse(course);
    },
    [toggleAccountWishlistCourse, userId],
  );
}
