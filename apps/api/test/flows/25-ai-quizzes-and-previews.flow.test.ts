/**
 * AI for quizzes and questions for a whole course, and staff trying draft
 * coding questions as a student. The AI provider is a fake that answers
 * by what it is asked (a quiz, whether a lecture deserves a coding
 * question, a coding question): no network, no cost.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

// The flow environment first: the API's config is read on first import.
import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";
import { setAiProviderForTests } from "../../src/modules/ai/index.ts";
import type { AiProvider } from "../../src/modules/ai/index.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

const CODING_QUESTION = {
  title: "Double each number",
  kind: "function",
  difficulty: "easy",
  estimatedMinutes: 10,
  topics: ["Arrays"],
  statement: "Return a new array with each number doubled.",
  starterFiles: [
    {
      path: "index.js",
      content: "function double(nums) {\n  // TODO\n}\n",
      readOnly: false,
    },
  ],
  answerFiles: [
    {
      path: "index.js",
      content: "function double(nums) {\n  return nums.map((n) => n * 2);\n}\n",
    },
  ],
  entryFile: "index.js",
  entryName: "double",
  cases: [
    {
      name: "three",
      argsJson: "[[1,2,3]]",
      expectedJson: "[2,4,6]",
      hidden: false,
      compare: "deepEqual",
    },
    {
      name: "empty",
      argsJson: "[[]]",
      expectedJson: "[]",
      hidden: true,
      compare: "deepEqual",
    },
  ],
  testSource: "",
  hints: ["Use map."],
  editorial: "## Approach\nMap each number to twice itself.",
  summary: "Doubling numbers.",
};

const quizQuestion = (n: number) => ({
  type: "single_choice",
  prompt: `What does step ${n} of this lecture do?`,
  explanation: "It is the step the lecture shows first.",
  options: [
    { text: `Answer A${n}`, correct: true },
    { text: `Answer B${n}`, correct: false },
    { text: `Answer C${n}`, correct: false },
  ],
});

/** The quiz answers the fake gives, call by call; then the last again. */
const quizAnswers: string[] = [];
const prompts: { system: string; user: string }[] = [];
const fake: AiProvider = {
  async generateJson(request) {
    prompts.push({ system: request.system, user: request.user });
    let text: string;
    if (request.system.startsWith("You write quiz questions")) {
      const required =
        (request.schema as { required?: string[] }).required ?? [];
      text = required.includes("question")
        ? JSON.stringify({
            question: {
              ...quizQuestion(9),
              prompt: "A clearer question about step 9?",
            },
            summary: "Made it clearer.",
          })
        : quizAnswers.length > 1
          ? quizAnswers.shift()!
          : (quizAnswers[0] ??
            JSON.stringify({
              title: "Quick check",
              summary: "Three questions.",
              questions: [quizQuestion(1), quizQuestion(2), quizQuestion(3)],
            }));
    } else if (request.system.startsWith("You help the teacher")) {
      text = JSON.stringify({
        worthIt: true,
        brief: "Double numbers in an array.",
        reason: "It teaches map.",
      });
    } else {
      text = JSON.stringify(CODING_QUESTION);
    }
    request.onProgress?.(text.length);
    return {
      text,
      model: request.model,
      usage: {
        inputTokens: 5_000,
        outputTokens: 2_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      ending: "complete",
    };
  },
};
setAiProviderForTests(() => fake);

interface StreamEvent {
  type: "progress" | "done" | "error";
  code?: string;
  message?: string;
  summary?: string;
  title?: string;
  questions?: {
    questionType: string;
    prompt: string;
    options: { text: string; isCorrect: boolean }[];
  }[];
  exercise?: { id: string; status: string; assignments: { id: string }[] };
}
const events = (body: unknown): StreamEvent[] =>
  ((body as { raw?: string }).raw ?? "")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as StreamEvent);
const last = (body: unknown) => events(body).at(-1)!;

await test("AI is turned on for these tests", async () => {
  const saved = await admin.patch("/v1/platform/ai-settings", {
    enabled: true,
    apiKey: "sk-ant-flow-test-key-000000005678",
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
});

await test("staff open a draft coding question as a student (preview); students cannot see it", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}],
  });
  const made = last(
    (
      await admin.post(`/v1/courses/${course.id}/coding-exercises/ai`, {
        lessonId: course.lessons[1]!.id,
      })
    ).body,
  );
  assert.equal(made.type, "done", JSON.stringify(made));
  const assignmentId = made.exercise!.assignments[0]!.id;

  const preview = await admin.get<{
    preview?: boolean;
    draft: unknown;
    exercise: { title: string };
  }>(`/v1/coding-assignments/${assignmentId}`);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.data!.preview, true);
  assert.equal(preview.body.data!.draft, null);
  assert.equal(preview.body.data!.exercise.title, "Double each number");

  const staffList = await admin.get<{
    items: { assignmentId: string; draft?: boolean }[];
  }>(`/v1/courses/${course.id}/practice`);
  assert.deepEqual(
    staffList.body.data!.items.map((item) => [item.assignmentId, item.draft]),
    [[assignmentId, true]],
  );
  const editorial = await admin.post<{ editorial: string }>(
    `/v1/coding-assignments/${assignmentId}/solution?preview=1`,
  );
  assert.equal(editorial.status, 200, JSON.stringify(editorial.body));
  assert.match(editorial.body.data!.editorial, /Approach/);

  const { client: learner } = await signedUpLearner(flow);
  await enrollForFree(learner, course);
  const learnerList = await learner.get<{ items: unknown[] }>(
    `/v1/courses/${course.id}/practice`,
  );
  assert.equal(learnerList.body.data!.items.length, 0);
  const refused = await learner.get(`/v1/coding-assignments/${assignmentId}`);
  assert.equal(refused.status, 404);
  const refusedPreview = await learner.get(
    `/v1/coding-assignments/${assignmentId}?preview=1`,
  );
  assert.equal(refusedPreview.status, 404);
});

