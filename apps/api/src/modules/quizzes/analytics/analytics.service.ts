import type { QuizActor, QuizServiceOptions } from "../shared/quiz.types.ts";
import {
  assertCanManageCourse,
  canManageCourse,
  reachesEveryQuiz,
  requireAcademyId,
} from "../shared/quiz.types.ts";
import { AppError } from "../../../lib/errors.ts";
import * as repo from "../shared/quiz.repository.ts";
import { presentQuizSubmission } from "./submission.presenter.ts";

type AnalyticsRow = Awaited<
  ReturnType<typeof repo.listAnalyticsAttempts>
>[number];
type StudentStatus = "passed" | "failed" | "in_progress" | "not_attempted";

function pct(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

const isClosed = (status: string) => status !== "in_progress";

export function createAnalyticsService(options: QuizServiceOptions) {
  const { database, accessService, courseService } = options;

  async function requireCourse(courseId: string) {
    const course = await courseService.findCourseById(courseId);
    if (!course)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    return course;
  }

  async function assertOwned(actor: QuizActor, assignmentId: string) {
    const assignment = await repo.findAssignment(database, assignmentId);
    if (!assignment)
      throw new AppError(
        404,
        "ASSIGNMENT_NOT_FOUND",
        "Quiz assignment not found.",
      );
    const course = await requireCourse(assignment.course_id);
    await assertCanManageCourse(database, actor, course, "submission.read");
    if (!(await reachesEveryQuiz(database, actor, "submission.read"))) {
      const quiz = await repo.findQuiz(database, assignment.quiz_id);
      if (!quiz || quiz.creator_id !== actor.id)
        throw new AppError(403, "FORBIDDEN", "You do not own this Quiz.");
    }
    return { assignment, course };
  }

  function group(rows: AnalyticsRow[]) {
    const grouped = new Map<string, AnalyticsRow[]>();
    for (const row of rows)
      grouped.set(row.studentId, [...(grouped.get(row.studentId) ?? []), row]);
    return grouped;
  }

  /**
   * The total each attempt is marked out of: its recorded maximum, or its
   * quiz version's points when it has none. Grading records the maximum, so
   * the versions are only read for open attempts and older rows without one.
   */
  async function attemptTotals(
    attempts: readonly { maxScore: number | null; quizVersionId: string }[],
  ) {
    const versionIds = [
      ...new Set(
        attempts
          .filter((item) => item.maxScore === null)
          .map((item) => item.quizVersionId),
      ),
    ];
    const versionTotals = new Map(
      (await repo.listVersionPointTotals(database, versionIds)).map((row) => [
        row.versionId,
        Number(row.totalPoints ?? 0),
      ]),
    );
    return (attempt: { maxScore: number | null; quizVersionId: string }) =>
      Number(attempt.maxScore ?? versionTotals.get(attempt.quizVersionId) ?? 0);
  }

  /**
   * One assignment's outcomes, per student and in total, from an
   * already-authorized assignment and the course's active-student list.
   * Students are identified by id only: the course report never shows a
   * name, so names are looked up by the one caller that does.
   */
  async function summarizeAssignment(
    assignment: { id: string; pass_percentage: number },
    activeStudents: readonly string[],
  ) {
    const attempts = await repo.listAnalyticsAttempts(database, assignment.id);
    const grouped = group(attempts);
    const studentIds = [...new Set([...activeStudents, ...grouped.keys()])];
    // Only the latest attempts are shown as marks; an open one shows none.
    const totalOf = await attemptTotals(
      studentIds.flatMap((studentId) => {
        const latest = grouped.get(studentId)?.[0];
        return latest && isClosed(latest.status) ? [latest] : [];
      }),
    );
    const students = studentIds.map((studentId) => {
      const records = grouped.get(studentId) ?? [];
      const latest = records[0];
      const status: StudentStatus =
        latest?.status === "in_progress"
          ? "in_progress"
          : latest && ["graded", "submitted", "expired"].includes(latest.status)
            ? Number(latest.scorePercentage ?? 0) >=
              Number(assignment.pass_percentage)
              ? "passed"
              : "failed"
            : "not_attempted";
      return {
        studentId,
        attemptCount: records.length,
        latestScore:
          latest?.scorePercentage === null ||
          latest?.scorePercentage === undefined
            ? null
            : Number(latest.scorePercentage),
        // The latest score as marks out of the quiz total ("6 / 21"), the
        // way the course team reads it. None until an attempt is closed.
        latestMarks:
          latest && isClosed(latest.status)
            ? {
                obtained: Number(latest.scoreObtained ?? 0),
                max: totalOf(latest),
              }
            : null,
        status,
        lastAttempt: latest?.submittedAt?.toISOString() ?? null,
      };
    });
    // Students who attempted come first, the latest activity first (a
    // submission, or the start of an open attempt), as a list of responses
    // reads. Students who have not attempted follow in their own order.
    const activity = (studentId: string) => {
      const latest = grouped.get(studentId)?.[0];
      return (latest?.submittedAt ?? latest?.createdAt)?.getTime() ?? null;
    };
    students.sort((a, b) => {
      const first = activity(a.studentId);
      const second = activity(b.studentId);
      if (first === null || second === null)
        return first === second ? 0 : first === null ? 1 : -1;
      return second - first;
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

  async function assignment(actor: QuizActor, assignmentId: string) {
    const { assignment: row, course } = await assertOwned(actor, assignmentId);
    const activeStudents = await accessService.listActiveUserIdsForCourse(
      database,
      row.course_id,
    );
    const report = await summarizeAssignment(row, activeStudents);
    // Emails go only to someone who may read this course's students (the
    // Students page's rule), so they can search by email as well as name.
    const withEmails = await canManageCourse(
      database,
      actor,
      course,
      "student.read",
    );
    const studentIds = report.students.map((student) => student.studentId);
    // Names (and emails) are resolved in one bulk query, for this report.
    const people = new Map(
      (withEmails
        ? await options.authService.listUserNamesAndEmailsByIds(studentIds)
        : (await options.authService.listUserDisplayNamesByIds(studentIds)).map(
            (user) => ({ ...user, email: null }),
          )
      ).map((user) => [user.id, user]),
    );
    const students = report.students.map((student) => ({
      ...student,
      studentName:
        people.get(student.studentId)?.display_name ?? student.studentId,
      studentEmail: people.get(student.studentId)?.email ?? null,
    }));
    // Those who have not attempted are listed by name, after the others.
    const attempted = students.filter((student) => student.attemptCount > 0);
    const notAttempted = students
      .filter((student) => student.attemptCount === 0)
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
    return { ...report, students: [...attempted, ...notAttempted] };
  }

  async function course(actor: QuizActor, courseId: string) {
    await assertCanManageCourse(
      database,
      actor,
      await requireCourse(courseId),
      "submission.read",
    );
    const assignments = await repo.listAssignmentsForCourse(database, courseId);
    const studentIds = await accessService.listActiveUserIdsForCourse(
      database,
      courseId,
    );

    // One bulk quiz fetch for both the per-assignment ownership rule below
    // and the titles at the end (was one findQuiz per assignment).
    const quizzes = await repo.listQuizzesByIds(database, [
      ...new Set(assignments.map((item) => item.quiz_id)),
    ]);
    const quizById = new Map(quizzes.map((quiz) => [quiz.id, quiz]));

    // Same rule assertOwned applied per assignment: a non-admin may only
    // see the course report when every assigned quiz is their own.
    if (!(await reachesEveryQuiz(database, actor, "submission.read"))) {
      for (const item of assignments) {
        const quiz = quizById.get(item.quiz_id);
        if (!quiz || quiz.creator_id !== actor.id)
          throw new AppError(403, "FORBIDDEN", "You do not own this Quiz.");
      }
    }

    // Serial on purpose: one query per assignment against the shared pool,
    // with the course's active-student list reused instead of re-fetched.
    const reports: Awaited<ReturnType<typeof summarizeAssignment>>[] = [];
    for (const item of assignments) {
      reports.push(await summarizeAssignment(item, studentIds));
    }
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
      quizzes: assignments.map((item, index) => {
        const report = reports[index]!;
        return {
          assignmentId: item.id,
          quizTitle: quizById.get(item.quiz_id)?.title ?? "Quiz",
          averageScore: report.averageScore,
          completionRate: pct(report.attempted, report.assignedStudents),
          passRate: pct(report.passed, report.attempted),
        };
      }),
    };
  }

  async function student(actor: QuizActor, studentId: string) {
    const quizzes = await repo.listQuizTitles(
      database,
      (await reachesEveryQuiz(database, actor, "submission.read"))
        ? { academyId: await requireAcademyId(options) }
        : { creatorId: actor.id },
    );
    const quizTitles = new Map(quizzes.map((quiz) => [quiz.id, quiz.title]));
    const assignments = await repo.listAssignmentRefsForQuizzes(
      database,
      quizzes.map((quiz) => quiz.id),
    );
    // Only this student's attempts on the quizzes the caller may report on.
    const attempts = await repo.listAttemptsForAssignments(
      database,
      studentId,
      assignments.map((assignment) => assignment.id),
    );
    const items = assignments.map((assignment) => {
      const records = attempts.filter(
        (attempt) => attempt.assignment_id === assignment.id,
      );
      const latest = records[0];
      const scores = records
        .filter((attempt) => attempt.score_percentage !== null)
        .map((attempt) => Number(attempt.score_percentage));
      const status: StudentStatus =
        latest?.status === "in_progress"
          ? "in_progress"
          : latest && ["graded", "submitted", "expired"].includes(latest.status)
            ? latest.is_passed
              ? "passed"
              : "failed"
            : "not_attempted";
      return {
        assignmentId: assignment.id,
        quizTitle: quizTitles.get(assignment.quiz_id) ?? "Quiz",
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
      completedQuizzes: completed.length,
      passed: passed.length,
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
  /**
   * One student's attempt on an assignment, answer by answer: the newest
   * attempt unless `attemptId` names another of theirs. Only someone who
   * manages the course (and, below academy-wide reach, owns the quiz) may
   * read it, the same as the assignment's analytics.
   */
  async function submission(
    actor: QuizActor,
    assignmentId: string,
    studentId: string,
    attemptId?: string,
  ) {
    const { assignment: row } = await assertOwned(actor, assignmentId);
    const attempts = await repo.listSubmissionAttempts(
      database,
      row.id,
      studentId,
    );
    const attempt = attemptId
      ? attempts.find((item) => item.id === attemptId)
      : attempts[0];
    if (!attempt)
      throw new AppError(404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found.");

    const [questions, answers, quiz, lessons, names, totalOf] =
      await Promise.all([
        repo.listGradingQuestions(database, attempt.quiz_version_id, {
          prompt: true,
          explanation: true,
        }),
        repo.listAnswers(database, attempt.id),
        repo.findQuiz(database, row.quiz_id),
        repo.listLessonsByIds(database, [row.lesson_id]),
        options.authService.listUserDisplayNamesByIds([studentId]),
        attemptTotals(
          attempts.map((item) => ({
            maxScore: item.max_score,
            quizVersionId: item.quiz_version_id,
          })),
        ),
      ]);
    const keyOptions = await repo.listKeyOptions(
      database,
      questions.map((question) => question.id),
    );
    return presentQuizSubmission({
      assignment: row,
      quizTitle: quiz?.title ?? "Quiz",
      lessonTitle: lessons[0]?.title ?? null,
      student: { id: studentId, name: names[0]?.display_name ?? studentId },
      // Every attempt with the total it is marked out of.
      attempts: attempts.map((item) => ({
        ...item,
        max_score: totalOf({
          maxScore: item.max_score,
          quizVersionId: item.quiz_version_id,
        }),
      })),
      attempt,
      questions,
      options: keyOptions,
      answers,
    });
  }

  return { assignment, course, student, submission };
}
export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
