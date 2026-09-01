import { useEffect } from "react";
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
  migrateCoursePlayerSessionKey,
  upsertCoursePlayerSessionFromRoute,
} from "../learning/coursePlayerNavigation";
import { getRouteMeta } from "../routing/routeDescriptors";
import { useCourseOverview } from "../services/courses";
import type { AcademyOutletContext } from "./academy-layout";

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
  const { mobileBottomNavigation, mobileBottomNavigationHidden, navigateTo } =
    useOutletContext<AcademyOutletContext>();
  const origin = getCoursePlayerOrigin(location.search);
  const routeReturnPath = getCoursePlayerReturnPath(location.search);
  const resolvesLegacyCourseId = Boolean(
    courseSlug && COURSE_ID_PATTERN.test(courseSlug),
  );
  const { data: courseOverview } = useCourseOverview(courseSlug, {
    enabled: resolvesLegacyCourseId,
  });
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
  }, [
    courseSlug,
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

  return (
    <LearningWorkspace
      key={courseSlug}
      courseSlug={courseSlug}
      lessonId={lessonId}
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
    />
  );
}
