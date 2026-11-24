import type {
  CodingAiStreamEvent,
  CodingExercise,
  CodingSettings,
  GenerateCodingExerciseRequest,
  ReviseCodingExerciseRequest,
} from "@veolms/contracts";
import { generateCodingExerciseRequestSchema } from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import type { AiService } from "../../ai/index.ts";
import type { CourseService } from "../../courses/course/course.service.ts";
import type { CodingAuthoringService } from "../authoring/authoring.service.ts";
import * as repo from "../shared/coding.repository.ts";
import { readContent } from "../shared/coding.presenters.ts";
import { DEFAULT_CODING_SETTINGS } from "../shared/coding.suite.ts";
import type { CodingActor } from "../shared/coding.types.ts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import {
  convertAiOutput,
  type ConvertedQuestion,
} from "./coding-ai.convert.ts";
import {
  CODING_AI_OUTPUT_SCHEMA,
  CODING_AI_SYSTEM,
} from "./coding-ai.prompt.ts";

/** Room for thinking plus a full question (files, tests, editorial). */
const MAX_TOKENS = 48_000;
/** How much of a lecture's own text goes to the AI. */
const LECTURE_TEXT_CHARS = 12_000;
const COURSE_TEXT_CHARS = 2_000;
const OUTLINE_LESSONS = 400;

type Emit = (event: CodingAiStreamEvent) => void;

export interface CodingAiServiceOptions {
  database: Kysely<Database>;
  ai: AiService;
  authoring: CodingAuthoringService;
  courseService: Pick<
    CourseService,
    "findCourseById" | "getCourseContent" | "getLessonDescription"
  >;
}

const clip = (text: string | null | undefined, chars: number) => {
  const value = (text ?? "").trim();
  return value.length > chars ? `${value.slice(0, chars)}\n[…cut]` : value;
};

/**
 * Writes coding questions with AI: a new draft for a lecture, or a change
 * to a question's draft. The result is never published: the author checks
 * it in the editor (the answer must pass, the starter must fail) and
 * publishes it as any other question.
 */
