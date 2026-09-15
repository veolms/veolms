import type { QuizActor, QuizServiceOptions } from "../shared/quiz.types.ts";
import { isAdmin } from "../shared/quiz.types.ts";
import { AppError } from "../../../lib/errors.ts";
import * as repo from "../shared/quiz.repository.ts";

type AnalyticsRow = Awaited<
  ReturnType<typeof repo.listAnalyticsAttempts>
>[number];
function pct(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

export function createAnalyticsService(options: QuizServiceOptions) {
  const { database, accessService, courseService } = options;
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
    for (const row of rows)
      grouped.set(row.studentId, [...(grouped.get(row.studentId) ?? []), row]);
    return grouped;
  }

  async function studentName(studentId: string, fallback: string) {
    const student = await options.authService.findUserById(studentId);
    return student?.display_name ?? fallback;
  }

  async function assignment(actor: QuizActor, assignmentId: string) {
    const row = await assertOwned(actor, assignmentId);
    const activeStudents = await accessService.listActiveUserIdsForCourse(
      database,
      row.course_id,
    );
    const attempts = await repo.listAnalyticsAttempts(database, assignmentId);
    const grouped = group(attempts);
    const studentIds = [...new Set([...activeStudents, ...grouped.keys()])];
    const students = await Promise.all(
      studentIds.map(async (studentId) => {
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
            : latest &&
                ["graded", "submitted", "expired"].includes(latest.status)
              ? Number(latest.scorePercentage ?? 0) >=
                Number(row.pass_percentage)
                ? "passed"
                : "failed"
              : "not_attempted";
        return {
          studentId,
          studentName: await studentName(studentId, studentId),
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
      }),
    );
    const scores = attempts
      .filter(
        (attempt) =>
          attempt.status === "graded" && attempt.scorePercentage !== null,
      )
      .map((attempt) => Number(attempt.scorePercentage));
    const passed = students.filter(
      (student) => student.status === "passed",
    ).length;
    return {
      assignedStudents: studentIds.length,
      attempted: students.filter((student) => student.attemptCount > 0).length,
      passed,
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

  async function course(actor: QuizActor, courseId: string) {
    const courseRecord = await courseService.findCourseById(courseId);
    if (!courseRecord)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    if (!isAdmin(actor))
      await courseService.getCourseAndVerifyOwner(courseId, actor.id);
    const assignments = await repo.listAssignmentsForCourse(database, courseId);
    const reports = await Promise.all(
      assignments.map((item) => assignment(actor, item.id)),
    );
    const studentIds = await accessService.listActiveUserIdsForCourse(
      database,
      courseId,
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
    const totalSlots = assignments.length * studentIds.length;
    return {
      totalQuizzes: assignments.length,
      requiredQuizzes: assignments.filter((item) => item.required).length,
      students: studentIds.length,
      averageQuizScore: scores.length
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : 0,
      quizCompletionRate: pct(attempted, totalSlots),
      passRate: pct(passed, attempted),
      quizzes: await Promise.all(
        assignments.map(async (item, index) => {
          const quiz = await repo.findQuiz(database, item.quiz_id);
          const report = reports[index]!;
          return {
            assignmentId: item.id,
            quizTitle: quiz?.title ?? "Quiz",
            averageScore: report.averageScore,
            completionRate: pct(report.attempted, report.assignedStudents),
            passRate: pct(report.passed, report.attempted),
          };
        }),
      ),
    };
  }

  async function student(actor: QuizActor, studentId: string) {
    const quizzes = await repo.listQuizzesByCreator(database, actor.id);
    const assignments = await repo.listAssignmentsForQuizzes(
      database,
      quizzes.map((quiz) => quiz.id),
    );
    const attempts = await repo.listAttemptsForUser(database, studentId);
    const items = assignments.map((assignment) => {
      const records = attempts.filter(
        (attempt) => attempt.assignment_id === assignment.id,
      );
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
        quizTitle:
          quizzes.find((quiz) => quiz.id === assignment.quiz_id)?.title ??
          "Quiz",
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
