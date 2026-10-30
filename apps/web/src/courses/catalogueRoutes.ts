import type { CourseEnrollmentFilter } from "./catalogue";
import { normalizeNavigationPath } from "../routing/routeDescriptors";

const STUDENT_CATALOGUE_FILTER_PATHS: Readonly<
  Record<"enrolled" | "not-enrolled" | "free" | "wishlist", string>
> = {
  enrolled: "/courses/enrolled",
  "not-enrolled": "/courses/not-enrolled",
  free: "/courses/free",
  wishlist: "/courses/wishlist",
};

export function getStudentCatalogueEnrollmentFilterFromPath(
  pathname: string,
): Extract<
  CourseEnrollmentFilter,
  "all" | "enrolled" | "not-enrolled" | "free" | "wishlist"
> {
  const path = normalizeNavigationPath(pathname);
  if (path === STUDENT_CATALOGUE_FILTER_PATHS.enrolled) return "enrolled";
  if (path === STUDENT_CATALOGUE_FILTER_PATHS["not-enrolled"])
    return "not-enrolled";
  if (path === STUDENT_CATALOGUE_FILTER_PATHS.free) return "free";
  if (path === STUDENT_CATALOGUE_FILTER_PATHS.wishlist || path === "/wishlist")
    return "wishlist";
  return "all";
}

export function getStudentCataloguePathForEnrollmentFilter(
  filter: CourseEnrollmentFilter,
): string {
  if (filter === "enrolled") return STUDENT_CATALOGUE_FILTER_PATHS.enrolled;
  if (filter === "not-enrolled")
    return STUDENT_CATALOGUE_FILTER_PATHS["not-enrolled"];
  if (filter === "free") return STUDENT_CATALOGUE_FILTER_PATHS.free;
  if (filter === "wishlist") return STUDENT_CATALOGUE_FILTER_PATHS.wishlist;
  return "/courses";
}

export function isStudentCatalogueFilterPath(pathname: string): boolean {
  const path = normalizeNavigationPath(pathname);
  return (
    path === "/courses" ||
    path === STUDENT_CATALOGUE_FILTER_PATHS.enrolled ||
    path === STUDENT_CATALOGUE_FILTER_PATHS["not-enrolled"] ||
    path === STUDENT_CATALOGUE_FILTER_PATHS.free ||
    path === STUDENT_CATALOGUE_FILTER_PATHS.wishlist
  );
}

export function isStudentCatalogueFilterSubpath(pathname: string): boolean {
  const path = normalizeNavigationPath(pathname);
  return (
    path === STUDENT_CATALOGUE_FILTER_PATHS.enrolled ||
    path === STUDENT_CATALOGUE_FILTER_PATHS["not-enrolled"] ||
    path === STUDENT_CATALOGUE_FILTER_PATHS.free ||
    path === STUDENT_CATALOGUE_FILTER_PATHS.wishlist
  );
}

/** Route ids for catalogue filter URLs (must stay aligned with academy.routes.ts). */
export function getCatalogueRouteIdFromPath(pathname: string): string | null {
  const path = normalizeNavigationPath(pathname);
  if (path === "/courses") return "courses";
  if (path === STUDENT_CATALOGUE_FILTER_PATHS.enrolled)
    return "courses-enrolled";
  if (path === STUDENT_CATALOGUE_FILTER_PATHS["not-enrolled"])
    return "courses-not-enrolled";
  if (path === STUDENT_CATALOGUE_FILTER_PATHS.free) return "courses-free";
  if (path === STUDENT_CATALOGUE_FILTER_PATHS.wishlist)
    return "courses-wishlist";
  return null;
}
