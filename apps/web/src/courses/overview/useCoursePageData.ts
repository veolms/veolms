import { useCallback, useState } from "react";
import type {
  CourseAccessResponse,
  CourseOverviewResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { prefersReducedData } from "../../lib/reduced-data";
import {
  useCourseAccess,
  useCourseOverview,
  useCoursePublicCurriculum,
  useStaticCurriculum,
} from "../../services/courses";
import {
  curriculumToOverview,
  type CourseCurriculumPreview,
} from "../staticCurriculum";
import { useProvisionalCourseAccess } from "./useProvisionalCourseAccess";

export interface CoursePageData {
  /** The course as the page draws it; undefined until something is in. */
  overview: CourseOverviewResponse | undefined;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  /** What the viewer may do with the course; undefined until it answers. */
  access: CourseAccessResponse | undefined;
  accessPending: boolean;
  /** How many sections the whole curriculum has. */
  totalSections: number | undefined;
  /** Whether `overview` holds every section, or the first ones only. */
  sectionsComplete: boolean;
  /** Fetches the sections the page was not built with: the reader asked. */
  requestAllSections: () => void;
  /**
   * The same, ahead of a press that looks likely (see
   * `useCurriculumIntent`); skipped when the connection asks to save data.
   */
  prefetchAllSections: () => void;
}

/**
 * Where a course page's course comes from. What every visitor sees is in
 * the page itself, built ahead of time: the course and its first sections.
 * The rest of the curriculum is a file the site was built with, fetched
 * when the reader is about to use it (a moment's hover on what shows or
 * uses it, a touch, the "Show all" button nearing the screen on a phone)
 * or asks for it. A visitor who only reads the top of the page never
 * downloads it. The viewer's own
 * part (the price in force, whether they hold the course, their progress,
 * whether they manage it) is one small answer from the API.
 *
 * A page opened from another one (not loaded with this course built in)
 * reads the same file, the copy the site was built with, at once. The
 * API's curriculum is asked for only when there is no such file (the dev
 * server, a course published after the build) or when the copy is older
 * than the course (the access answer carries the current version).
 *
 * Until the access answer is in, the viewer's part is drawn from what the
 * Courses page already loaded (`useProvisionalCourseAccess`).
 * The course's creator and admins get the whole overview, unpublished
 * lessons included, as do learners who hold an archived course, which has
 * no public curriculum.
 */
export function useCoursePageData({
  courseSlug,
  preview,
  enabled,
  awaitsAccess,
  viewerKind,
}: {
  courseSlug: string | undefined;
  preview: CourseCurriculumPreview | undefined;
  enabled: boolean;
  /** Whether the page waits for the access answer (a signed-in viewer). */
  awaitsAccess: boolean;
  /**
   * Who is looking, as far as the shell knows: a guest, a learner, or
   * someone the access answer alone can place (a creator, an unsettled
   * session), who gets no stand-in.
   */
  viewerKind: "guest" | "learner" | null;
}): CoursePageData {
  // The built course belongs to the page first loaded; another course's
  // route must not be drawn with it.
  const seeded =
    preview &&
    courseSlug &&
    (preview.curriculum.course.slug === courseSlug ||
      preview.curriculum.course.id === courseSlug)
      ? preview
      : undefined;

  const accessQuery = useCourseAccess(courseSlug, { enabled });
  const answeredAccess = accessQuery.data;
  const provisionalAccess = useProvisionalCourseAccess(
    courseSlug,
    viewerKind,
    seeded?.pricing
      ? {
          id: seeded.curriculum.course.id,
          slug: seeded.curriculum.course.slug,
          pricing: {
            ...seeded.pricing,
            salePrice: seeded.pricing.salePrice ?? null,
          },
          canSelfEnroll: seeded.curriculum.canSelfEnroll,
        }
      : null,
  );
  const access = answeredAccess ?? provisionalAccess;
  const isManager = answeredAccess?.viewer === "manager";
  const builtBeforeChange = Boolean(
    seeded &&
    answeredAccess &&
    answeredAccess.curriculumVersion !== seeded.curriculum.version,
  );

  const [wantsAllSections, setWantsAllSections] = useState(false);
  // Built in: the rest of the curriculum, when the reader wants it. Not
  // built in: the whole file the site was built with, at once.
  const needsFile =
    enabled &&
    !builtBeforeChange &&
    !isManager &&
    (seeded ? !seeded.complete && wantsAllSections : Boolean(courseSlug));
  const fileQuery = useStaticCurriculum(
    seeded?.curriculum.course.slug ?? courseSlug,
    seeded ? seeded.curriculum.version : null,
    { enabled: needsFile },
  );
  const fileMissing = fileQuery.isFetched && !fileQuery.data;
  const fileBehind = Boolean(
    !seeded &&
    answeredAccess &&
    fileQuery.data &&
    answeredAccess.curriculumVersion !== fileQuery.data.version,
  );

  const needsApiCurriculum =
    enabled &&
    !isManager &&
    (seeded
      ? builtBeforeChange || (wantsAllSections && fileMissing)
      : fileMissing || fileBehind);
  const apiCurriculum = useCoursePublicCurriculum(courseSlug, {
    enabled: needsApiCurriculum,
  });
  const publicCurriculumMissing =
    apiCurriculum.error?.status === 404 && Boolean(answeredAccess);

  const personal = useCourseOverview(courseSlug, {
    enabled: enabled && (isManager || publicCurriculumMissing),
  });

  const fullCurriculum =
    (needsApiCurriculum ? apiCurriculum.data : undefined) ?? fileQuery.data;
  const curriculum =
    fullCurriculum ?? (builtBeforeChange ? undefined : seeded?.curriculum);
  const sectionsComplete = Boolean(fullCurriculum) || Boolean(seeded?.complete);
  const pricing = access?.pricing ?? seeded?.pricing ?? null;

  let overview: CourseOverviewResponse | undefined;
  if ((isManager || publicCurriculumMissing) && personal.data) {
    overview = personal.data;
  } else if (curriculum) {
    overview = curriculumToOverview(curriculum, pricing);
    if (access) overview = { ...overview, canSelfEnroll: access.canSelfEnroll };
  } else if (seeded && builtBeforeChange) {
    // Older than the course, but better than an empty page while the
    // current curriculum is on its way.
    overview = curriculumToOverview(seeded.curriculum, pricing);
  }

  const overviewIsWhole =
    overview === personal.data ? Boolean(personal.data) : sectionsComplete;
  const totalSections = overviewIsWhole
    ? overview?.sections.length
    : seeded?.totalSections;

  const requestAllSections = useCallback(() => setWantsAllSections(true), []);
  const prefetchAllSections = useCallback(() => {
    if (!prefersReducedData()) setWantsAllSections(true);
  }, []);

  const isLoading =
    !overview &&
    (accessQuery.isLoading ||
      fileQuery.isLoading ||
      apiCurriculum.isLoading ||
      personal.isLoading);
  // Nothing is "not found" while the course is still on its way: the
  // access answer can fail (a 404 from an API that predates it) before the
  // curriculum file has arrived and drawn the page.
  const error =
    overview || fileQuery.isLoading || apiCurriculum.isLoading
      ? null
      : (personal.error ??
        (publicCurriculumMissing ? null : apiCurriculum.error) ??
        accessQuery.error ??
        null);

  return {
    overview,
    isLoading,
    error,
    refetch: () => {
      void accessQuery.refetch();
      if (needsApiCurriculum) void apiCurriculum.refetch();
      if (isManager || publicCurriculumMissing) void personal.refetch();
    },
    access,
    accessPending:
      awaitsAccess && enabled && accessQuery.isPending && !provisionalAccess,
    totalSections,
    sectionsComplete: overviewIsWhole,
    requestAllSections,
    prefetchAllSections,
  };
}
