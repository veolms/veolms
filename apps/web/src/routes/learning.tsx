import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router";
import type { CourseLesson } from "@veolms/contracts";
import type { Route } from "./+types/learning";
import {
  getLearningPlaybackRequestMetadata,
  LEARNING_COURSE_SLUG_META_NAME,
  LEARNING_LESSON_NUMBER_META_NAME,
} from "../learning/learningHlsBootstrap";
import { resolveLessonIdentifier } from "../learning/courseContent";
import { LearningWorkspaceFallback } from "../learning/LearningWorkspaceFallback";
import {
  getCoursePlayerNote,
  getCoursePlayerPath,
  getCoursePlayerThread,
  getCoursePlayerThreadFocus,
  getStoredCourseLessonId,
  migrateCoursePlayerSessionKey,
  upsertCoursePlayerSessionFromRoute,
} from "../learning/coursePlayerNavigation";
import {
  getLearningReturnLocation,
  getLearningReturnLocationServerSnapshot,
  subscribeToLearningReturnLocation,
} from "../learning/learningReturnLocation";
import { getRouteMeta } from "../routing/routeDescriptors";
import {
  buildLoginPath,
  keepLoginDialogOpen,
  stripLoginDialogParams,
} from "../routing/routeAccess";
import { useCurrentUser } from "../services/auth";
import { useCourseOverview } from "../services/courses";
import { withKeepScroll } from "../shell/applicationScroll";
import { useAuthStore } from "../store/auth.store";
import type { AcademyOutletContext } from "./academy-layout";
import type { LearningMiniPlayerRequest } from "../learning/player/learningMiniPlayerTypes";
import { getVideoPlaybackApiOrigin } from "../learning/videoPlaybackBootstrap";
import { useMyQuizAssignments } from "../services/quizzes";

const LearningWorkspace = lazy(() =>
  import("../learning/LearningWorkspace").then((module) => ({
    default: module.LearningWorkspace,
  })),
);

export function meta({ location, matches, params }: Route.MetaArgs) {
  const descriptors = Object.entries(
    getRouteMeta("learning", params, location.pathname, matches),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
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
  return [...descriptors, ...safeMetadata];
}

export function links() {
  const apiOrigin = getVideoPlaybackApiOrigin();
  return apiOrigin
    ? [{ rel: "preconnect", href: apiOrigin, crossOrigin: "anonymous" }]
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
  // The page the player was opened from. Minimizing goes back to it.
  const playerReturnPath = useSyncExternalStore(
    subscribeToLearningReturnLocation,
    getLearningReturnLocation,
    getLearningReturnLocationServerSnapshot,
  ).path;
  const { data: courseOverview, isLoading: isCourseOverviewLoading } =
    useCourseOverview(courseSlug, {
      enabled: Boolean(courseSlug),
    });
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
  const hasDiscussionReturnPath = isDiscussionsReturnPath(playerReturnPath);

  const canonicalCourseSlug = courseOverview?.course.slug;
  const hasExplicitLectureSlug = lectureSlug !== undefined;
  const resolvedExplicitLessonId = hasExplicitLectureSlug
    ? resolveLessonIdentifier(lectureSlug)
    : null;
  const routeLessonId = hasExplicitLectureSlug
    ? (resolvedExplicitLessonId ?? 1)
    : courseSlug
      ? getStoredCourseLessonId(courseSlug)
      : 1;

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
    const idx = allApiLessons.findIndex(
      (l: CourseLesson) => l.id === targetLessonUuid,
    );
    return idx >= 0 ? idx + 1 : null;
  }, [targetLessonUuid, allApiLessons]);

  const lessonId = resolvedFromUuid ?? routeLessonId;
  // Any link that names its lesson by id — a discussion deep link or a quiz
  // link from the Quizzes page or a notification — has to wait for the course
  // to load. Canonicalising earlier rewrote the address to the last-watched
  // lesson and dropped the id.
  const isLessonUuidResolutionPending = Boolean(
    targetLessonUuid && isCourseOverviewLoading && !courseOverview,
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
          null,
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

    // The login pop-up's parameters are not part of the lesson's address:
    // they are left out of the comparison and carried over a rewrite.
    const currentPath = `${location.pathname}${stripLoginDialogParams(location.search)}`;
    const nextPath = courseSlug
      ? upsertCoursePlayerSessionFromRoute(
          courseSlug,
          location.search,
          lessonId,
        )
      : playerReturnPath;
    if (currentPath !== nextPath) {
      void navigate(keepLoginDialogOpen(location.search, nextPath), {
        replace: true,
        state: withKeepScroll(location.state),
      });
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
    playerReturnPath,
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
    const nextPath = getCoursePlayerPath(canonicalCourseSlug, lessonId, {
      threadId,
      threadFocus: getCoursePlayerThreadFocus(location.search),
      noteId: noteDeepLinkId,
      view: isQuizViewRequested ? "quiz" : undefined,
    });
    void navigate(keepLoginDialogOpen(location.search, nextPath), {
      replace: true,
      state: withKeepScroll(location.state),
    });
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
    threadDeepLinkId,
  ]);

  const selectLesson = useCallback(
    (nextLessonId: number, view?: "video" | "quiz") => {
      if (!courseSlug) return;
      const isSameLesson = nextLessonId === lessonId;
      const noteId = isSameLesson ? getCoursePlayerNote(location.search) : null;
      const threadId =
        isSameLesson && !noteId ? getCoursePlayerThread(location.search) : null;
      const path = getCoursePlayerPath(courseSlug, nextLessonId, {
        threadId,
        threadFocus: getCoursePlayerThreadFocus(location.search),
        noteId,
        view,
      });
      navigateTo(path, { exact: true });
    },
    [courseSlug, lessonId, location.search, navigateTo],
  );
  const openCourseOverview = useCallback(() => {
    if (!courseSlug) return;
    if (hasDiscussionReturnPath) {
      navigateTo(playerReturnPath, { exact: true, replace: true });
      return;
    }
    navigateTo(`/courses/${encodeURIComponent(courseSlug)}/overview`);
  }, [courseSlug, hasDiscussionReturnPath, navigateTo, playerReturnPath]);
  const openLogin = useCallback(() => {
    navigateTo(
      buildLoginPath(
        `${location.pathname}${stripLoginDialogParams(location.search)}`,
      ),
      {
        exact: true,
      },
    );
  }, [location.pathname, location.search, navigateTo]);
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
    <Suspense fallback={<LearningWorkspaceFallback />}>
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
        onOpenLogin={openLogin}
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
    </Suspense>
  );
}
