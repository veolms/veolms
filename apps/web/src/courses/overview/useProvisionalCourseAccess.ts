import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type {
  CourseAccessResponse,
  CourseListResponse,
  CourseSummary,
} from "@veolms/contracts";
import { courseKeys } from "../../services/courses/courses.keys";
import { useEnrolledCourses } from "../../services/enrollments";

/** A course from any course list this tab has loaded (the Courses page's). */
function findListedCourse(
  lists: readonly (readonly [unknown, unknown])[],
  idOrSlug: string,
): CourseSummary | undefined {
  for (const [, data] of lists) {
    if (!data || typeof data !== "object") continue;
    const pages =
      "pages" in data
        ? (data as InfiniteData<CourseListResponse>).pages
        : [data as { courses?: CourseSummary[] }];
    for (const page of pages) {
      const found = page?.courses?.find(
        (course) => course.slug === idOrSlug || course.id === idOrSlug,
      );
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * What the course page can say about the viewer before its own access
 * answer is in, from what the Courses page (or this tab's copy of the
 * enrolled courses) already loaded: the price, whether the course is
 * theirs and their progress. The page draws its band from this at once and
 * the access answer, asked for as before, replaces it: only that answer
 * carries where to resume and the curriculum's version.
 *
 * A page loaded with its course built in (a reload) has no list to read;
 * the course and its price as the site was built (`builtCourse`) stand in
 * for it.
 *
 * Undefined when it cannot be told: the course is in no list this tab has
 * and was not built in, or a signed-in learner's enrolments are not known
 * yet.
 */
export function useProvisionalCourseAccess(
  idOrSlug: string | undefined,
  viewer: "guest" | "learner" | null,
  builtCourse?: Pick<
    CourseSummary,
    "id" | "slug" | "pricing" | "canSelfEnroll"
  > | null,
): CourseAccessResponse | undefined {
  const queryClient = useQueryClient();
  // A signed-in learner's list is asked for here too (one small answer,
  // usually the tab's copy, see `accountSessionCopies`): a page opened
  // straight from an address has no other page that asked for it, and
  // without it neither this stand-in nor the next reload's first paint
  // knows whether the course is theirs.
  const enrolments = useEnrolledCourses({ enabled: viewer === "learner" }).data;
  if (!idOrSlug || !viewer) return undefined;
  const listed =
    findListedCourse(
      queryClient.getQueriesData({ queryKey: courseKeys.lists() }),
      idOrSlug,
    ) ??
    builtCourse ??
    undefined;
  if (!listed?.pricing) return undefined;
  if (viewer === "learner" && !enrolments) return undefined;

  const held = enrolments?.courses.find(
    (course) =>
      course.courseId === listed.id || course.courseSlug === listed.slug,
  );
  const enrolled = viewer === "learner" && Boolean(held);
  const lastAccessedAt = held?.lastAccessedAt;
  return {
    courseId: listed.id,
    slug: listed.slug,
    viewer,
    access: enrolled ? "full" : "limited",
    firstLessonOpen: false,
    lockedLessonsNeed: enrolled
      ? null
      : viewer === "guest"
        ? "sign-in"
        : "purchase",
    enrolled,
    canSelfEnroll: listed.canSelfEnroll ?? true,
    pricing: {
      ...listed.pricing,
      showDiscountBadge: listed.pricing.showDiscountBadge ?? false,
      international: listed.pricing.international ?? null,
    },
    progress:
      enrolled && held
        ? {
            percent: Math.round(held.progress ?? 0),
            started: (held.progress ?? 0) > 0 || Boolean(lastAccessedAt),
            lastAccessedAt:
              lastAccessedAt instanceof Date
                ? lastAccessedAt.toISOString()
                : (lastAccessedAt ?? null),
          }
        : null,
    mayJoinDiscussions: false,
    resume: null,
    // Not known from a list; nothing compares it while this stands in.
    curriculumVersion: "",
  };
}
