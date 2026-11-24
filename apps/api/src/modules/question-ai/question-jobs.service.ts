import {
  questionGenerationSettingsSchema,
  type QuestionGenerationJob,
  type QuestionGenerationSettings,
  type StartQuestionGenerationRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { AppError } from "../../lib/errors.ts";
import type { AiService } from "../ai/index.ts";
import { listUserRoleNames } from "../auth/authentication/authentication.repository.ts";
import type { CodingAiService } from "../coding-practice/ai/coding-ai.service.ts";
import type { CourseService } from "../courses/course/course.service.ts";
import { mayManageCourse } from "../courses/shared/courses.utils.ts";
import type { AssignmentService } from "../quizzes/assignments/assignment.service.ts";
import type { AuthoringService as QuizAuthoringService } from "../quizzes/authoring/authoring.service.ts";
import { assertCanManageCourse } from "../quizzes/shared/quiz.types.ts";
import {
  buildLectureContext,
  type LectureContextDeps,
} from "./lecture-context.ts";
import type { QuizAiService } from "./quiz-ai.service.ts";
import * as repo from "./question-jobs.repository.ts";

type Actor = { id: string; roles: readonly string[] };

/** Whether a lecture deserves a coding question, and what about. */
const CODING_GATE_SYSTEM = `You help the teacher of an online programming course decide whether one lecture should get a small coding exercise. Say yes only when the lecture teaches something a student can practise by writing code (a language feature, an API, an algorithm, a pattern, a UI to build). Say no for introductions, overviews, setup and installation, theory with nothing to code, career talks and thank-you videos. When yes, write a one or two sentence brief for the exercise: what the student builds, using only what this lecture and earlier ones taught.`;
const CODING_GATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["worthIt", "brief", "reason"],
  properties: {
    worthIt: { type: "boolean" },
    brief: { type: "string" },
    reason: { type: "string" },
  },
} as const;

const noop = () => undefined;

export interface QuestionJobsOptions extends LectureContextDeps {
  ai: AiService;
  quizAi: QuizAiService;
  codingAi: CodingAiService;
  quizAuthoring: QuizAuthoringService;
  quizAssignments: AssignmentService;
  courseService: LectureContextDeps["courseService"] &
    Pick<CourseService, "findCourseById">;
}

const iso = (value: Date | null | undefined) =>
  value ? value.toISOString() : null;

/**
 * Questions for a whole course in one go: staff choose what to make, a
 * background run writes a draft quiz (and a coding question where the
 * lecture teaches code) for each lecture in course order, and staff review
 * and publish them. Students see none of it until it is published.
 */
