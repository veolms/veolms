import { Navigate, useLocation, useParams } from "react-router";
import { isStudentCatalogueFilterSubpath } from "../courses/catalogueRoutes";
import { normalizeNavigationPath } from "../routing/routeDescriptors";

export default function LegacyLearningRoute() {
  const { courseSlug, lectureSlug } = useParams();
  const location = useLocation();

  if (!courseSlug) return <Navigate replace to="/courses" />;
  if (
    !lectureSlug &&
    isStudentCatalogueFilterSubpath(normalizeNavigationPath(`/courses/${courseSlug}`))
  ) {
    return null;
  }
  if (lectureSlug === "overview")
    return (
      <Navigate
        replace
        to={`/courses/${encodeURIComponent(courseSlug)}/overview${location.search}`}
      />
    );

  return (
    <Navigate
      replace
      to={`/learn/${encodeURIComponent(courseSlug)}${lectureSlug ? `/${encodeURIComponent(lectureSlug)}` : ""}${location.search}`}
    />
  );
}
