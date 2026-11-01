import { useCallback, useMemo } from "react";
import { ALLOW_GUEST_LEARNING } from "../../../routing/routeAccess";
import {
  canPlayCourseLesson,
  getPublicPreviewLessonNumbers,
} from "../../coursePlayerAccess";
import { useAuthStore } from "../../../store/auth.store";
import { useCourseAccess } from "../../../services/courses";
import { useLearningCourse } from "../../useLearningCourse";
import { useCurrentUser } from "../../../services/auth";
import type { InteractionCapabilities } from "../../Discussion";
import type { AuthUser } from "../../../store/auth.store";
import type { ApiError } from "../../../lib/api-error";

export interface UseLearningCourseDataArgs {
  courseSlug: string | undefined;
}

export interface UseLearningCourseDataResult {
  isAuthenticated: boolean;
  resolvedAuthUser: AuthUser | null;
  isAuthResolutionPending: boolean;
  /**
   * What the viewer may do with the course, decided by the server by the
   * rule playback applies: which lessons open, and whether they manage it.
   */
  courseAccessQuery: ReturnType<typeof useCourseAccess>;
  isApiRoute: boolean;
  courseOverview: ReturnType<typeof useLearningCourse>["data"];
  /** Whether `courseOverview` lists every lesson (see `useLearningCourse`). */
  isCourseOverviewComplete: boolean;
  isCourseOverviewLoading: boolean;
  isCourseOverviewError: boolean;
  courseOverviewError: ApiError | null;
  isCourseOverviewFetching: boolean;
  refetchCourseOverview: () => Promise<unknown>;
  isInteractionCapabilitiesLoading: boolean;
  interactionCapabilities: InteractionCapabilities;
  isLessonAvailable: (lessonNumber: number) => boolean;
  lessonStorageKey: string;
}

export function useLearningCourseData({
  courseSlug,
}: UseLearningCourseDataArgs): UseLearningCourseDataResult {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const storedAuthUser = useAuthStore((state) => state.user);
  const { data: currentUser, isFetched: isCurrentUserFetched } =
    useCurrentUser();
  const resolvedAuthUser =
    currentUser === undefined ? storedAuthUser : currentUser;
  const isAuthResolutionPending = !isCurrentUserFetched && !storedAuthUser;
  const isApiRoute = Boolean(courseSlug);
  const courseAccessQuery = useCourseAccess(courseSlug, {
    enabled: isApiRoute,
  });
  const {
    data: courseOverview,
    isComplete: isCourseOverviewComplete,
    isLoading: isCourseOverviewLoading,
    isError: isCourseOverviewError,
    error: courseOverviewError,
    isFetching: isCourseOverviewFetching,
    refetch: refetchCourseOverview,
  } = useLearningCourse(courseSlug, {
    enabled: isApiRoute,
  });
  const isInteractionCapabilitiesLoading =
    isApiRoute && isCourseOverviewLoading && !courseOverview;
  const allowComments = courseOverview?.settings?.allowComments ?? true;
  const allowNotes = courseOverview?.settings?.allowNotes ?? true;
  const allowQa = courseOverview?.settings?.allowQa ?? true;

  const interactionCapabilities: InteractionCapabilities = useMemo(() => {
    return {
      allowComments,
      allowNotes,
      allowQa,
    };
  }, [allowComments, allowNotes, allowQa]);
  const publicPreviewLessonNumbers = useMemo(
    () => getPublicPreviewLessonNumbers(courseOverview),
    [courseOverview],
  );
  const publicPreviewLessonSet = useMemo(
    () => new Set(publicPreviewLessonNumbers),
    [publicPreviewLessonNumbers],
  );
  const isLessonAvailable = useCallback(
    (lessonNumber: number) =>
      canPlayCourseLesson({
        allowGuestLearning: ALLOW_GUEST_LEARNING,
        isAuthenticated,
        lessonNumber,
        publicPreviewLessonNumbers: publicPreviewLessonSet,
      }),
    [isAuthenticated, publicPreviewLessonSet],
  );
  const lessonStorageKey = `veolms-last-lesson-${encodeURIComponent(courseSlug || "default")}`;
  return {
    isAuthenticated,
    resolvedAuthUser,
    isAuthResolutionPending,
    courseAccessQuery,
    isApiRoute,
    courseOverview,
    isCourseOverviewComplete,
    isCourseOverviewLoading,
    isCourseOverviewError,
    courseOverviewError,
    isCourseOverviewFetching,
    refetchCourseOverview,
    isInteractionCapabilitiesLoading,
    interactionCapabilities,
    isLessonAvailable,
    lessonStorageKey,
  };
}
