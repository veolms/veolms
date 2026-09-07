import { useCallback, useEffect, useRef } from "react";
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router";
import type { Route } from "./+types/learning";
import { LearningWorkspace } from "../learning/LearningWorkspace";
import {
  getLearningHlsBootstrap,
  getLearningHlsPreconnectHref,
  LEARNING_HLS_MANIFEST_META_NAME,
  LEARNING_HLS_MEDIA_KEY_META_NAME,
} from "../learning/learningHlsBootstrap";
import { resolveLessonIdentifier } from "../learning/courseContent";
import {
  courses as localCourses,
  getApiCourseSlugForLegacyKey,
  getCourseRouteKey,
} from "../courses/catalogue";
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
import { useCourseOverview } from "../services/courses";
import { useUpsertLearningSpaceSession } from "../services/learning-space";
import { useAuthStore } from "../store/auth.store";
import type { AcademyOutletContext } from "./academy-layout";
import type { LearningMiniPlayerRequest } from "../learning/player/learningMiniPlayerTypes";

const COURSE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IdleSchedulerWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleLearningSessionSync(sync: () => void) {
  const idleWindow = window as IdleSchedulerWindow;
  let idleHandle: number | undefined;
  let timeoutHandle: number | undefined;

  if (idleWindow.requestIdleCallback) {
    idleHandle = idleWindow.requestIdleCallback(sync, { timeout: 1500 });
  } else {
    // Keep the fallback outside the initial render window in browsers without
    // requestIdleCallback.
    timeoutHandle = window.setTimeout(sync, 1000);
  }

  return () => {
    if (idleHandle !== undefined && idleWindow.cancelIdleCallback) {
      idleWindow.cancelIdleCallback(idleHandle);
    }
    if (timeoutHandle !== undefined) {
      window.clearTimeout(timeoutHandle);
    }
  };
}

export function meta({ location, params }: Route.MetaArgs) {
  const descriptors = Object.entries(
    getRouteMeta("learning", params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
  const bootstrap = getLearningHlsBootstrap(params);
  if (!bootstrap) return descriptors;
  return [
    ...descriptors,
    { name: LEARNING_HLS_MANIFEST_META_NAME, content: bootstrap.manifestUrl },
    { name: LEARNING_HLS_MEDIA_KEY_META_NAME, content: bootstrap.mediaKey },
  ];
}

export function links(args?: Pick<Route.MetaArgs, "params">) {
  const bootstrap = getLearningHlsBootstrap(args?.params ?? {});
  if (!bootstrap) return [];
  const preconnectHref = getLearningHlsPreconnectHref(bootstrap.manifestUrl);
  return preconnectHref
    ? [{ rel: "preconnect", href: preconnectHref, crossOrigin: "anonymous" }]
    : [];
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
  const origin = getCoursePlayerOrigin(location.search);
  const routeReturnPath = getCoursePlayerReturnPath(location.search);
  const resolvesLegacyCourseId = Boolean(
    courseSlug && COURSE_ID_PATTERN.test(courseSlug),
  );
  const apiCourseSlugForKey = getApiCourseSlugForLegacyKey(courseSlug);
  const isLocalCourseKey = localCourses.some(
    (course) => getCourseRouteKey(course) === courseSlug,
  );
  // Start the curriculum request from the route itself. It must not wait for
  // `/auth/me`: the player and the SSG curriculum can render immediately,
  // while this query refreshes the static fallback in parallel.
  const courseOverviewKey =
    courseSlug &&
    (resolvesLegacyCourseId || apiCourseSlugForKey || !isLocalCourseKey)
      ? (apiCourseSlugForKey ?? courseSlug)
      : undefined;
  const { data: courseOverview } = useCourseOverview(courseOverviewKey, {
    enabled: Boolean(courseOverviewKey),
  });
  const { data: authUser } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const activeUser = authUser || storeUser;
  const { mutate: upsertLearningSpaceSession } = useUpsertLearningSpaceSession(
    activeUser?.id,
  );
  const lastSyncedSessionRef = useRef<string | null>(null);
  const canonicalCourseSlug = courseOverview?.course.slug;
  const lessonId = courseSlug
    ? (resolveLessonIdentifier(lectureSlug) ??
      getStoredCourseLessonId(courseSlug))
    : 1;
  useEffect(() => {
    let cancelScheduledSessionSync = () => {};
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

    // Keep local playback working for demo/legacy routes without fetching the
    // full course catalogue just to resolve a session key. Known legacy keys
    // map synchronously; real API slugs can be persisted directly, while
    // local/demo-only keys are intentionally not sent to the API.
    const resolvedApiCourseKey =
      canonicalCourseSlug ??
      apiCourseSlugForKey ??
      (courseSlug && !resolvesLegacyCourseId && !isLocalCourseKey
        ? courseSlug
        : undefined);
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
        cancelScheduledSessionSync = scheduleLearningSessionSync(() => {
          if (lastSyncedSessionRef.current === syncKey) return;
          lastSyncedSessionRef.current = syncKey;
          upsertLearningSpaceSession({
            courseKey,
            payload: {
              lessonKey: String(session?.lessonId ?? lessonId),
              origin: session?.origin ?? origin,
              returnPath: session?.returnPath ?? routeReturnPath,
            },
          });
        });
      }
    }

    return () => cancelScheduledSessionSync();
  }, [
    activeUser,
    apiCourseSlugForKey,
    canonicalCourseSlug,
    courseSlug,
    isLocalCourseKey,
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
      courseOverview={courseOverview}
    />
  );
}
