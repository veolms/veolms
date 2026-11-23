import type {
  CodingAssignmentAnalytics,
  CodingSubmissionSummary,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import { mayManageCourse } from "../../courses/shared/courses.utils.ts";
import * as repo from "../shared/coding.repository.ts";
import { presentSubmission, readContent } from "../shared/coding.presenters.ts";
import { expectedTests } from "../shared/coding.suite.ts";
import {
  assertCanManageCourse,
  CodingErrors,
  type CodingActor,
  type CodingServiceOptions,
} from "../shared/coding.types.ts";

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function createAnalyticsService(options: CodingServiceOptions) {
  const { database, courseService, accessService, authService } = options;

  async function requireManaged(actor: CodingActor, assignmentId: string) {
    const assignment = await repo.findAssignment(database, assignmentId);
    if (!assignment) throw CodingErrors.assignmentNotFound();
    const course = await courseService.findCourseById(assignment.course_id);
    if (!course)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    await assertCanManageCourse(database, actor, course, "submission.read");
    return { assignment, course };
  }

  /** How learners do on one lesson's exercise, and which test stops them. */
  async function assignment(
    actor: CodingActor,
    assignmentId: string,
  ): Promise<CodingAssignmentAnalytics> {
    const { assignment, course } = await requireManaged(actor, assignmentId);
    const [
      exercise,
      version,
      lesson,
      states,
      draftOnly,
      attemptsToPass,
      failures,
      learnersWithAccess,
    ] = await Promise.all([
      repo.findExercise(database, assignment.exercise_id),
      repo.findVersion(database, assignment.exercise_version_id),
      assignment.lesson_id
        ? courseService.findLessonById(
            assignment.course_id,
            assignment.lesson_id,
          )
        : Promise.resolve(null),
      repo.listLearnerStates(database, assignmentId),
      repo.countDraftOnlyLearners(database, assignmentId),
      repo.listAttemptsToPass(database, assignmentId),
      repo.countLatestFailuresByTest(database, assignmentId),
      accessService.listActiveUserIdsForCourse(database, assignment.course_id),
    ]);
    const withEmails = await mayManageCourse(
      database,
      course,
      actor.id,
      actor.roles,
      "student.read",
    );
    const userIds = states.map((state) => state.user_id);
    const people = new Map(
      (withEmails
        ? await authService.listUserNamesAndEmailsByIds(userIds)
        : (await authService.listUserDisplayNamesByIds(userIds)).map(
            (user) => ({ ...user, email: null as string | null }),
          )
      ).map((user) => [user.id, user]),
    );
    const tests = version ? expectedTests(readContent(version).tests) : [];
    return {
      exerciseTitle: exercise?.title ?? "Deleted exercise",
      lessonTitle: lesson?.title ?? "Deleted lesson",
      learnersWithAccess: learnersWithAccess.length,
      opened: states.length + draftOnly,
      submitted: states.filter((state) => state.attempts_count > 0).length,
      passed: states.filter((state) => state.first_passed_at).length,
      medianAttemptsToPass: median(attemptsToPass),
      solutionViewedBeforePass: states.filter(
        (state) => state.solution_viewed_before_pass,
      ).length,
      tests: tests
        .map((test) => ({
          id: test.id,
          name: test.name,
          hidden: test.hidden,
          failedBy: failures.get(test.id) ?? 0,
        }))
        .sort((left, right) => right.failedBy - left.failedBy),
      learners: states.map((state) => ({
        userId: state.user_id,
        name: people.get(state.user_id)?.display_name ?? "Learner",
        email: people.get(state.user_id)?.email ?? null,
        attempts: state.attempts_count,
        passed: Boolean(state.first_passed_at),
        firstPassedAt: state.first_passed_at?.toISOString() ?? null,
        solutionViewedBeforePass: state.solution_viewed_before_pass,
        lastSubmittedAt: state.last_submitted_at?.toISOString() ?? null,
      })),
    };
  }

  /** One learner's submissions, read-only, for staff. */
  async function learnerSubmissions(
    actor: CodingActor,
    assignmentId: string,
    studentId: string,
  ): Promise<{ submissions: CodingSubmissionSummary[] }> {
    await requireManaged(actor, assignmentId);
    const rows = await repo.listSubmissions(database, {
      userId: studentId,
      assignmentId,
      limit: 50,
    });
    return {
      submissions: rows.map(presentSubmission),
    };
  }

  return { assignment, learnerSubmissions };
}

export type CodingAnalyticsService = ReturnType<typeof createAnalyticsService>;
