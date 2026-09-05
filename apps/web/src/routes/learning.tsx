import { useCallback, useEffect, useRef } from "react";
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router";
import type { Route } from "./+types/learning";
import { LearningWorkspace } from "../learning/LearningWorkspace";
import { resolveLessonIdentifier } from "../learning/courseContent";
import { getApiCourseSlugForLegacyKey } from "../courses/catalogue";
import {
  getCoursePlayerOrigin,
  getCoursePlayerPath,
  getCoursePlayerReturnPath,
  getCoursePlayerSession,
  getStoredCourseLessonId,
  migrateCoursePlayerSessionKey,
  upsertCoursePlayerSessionFromRoute,
} from "../learning/coursePlayerNavigation";
import { getRouteMeta } from "../routing/routeDescriptors";
import { useCurrentUser } from "../services/auth";
import { useCourseOverview, useCourses } from "../services/courses";
import { useUpsertLearningSpaceSession } from "../services/learning-space";
import { useAuthStore } from "../store/auth.store";
import type { AcademyOutletContext } from "./academy-layout";
import type { LearningMiniPlayerRequest } from "../learning/player/learningMiniPlayerTypes";

const COURSE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function meta({ location, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta("learning", params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function LearningRoute() {
  const { courseSlug, lectureSlug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    mobileBottomNavigation,
    mobileBottomNavigationHidden,
    navigateTo,
    onLearningPlayerMinimizeGestureChange,
    onMiniPlayerRestoreReady,
    openLearningMiniPlayer,
    persistentPlayerMounted,
    registerPersistentPlayer,
  } = useOutletContext<AcademyOutletContext>();
  const { data: authUser } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const activeUser = authUser || storeUser;
  const { mutate: upsertLearningSpaceSession } = useUpsertLearningSpaceSession(
    activeUser?.id,
  );
  const lastSyncedSessionRef = useRef<string | null>(null);
  const origin = getCoursePlayerOrigin(location.search);
  const routeReturnPath = getCoursePlayerReturnPath(location.search);
  const resolvesLegacyCourseId = Boolean(
    courseSlug && COURSE_ID_PATTERN.test(courseSlug),
  );
  const { data: courseOverview } = useCourseOverview(courseSlug, {
    enabled: resolvesLegacyCourseId,
  });
  const { data: publishedCoursesData } = useCourses({
    enabled: Boolean(activeUser),
  });
  const apiCourseSlugForKey = getApiCourseSlugForLegacyKey(courseSlug);
  const apiCourse = publishedCoursesData?.courses.find(
    (course) =>
      course.id === courseSlug ||
      course.slug === courseSlug ||
      course.slug === apiCourseSlugForKey,
  );
  const canonicalCourseSlug = courseOverview?.course.slug;
  const lessonId = courseSlug
    ? (resolveLessonIdentifier(lectureSlug) ??
      getStoredCourseLessonId(courseSlug))
    : 1;
  useEffect(() => {
    const currentPath = `${location.pathname}${location.search}`;
    const nextPath = courseSlug
      ? upsertCoursePlayerSessionFromRoute(
          courseSlug,
          location.search,
          lessonId,
        )
      : routeReturnPath;
    if (currentPath !== nextPath) {
      void navigate(nextPath, { replace: true });
    }

    // Keep local playback working for demo/legacy routes, but only persist a
    // session when the course key is known by the API. This prevents stale
    // local IDs such as "backend-nodejs" from producing COURSE_NOT_FOUND.
    // A legacy key is eligible for persistence only when the current API
    // catalogue confirms its mapped course exists. If the API catalogue is
    // empty, this route belongs to the local/dummy catalogue instead.
    const resolvedApiCourseKey = apiCourse?.slug ?? canonicalCourseSlug;
    if (courseSlug && activeUser && resolvedApiCourseKey) {
      const session = getCoursePlayerSession(courseSlug);
      const courseKey = resolvedApiCourseKey;
      const syncKey = [
        activeUser.id,
        courseKey,
        session?.lessonId ?? lessonId,
        session?.origin ?? origin,
        session?.returnPath ?? routeReturnPath,
      ].join(":");
      if (lastSyncedSessionRef.current !== syncKey) {
        lastSyncedSessionRef.current = syncKey;
        upsertLearningSpaceSession({
          courseKey,
          payload: {
            lessonKey: String(session?.lessonId ?? lessonId),
            origin: session?.origin ?? origin,
            returnPath: session?.returnPath ?? routeReturnPath,
          },
        });
      }
    }
  }, [
    activeUser,
    apiCourse,
    apiCourseSlugForKey,
    canonicalCourseSlug,
    courseSlug,
    lessonId,
    location.pathname,
    location.search,
    navigate,
    origin,
    routeReturnPath,
    upsertLearningSpaceSession,
  ]);

  // Older saved sessions and shared links may still contain a course UUID.
  // Resolve it once and keep the public learning URL slug-based.
  useEffect(() => {
    if (
      !courseSlug ||
      !canonicalCourseSlug ||
      canonicalCourseSlug === courseSlug
    )
      return;

    migrateCoursePlayerSessionKey(courseSlug, canonicalCourseSlug);
    const nextPath = getCoursePlayerPath(
      canonicalCourseSlug,
      origin,
      lessonId,
      routeReturnPath,
    );
    void navigate(nextPath, { replace: true });
  }, [
    canonicalCourseSlug,
    courseSlug,
    lessonId,
    navigate,
    origin,
    routeReturnPath,
  ]);

  const selectLesson = useCallback(
    (nextLessonId: number) => {
      if (!courseSlug) return;
      const path = getCoursePlayerPath(
        courseSlug,
        origin,
        nextLessonId,
        getCoursePlayerSession(courseSlug)?.returnPath || routeReturnPath,
      );
      navigateTo(path, { exact: true });
    },
    [courseSlug, navigateTo, origin, routeReturnPath],
  );
  const openCourseOverview = useCallback(() => {
    if (!courseSlug) return;
    navigateTo(`/courses/${encodeURIComponent(courseSlug)}/overview`);
  }, [courseSlug, navigateTo]);
  const minimizePlayer = useCallback(
    (request: LearningMiniPlayerRequest) => {
      const returnPath =
        (courseSlug && getCoursePlayerSession(courseSlug)?.returnPath) ||
        routeReturnPath;
      openLearningMiniPlayer({
        ...request,
        lessonPath: `${location.pathname}${location.search}`,
        returnPath,
      });
    },
    [
      courseSlug,
      location.pathname,
      location.search,
      openLearningMiniPlayer,
      routeReturnPath,
    ],
  );

  return (
    <LearningWorkspace
      key={courseSlug}
      courseSlug={courseSlug}
      lessonId={lessonId}
      mobileBottomNavigation={mobileBottomNavigation}
      mobileBottomNavigationHidden={mobileBottomNavigationHidden}
      onSelectLesson={selectLesson}
      onOpenCourseOverview={openCourseOverview}
      onMinimizeGestureChange={onLearningPlayerMinimizeGestureChange}
      onMiniPlayerRestoreReady={onMiniPlayerRestoreReady}
      persistentPlayerCourseRouteKey={courseSlug}
      persistentPlayerLessonPath={`${location.pathname}${location.search}`}
      persistentPlayerReturnPath={
        (courseSlug && getCoursePlayerSession(courseSlug)?.returnPath) ||
        routeReturnPath
      }
      persistentPlayerMounted={persistentPlayerMounted}
      registerPersistentPlayer={registerPersistentPlayer}
      onMinimizePlayer={minimizePlayer}
    />
  );
}
