import type { QuizActor, QuizServiceOptions } from "../shared/quiz.types.ts";
import { isAdmin } from "../shared/quiz.types.ts";
import { AppError } from "../../../lib/errors.ts";
import * as repo from "../shared/quiz.repository.ts";

type AnalyticsRow = Awaited<
  ReturnType<typeof repo.listAnalyticsAttempts>
>[number];
type BulkAnalyticsRow = Awaited<
  ReturnType<typeof repo.listAnalyticsAttemptsForAssignments>
>[number];
function pct(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

export function createAnalyticsService(options: QuizServiceOptions) {
  const { database, accessService, courseService } = options;
  async function academyId() {
    const id = await options.getAcademyId();
    if (!id)
      throw new AppError(
        503,
        "ACADEMY_NOT_CONFIGURED",
        "The academy is not configured.",
      );
    return id;
  }

  async function assertOwned(actor: QuizActor, assignmentId: string) {
    const assignment = await repo.findAssignment(database, assignmentId);
    if (!assignment)
      throw new AppError(
        404,
        "ASSIGNMENT_NOT_FOUND",
        "Quiz assignment not found.",
      );
    const course = await courseService.findCourseById(assignment.course_id);
    if (!course)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    if (!isAdmin(actor))
      await courseService.getCourseAndVerifyOwner(
        assignment.course_id,
        actor.id,
      );
    if (!isAdmin(actor)) {
      const quiz = await repo.findQuiz(database, assignment.quiz_id);
      if (!quiz || quiz.creator_id !== actor.id)
        throw new AppError(403, "FORBIDDEN", "You do not own this Quiz.");
    }
    return assignment;
  }

  function group(rows: AnalyticsRow[]) {
    const grouped = new Map<string, AnalyticsRow[]>();
    for (const row of rows) {
      const current = grouped.get(row.studentId);
      if (current) current.push(row);
      else grouped.set(row.studentId, [row]);
    }
    return grouped;
  }

  function buildReport(
    row: { pass_percentage: number },
    activeStudents: readonly string[],
    attempts: readonly AnalyticsRow[],
    studentNames: ReadonlyMap<string, string> = new Map(),
  ) {
    const grouped = group([...attempts]);
    const studentIds = [...new Set([...activeStudents, ...grouped.keys()])];
    const students = studentIds.map((studentId) => {
      const records = grouped.get(studentId) ?? [];
      const latest = records[0];
      const scored = records.filter(
        (record) =>
          record.status === "graded" && record.scorePercentage !== null,
      );
      const best = scored.reduce<number | null>(
        (current, record) =>
          Math.max(current ?? 0, Number(record.scorePercentage)),
        null,
      );
      const status: "passed" | "failed" | "in_progress" | "not_attempted" =
        latest?.status === "in_progress"
          ? "in_progress"
          : latest && ["graded", "submitted", "expired"].includes(latest.status)
            ? Number(latest.scorePercentage ?? 0) >= Number(row.pass_percentage)
              ? "passed"
              : "failed"
            : "not_attempted";
      return {
        studentId,
        studentName: studentNames.get(studentId) ?? studentId,
        attemptCount: records.length,
        latestScore:
          latest?.scorePercentage === null ||
          latest?.scorePercentage === undefined
            ? null
            : Number(latest.scorePercentage),
        bestScore: best,
        status,
        lastAttempt: latest?.submittedAt?.toISOString() ?? null,
      };
    });
    const scores = attempts
      .filter(
        (attempt) =>
          attempt.status === "graded" && attempt.scorePercentage !== null,
      )
      .map((attempt) => Number(attempt.scorePercentage));
    return {
      assignedStudents: studentIds.length,
      attempted: students.filter((student) => student.attemptCount > 0).length,
      passed: students.filter((student) => student.status === "passed").length,
      failed: students.filter((student) => student.status === "failed").length,
      notAttempted: students.filter(
        (student) => student.status === "not_attempted",
      ).length,
      averageScore: scores.length
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : 0,
      highestScore: scores.length ? Math.max(...scores) : 0,
      lowestScore: scores.length ? Math.min(...scores) : 0,
      students,
    };
  }

  async function listVisibleQuizzes(actor: QuizActor) {
    return isAdmin(actor)
      ? repo.listQuizzesByAcademy(database, await academyId())
      : repo.listQuizzesByCreator(database, actor.id);
  }

  async function assignment(actor: QuizActor, assignmentId: string) {
    const row = await assertOwned(actor, assignmentId);
    const [activeStudents, attempts] = await Promise.all([
      accessService.listActiveUserIdsForCourse(database, row.course_id),
      repo.listAnalyticsAttempts(database, assignmentId),
    ]);
    const grouped = group(attempts);
    const studentIds = [...new Set([...activeStudents, ...grouped.keys()])];
    const users = await options.authService.findUsersByIds(studentIds);
    const studentNames = new Map(
      users.map((user) => [user.id, user.display_name] as const),
    );
    return buildReport(row, activeStudents, attempts, studentNames);
  }

  async function course(actor: QuizActor, courseId: string) {
    const courseRecord = await courseService.findCourseById(courseId);
    if (!courseRecord)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    if (!isAdmin(actor))
      await courseService.getCourseAndVerifyOwner(courseId, actor.id);
    const assignments = await repo.listAssignmentsForCourseWithQuiz(
      database,
      courseId,
    );
    if (!isAdmin(actor)) {
      // course() already performed the course ownership check. Preserve the
      // existing per-assignment quiz ownership rule without re-querying every
      // assignment and course.
      for (const item of assignments) {
        if (item.quiz_creator_id !== actor.id)
          throw new AppError(403, "FORBIDDEN", "You do not own this Quiz.");
      }
    }
    const activeStudents = await accessService.listActiveUserIdsForCourse(
      database,
      courseId,
    );
    const attempts = await repo.listAnalyticsAttemptsForAssignments(
      database,
      assignments.map((item) => item.id),
    );
    const attemptsByAssignment = new Map<string, BulkAnalyticsRow[]>();
    for (const attempt of attempts) {
      const current = attemptsByAssignment.get(attempt.assignmentId);
      if (current) current.push(attempt);
      else attemptsByAssignment.set(attempt.assignmentId, [attempt]);
    }
    const reports = assignments.map((item) =>
      buildReport(
        item,
        activeStudents,
        attemptsByAssignment.get(item.id) ?? [],
      ),
    );
    const scores = reports.flatMap((report) =>
      report.students
        .filter((student) => student.latestScore !== null)
        .map((student) => student.latestScore!),
    );
    const attempted = reports.reduce(
      (sum, report) => sum + report.attempted,
      0,
    );
    const passed = reports.reduce((sum, report) => sum + report.passed, 0);
    const totalSlots = assignments.length * activeStudents.length;
    return {
      totalQuizzes: assignments.length,
      requiredQuizzes: assignments.filter((item) => item.required).length,
      students: activeStudents.length,
      averageQuizScore: scores.length
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : 0,
      quizCompletionRate: pct(attempted, totalSlots),
      passRate: pct(passed, attempted),
      quizzes: assignments.map((item, index) => {
        const report = reports[index]!;
        return {
          assignmentId: item.id,
          quizTitle: item.quiz_title ?? "Quiz",
          averageScore: report.averageScore,
          completionRate: pct(report.attempted, report.assignedStudents),
          passRate: pct(report.passed, report.attempted),
        };
      }),
    };
  }

  async function student(actor: QuizActor, studentId: string) {
    const quizzes = await listVisibleQuizzes(actor);
    const assignments = await repo.listAssignmentsForQuizzes(
      database,
      quizzes.map((quiz) => quiz.id),
    );
    const attempts = await repo.listAttemptsForUser(database, studentId);
    const quizzesById = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
    const attemptsByAssignment = new Map<string, typeof attempts>();
    for (const attempt of attempts) {
      const current = attemptsByAssignment.get(attempt.assignment_id);
      if (current) current.push(attempt);
      else attemptsByAssignment.set(attempt.assignment_id, [attempt]);
    }
    const items = assignments.map((assignment) => {
      const records = attemptsByAssignment.get(assignment.id) ?? [];
      const latest = records[0];
      const scores = records
        .filter((attempt) => attempt.score_percentage !== null)
        .map((attempt) => Number(attempt.score_percentage));
      const status: "passed" | "failed" | "in_progress" | "not_attempted" =
        latest?.status === "in_progress"
          ? "in_progress"
          : latest && ["graded", "submitted", "expired"].includes(latest.status)
            ? latest.is_passed
              ? "passed"
              : "failed"
            : "not_attempted";
      return {
        assignmentId: assignment.id,
        quizTitle: quizzesById.get(assignment.quiz_id)?.title ?? "Quiz",
        courseId: assignment.course_id,
        attempts: records.length,
        bestScore: scores.length ? Math.max(...scores) : null,
        latestScore:
          latest?.score_percentage === null ||
          latest?.score_percentage === undefined
            ? null
            : Number(latest.score_percentage),
        status,
      };
    });
    const completed = items.filter(
      (item) => item.status === "passed" || item.status === "failed",
    );
    const passed = items.filter((item) => item.status === "passed");
    const scores = items.flatMap((item) =>
      item.latestScore === null ? [] : [item.latestScore],
    );
    return {
      studentId,
      completedQuizzes: completed.length,
      passed: passed.length,
      pending: items.filter(
        (item) =>
          item.status === "in_progress" || item.status === "not_attempted",
      ).length,
      averageScore: scores.length
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : 0,
      bestScore: items.reduce(
        (max, item) => Math.max(max, item.bestScore ?? 0),
        0,
      ),
      quizzes: items,
    };
  }
  return { assignment, course, student };
}
export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
