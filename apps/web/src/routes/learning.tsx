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
  const { navigateTo } = useOutletContext<AcademyOutletContext>();
  const origin = getCoursePlayerOrigin(location.search);
  const routeReturnPath = getCoursePlayerReturnPath(location.search);
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

  return (
    <LearningWorkspace
      key={courseSlug}
      courseSlug={courseSlug}
      lessonId={lessonId}
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
