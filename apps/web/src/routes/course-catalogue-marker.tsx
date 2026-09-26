import type { Route } from "./+types/course-catalogue-marker";
import type { LoaderFunctionArgs } from "react-router";
import {
  isBuildPrerenderWithoutPublicApi,
  publicCourseApi,
} from "../lib/public-course-api";
import { getRouteMeta } from "../routing/routeDescriptors";

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (params.courseSlug) {
    return {
      publicCourseOverview: await publicCourseApi.overview(
        request,
        params.courseSlug,
      ),
    };
  }

  if (isBuildPrerenderWithoutPublicApi()) {
    throw new Error("Public course data is required to build the SSG catalogue.");
  }
  return { publicCourses: await publicCourseApi.list(request) };
}

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function CourseCatalogueMarker() {
  return null;
}
