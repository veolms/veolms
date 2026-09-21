import crypto from "node:crypto";
import type { Database, DatabaseExecutor } from "@veolms/database";
import type {
  CreateQuizQuestionRequest,
  CreateQuizRequest,
  CreateQuizWithQuestionsRequest,
  UpdateQuizQuestionRequest,
  UpdateQuizRequest,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import * as repo from "../shared/quiz.repository.ts";
import * as pricingRepo from "../shared/quiz-pricing.repository.ts";
import type { QuizActor, QuizServiceOptions } from "../shared/quiz.types.ts";
import { isAdmin } from "../shared/quiz.types.ts";

type OptionInput = CreateQuizQuestionRequest["options"];

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

export function createAuthoringService(options: QuizServiceOptions) {
  const { database } = options;

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

  async function requireQuiz(quizId: string, actor: QuizActor) {
    const quiz = await repo.findQuiz(database, quizId);
    if (!quiz) throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
    const currentAcademyId = await academyId();
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
        academy_id: await academyId(),
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
    return getQuiz(actor, quizId);
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
        academy_id: await academyId(),
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

    return getQuiz(actor, quizId);
  }

  async function listMine(actor: QuizActor) {
    const rows = isAdmin(actor)
      ? await repo.listQuizzesByAcademy(database, await academyId())
      : await repo.listQuizzesByCreator(database, actor.id);
    return Promise.all(rows.map((quiz) => getQuiz(actor, quiz.id)));
  }

  async function presentQuiz(quizId: string) {
    const quiz = await repo.findQuiz(database, quizId);
    if (!quiz) throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
    const versions = await repo.listVersions(database, quizId);
    const result = [];
    for (const version of versions) {
      const questions = await repo.listQuestions(database, version.id);
      const options = await repo.listOptions(
        database,
        questions.map((question) => question.id),
      );
      result.push({
        id: version.id,
        versionNumber: version.version_number,
        instructions: version.instructions,
        publishedAt: iso(version.published_at),
        questions: questions.map((question) => ({
          id: question.id,
          questionType: question.question_type,
          prompt: question.prompt,
          points: Number(question.points),
          position: question.position,
          explanation: question.explanation,
          options: options
            .filter((option) => option.question_id === question.id)
            .map((option) => ({
              id: option.id,
              text: option.option_text,
              isCorrect: option.is_correct,
              weight: Number(option.weight),
              position: option.position,
            })),
        })),
      });
    }
    const assignmentRows = await repo.listAssignmentsForQuizzes(database, [quizId]);
    const pricingByCourseId = new Map(
      (
        await pricingRepo.listPricingForCourses(database, [
          ...new Set(assignmentRows.map((row) => row.course_id)),
        ])
      ).map((pricing) => [pricing.course_id, pricing] as const),
    );
    const assignments = assignmentRows.map((row) => {
      const pricing = pricingByCourseId.get(row.course_id);
      return {
      id: row.id,
      quizId: row.quiz_id,
      quizVersionId: row.quiz_version_id,
      courseId: row.course_id,
      lessonId: row.lesson_id,
      required: row.required,
      passPercentage: Number(row.pass_percentage),
      maxAttempts: row.max_attempts,
      timeLimitSeconds: row.time_limit_seconds,
      shuffleQuestions: row.shuffle_questions,
      shuffleOptions: row.shuffle_options,
      feedbackMode: row.feedback_mode,
      availableFrom: row.available_from?.toISOString() ?? null,
      availableUntil: row.available_until?.toISOString() ?? null,
      quizPricingId: pricing?.id ?? null,
      pricingType: pricing?.pricing_type ?? ("free" as const),
      price: Number(pricing?.price ?? 0),
      currency: pricing?.currency ?? "INR",
      salePrice:
        pricing?.sale_price !== null && pricing?.sale_price !== undefined
          ? Number(pricing.sale_price)
          : null,
      };
    });
    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      status: quiz.status,
      createdAt: quiz.created_at.toISOString(),
      updatedAt: quiz.updated_at.toISOString(),
      versions: result,
      assignments,
    };
  }

  async function getQuiz(actor: QuizActor, quizId: string) {
    await requireQuiz(quizId, actor);
    return presentQuiz(quizId);
  }

  async function getEditableVersion(trx: DatabaseExecutor, quizId: string) {
    const draft = await repo.findLatestVersion(trx, quizId, false);
    if (draft) return draft;
    const latest = await repo.listVersions(trx, quizId);
    const source = latest.at(-1);
    if (!source)
      throw new AppError(409, "QUIZ_VERSION_MISSING", "Quiz has no version.");
    const version = await repo.insertVersion(trx, {
      id: crypto.randomUUID(),
      quiz_id: quizId,
      version_number:
        Math.max(...latest.map((item) => item.version_number)) + 1,
      instructions: source.instructions,
      created_at: new Date(),
      published_at: null,
    });
    const questions = await repo.listQuestions(trx, source.id);
    const options = await repo.listOptions(
      trx,
      questions.map((question) => question.id),
    );
    for (const question of questions) {
      const questionId = crypto.randomUUID();
      await repo.insertQuestion(trx, {
        id: questionId,
        quiz_version_id: version.id,
        question_type: question.question_type,
        prompt: question.prompt,
        points: question.points,
        position: question.position,
        configuration: question.configuration,
        explanation: question.explanation,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      });
      await repo.insertOptions(
        trx,
        options
          .filter((option) => option.question_id === question.id)
          .map((option) => ({
            id: crypto.randomUUID(),
            question_id: questionId,
            option_text: option.option_text,
            is_correct: option.is_correct,
            weight: option.weight,
            position: option.position,
            created_at: new Date(),
            updated_at: new Date(),
          })),
      );
    }
    return version;
  }

  /**
   * Resolve a question against the editable snapshot. If the caller loaded a
   * published version before the first edit, its question IDs belong to that
   * immutable snapshot. Match that source question to the cloned draft by its
   * stable authoring position so edits never mutate an attempt's pinned data.
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
    return getQuiz(actor, quizId);
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
      const existing = await repo.listQuestions(trx, version.id);
      await repo.insertQuestion(trx, {
        id: questionId,
        quiz_version_id: version.id,
        question_type: payload.questionType,
        prompt: payload.prompt,
        points: payload.points,
        position: payload.position ?? existing.length,
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
    return getQuiz(actor, quizId);
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
    return getQuiz(actor, quizId);
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
    return getQuiz(actor, quizId);
  }

  async function deleteQuiz(actor: QuizActor, quizId: string) {
    await requireQuiz(quizId, actor);
    await database.transaction().execute(async (trx) => {
      const assignments = await repo.listAssignmentsForQuizzes(trx, [quizId]);
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
    presentQuiz,
  };
}
export type AuthoringService = ReturnType<typeof createAuthoringService>;
