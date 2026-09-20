import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router";
import type { CourseLesson } from "@veolms/contracts";
import type { Route } from "./+types/learning";
import { LearningWorkspace } from "../learning/LearningWorkspace";
import {
  getLearningHlsBootstrap,
  getLearningHlsPreconnectHref,
  getLearningPlaybackRequestMetadata,
  LEARNING_COURSE_SLUG_META_NAME,
  LEARNING_HLS_MANIFEST_META_NAME,
  LEARNING_HLS_MEDIA_KEY_META_NAME,
  LEARNING_LESSON_NUMBER_META_NAME,
} from "../learning/learningHlsBootstrap";
import { resolveLessonIdentifier } from "../learning/courseContent";
import { getApiCourseSlugForLegacyKey } from "../courses/catalogue";
import {
  getCoursePlayerOrigin,
  getCoursePlayerNote,
  getCoursePlayerPath,
  getCoursePlayerReturnPath,
  getCoursePlayerSession,
  getCoursePlayerThread,
  getStoredCourseLessonId,
  migrateCoursePlayerSessionKey,
  upsertCoursePlayerSessionFromRoute,
} from "../learning/coursePlayerNavigation";
import { getRouteMeta } from "../routing/routeDescriptors";
import { useCurrentUser } from "../services/auth";
import { useCourseOverview, useCourses } from "../services/courses";
import { useAuthStore } from "../store/auth.store";
import type { AcademyOutletContext } from "./academy-layout";
import type { LearningMiniPlayerRequest } from "../learning/player/learningMiniPlayerTypes";
import { getVideoPlaybackApiOrigin } from "../learning/videoPlaybackBootstrap";
import { useMyQuizAssignments } from "../services/quizzes";