await test("AI writes a lecture's quiz in plain order, replacing a broken question; nothing is saved", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, { title: "Arrays with map" }, {}],
  });
  const lessonId = course.lessons[1]!.id;
  const broken = {
    ...quizQuestion(2),
    options: quizQuestion(2).options.map((option) => ({
      ...option,
      correct: true,
    })),
  };
  quizAnswers.length = 0;
  quizAnswers.push(
    JSON.stringify({
      title: "Quick check",
      summary: "s",
      questions: [quizQuestion(1), broken, quizQuestion(3)],
    }),
    JSON.stringify({ title: "", summary: "", questions: [quizQuestion(4)] }),
  );
  prompts.length = 0;
  const response = await admin.post(
    `/v1/courses/${course.id}/lessons/${lessonId}/quiz-ai`,
    {
      count: 3,
      types: ["single_choice"],
    },
  );
  assert.equal(response.status, 200);
  const done = last(response.body);
  assert.equal(done.type, "done", JSON.stringify(events(response.body)));
  assert.deepEqual(
    done.questions!.map((question) => question.prompt),
    [quizQuestion(1).prompt, quizQuestion(3).prompt, quizQuestion(4).prompt],
  );
  assert.equal(prompts.length, 2, "one round for the broken question");
  assert.match(prompts[0]!.user, /Title: Arrays with map/);
  assert.match(prompts[0]!.user, /NOT taught yet/);
  assert.match(prompts[1]!.user, /exactly one correct option/);
  const saved = await flow.database
    .selectFrom("quiz_assignments")
    .select("id")
    .where("lesson_id", "=", lessonId)
    .execute();
  assert.equal(saved.length, 0, "the editor saves it, not the AI");

  const revised = last(
    (
      await admin.post(
        `/v1/courses/${course.id}/lessons/${lessonId}/quiz-ai/revise`,
        {
          question: {
            questionType: "single_choice",
            prompt: "Old?",
            points: 2,
            options: [
              { text: "a", isCorrect: true },
              { text: "b", isCorrect: false },
              { text: "c", isCorrect: false },
            ],
          },
          instruction: "make it clearer",
        },
      )
    ).body,
  );
  assert.equal(revised.type, "done", JSON.stringify(revised));
  assert.equal(
    revised.questions![0]!.prompt,
    "A clearer question about step 9?",
  );
});

await test("one press writes draft quizzes and coding questions for every lecture, hidden until published", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}, {}],
  });
  quizAnswers.length = 0;
  const started = await admin.post<{
    id: string;
    status: string;
    totalItems: number;
  }>(`/v1/courses/${course.id}/question-jobs`, {
    questionsPerQuiz: 3,
    types: ["single_choice"],
  });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.equal(started.body.data!.totalItems, 3);
  const again = await admin.post(`/v1/courses/${course.id}/question-jobs`, {});
  assert.equal(again.status, 409, "one run per course at a time");

  type Job = {
    id: string;
    status: string;
    quizzesCreated: number;
    codingCreated: number;
    items: {
      position: number;
      status: string;
      quiz: { id: string; status: string; questionCount: number } | null;
      coding: { status: string } | null;
    }[];
  };
  let job: Job | null = null;
  for (let wait = 0; wait < 120; wait += 1) {
    const latest = await admin.get<{ job: Job | null }>(
      `/v1/courses/${course.id}/question-jobs/latest`,
    );
    job = latest.body.data!.job;
    if (job && (job.status === "done" || job.status === "failed")) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(job?.status, "done", JSON.stringify(job));
  assert.equal(job!.quizzesCreated, 3);
  assert.equal(job!.codingCreated, 3);
  assert.deepEqual(
    job!.items.map((item) => item.position),
    [1, 2, 3],
    "course order",
  );
  for (const item of job!.items) {
    assert.equal(item.quiz?.status, "draft");
    assert.equal(item.quiz?.questionCount, 3);
    assert.equal(item.coding?.status, "draft");
  }

  // Attached to their lectures as drafts, and nobody was told.
  const attached = await flow.database
    .selectFrom("quiz_assignments")
    .select("id")
    .where("course_id", "=", course.id)
    .execute();
  assert.equal(attached.length, 3);
  const told = await flow.database
    .selectFrom("outbox_events")
    .select("id")
    .where("event_type", "=", "quiz.assigned")
    .where(
      "dedupe_key",
      "in",
      attached.map((row) => `quiz:assigned:${row.id}`),
    )
    .execute();
  assert.equal(told.length, 0, "no notification for a draft quiz");

  const published = await admin.post<Job>(
    `/v1/question-jobs/${job!.id}/publish-quizzes`,
    {},
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.ok(
    published.body.data!.items.every(
      (item) => item.quiz?.status === "published",
    ),
  );
});

setAiProviderForTests(null);
await flow.close();