export function createQuestionJobsService(options: QuestionJobsOptions) {
  const { database, ai, quizAi, codingAi, courseService } = options;

  async function requireCourse(actor: Actor, courseId: string) {
    const course = await courseService.findCourseById(courseId);
    if (!course)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    await assertCanManageCourse(database, actor, course, "quiz.create");
    return course;
  }

  async function canWriteCoding(
    actor: Actor,
    course: { id: string; creator_id: string | null },
  ) {
    return await mayManageCourse(
      database as Kysely<Database>,
      course as Parameters<typeof mayManageCourse>[1],
      actor.id,
      actor.roles,
      "coding.manage",
    );
  }

  async function present(
    job: NonNullable<repo.JobRow>,
  ): Promise<QuestionGenerationJob> {
    const items = await repo.listItems(database, job.id);
    const [quizzes, exercises] = await Promise.all([
      repo.describeQuizzes(
        database,
        items.map((item) => item.quiz_id).filter((id): id is string => !!id),
      ),
      repo.describeExercises(
        database,
        items
          .map((item) => item.coding_exercise_id)
          .filter((id): id is string => !!id),
      ),
    ]);
    const quizById = new Map(quizzes.map((row) => [row.id, row]));
    const exerciseById = new Map(exercises.map((row) => [row.id, row]));
    const settings = questionGenerationSettingsSchema.safeParse(job.settings);
    return {
      id: job.id,
      courseId: job.course_id,
      status: job.status,
      settings: settings.success
        ? settings.data
        : questionGenerationSettingsSchema.parse({}),
      totalItems: job.total_items,
      doneItems: job.done_items,
      quizzesCreated: job.quizzes_created,
      codingCreated: job.coding_created,
      skippedItems: job.skipped_items,
      failedItems: job.failed_items,
      error: job.error,
      createdAt: job.created_at.toISOString(),
      startedAt: iso(job.started_at),
      finishedAt: iso(job.finished_at),
      items: items.map((item) => {
        const quiz = item.quiz_id ? quizById.get(item.quiz_id) : undefined;
        const exercise = item.coding_exercise_id
          ? exerciseById.get(item.coding_exercise_id)
          : undefined;
        return {
          id: item.id,
          lessonId: item.lesson_id,
          lessonTitle: item.lesson_title,
          sectionTitle: item.section_title ?? null,
          position: item.position,
          status: item.status,
          message: item.message,
          quiz: quiz
            ? {
                id: quiz.id,
                title: quiz.title,
                status: quiz.status,
                questionCount: Number(quiz.question_count ?? 0),
              }
            : null,
          coding: exercise
            ? {
                exerciseId: exercise.id,
                assignmentId: exercise.assignment_id ?? null,
                title: exercise.title,
                status: exercise.status,
              }
            : null,
        };
      }),
    };
  }

  /** Starts a run for the course's lectures, in course order. */
  async function start(
    actor: Actor,
    courseId: string,
    raw: StartQuestionGenerationRequest,
  ) {
    const settings = questionGenerationSettingsSchema.parse(raw);
    if (!settings.quizzes && !settings.coding)
      throw new AppError(
        400,
        "NOTHING_TO_MAKE",
        "Choose quizzes, coding questions or both.",
      );
    const course = await requireCourse(actor, courseId);
    if (settings.coding && !(await canWriteCoding(actor, course)))
      throw new AppError(
        403,
        "FORBIDDEN",
        "You cannot add coding questions to this course.",
      );
    const availability = await ai.availability();
    if (!availability.available)
      throw new AppError(
        409,
        "AI_UNAVAILABLE",
        availability.reason ??
          "AI is off. An admin can turn it on in Platform → AI.",
      );
    if (await repo.findActiveJob(database, courseId))
      throw new AppError(
        409,
        "QUESTION_JOB_RUNNING",
        "AI is already writing questions for this course.",
      );

    const content = await courseService.getCourseContent(course);
    const sections = [...content.sections].sort(
      (a, b) => a.position - b.position,
    );
    const sectionOrder = new Map(
      sections.map((section, at) => [section.id, at]),
    );
    const chosen = new Set(settings.sectionIds);
    const lessons = [...content.lessons]
      .filter((lesson) => lesson.content_type !== "quiz")
      .filter((lesson) => chosen.size === 0 || chosen.has(lesson.section_id))
      .sort(
        (a, b) =>
          (sectionOrder.get(a.section_id) ?? 1e9) -
            (sectionOrder.get(b.section_id) ?? 1e9) || a.position - b.position,
      );
    if (!lessons.length)
      throw new AppError(
        400,
        "NO_LECTURES",
        "There are no lectures to write questions for.",
      );

    const job = await database
      .transaction()
      .execute(async (trx) => {
        const inserted = await repo.insertJob(trx, {
          course_id: courseId,
          created_by: actor.id,
          status: "queued",
          settings: settings as never,
          total_items: lessons.length,
        });
        await repo.insertItems(
          trx,
          lessons.map((lesson, index) => ({
            job_id: inserted.id,
            lesson_id: lesson.id,
            position: index + 1,
          })),
        );
        return inserted;
      })
      .catch((error: unknown) => {
        // Two presses at once: the second meets the one-run-per-course index.
        if (String((error as { code?: string })?.code) === "23505")
          throw new AppError(
            409,
            "QUESTION_JOB_RUNNING",
            "AI is already writing questions for this course.",
          );
        throw error;
      });
    return await present(job);
  }

  async function latest(actor: Actor, courseId: string) {
    await requireCourse(actor, courseId);
    const job = await repo.findLatestJob(database, courseId);
    return { job: job ? await present(job) : null };
  }

  async function requireJob(actor: Actor, jobId: string) {
    const job = await repo.findJob(database, jobId);
    if (!job)
      throw new AppError(
        404,
        "QUESTION_JOB_NOT_FOUND",
        "This run was not found.",
      );
    await requireCourse(actor, job.course_id);
    return job;
  }

  /** Stops after the lecture being written (what is made stays as drafts). */
  async function cancel(actor: Actor, jobId: string) {
    const job = await requireJob(actor, jobId);
    if (job.status === "queued" || job.status === "running")
      await repo.updateJob(database, job.id, {
        status: "cancelled",
        finished_at: new Date(),
        lease_until: null,
      });
    return await present((await repo.findJob(database, job.id))!);
  }

  /** Shows the run's draft quizzes to students (coding questions are checked and published one by one). */
  async function publishQuizzes(
    actor: Actor,
    jobId: string,
    quizIds?: string[],
  ) {
    const job = await requireJob(actor, jobId);
    const items = await repo.listItems(database, job.id);
    const wanted = quizIds ? new Set(quizIds) : null;
    const quizzes = await repo.describeQuizzes(
      database,
      items
        .map((item) => item.quiz_id)
        .filter((id): id is string => !!id && (!wanted || wanted.has(id))),
    );
    for (const quiz of quizzes) {
      if (quiz.status === "draft")
        await options.quizAuthoring.setStatus(actor, quiz.id, "published");
    }
    return await present((await repo.findJob(database, job.id))!);
  }

  /* ------------------------------------------------------------- the run */

  /** The person who started the run, with their roles as they are now. */
  async function actorOf(job: NonNullable<repo.JobRow>): Promise<Actor> {
    if (!job.created_by)
      throw new AppError(
        403,
        "FORBIDDEN",
        "The person who started this run no longer exists.",
      );
    return {
      id: job.created_by,
      roles: await listUserRoleNames(database, job.created_by),
    };
  }

  async function codingBrief(
    actor: Actor,
    contextText: string,
    signal: AbortSignal,
  ) {
    const { text } = await ai.runJson({
      feature: "course.questions",
      userId: actor.id,
      system: CODING_GATE_SYSTEM,
      user: contextText,
      schema: CODING_GATE_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 4_000,
      effort: "low",
      signal,
      background: true,
    });
    try {
      const parsed = JSON.parse(text) as {
        worthIt?: unknown;
        brief?: unknown;
        reason?: unknown;
      };
      return {
        worthIt: parsed.worthIt === true,
        brief:
          typeof parsed.brief === "string"
            ? parsed.brief.trim().slice(0, 1_500)
            : "",
        reason:
          typeof parsed.reason === "string"
            ? parsed.reason.trim().slice(0, 300)
            : "",
      };
    } catch {
      return { worthIt: false, brief: "", reason: "" };
    }
  }

  /**
   * One lecture: a draft quiz, attached to the lecture as a draft (hidden,
   * no notification), and a draft coding question where it fits. Errors
   * on one lecture are written on it; the run goes on.
   */
  async function runItem(
    job: NonNullable<repo.JobRow>,
    item: NonNullable<Awaited<ReturnType<typeof repo.nextItem>>>,
    settings: QuestionGenerationSettings,
    signal: AbortSignal,
  ) {
    const actor = await actorOf(job);
    await repo.updateItem(database, item.id, {
      status: "running",
      attempts: item.attempts + 1,
    });
    const existing = await repo.lessonsWithQuestions(database, job.course_id);
    // A lecture holds one quiz; others keep theirs when asked to.
    const wantQuiz =
      settings.quizzes && !item.quiz_id && !existing.quiz.has(item.lesson_id);
    const wantCoding =
      settings.coding &&
      !item.coding_exercise_id &&
      !(settings.skipExisting && existing.coding.has(item.lesson_id));
    if (!wantQuiz && !wantCoding) {
      await repo.updateItem(database, item.id, {
        status: item.quiz_id || item.coding_exercise_id ? "done" : "skipped",
        message:
          item.quiz_id || item.coding_exercise_id
            ? null
            : "Already has its questions.",
      });
      await repo.countOn(database, job.id, {
        done: 1,
        skipped: item.quiz_id || item.coding_exercise_id ? 0 : 1,
      });
      return;
    }

    const context = await buildLectureContext(
      options,
      actor,
      job.course_id,
      item.lesson_id,
    );
    const notes: string[] = [];
    let quizId = item.quiz_id;
    let exerciseId = item.coding_exercise_id;
    let quizzesMade = 0;
    let codingMade = 0;

    if (wantQuiz) {
      const quiz = await quizAi.writeQuiz(
        actor,
        context,
        {
          count: settings.questionsPerQuiz,
          level: settings.level,
          types: settings.types,
          guidance: settings.guidance,
        },
        noop,
        signal,
        { background: true, subjectId: item.lesson_id },
      );
      if (quiz.questions.length) {
        const created = await options.quizAuthoring.createQuizWithQuestions(
          actor,
          {
            title: quiz.title || `Quick check: ${context.lessonTitle}`,
            description: null,
            instructions: null,
            questions: quiz.questions,
          },
        );
        quizId = created.id;
        await repo.updateItem(database, item.id, { quiz_id: quizId });
        const frozen = await options.quizAuthoring.publish(
          actor,
          created.id,
          "draft",
        );
        const version = frozen.versions.filter((v) => v.publishedAt).at(-1);
        if (version)
          await options.quizAssignments.assign(
            actor,
            job.course_id,
            item.lesson_id,
            {
              quizVersionId: version.id,
            },
          );
        quizzesMade = 1;
      } else if (quiz.summary) {
        notes.push(quiz.summary);
      }
    }

    if (wantCoding) {
      // Even a lecture with only a title ("Higher order functions") can
      // say clearly that it teaches code; the AI decides from what there is.
      const gate = await codingBrief(actor, context.text, signal);
      if (gate.worthIt) {
        const exercise = await codingAi.generate(
          actor,
          job.course_id,
          {
            lessonId: item.lesson_id,
            kind: "auto",
            difficulty: settings.level === "hard" ? "medium" : "easy",
            language: "javascript",
            mode: "practice",
            brief: [gate.brief, settings.guidance].filter(Boolean).join(" "),
          },
          noop,
          signal,
          { background: true },
        );
        exerciseId = exercise.id;
        codingMade = 1;
      } else if (gate.reason) {
        notes.push(`No coding question: ${gate.reason}`);
      }
    }

    const made = quizzesMade + codingMade > 0 || quizId || exerciseId;
    await repo.updateItem(database, item.id, {
      status: made ? "done" : "skipped",
      quiz_id: quizId,
      coding_exercise_id: exerciseId,
      message: notes.join(" ").slice(0, 500) || null,
    });
    await repo.countOn(database, job.id, {
      done: 1,
      quizzes: quizzesMade,
      coding: codingMade,
      skipped: made ? 0 : 1,
    });
  }

  return {
    start,
    latest,
    cancel,
    publishQuizzes,
    runItem,
    present,
  };
}

export type QuestionJobsService = ReturnType<typeof createQuestionJobsService>;
