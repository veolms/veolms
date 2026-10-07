import crypto from "node:crypto";
import type { DatabaseExecutor, Json } from "@veolms/database";
import type {
  CreateQuizQuestionRequest,
  CreateQuizRequest,
  CreateQuizWithQuestionsRequest,
  UpdateQuizQuestionRequest,
  UpdateQuizRequest,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import * as repo from "../shared/quiz.repository.ts";
import { presentAssignment } from "../shared/quiz.presenters.ts";
import {
  assertNoLearnerAttempts,
  isAdmin,
  requireAcademyId,
  type QuizActor,
  type QuizServiceOptions,
} from "../shared/quiz.types.ts";

type QuizRow = NonNullable<Awaited<ReturnType<typeof repo.findQuiz>>>;

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function validateQuestionPayload(payload: CreateQuizQuestionRequest) {
  if (payload.questionType === "true_false" && payload.options.length !== 2)
    throw new AppError(
      400,
      "INVALID_TRUE_FALSE_OPTIONS",
      "True/False questions require exactly two options.",
    );
  if (payload.questionType === "short_answer") {
    if (payload.options.length === 0)
      throw new AppError(
        400,
        "SHORT_ANSWER_NEEDS_OPTION",
        "Short answer questions require at least one accepted answer.",
      );
    if (payload.options.some((option) => !option.isCorrect))
      throw new AppError(
        400,
        "SHORT_ANSWER_OPTIONS_MUST_BE_CORRECT",
        "All accepted answers for short answer questions must be marked correct.",
      );
  } else {
    const correct = payload.options.filter((option) => option.isCorrect);
    if (correct.length === 0)
      throw new AppError(
        400,
        "QUESTION_NEEDS_CORRECT_OPTION",
        "Every question needs at least one correct option.",
      );
    if (payload.questionType === "single_choice" && correct.length !== 1)
      throw new AppError(
        400,
        "SINGLE_CHOICE_NEEDS_ONE_CORRECT_OPTION",
        "Single-choice questions require exactly one correct option.",
      );
  }
  const ids = payload.options.flatMap((option) =>
    option.id ? [option.id] : [],
  );
  if (new Set(ids).size !== ids.length)
    throw new AppError(
      400,
      "DUPLICATE_OPTION_ID",
      "Question options must be unique.",
    );
}

function isJsonObject(value: unknown): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createAuthoringService(options: QuizServiceOptions) {
  const { database } = options;

  async function requireQuiz(quizId: string, actor: QuizActor) {
    const quiz = await repo.findQuiz(database, quizId);
    if (!quiz) throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
    const currentAcademyId = await requireAcademyId(options);
    if (quiz.academy_id !== currentAcademyId)
      throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
    if (quiz.creator_id !== actor.id && !isAdmin(actor))
      throw new AppError(403, "FORBIDDEN", "You do not own this Quiz.");
    return quiz;
  }

  async function createQuiz(actor: QuizActor, payload: CreateQuizRequest) {
    const now = new Date();
    const quizId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    await database.transaction().execute(async (trx) => {
      await repo.insertQuiz(trx, {
        id: quizId,
        academy_id: await requireAcademyId(options),
        creator_id: actor.id,
        title: payload.title,
        description: payload.description ?? null,
        status: "draft",
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      await repo.insertVersion(trx, {
        id: versionId,
        quiz_id: quizId,
        version_number: 1,
        instructions: payload.instructions ?? null,
        created_at: now,
        published_at: null,
      });
    });
    return presentQuizById(quizId);
  }

  async function createQuizWithQuestions(
    actor: QuizActor,
    payload: CreateQuizWithQuestionsRequest,
  ) {
    for (const question of payload.questions) {
      validateQuestionPayload(question);
    }

    const now = new Date();
    const quizId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const questionRows = payload.questions.map((question, position) => ({
      id: crypto.randomUUID(),
      quiz_version_id: versionId,
      question_type: question.questionType,
      prompt: question.prompt,
      points: question.points,
      position: question.position ?? position,
      configuration: {},
      explanation: question.explanation ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }));
    const optionRows = payload.questions.flatMap((question, questionIndex) =>
      question.options.map((option, position) => ({
        id: option.id ?? crypto.randomUUID(),
        question_id: questionRows[questionIndex]!.id,
        option_text: option.text,
        is_correct: option.isCorrect,
        weight: option.weight ?? (option.isCorrect ? 1 : 0),
        position: option.position ?? position,
        created_at: now,
        updated_at: now,
      })),
    );

    await database.transaction().execute(async (trx) => {
      await repo.insertQuiz(trx, {
        id: quizId,
        academy_id: await requireAcademyId(options),
        creator_id: actor.id,
        title: payload.title,
        description: payload.description ?? null,
        status: "draft",
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      await repo.insertVersion(trx, {
        id: versionId,
        quiz_id: quizId,
        version_number: 1,
        instructions: payload.instructions ?? null,
        created_at: now,
        published_at: null,
      });
      await repo.insertQuestions(trx, questionRows);
      await repo.insertOptions(trx, optionRows);
    });

    return presentQuizById(quizId);
  }

  /**
   * The quiz library. A summary per quiz, counted in one query: the list
   * shows a title, a status and two counts, never a question.
   */
  async function listMine(actor: QuizActor) {
    const rows = await repo.listQuizSummaries(
      database,
      isAdmin(actor)
        ? { academyId: await requireAcademyId(options) }
        : { creatorId: actor.id },
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      updatedAt: row.updated_at.toISOString(),
      questionCount: Number(row.question_count ?? 0),
      publishedVersionCount: Number(row.published_version_count ?? 0),
    }));
  }

  /**
   * The quiz as its author edits it. Questions are loaded for one version
   * only — the draft, or the newest version when nothing is in draft — which
   * is the one the editor works on. Earlier versions are listed by number so
   * one can be picked for an assignment.
   */
  async function presentQuiz(quiz: QuizRow) {
    const [versions, assignmentRows] = await Promise.all([
      repo.listVersions(database, quiz.id),
      repo.listAssignmentsForQuizzes(database, [quiz.id]),
    ]);
    const editable =
      versions.find((version) => !version.published_at) ?? versions.at(-1);
    const questions = editable
      ? await repo.listQuestions(database, editable.id)
      : [];
    const options = await repo.listOptions(
      database,
      questions.map((question) => question.id),
    );
    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      versions: versions.map((version) => ({
        id: version.id,
        versionNumber: version.version_number,
        publishedAt: iso(version.published_at),
      })),
      editableVersion: editable
        ? {
            id: editable.id,
            instructions: editable.instructions,
            publishedAt: iso(editable.published_at),
            questions: questions.map((question) => ({
              id: question.id,
              questionType: question.question_type,
              prompt: question.prompt,
              points: Number(question.points),
              explanation: question.explanation,
              options: options
                .filter((option) => option.question_id === question.id)
                .map((option) => ({
                  id: option.id,
                  text: option.option_text,
                  isCorrect: option.is_correct,
                })),
            })),
          }
        : null,
      assignments: assignmentRows.map(presentAssignment),
    };
  }

  /** For a caller that has already been authorized for this quiz. */
  async function presentQuizById(quizId: string) {
    const quiz = await repo.findQuiz(database, quizId);
    if (!quiz) throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
    return presentQuiz(quiz);
  }

  async function getQuiz(actor: QuizActor, quizId: string) {
    return presentQuiz(await requireQuiz(quizId, actor));
  }

  async function getEditableVersion(trx: DatabaseExecutor, quizId: string) {
    const draft = await repo.findLatestVersion(trx, quizId, false);
    if (draft) return draft;
    const latest = await repo.listVersions(trx, quizId);
    const source = latest.at(-1);
    if (!source)
      throw new AppError(409, "QUIZ_VERSION_MISSING", "Quiz has no version.");
    const now = new Date();
    const version = await repo.insertVersion(trx, {
      id: crypto.randomUUID(),
      quiz_id: quizId,
      version_number:
        Math.max(...latest.map((item) => item.version_number)) + 1,
      instructions: source.instructions,
      created_at: now,
      published_at: null,
    });
    const questions = await repo.listQuestions(trx, source.id);
    const options = await repo.listOptions(
      trx,
      questions.map((question) => question.id),
    );
    // The copy is written in two statements, not two per question.
    const copies = questions.map((question) => ({
      source: question,
      id: crypto.randomUUID(),
    }));
    await repo.insertQuestions(
      trx,
      copies.map(({ source: question, id }) => ({
        id,
        quiz_version_id: version.id,
        question_type: question.question_type,
        prompt: question.prompt,
        points: question.points,
        position: question.position,
        // Remember which published question this copy came from, so an
        // edit addressed to the published id reaches the right draft row.
        configuration: {
          ...(isJsonObject(question.configuration)
            ? question.configuration
            : {}),
          sourceQuestionId: question.id,
        },
        explanation: question.explanation,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })),
    );
    await repo.insertOptions(
      trx,
      copies.flatMap(({ source: question, id }) =>
        options
          .filter((option) => option.question_id === question.id)
          .map((option) => ({
            id: crypto.randomUUID(),
            question_id: id,
            option_text: option.option_text,
            is_correct: option.is_correct,
            weight: option.weight,
            position: option.position,
            created_at: now,
            updated_at: now,
          })),
      ),
    );
    return version;
  }

  /**
   * Resolve a question against the editable snapshot. If the caller loaded a
   * published version before the first edit, its question IDs belong to that
   * immutable snapshot. Match that source question to its copy in the draft
   * so edits never mutate an attempt's pinned data. The copy records the id
   * it was made from; position and prompt are only a fallback for drafts
   * cloned before that was recorded — two questions can share a position
   * after a delete and an add, and matching on it edited the wrong one.
   */
  async function getEditableQuestion(
    trx: DatabaseExecutor,
    quizId: string,
    questionId: string,
  ) {
    let version = await repo.findLatestVersion(trx, quizId, false);
    if (version) {
      const draftQuestion = (
        await repo.listQuestionsByIds(trx, version.id, [questionId])
      )[0];
      if (draftQuestion) return { version, question: draftQuestion };
    }

    const sourceVersion = await repo.findLatestVersion(trx, quizId, true);
    if (!sourceVersion) {
      throw new AppError(404, "QUESTION_NOT_FOUND", "Question not found.");
    }
    const sourceQuestion = (
      await repo.listQuestionsByIds(trx, sourceVersion.id, [questionId])
    )[0];
    if (!sourceQuestion) {
      throw new AppError(404, "QUESTION_NOT_FOUND", "Question not found.");
    }

    version = await getEditableVersion(trx, quizId);
    const draftQuestions = await repo.listQuestions(trx, version.id);
    const question =
      draftQuestions.find(
        (candidate) =>
          isJsonObject(candidate.configuration) &&
          candidate.configuration.sourceQuestionId === sourceQuestion.id,
      ) ??
      draftQuestions.find(
        (candidate) => candidate.position === sourceQuestion.position,
      ) ??
      draftQuestions.find(
        (candidate) => candidate.prompt === sourceQuestion.prompt,
      );
    if (!question) {
      throw new AppError(
        409,
        "QUESTION_VERSION_MAPPING_FAILED",
        "The question could not be mapped to the editable Quiz version.",
      );
    }
    return { version, question };
  }

  async function updateQuiz(
    actor: QuizActor,
    quizId: string,
    payload: UpdateQuizRequest,
  ) {
    await requireQuiz(quizId, actor);
    await database.transaction().execute(async (trx) => {
      if (payload.title !== undefined || payload.description !== undefined)
        await repo.updateQuiz(trx, quizId, {
          title: payload.title,
          description: payload.description,
        });
      if (payload.instructions !== undefined) {
        const version = await getEditableVersion(trx, quizId);
        await repo.updateVersion(trx, version.id, {
          instructions: payload.instructions,
        });
      }
    });
    return presentQuizById(quizId);
  }

  async function addQuestion(
    actor: QuizActor,
    quizId: string,
    payload: CreateQuizQuestionRequest,
  ) {
    await requireQuiz(quizId, actor);
    validateQuestionPayload(payload);
    const questionId = crypto.randomUUID();
    await database.transaction().execute(async (trx) => {
      const version = await getEditableVersion(trx, quizId);
      await repo.insertQuestion(trx, {
        id: questionId,
        quiz_version_id: version.id,
        question_type: payload.questionType,
        prompt: payload.prompt,
        points: payload.points,
        position:
          payload.position ?? (await repo.countQuestions(trx, version.id)),
        configuration: {},
        explanation: payload.explanation ?? null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      });
      await repo.insertOptions(
        trx,
        payload.options.map((option, position) => ({
          id: option.id ?? crypto.randomUUID(),
          question_id: questionId,
          option_text: option.text,
          is_correct: option.isCorrect,
          weight: option.weight ?? (option.isCorrect ? 1 : 0),
          position: option.position ?? position,
          created_at: new Date(),
          updated_at: new Date(),
        })),
      );
    });
    return presentQuizById(quizId);
  }

  async function updateQuestion(
    actor: QuizActor,
    quizId: string,
    questionId: string,
    payload: UpdateQuizQuestionRequest,
  ) {
    await requireQuiz(quizId, actor);
    await database.transaction().execute(async (trx) => {
      const editable = await getEditableQuestion(trx, quizId, questionId);
      const currentOptions = await repo.listOptions(trx, [
        editable.question.id,
      ]);
      const next = {
        questionType: payload.questionType ?? editable.question.question_type,
        prompt: payload.prompt ?? editable.question.prompt,
        points: payload.points ?? Number(editable.question.points),
        position: payload.position ?? editable.question.position,
        explanation:
          payload.explanation !== undefined
            ? payload.explanation
            : editable.question.explanation,
        options:
          payload.options ??
          currentOptions.map((option) => ({
            text: option.option_text,
            isCorrect: option.is_correct,
            weight: Number(option.weight),
            position: option.position,
          })),
      } as CreateQuizQuestionRequest;
      validateQuestionPayload(next);
      await repo.updateQuestion(trx, editable.question.id, {
        question_type: next.questionType,
        prompt: next.prompt,
        points: next.points,
        position: next.position,
        explanation: next.explanation,
      });
      if (payload.options) {
        const currentOptionIds = new Set(
          currentOptions.map((option) => option.id),
        );
        await repo.deleteOptions(trx, editable.question.id);
        await repo.insertOptions(
          trx,
          next.options.map((option, position) => ({
            id:
              option.id && currentOptionIds.has(option.id)
                ? option.id
                : crypto.randomUUID(),
            question_id: editable.question.id,
            option_text: option.text,
            is_correct: option.isCorrect,
            weight: option.weight ?? (option.isCorrect ? 1 : 0),
            position: option.position ?? position,
            created_at: new Date(),
            updated_at: new Date(),
          })),
        );
      }
    });
    return presentQuizById(quizId);
  }

  async function deleteQuestion(
    actor: QuizActor,
    quizId: string,
    questionId: string,
  ) {
    await requireQuiz(quizId, actor);
    await database.transaction().execute(async (trx) => {
      const editable = await getEditableQuestion(trx, quizId, questionId);
      await repo.softDeleteQuestion(trx, editable.question.id);
    });
    return { success: true as const };
  }

  async function publish(actor: QuizActor, quizId: string) {
    await requireQuiz(quizId, actor);
    const version = await repo.findLatestVersion(database, quizId, false);
    if (!version)
      throw new AppError(
        409,
        "QUIZ_VERSION_MISSING",
        "Quiz has no draft version.",
      );
    const questions = await repo.listQuestions(database, version.id);
    if (!questions.length)
      throw new AppError(
        400,
        "QUIZ_NEEDS_QUESTION",
        "Add at least one question before publishing.",
      );
    const options = await repo.listOptions(
      database,
      questions.map((question) => question.id),
    );
    for (const question of questions) {
      const questionOptions = options.filter(
        (option) => option.question_id === question.id,
      );
      validateQuestionPayload({
        questionType: question.question_type,
        prompt: question.prompt,
        points: Number(question.points),
        position: question.position,
        explanation: question.explanation,
        options: questionOptions.map((option) => ({
          id: option.id,
          text: option.option_text,
          isCorrect: option.is_correct,
          weight: Number(option.weight),
          position: option.position,
        })),
      });
    }
    await database.transaction().execute(async (trx) => {
      await repo.updateVersion(trx, version.id, { published_at: new Date() });
      await repo.updateQuiz(trx, quizId, { status: "published" });
    });
    return presentQuizById(quizId);
  }

  async function deleteQuiz(actor: QuizActor, quizId: string) {
    await requireQuiz(quizId, actor);
    await database.transaction().execute(async (trx) => {
      const assignments = await repo.listAssignmentRefsForQuizzes(trx, [
        quizId,
      ]);
      assertNoLearnerAttempts(
        await repo.countLearnerAttempts(trx, {
          assignmentIds: assignments.map((assignment) => assignment.id),
          actorId: actor.id,
        }),
      );
      const lessonIds = assignments
        .map((a) => a.lesson_id)
        .filter((id): id is string => Boolean(id));
      if (lessonIds.length > 0) {
        await trx
          .updateTable("course_lessons")
          .set({ content_type: "video", updated_at: new Date() })
          .where("id", "in", lessonIds)
          .where("content_type", "=", "quiz")
          .execute();
      }
      await repo.deleteAssignmentsByQuizId(trx, quizId);
      await repo.softDeleteQuiz(trx, quizId);
    });
    return { success: true as const };
  }

  return {
    createQuiz,
    createQuizWithQuestions,
    listMine,
    getQuiz,
    updateQuiz,
    deleteQuiz,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    publish,
  };
}
export type AuthoringService = ReturnType<typeof createAuthoringService>;
