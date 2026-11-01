import { useCallback, useSyncExternalStore } from "react";
import { useLocation, useMatches, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { CourseOverviewResponse } from "@veolms/contracts";
import { courseKeys } from "../services/courses";
import { configuredSiteOrigin } from "./configuredSiteOrigin";
import { getCourseDocumentTitle, getCourseHeadTags } from "./routeDescriptors";
import { useDocumentHeadTags } from "./useDocumentHeadTags";
import { useDocumentTitle } from "./useDocumentTitle";

const getServerCourse = () => undefined;

/**
 * On the course overview page, puts the course's own name in the tab title
 * and its description, picture and address in the head's description, share
 * (`og:`) and canonical tags once the page has fetched the course; leaving
 * the page puts those tags back. It only reads what the page's own request
 * left in the query cache: it makes no request and does not take part in
 * that query, so the page loads exactly as before.
 *
 * The address is the site's public one when the build was given it, the
 * same the route's `meta` wrote into the built page, so the two never
 * disagree; otherwise it is the address the page is being served from.
 */
export function useCourseOverviewDocumentTitle(active: boolean): void {
  const matches = useMatches();
  const { pathname } = useLocation();
  const { courseSlug } = useParams();
  const queryClient = useQueryClient();
  const slug = active ? courseSlug : undefined;

  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient],
  );
  const getCourse = useCallback(
    () =>
      slug
        ? (queryClient.getQueryData<CourseOverviewResponse>(
            courseKeys.overview(slug),
          )?.course ??
          // Visitors' pages read the public curriculum, not the overview.
          queryClient.getQueryData<CourseOverviewResponse>(
            courseKeys.publicCurriculum(slug),
          )?.course)
        : undefined,
    [queryClient, slug],
  );
  const course = useSyncExternalStore(subscribe, getCourse, getServerCourse);

  useDocumentTitle(
    slug
      ? getCourseDocumentTitle(
          "course-overview",
          { courseSlug: slug },
          pathname,
          matches,
          { courseTitle: course?.title },
        )
      : undefined,
  );
  useDocumentHeadTags(
    course?.title.trim()
      ? getCourseHeadTags(
          course,
          configuredSiteOrigin ?? window.location.origin,
        )
      : undefined,
  );
}
