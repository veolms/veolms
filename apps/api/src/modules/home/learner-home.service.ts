import {
  getEnrolledCourseKey,
  planLearnerHome,
  type EnrolledCourse,
  type LearnerHomeResponse,
  type LearningProgressResumeContextResponse,
} from "@veolms/contracts";
import { AppError } from "../../lib/errors.ts";
import type { EnrollmentService } from "../commerce/index.ts";
import type { LearningProgressService } from "../learning-progress/learning-progress.service.ts";

export interface LearnerHomeViewer {
  id: string;
  roles: readonly string[];
  /**
   * The viewer manages courses but asked to be answered as a learner (their
   * Student view): lessons are counted as a learner sees them.
   */
  learnerView: boolean;
}

/**
 * A learner's home in one answer. Nothing here is its own: the enrolments,
 * the goal summary and the place in a course each come from the service
 * that owns them, exactly as their own endpoints give them.
 */
export function createLearnerHomeService({
  enrollmentService,
  learningProgressService,
}: {
  enrollmentService: Pick<EnrollmentService, "listEnrolledCourses">;
  learningProgressService: Pick<
    LearningProgressService,
    "getResumeContext" | "getSummary"
  >;
}) {
  async function findResume(
    viewer: LearnerHomeViewer,
    course: EnrolledCourse,
  ): Promise<LearningProgressResumeContextResponse | null> {
    try {
      return await learningProgressService.getResumeContext(
        viewer,
        getEnrolledCourseKey(course),
      );
    } catch (error) {
      // The course was taken down, or the learner's access to it ended,
      // since the enrolment was listed. The home still opens: its page asks
      // for the course itself and shows what that answer says.
      if (
        error instanceof AppError &&
        (error.statusCode === 403 || error.statusCode === 404)
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Which course the home leads with is only known once the enrolments are
   * in, so its resume context follows them; the summary depends on neither
   * and is read alongside.
   */
  async function listCoursesWithResume(
    viewer: LearnerHomeViewer,
    pinnedCourseId: string | undefined,
  ) {
    const courses = await enrollmentService.listEnrolledCourses(
      viewer.id,
      viewer.roles,
    );
    const heroCourse = planLearnerHome(courses, pinnedCourseId)?.heroCourse;
    const resume = heroCourse ? await findResume(viewer, heroCourse) : null;
    return { courses, resume };
  }

  async function getLearnerHome(
    viewer: LearnerHomeViewer,
    pinnedCourseId?: string,
  ): Promise<LearnerHomeResponse> {
    const [{ courses, resume }, summary] = await Promise.all([
      listCoursesWithResume(viewer, pinnedCourseId),
      learningProgressService.getSummary({
        id: viewer.id,
        roles: viewer.roles,
      }),
    ]);
    return { courses, summary, resume };
  }

  return { getLearnerHome };
}

export type LearnerHomeService = ReturnType<typeof createLearnerHomeService>;
