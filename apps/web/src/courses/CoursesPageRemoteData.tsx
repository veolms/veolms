import { useEffect, type MutableRefObject } from "react";
import { useCurrentUser } from "../services/auth";
import {
  useCourses,
  useDeleteCourse,
  useDeletedCourses,
  useMyCourses,
  useRestoreCourse,
} from "../services/courses";
import type { CourseEnrollmentFilter, CourseRole } from "./catalogue";
import type {
  CoursesPageRemoteActions,
  CoursesPageRemoteSnapshot,
} from "./CoursesPageRemoteData.types";
import { EMPTY_COURSES_PAGE_REMOTE_ACTIONS } from "./CoursesPageRemoteData.types";

interface CoursesPageRemoteDataProps {
  actionsRef: MutableRefObject<CoursesPageRemoteActions>;
  currentUserQueryEnabled: boolean;
  enrollmentFilter: CourseEnrollmentFilter;
  onSnapshot: (snapshot: CoursesPageRemoteSnapshot) => void;
  role: CourseRole;
}

/**
 * Owns the authenticated academy's server state. The public learning route
 * never renders this bridge, so its API client and query/mutation runtime stay
 * out of the lesson's initial request graph.
 */
export function CoursesPageRemoteData({
  actionsRef,
  currentUserQueryEnabled,
  enrollmentFilter,
  onSnapshot,
  role,
}: CoursesPageRemoteDataProps) {
  const { data: authUser, isFetched: authUserFetched } = useCurrentUser({
    enabled: currentUserQueryEnabled,
  });
  const { data: publishedCoursesData } = useCourses({
    enabled: role === "student",
  });
  const { data: myCoursesData } = useMyCourses({
    enabled: role === "creator" && enrollmentFilter !== "bin",
  });
  const { data: deletedCoursesData } = useDeletedCourses(undefined, {
    enabled: role === "creator" && enrollmentFilter === "bin",
  });
  const deleteCourseMutation = useDeleteCourse();
  const restoreCourseMutation = useRestoreCourse();

  useEffect(() => {
    actionsRef.current = {
      deleteCourse: deleteCourseMutation.mutateAsync,
      restoreCourse: restoreCourseMutation.mutateAsync,
    };
    return () => {
      actionsRef.current = EMPTY_COURSES_PAGE_REMOTE_ACTIONS;
    };
  }, [
    actionsRef,
    deleteCourseMutation.mutateAsync,
    restoreCourseMutation.mutateAsync,
  ]);

  useEffect(() => {
    onSnapshot({
      authUser,
      authUserFetched,
      publishedCourses: publishedCoursesData?.courses ?? [],
      myCourses: myCoursesData?.courses ?? [],
      deletedCourses: deletedCoursesData?.courses ?? [],
    });
  }, [
    authUser,
    authUserFetched,
    deletedCoursesData?.courses,
    myCoursesData?.courses,
    onSnapshot,
    publishedCoursesData?.courses,
  ]);

  return null;
}
