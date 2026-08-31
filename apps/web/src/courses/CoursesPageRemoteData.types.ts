import type {
  CourseSummary,
  CurrentUserResponse,
  DeletedCoursesListResponse,
  MyCoursesListResponse,
} from "@veolms/contracts";

export interface CoursesPageRemoteSnapshot {
  authUser: CurrentUserResponse | undefined;
  authUserFetched: boolean;
  publishedCourses: CourseSummary[];
  myCourses: MyCoursesListResponse["courses"];
  deletedCourses: DeletedCoursesListResponse["courses"];
}

export interface CoursesPageRemoteActions {
  deleteCourse: (courseId: string) => Promise<unknown>;
  restoreCourse: (courseId: string) => Promise<unknown>;
}

export const EMPTY_COURSES_PAGE_REMOTE_SNAPSHOT: CoursesPageRemoteSnapshot = {
  authUser: undefined,
  authUserFetched: false,
  publishedCourses: [],
  myCourses: [],
  deletedCourses: [],
};

const unavailableAction = () =>
  Promise.reject(new Error("Course data is still loading."));

export const EMPTY_COURSES_PAGE_REMOTE_ACTIONS: CoursesPageRemoteActions = {
  deleteCourse: unavailableAction,
  restoreCourse: unavailableAction,
};