export function meta({ location, params }: Route.MetaArgs) {
  const descriptors = Object.entries(
    getRouteMeta("learning", params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
  const bootstrap = getLearningHlsBootstrap(params);
  const requestMetadata = getLearningPlaybackRequestMetadata(params);
  const safeMetadata = requestMetadata
    ? [
        {
          name: LEARNING_COURSE_SLUG_META_NAME,
          content: requestMetadata.courseSlug,
        },
        {
          name: LEARNING_LESSON_NUMBER_META_NAME,
          content: String(requestMetadata.lessonNumber),
        },
      ]
    : [];
  if (!bootstrap) return [...descriptors, ...safeMetadata];
  return [
    ...descriptors,
    ...safeMetadata,
    { name: LEARNING_HLS_MANIFEST_META_NAME, content: bootstrap.manifestUrl },
    { name: LEARNING_HLS_MEDIA_KEY_META_NAME, content: bootstrap.mediaKey },
  ];
}

export function links(args?: Pick<Route.MetaArgs, "params">) {
  const bootstrap = getLearningHlsBootstrap(args?.params ?? {});
  if (!bootstrap) {
    const apiOrigin = getVideoPlaybackApiOrigin();
    return apiOrigin
      ? [{ rel: "preconnect", href: apiOrigin, crossOrigin: "anonymous" }]
      : [];
  }
  const preconnectHref = getLearningHlsPreconnectHref(bootstrap.manifestUrl);
  return preconnectHref
    ? [{ rel: "preconnect", href: preconnectHref, crossOrigin: "anonymous" }]
    : [];
}

const isDiscussionsReturnPath = (returnPath: string): boolean => {
  const pathname =
    new URL(returnPath, "https://procodrr.local").pathname.replace(
      /\/+$/,
      "",
    ) || "/";
  return pathname === "/discussions" || pathname.startsWith("/discussions/");
};

export default function LearningRoute() {
  const { courseSlug, lectureSlug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const outletContext = useOutletContext<AcademyOutletContext>() ?? {};
  const {
    mobileBottomNavigation = false,
    mobileBottomNavigationHidden = false,
    navigateTo = (dest: any) =>
      navigate(typeof dest === "string" ? dest : dest.path),
    onLearningPlayerMinimizeGestureChange,
    onMiniPlayerRestoreReady,
    openLearningMiniPlayer = () => {},
    persistentPlayerMounted = false,
    registerPersistentPlayer,
  } = outletContext;
  const { data: authUser } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const activeUser = authUser || storeUser;
  const origin = getCoursePlayerOrigin(location.search);
  const routeReturnPath = getCoursePlayerReturnPath(location.search);
  const { data: courseOverview, isLoading: isCourseOverviewLoading } =
    useCourseOverview(courseSlug, {
      enabled: Boolean(courseSlug),
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
  const { data: myQuizAssignments, isLoading: myQuizAssignmentsLoading } =
    useMyQuizAssignments({
      enabled: Boolean(activeUser),
    });
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const targetLessonUuid = searchParams.get("lessonId");
  const threadDeepLinkId = getCoursePlayerThread(location.search);
  const noteDeepLinkId = getCoursePlayerNote(location.search);
  const hasDiscussionDeepLink = Boolean(threadDeepLinkId || noteDeepLinkId);
  const deepLinkLessonUuid =
    (threadDeepLinkId || noteDeepLinkId) && targetLessonUuid
      ? targetLessonUuid
      : null;
  const isQuizViewRequested = searchParams.get("view") === "quiz";
  const storedSessionReturnPath = courseSlug
    ? getCoursePlayerSession(courseSlug)?.returnPath
    : null;
  const playerReturnPath =
    searchParams.has("returnTo") ||
    !storedSessionReturnPath ||
    isDiscussionsReturnPath(storedSessionReturnPath)
      ? routeReturnPath
      : storedSessionReturnPath;
  const hasDiscussionReturnPath =
    searchParams.has("returnTo") && isDiscussionsReturnPath(routeReturnPath);

  const canonicalCourseSlug = courseOverview?.course.slug;
  const hasExplicitLectureSlug = lectureSlug !== undefined;
  const resolvedExplicitLessonId = hasExplicitLectureSlug
    ? resolveLessonIdentifier(lectureSlug)
    : null;
  const routeLessonId = hasExplicitLectureSlug
    ? (resolvedExplicitLessonId ?? 1)
    : (courseSlug ? getStoredCourseLessonId(courseSlug) : 1);

  const allApiLessons = useMemo<CourseLesson[]>(() => {
    if (!courseOverview?.sections) return [];
    return courseOverview.sections
      .slice()
      .sort((left, right) => left.position - right.position)
      .flatMap((section) =>
        (section.lessons ?? [])
          .slice()
          .sort((left, right) => left.position - right.position),
      );
  }, [courseOverview]);

  const resolvedFromUuid = useMemo(() => {
    if (!targetLessonUuid || allApiLessons.length === 0) return null;
    const idx = allApiLessons.findIndex((l: CourseLesson) => l.id === targetLessonUuid);
    return idx >= 0 ? idx + 1 : null;
  }, [targetLessonUuid, allApiLessons]);

  const lessonId = resolvedFromUuid ?? routeLessonId;
  const isLessonUuidResolutionPending = Boolean(
    deepLinkLessonUuid && isCourseOverviewLoading && !courseOverview,
  );
  const isDeepLinkRouteSettled =
    !hasDiscussionDeepLink ||
    Boolean(
      courseOverview &&
      canonicalCourseSlug &&
      canonicalCourseSlug === courseSlug &&
      hasExplicitLectureSlug &&
      resolvedExplicitLessonId !== null &&
      resolvedExplicitLessonId === lessonId &&
      !targetLessonUuid &&
      !isLessonUuidResolutionPending,
    );
  const apiLesson = allApiLessons[lessonId - 1];
  const quizAssignment = myQuizAssignments?.assignments.find(
    (assignment) =>
      assignment.courseId === courseOverview?.course.id &&
      assignment.lessonId === apiLesson?.id,
  );

  useLayoutEffect(() => {
    if (!courseSlug) return;

    // Hard navigations start from the root head script. This covers SPA lesson
    // changes, where React Router updates the lesson meta tags without a new
    // document and therefore cannot execute that script again.
    void import("../learning/earlyHlsPreload")
      .then(({ startEarlyHlsPreload }) =>
        startEarlyHlsPreload(
          getLearningHlsBootstrap({ courseSlug, lectureSlug }),
          getLearningPlaybackRequestMetadata({ courseSlug, lectureSlug }),
        ),
      )
      .catch(() => undefined);
  }, [courseSlug, lectureSlug]);

  useEffect(() => {
    if (isLessonUuidResolutionPending) return;
    if (
      hasDiscussionDeepLink &&
      (!courseOverview ||
        (canonicalCourseSlug && canonicalCourseSlug !== courseSlug))
    )
      return;

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
  }, [
    courseSlug,
    canonicalCourseSlug,
    courseOverview,
    hasDiscussionDeepLink,
    isLessonUuidResolutionPending,
    lessonId,
    location.pathname,
    location.search,
    navigate,
    routeReturnPath,
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
    if (hasDiscussionDeepLink && isLessonUuidResolutionPending) return;

    migrateCoursePlayerSessionKey(courseSlug, canonicalCourseSlug);
    const threadId = noteDeepLinkId ? null : threadDeepLinkId;
    const nextPath = getCoursePlayerPath(
      canonicalCourseSlug,
      origin,
      lessonId,
      routeReturnPath,
      {
        threadId,
        noteId: noteDeepLinkId,
        view: isQuizViewRequested ? "quiz" : undefined,
      },
    );
    void navigate(nextPath, { replace: true });
  }, [
    canonicalCourseSlug,
    courseSlug,
    hasDiscussionDeepLink,
    isQuizViewRequested,
    isLessonUuidResolutionPending,
    lessonId,
    location.search,
    navigate,
    noteDeepLinkId,
    origin,
    routeReturnPath,
    threadDeepLinkId,
  ]);

  const selectLesson = useCallback(
    (nextLessonId: number, view?: "video" | "quiz") => {
      if (!courseSlug) return;
      const isSameLesson = nextLessonId === lessonId;
      const noteId = isSameLesson ? getCoursePlayerNote(location.search) : null;
      const threadId =
        isSameLesson && !noteId ? getCoursePlayerThread(location.search) : null;
      const path = getCoursePlayerPath(
        courseSlug,
        origin,
        nextLessonId,
        playerReturnPath,
        { threadId, noteId, view },
      );
      navigateTo(path, { exact: true });
    },
    [
      courseSlug,
      lessonId,
      location.search,
      navigateTo,
      origin,
      playerReturnPath,
    ],
  );
  const openCourseOverview = useCallback(() => {
    if (!courseSlug) return;
    if (hasDiscussionReturnPath) {
      navigateTo(routeReturnPath, { exact: true, replace: true });
      return;
    }
    navigateTo(`/courses/${encodeURIComponent(courseSlug)}/overview`);
  }, [courseSlug, hasDiscussionReturnPath, navigateTo, routeReturnPath]);
  const minimizePlayer = useCallback(
    (request: LearningMiniPlayerRequest) => {
      openLearningMiniPlayer({
        ...request,
        lessonPath: `${location.pathname}${location.search}`,
        returnPath: playerReturnPath,
      });
    },
    [
      location.pathname,
      location.search,
      openLearningMiniPlayer,
      playerReturnPath,
    ],
  );

  return (
    <LearningWorkspace
      key={courseSlug}
      courseSlug={courseSlug}
      userId={activeUser?.id}
      lessonId={lessonId}
      initialLessonView={isQuizViewRequested ? "quiz" : "video"}
      mobileBottomNavigation={mobileBottomNavigation}
      mobileBottomNavigationHidden={mobileBottomNavigationHidden}
      onSelectLesson={selectLesson}
      onOpenCourseOverview={openCourseOverview}
      onMinimizeGestureChange={onLearningPlayerMinimizeGestureChange}
      onMiniPlayerRestoreReady={onMiniPlayerRestoreReady}
      persistentPlayerCourseRouteKey={courseSlug}
      persistentPlayerLessonPath={`${location.pathname}${location.search}`}
      persistentPlayerReturnPath={playerReturnPath}
      courseNavigationActionLabel={
        hasDiscussionReturnPath ? "Back to Discussions" : undefined
      }
      persistentPlayerMounted={persistentPlayerMounted}
      registerPersistentPlayer={registerPersistentPlayer}
      onMinimizePlayer={minimizePlayer}
      deepLinkLessonUuid={deepLinkLessonUuid}
      isDiscussionDeepLink={hasDiscussionDeepLink}
      deepLinkRouteSettled={isDeepLinkRouteSettled}
      noteDeepLinkId={noteDeepLinkId}
      quizAssignment={quizAssignment ?? null}
      quizAssignments={myQuizAssignments?.assignments ?? null}
      quizAssignmentLoading={myQuizAssignmentsLoading}
    />
  );
}