export function createCodingAiService(options: CodingAiServiceOptions) {
  const { database, ai, authoring, courseService } = options;

  /** The course and lecture, as the AI reads them. */
  async function courseContext(
    actor: CodingActor,
    courseId: string,
    lessonId: string | null,
  ) {
    const course = await courseService.findCourseById(courseId);
    if (!course)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    const content = await courseService.getCourseContent(course);
    const sections = [...content.sections].sort(
      (left, right) => left.position - right.position,
    );
    const lessons = [...content.lessons].sort(
      (left, right) => left.position - right.position,
    );
    const lesson = lessonId
      ? lessons.find((item) => item.id === lessonId)
      : undefined;
    let shown = 0;
    const outline = sections
      .map((section) => {
        const items = lessons
          .filter((item) => item.section_id === section.id)
          .map((item) => {
            shown += 1;
            if (shown > OUTLINE_LESSONS) return null;
            return `  - ${item.title}${item.id === lessonId ? "   ← THIS LECTURE" : ""}`;
          })
          .filter(Boolean);
        return `- ${section.title}\n${items.join("\n")}`;
      })
      .join("\n");
    let lectureText = "";
    if (lesson) {
      try {
        lectureText =
          (
            await courseService.getLessonDescription(courseId, lesson.id, {
              id: actor.id,
              roles: actor.roles,
            })
          ).description ?? "";
      } catch {
        lectureText = lesson.description ?? "";
      }
    }
    const existing = await repo.listCourseExercises(database, courseId);
    const section = lesson
      ? sections.find((item) => item.id === lesson.section_id)
      : undefined;
    return {
      course,
      lesson,
      text: [
        `# Course: ${course.title}`,
        clip(course.short_description, 500),
        clip(course.description, COURSE_TEXT_CHARS),
        `\n# Curriculum (sections and lectures, in order)\n${outline}`,
        lesson
          ? `\n# This lecture\nSection: ${section?.title ?? "?"}\nTitle: ${lesson.title}\nKind of lesson: ${lesson.content_type}\n\nWhat the lecture covers (its description / notes; may contain video chapter times):\n${clip(lectureText, LECTURE_TEXT_CHARS) || "(no description written)"}`
          : "",
        existing.length
          ? `\n# Questions the course already has (don't repeat them)\n${existing
              .slice(0, 80)
              .map((row) => `- ${row.title} (${row.kind}, ${row.difficulty})`)
              .join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  /** Asks the AI, checks the answer, and asks once more to fix problems. */
  async function ask(input: {
    actor: CodingActor;
    feature: "coding.generate" | "coding.revise";
    subjectId: string | null;
    user: string;
    settings: CodingSettings;
    requiredKind?: ConvertedQuestion["kind"];
    emit: Emit;
    signal: AbortSignal;
    /** A course-wide run: no per-person burst limit (see AiRunRequest). */
    background?: boolean;
  }): Promise<ConvertedQuestion> {
    let message = input.user;
    for (let round = 0; round < 2; round += 1) {
      input.emit({
        type: "progress",
        stage: "writing",
        message:
          round === 0 ? "Writing the question…" : "Fixing what was wrong…",
        chars: 0,
      });
      let lastSent = 0;
      const { text } = await ai.runJson({
        feature: input.feature,
        userId: input.actor.id,
        subjectId: input.subjectId,
        system: CODING_AI_SYSTEM,
        user: message,
        schema: CODING_AI_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: MAX_TOKENS,
        effort: "high",
        signal: input.signal,
        background: input.background,
        onProgress: (chars) => {
          if (chars - lastSent < 400) return;
          lastSent = chars;
          input.emit({
            type: "progress",
            stage: "writing",
            message: "Writing the question…",
            chars,
          });
        },
      });
      input.emit({
        type: "progress",
        stage: "checking",
        message: "Checking the answer…",
      });
      const result = convertAiOutput(text, {
        settings: input.settings,
        requiredKind: input.requiredKind,
      });
      if (result.question) return result.question;
      if (round === 1)
        throw new AppError(
          422,
          "AI_INVALID_QUESTION",
          `The AI's question was not usable: ${result.problems.slice(0, 4).join(" ")}`,
        );
      message = `${input.user}\n\n# Your previous answer had these problems\n${result.problems
        .map((problem) => `- ${problem}`)
        .join(
          "\n",
        )}\n\nYour previous answer was:\n${text.slice(0, 60_000)}\n\nReturn the whole corrected JSON.`;
    }
    throw new AppError(
      422,
      "AI_INVALID_QUESTION",
      "The AI's question was not usable.",
    );
  }

  async function generate(
    actor: CodingActor,
    courseId: string,
    rawRequest: GenerateCodingExerciseRequest,
    emit: Emit,
    signal: AbortSignal,
    run: { background?: boolean } = {},
  ): Promise<CodingExercise> {
    const request = generateCodingExerciseRequestSchema.parse(rawRequest);
    await authoring.requireManagedLesson(actor, courseId, request.lessonId);
    emit({
      type: "progress",
      stage: "context",
      message: "Reading the course…",
    });
    const context = await courseContext(actor, courseId, request.lessonId);
    const settings: CodingSettings = {
      ...DEFAULT_CODING_SETTINGS,
      bestOnDesktop: request.kind === "web" || request.kind === "react",
      mode: request.mode,
      timeLimitMinutes:
        request.mode === "machine_coding"
          ? (request.timeLimitMinutes ?? 45)
          : null,
    };
    const wanted = [
      `\n# What to write`,
      `Kind: ${request.kind === "auto" ? "choose the kind that fits this lecture best (function for logic/algorithms; web for HTML/CSS/DOM; react for React; node for Node.js modules)" : request.kind}`,
      `Difficulty: ${request.difficulty === "auto" ? "choose what fits this point of the course" : request.difficulty}`,
      `Language: ${request.language === "typescript" ? "TypeScript (.ts/.tsx files)" : "JavaScript (.js/.jsx files)"}`,
      request.mode === "machine_coding"
        ? `Format: a machine coding round (interview style) of about ${settings.timeLimitMinutes} minutes: a small but complete feature with clear requirements.`
        : "Format: practice right after the lecture.",
      request.brief
        ? `The instructor's brief (follow it): ${request.brief}`
        : "No brief: pick the single most useful question for what this lecture teaches.",
    ].join("\n");
    const question = await ask({
      actor,
      feature: "coding.generate",
      subjectId: null,
      user: `${context.text}\n${wanted}`,
      settings,
      requiredKind: request.kind === "auto" ? undefined : request.kind,
      emit,
      signal,
      background: run.background,
    });
    emit({ type: "progress", stage: "saving", message: "Saving the draft…" });
    const exercise = await authoring.createExercise(actor, courseId, {
      lessonId: request.lessonId,
      title: question.title,
      kind: question.kind,
      difficulty: question.difficulty,
      estimatedMinutes: question.estimatedMinutes,
      topics: question.topics,
      content: question.content,
      createdWithAi: true,
    });
    emit({
      type: "done",
      exercise,
      summary: question.summary || `Wrote “${question.title}”.`,
    });
    return exercise;
  }

  async function revise(
    actor: CodingActor,
    exerciseId: string,
    request: ReviseCodingExerciseRequest,
    emit: Emit,
    signal: AbortSignal,
  ): Promise<CodingExercise> {
    const exercise = await authoring.requireEditable(actor, exerciseId);
    if (!request.instruction?.trim() && !request.checkReport?.trim())
      throw new AppError(
        400,
        "AI_NOTHING_TO_DO",
        "Say what to change, or run Check tests first.",
      );
    const latest = await repo.findLatestVersion(database, exerciseId);
    if (!latest)
      throw new AppError(
        404,
        "CODING_EXERCISE_NOT_FOUND",
        "Exercise not found.",
      );
    const links = await repo.listLinksByExercise(database, exerciseId);
    emit({
      type: "progress",
      stage: "context",
      message: "Reading the question…",
    });
    const context = await courseContext(
      actor,
      exercise.course_id,
      links.find((link) => link.lesson_id)?.lesson_id ?? null,
    );
    const content = readContent(latest);
    const current = {
      title: exercise.title,
      kind: exercise.kind,
      difficulty: exercise.difficulty,
      estimatedMinutes: exercise.estimated_minutes,
      topics: exercise.topics ?? [],
      statement: content.statement,
      starterFiles: content.starterFiles,
      answerFiles: content.solutionFiles,
      entry: content.entry,
      tests: content.tests,
      hints: content.hints.map((hint) => hint.body),
      editorial: content.editorial,
    };
    const question = await ask({
      actor,
      feature: "coding.revise",
      subjectId: exerciseId,
      user: [
        context.text,
        `\n# The question as it is now (JSON; for function questions "tests.cases" hold args/expected as values — return them as argsJson/expectedJson strings)\n${JSON.stringify(current).slice(0, 80_000)}`,
        request.checkReport?.trim()
          ? `\n# What the instructor's Check tests found (fix all of it: the answer must pass every test, the starter must fail at least one)\n${request.checkReport.trim()}`
          : "",
        request.instruction?.trim()
          ? `\n# The instructor asks\n${request.instruction.trim()}`
          : "",
        `\nKeep the kind "${exercise.kind}". Keep everything that is fine; change what is asked. Return the whole question.`,
      ]
        .filter(Boolean)
        .join("\n"),
      settings: content.settings,
      requiredKind: exercise.kind,
      emit,
      signal,
    });
    emit({ type: "progress", stage: "saving", message: "Saving the draft…" });
    const updated = await authoring.update(actor, exerciseId, {
      title: question.title,
      difficulty: question.difficulty,
      estimatedMinutes: question.estimatedMinutes,
      topics: question.topics,
      statement: question.content.statement,
      starterFiles: question.content.starterFiles,
      solutionFiles: question.content.solutionFiles,
      entry: question.content.entry,
      tests: question.content.tests,
      hints: question.content.hints,
      editorial: question.content.editorial,
    });
    emit({
      type: "done",
      exercise: updated,
      summary: question.summary || "Updated the question.",
    });
    return updated;
  }

  return { generate, revise };
}

export type CodingAiService = ReturnType<typeof createCodingAiService>;
