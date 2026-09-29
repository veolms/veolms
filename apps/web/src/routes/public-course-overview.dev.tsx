import type { LoaderFunctionArgs } from "react-router";
import { publicCourseApi } from "../lib/public-course-api";

export { default, meta } from "./public-course-overview";

export function clientLoader({ request, params }: LoaderFunctionArgs) {
  if (!params.courseSlug) {
    throw new Response("Course not found.", { status: 404 });
  }
  return publicCourseApi.overview(request, params.courseSlug);
}
