import { useQuery, type QueryClient } from "@tanstack/react-query";
import type {
  GuestHomePageResponse,
  HomeDiscoveryResponse,
  HomePageLessonVideoOptionsResponse,
  HomePageOptionsResponse,
  HomePageSettingsResponse,
  LearnerHomeResponse,
} from "@veolms/contracts";
import {
  getEnrolledCourseKey,
  planLearnerHome,
} from "@veolms/contracts/learner-home-plan";
import type { ApiError } from "../../lib/api-error";
import { isLearnerView } from "../../lib/learner-view";
import {
  enrolledCoursesQueryOptions,
  enrollmentsService,
} from "../enrollments";
import {
  LEARNING_SUMMARY_STALE_MS,
  learningGoalKeys,
  learningGoalsService,
} from "../learning-goals";
import { learningProgressKeys } from "../learning-progress";
import { homeKeys } from "./home.keys";
import { homeService } from "./home.service";
import {
  GUEST_HOME_PAGE_SESSION_MAX_AGE_MS,
  readSessionGuestHomePage,
  saveSessionGuestHomePage,
} from "./home.session";

export function useHomeDiscovery(options?: {
  enabled?: boolean;
  initialData?: HomeDiscoveryResponse;
}) {
  return useQuery<HomeDiscoveryResponse, ApiError>({
    queryKey: homeKeys.discovery(),
    queryFn: () => homeService.getDiscovery(),
    enabled: options?.enabled ?? true,
    initialData: options?.initialData,
    retry: false,
    staleTime: options?.initialData ? Infinity : 60 * 1000,
  });
}

/**
 * The signed-out home page as this tab was last given it, or the API's
 * current one when the tab has none (or has had it for too long). Courses,
 * what students say and the page's words are the same for every visitor, so
 * one answer serves every reload and every return to the page in the tab.
 */
async function loadGuestHomePage(): Promise<GuestHomePageResponse> {
  const saved = readSessionGuestHomePage();
  if (saved) return saved.value;
  const page = await homeService.getGuestPage();
  saveSessionGuestHomePage(page);
  return page;
}

/**
 * The signed-out home page. `initialData` is the copy the production build
 * prerendered; it is treated as stale so the page is checked once `enabled`,
 * and only changes on screen when an admin has changed something since that
 * build. The check is answered by the tab's own copy when it has one, so it
 * reaches the API once per tab rather than on every load.
 */
export function useGuestHomePage(options?: {
  enabled?: boolean;
  initialData?: GuestHomePageResponse;
}) {
  return useQuery<GuestHomePageResponse, ApiError>({
    queryKey: homeKeys.guestPage(),
    queryFn: loadGuestHomePage,
    enabled: options?.enabled ?? true,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialData ? 0 : undefined,
    retry: false,
    staleTime: GUEST_HOME_PAGE_SESSION_MAX_AGE_MS,
    refetchOnWindowFocus: false,
  });
}

/**
 * Loads the signed-out home page ahead of a visit to it, so that opening it
 * from another page finds its courses and discussions already there.
 */
export function prefetchGuestHomePage(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: homeKeys.guestPage(),
    queryFn: loadGuestHomePage,
    staleTime: GUEST_HOME_PAGE_SESSION_MAX_AGE_MS,
  });
}

export function useHomePageSettings() {
  return useQuery<HomePageSettingsResponse, ApiError>({
    queryKey: homeKeys.pageSettings(),
    queryFn: () => homeService.getPageSettings(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useHomePageSettingsOptions() {
  return useQuery<HomePageOptionsResponse, ApiError>({
    queryKey: homeKeys.pageSettingsOptions(),
    queryFn: () => homeService.getPageSettingsOptions(),
    staleTime: 60 * 1000,
  });
}

/** The lessons of a course that have a video, for the hero video picker. */
export function useHomePageLessonVideoOptions(courseId: string | null) {
  return useQuery<HomePageLessonVideoOptionsResponse, ApiError>({
    queryKey: homeKeys.lessonVideoOptions(courseId ?? ""),
    queryFn: () => homeService.getLessonVideoOptions(courseId!),
    enabled: Boolean(courseId),
    staleTime: 60 * 1000,
  });
}

/**
 * Asks for a signed-in learner's home ahead of the page that shows it, in
 * one request: their courses, their goal summary, and where they are in the
 * course the home leads with.
 *
 * The home reads those from three queries of their own (`useEnrolledCourses`,
 * `useLearningSummary`, `useLearningProgressResumeContext`), and so does
 * everything that refreshes them after a lesson or a change of goal. So the
 * one answer is not kept as a query of its own: it is what those three are
 * filled from. The first two are fetched here through the shared request,
 * and a hook that mounts meanwhile joins that fetch instead of starting its
 * own; the third is put in place before the courses are, because the page
 * asks for it the moment it has them.
 *
 * Asked for separately, the third could only go out after the first had
 * answered, and the hero filled in over two round trips.
 *
 * If the one request fails (an API that does not have it yet, say) each
 * query falls back to its own endpoint, as before. Not when the failure is
 * that nobody is signed in: the other endpoints would only say the same.
 */
export function prefetchLearnerHome(
  queryClient: QueryClient,
  pinnedCourseId?: string | null,
) {
  let home: Promise<LearnerHomeResponse> | undefined;
  // Lessons are counted differently for an account in its Student view
  // (see lib/learner-view). The request can go out before the page knows
  // which view it is in; if the view has changed by the time the answer is
  // in, its place in the course was counted the other way and is left for
  // the page to ask for itself.
  const askedInLearnerView = isLearnerView();
  // Started only if a query below actually needs fetching.
  const loadHome = () =>
    (home ??= homeService.getLearnerHome(pinnedCourseId).then((answer) => {
      const heroCourse = planLearnerHome(
        answer.courses,
        pinnedCourseId,
      )?.heroCourse;
      if (
        heroCourse &&
        answer.resume?.courseId === heroCourse.courseId &&
        isLearnerView() === askedInLearnerView
      ) {
        queryClient.setQueryData(
          learningProgressKeys.resumeContext(getEnrolledCourseKey(heroCourse)),
          answer.resume,
        );
      }
      return answer;
    }));

  const orFromItsOwnEndpoint =
    <Result>(ask: () => Promise<Result>) =>
    (error: unknown): Promise<Result> =>
      (error as Partial<ApiError> | null)?.status === 401
        ? Promise.reject(error)
        : ask();

  const courses = enrolledCoursesQueryOptions();
  void queryClient.prefetchQuery({
    ...courses,
    queryFn: () =>
      loadHome().then(
        (answer) => ({ courses: answer.courses }),
        orFromItsOwnEndpoint(() => enrollmentsService.listEnrolledCourses()),
      ),
  });
  void queryClient.prefetchQuery({
    queryKey: learningGoalKeys.summary(),
    queryFn: () =>
      loadHome().then(
        (answer) => answer.summary,
        orFromItsOwnEndpoint(() => learningGoalsService.summary()),
      ),
    staleTime: LEARNING_SUMMARY_STALE_MS,
  });
}
