import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type {
  CourseAccessListResponse,
  CourseAccessProgress,
  CourseAccessResponse,
  CourseAccessResume,
  CourseAccessSummary,
} from "@veolms/contracts";

import { AppError } from "../../lib/errors.ts";
import { createAccessService, type AccessService } from "../access/index.ts";
import { hasAcademyPermission } from "../authorization/index.ts";
import type { EnrollmentService } from "../commerce/index.ts";
import {
  resolveOverviewVisibility,
  type CourseAccessFacts,
  type CourseService,
} from "../courses/index.ts";
import type { LearningProgressService } from "../learning-progress/learning-progress.service.ts";
import {
  decideCourseAccess,
  isGrantInForce,
  type AccessViewer,
} from "./viewer-access.rules.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** A curriculum version for a course that has no public curriculum. */
const NO_PUBLIC_CURRICULUM = "none";

export interface ViewerAccessUser {
  id: string;
  roles: readonly string[];
  learnerView: boolean;
}

export interface ViewerAccessService {
  listCourseAccess(
    user: ViewerAccessUser | undefined,
  ): Promise<CourseAccessListResponse>;
  getCourseAccess(
    courseIdOrSlug: string,
    user: ViewerAccessUser | undefined,
  ): Promise<CourseAccessResponse>;
}

/**
 * What each viewer may do with courses, kept apart from what courses are.
 * The course pages are the same for everyone and built ahead of time; these
 * answers carry the rest: whether the viewer may open every lesson, what
 * they must do to open the others, the price in force and their progress.
 * They are asked of the server every time and never kept by a cache.
 */
export function createViewerAccessService({
  database,
  courseService,
  enrollmentService,
  learningProgressService,
  accessService = createAccessService(),
}: {
  database: Kysely<Database>;
  courseService: Pick<
    CourseService,
    | "findCourseById"
    | "findCourseBySlug"
    | "listCourseAccessFacts"
    | "getPublicCurriculumVersion"
  >;
  enrollmentService: Pick<EnrollmentService, "listEnrollmentProgress">;
  learningProgressService: Pick<LearningProgressService, "getResumeContext">;
  accessService?: Pick<
    AccessService,
    "hasActiveAccess" | "isCourseOpenToLearner" | "listUserGrants"
  >;
}): ViewerAccessService {
  async function toAccessViewer(
    user: ViewerAccessUser | undefined,
  ): Promise<AccessViewer | undefined> {
    if (!user) return undefined;
    return {
      ...user,
      previewsEveryCourse: await hasAcademyPermission(
        database,
        user.id,
        "course.preview",
      ),
    };
  }

  /** The learner's enrolments: progress in each, and when access ends. */
  async function listProgressByCourse(
    user: ViewerAccessUser | undefined,
  ): Promise<
    Map<
      string,
      { progress: CourseAccessProgress; accessExpiresAt: Date | null }
    >
  > {
    if (!user) return new Map();
    const rows = await enrollmentService.listEnrollmentProgress(user.id);
    return new Map(
      rows.map((row) => [
        row.courseId,
        {
          progress: {
            percent: Math.min(100, Math.max(0, Math.round(row.progress))),
            started: row.progress > 0 || row.lastAccessedAt !== null,
            lastAccessedAt: row.lastAccessedAt?.toISOString() ?? null,
          },
          accessExpiresAt: row.accessExpiresAt,
        },
      ]),
    );
  }

  function summarize(
    course: CourseAccessFacts,
    viewer: AccessViewer | undefined,
    holdsGrant: boolean,
    progress: CourseAccessProgress | undefined,
  ): CourseAccessSummary {
    return {
      courseId: course.id,
      slug: course.slug,
      ...decideCourseAccess({ course, viewer, holdsGrant }),
      enrolled: progress !== undefined,
      canSelfEnroll: course.canSelfEnroll,
      pricing: {
        ...course.pricing,
        showDiscountBadge: course.pricing.showDiscountBadge === true,
      },
      progress: progress ?? null,
    };
  }

  async function listCourseAccess(
    user: ViewerAccessUser | undefined,
  ): Promise<CourseAccessListResponse> {
    const [courses, viewer, grants, progressByCourse] = await Promise.all([
      courseService.listCourseAccessFacts({ published: true }),
      toAccessViewer(user),
      user ? accessService.listUserGrants(database, user.id) : [],
      listProgressByCourse(user),
    ]);
    const now = new Date();
    const heldCourseIds = new Set(
      grants
        .filter((grant) => isGrantInForce(grant, now))
        .map((grant) => grant.courseId),
    );
    return {
      courses: courses.map((course) =>
        summarize(
          course,
          viewer,
          heldCourseIds.has(course.id),
          progressByCourse.get(course.id)?.progress,
        ),
      ),
    };
  }

  async function getResume(
    user: ViewerAccessUser,
    courseId: string,
  ): Promise<CourseAccessResume | null> {
    try {
      const context = await learningProgressService.getResumeContext(
        user,
        courseId,
      );
      return {
        totalLessons: context.totalLessons,
        completedLessons: context.completedLessons,
        resumeLesson: context.resumeLesson,
      };
    } catch (error) {
      // Refused for a course the learner may not record progress in.
      if (error instanceof AppError) return null;
      throw error;
    }
  }

  /**
   * The rule the discussions apply to posting
   * (`assertCanParticipateInCourse`): whoever reads every course's
   * discussions (admins, through their role), the course's creator, and
   * learners holding a grant.
   */
  async function mayJoinCourseDiscussions(
    user: ViewerAccessUser | undefined,
    creatorId: string | null,
    holdsGrant: boolean,
  ): Promise<boolean> {
    if (!user) return false;
    if (holdsGrant || creatorId === user.id) return true;
    return await hasAcademyPermission(database, user.id, "discussion.read");
  }

  async function getCourseAccess(
    courseIdOrSlug: string,
    user: ViewerAccessUser | undefined,
  ): Promise<CourseAccessResponse> {
    const course = UUID_PATTERN.test(courseIdOrSlug)
      ? await courseService.findCourseById(courseIdOrSlug)
      : await courseService.findCourseBySlug(courseIdOrSlug);
    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    const viewer = await toAccessViewer(user);
    // Found for exactly the viewers its overview is found for.
    if (
      !resolveOverviewVisibility(course, viewer).mayOpen &&
      !(await accessService.isCourseOpenToLearner(database, user?.id, course))
    ) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not published.");
    }

    const [[facts], holdsGrant, progressByCourse, curriculumVersion] =
      await Promise.all([
        courseService.listCourseAccessFacts({ courseIds: [course.id] }),
        user
          ? accessService.hasActiveAccess(database, user.id, course.id)
          : false,
        listProgressByCourse(user),
        courseService.getPublicCurriculumVersion(course.id),
      ]);
    if (!facts) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    const enrollment = progressByCourse.get(course.id);
    const summary = summarize(facts, viewer, holdsGrant, enrollment?.progress);
    const [resume, mayJoinDiscussions] = await Promise.all([
      user && summary.access === "full"
        ? getResume(user, course.id)
        : Promise.resolve(null),
      mayJoinCourseDiscussions(user, course.creator_id, holdsGrant),
    ]);

    return {
      ...summary,
      mayJoinDiscussions,
      resume,
      accessExpiresAt: enrollment?.accessExpiresAt?.toISOString() ?? null,
      curriculumVersion: curriculumVersion ?? NO_PUBLIC_CURRICULUM,
    };
  }

  return { listCourseAccess, getCourseAccess };
}
