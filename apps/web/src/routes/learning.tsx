import { useEffect, useState } from "react";
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router";
import type { Route } from "./+types/learning";
import { LearningWorkspace } from "../learning/LearningWorkspace";
import { resolveLessonIdentifier } from "../learning/courseContent";
import {
  getCoursePlayerBackLabel,
  getCoursePlayerOrigin,
  getCoursePlayerPath,
  getCoursePlayerReturnPath,
  getCoursePlayerSession,
  getStoredCourseLessonId,
  upsertCoursePlayerSessionFromRoute,
} from "../learning/coursePlayerNavigation";
import { getRouteMeta } from "../routing/routeDescriptors";
import type { AcademyOutletContext } from "./academy-layout";

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
    openLearningMiniPlayer,
  } = useOutletContext<AcademyOutletContext>();
  // Prerendered lesson documents are shared by every valid `from` query.
  // Start from the canonical course origin on both server and client, then
  // apply query-derived navigation after hydration to avoid stale attributes.
  const [hydratedSearch, setHydratedSearch] = useState("");
  const [storedLessonId, setStoredLessonId] = useState(1);
  const routeLessonId = resolveLessonIdentifier(lectureSlug);
  const [storedLessonReady, setStoredLessonReady] = useState(
    routeLessonId !== null,
  );
  const origin = getCoursePlayerOrigin(hydratedSearch);
  const routeReturnPath = getCoursePlayerReturnPath(hydratedSearch);
  const lessonId = routeLessonId ?? storedLessonId;

  useEffect(() => {
    setHydratedSearch(location.search);
  }, [location.search]);

  useEffect(() => {
    if (!courseSlug || routeLessonId !== null) {
      setStoredLessonReady(true);
      return;
    }
    setStoredLessonId(getStoredCourseLessonId(courseSlug));
    setStoredLessonReady(true);
  }, [courseSlug, routeLessonId]);

  useEffect(() => {
    if (routeLessonId === null && !storedLessonReady) return;
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
    lessonId,
    location.pathname,
    location.search,
    navigate,
    routeLessonId,
    routeReturnPath,
    storedLessonReady,
  ]);

  return (
    <LearningWorkspace
      key={courseSlug}
      courseSlug={courseSlug}
      lessonId={lessonId}
      lessonPersistenceReady={routeLessonId !== null || storedLessonReady}
      mobileBottomNavigation={mobileBottomNavigation}
      mobileBottomNavigationHidden={mobileBottomNavigationHidden}
      backLabel={getCoursePlayerBackLabel(routeReturnPath)}
      onSelectLesson={(nextLessonId) => {
        if (!courseSlug) return;
        const path = getCoursePlayerPath(
          courseSlug,
          origin,
          nextLessonId,
          getCoursePlayerSession(courseSlug)?.returnPath || routeReturnPath,
        );
        void navigate(path, { preventScrollReset: true });
      }}
      onOpenCourseOverview={() => {
        if (!courseSlug) return;
        navigateTo(`/courses/${encodeURIComponent(courseSlug)}/overview`);
      }}
      onNavigateBack={() => {
        navigateTo(
          (courseSlug && getCoursePlayerSession(courseSlug)?.returnPath) ||
            routeReturnPath,
          { exact: true },
        );
      }}
      onMinimizePlayer={(request) => {
        const returnPath =
          (courseSlug && getCoursePlayerSession(courseSlug)?.returnPath) ||
          routeReturnPath;
        openLearningMiniPlayer({
          ...request,
          lessonPath: `${location.pathname}${location.search}`,
          returnPath,
        });
        navigateTo(returnPath, { exact: true });
      }}
    />
  );
}
