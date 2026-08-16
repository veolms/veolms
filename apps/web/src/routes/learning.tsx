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
  COURSE_PLAYER_SESSION_STORAGE_KEY,
  clearRememberedCoursePlayerDestination,
  getActiveCoursePlayerSession,
  getCoursePlayerBackLabel,
  getCoursePlayerOrigin,
  getCoursePlayerParentPath,
  getCoursePlayerPath,
  getStoredCourseLessonId,
  rememberCoursePlayerDestination,
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
  const lessonId = courseSlug
    ? (resolveLessonIdentifier(lectureSlug) ??
      getStoredCourseLessonId(courseSlug))
    : 1;
  const canonicalPath = courseSlug
    ? getCoursePlayerPath(courseSlug, origin, lessonId)
    : getCoursePlayerParentPath(origin);

  useEffect(() => {
    const currentPath = `${location.pathname}${location.search}`;
    if (currentPath !== canonicalPath) {
      void navigate(canonicalPath, { replace: true });
    }
  }, [canonicalPath, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (courseSlug)
      rememberCoursePlayerDestination(courseSlug, origin, lessonId);
  }, [courseSlug, lessonId, origin]);

  useEffect(() => {
    if (!courseSlug) return undefined;
    const closeReplacedSession = (event: StorageEvent) => {
      if (event.key !== COURSE_PLAYER_SESSION_STORAGE_KEY) return;
      const activeSession = getActiveCoursePlayerSession();
      if (activeSession?.path === canonicalPath) return;
      void navigate(getCoursePlayerParentPath(origin), { replace: true });
    };
    window.addEventListener("storage", closeReplacedSession);
    return () => window.removeEventListener("storage", closeReplacedSession);
  }, [canonicalPath, courseSlug, navigate, origin]);

  return (
    <LearningWorkspace
      key={courseSlug}
      courseSlug={courseSlug}
      lessonId={lessonId}
      backLabel={getCoursePlayerBackLabel(origin)}
      onSelectLesson={(nextLessonId) => {
        if (!courseSlug) return;
        const path = rememberCoursePlayerDestination(
          courseSlug,
          origin,
          nextLessonId,
        );
        void navigate(path, { preventScrollReset: true });
      }}
      onNavigateBack={() => {
        clearRememberedCoursePlayerDestination(origin);
        navigateTo(getCoursePlayerParentPath(origin));
      }}
    />
  );
}
