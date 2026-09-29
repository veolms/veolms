import type { LoaderFunctionArgs } from "react-router";
import { publicCourseApi } from "../lib/public-course-api";

export { default, meta } from "./public-courses";

export function clientLoader({ request }: LoaderFunctionArgs) {
  return publicCourseApi.list(request);
}
