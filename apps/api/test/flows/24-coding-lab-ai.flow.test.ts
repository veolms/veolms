/**
 * Coding Lab v2: AI writes coding questions (drafts only), the AI settings
 * (key write-only, usage ledger, on/off), and a learner's practice counting
 * into their day (streak, minutes) and the Coding Lab stats. The AI provider
 * is a fake: no network, no cost.
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

/** What the fake AI answers, call by call; then the last one again. */
const answers: string[] = [];
const prompts: string[] = [];
const fake: AiProvider = {
  async generateJson(request) {
    prompts.push(request.user);
    const text = answers.length > 1 ? answers.shift()! : (answers[0] ?? "{}");
    request.onProgress?.(text.length);
    return {
      text,
      model: request.model,
      usage: {
        inputTokens: 10_000,
        outputTokens: 5_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      ending: "complete",
    };
  },
};
let lastCredentials: { apiKey: string; workspaceId: string | null } | null =
  null;
setAiProviderForTests((_provider, credentials) => {
  lastCredentials = credentials;
  return fake;
});

const QUESTION = {
  title: "Sum of an array",
  kind: "function",
  difficulty: "easy",
  estimatedMinutes: 10,
  topics: ["Arrays", "Loops"],
  statement: "Return the sum of `nums`.\n\n**Example:** `sum([1,2,3])` → `6`",
  starterFiles: [
    {
      path: "index.js",
      content: "function sum(nums) {\n  // TODO\n}\n",
      readOnly: false,
    },
  ],
  answerFiles: [
    {
      path: "index.js",
      content:
        "function sum(nums) {\n  return nums.reduce((a, b) => a + b, 0);\n}\n",
    },
  ],
  entryFile: "index.js",
  entryName: "sum",
  cases: [
    {
      name: "three numbers",
      argsJson: "[[1,2,3]]",
      expectedJson: "6",
      hidden: false,
      compare: "deepEqual",
    },
    {
      name: "empty",
      argsJson: "[[]]",
      expectedJson: "0",
      hidden: true,
      compare: "deepEqual",
    },
  ],
  testSource: "",
  hints: ["Start from 0.", "Add each number in a loop."],
  editorial: "## Approach\nAdd each number to a running total.",
  summary: "A short array question for this lecture.",
};

interface StreamEvent {
  type: "progress" | "done" | "error";
  code?: string;
  message?: string;
  summary?: string;
  exercise?: {
    id: string;
    title: string;
    status: string;
    createdWithAi: boolean;
    topics: string[];
    editable: {
      suiteHash: string;
      editorial: string;
      tests: { format: string; cases: { id: string; hidden: boolean }[] };
      hints: { body: string; unlockAfterFailedSubmits: number }[];
    };
  };
}

/** The NDJSON lines of a streamed answer. */
function events(body: unknown): StreamEvent[] {
  const raw = (body as { raw?: string }).raw ?? "";
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as StreamEvent);
}

const last = (body: unknown) => events(body).at(-1)!;

await test("AI settings: off by default, the key is write-only, a learner cannot see them", async () => {
  const fresh = await admin.get<{
    settings: { enabled: boolean; hasApiKey: boolean };
  }>("/v1/platform/ai-settings");
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.data!.settings.enabled, false);

  const saved = await admin.patch<{
    settings: { enabled: boolean; hasApiKey: boolean; apiKeyLast4: string };
  }>("/v1/platform/ai-settings", {
    enabled: true,
    apiKey: "sk-ant-flow-test-key-000000001234",
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data!.settings.hasApiKey, true);
  assert.equal(saved.body.data!.settings.apiKeyLast4, "1234");
  assert.ok(
    !JSON.stringify(saved.body).includes("sk-ant-flow-test-key"),
    "the key is never sent back",
  );

  const { client: learner } = await signedUpLearner(flow);
  const refused = await learner.get("/v1/platform/ai-settings");
  assert.equal(refused.status, 403);
});

await test("AI writes a draft question for a lecture, fixing its own mistakes once; nothing is published", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}, {}],
  });
  const lessonId = course.lessons[1]!.id;
  // The first answer has no hidden case: the API asks again with the problem.
  answers.length = 0;
  answers.push(
    JSON.stringify({
      ...QUESTION,
      cases: [{ ...QUESTION.cases[0], hidden: true }],
    }),
    JSON.stringify(QUESTION),
  );
  prompts.length = 0;
  const generated = await admin.post(
    `/v1/courses/${course.id}/coding-exercises/ai`,
    { lessonId, brief: "an array sum" },
  );
  assert.equal(generated.status, 200);
  const done = last(generated.body);
  assert.equal(done.type, "done", JSON.stringify(events(generated.body)));
  assert.ok(
    events(generated.body).some((event) => event.type === "progress"),
    "progress lines come first",
  );
  const exercise = done.exercise!;
  assert.equal(exercise.status, "draft");
  assert.equal(exercise.createdWithAi, true);
  assert.deepEqual(exercise.topics, ["Arrays", "Loops"]);
  assert.match(exercise.editable.editorial, /Approach/);
  assert.deepEqual(
    exercise.editable.tests.cases.map((item) => item.hidden),
    [false, true],
  );
  assert.equal(prompts.length, 2, "one repair round");
  assert.match(prompts[0]!, new RegExp(course.title));
  assert.match(prompts[0]!, /THIS LECTURE/);
  assert.match(prompts[1]!, /At least one case must be visible/);

  // Learners see nothing until it is published.
  const { client: learner } = await signedUpLearner(flow);
  await enrollForFree(learner, course);
  const list = await learner.get<{ items: unknown[] }>(
    `/v1/courses/${course.id}/practice`,
  );
  assert.equal(list.body.data!.items.length, 0);

  // Each call is in the usage ledger, with an estimated cost.
  const settings = await admin.get<{
    usage: { calls: number; costUsd: number; byFeature: { feature: string }[] };
  }>("/v1/platform/ai-settings");
  assert.ok(settings.body.data!.usage.calls >= 2);
  assert.ok(settings.body.data!.usage.costUsd > 0);
  assert.ok(
    settings.body.data!.usage.byFeature.some(
      (row) => row.feature === "coding.generate",
    ),
  );
});

await test("a key made outside a workspace sends the saved workspace id, which is shown masked", async () => {
  type Settings = {
    settings: { hasWorkspaceId: boolean; workspaceIdHint: string | null };
  };
  const saved = await admin.patch<Settings>("/v1/platform/ai-settings", {
    workspaceId: "wrkspc_flowtest123",
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data!.settings.hasWorkspaceId, true);
  assert.equal(saved.body.data!.settings.workspaceIdHint, "wrkspc_••••t123");
  assert.ok(
    !JSON.stringify(saved.body).includes("flowtest123"),
    "the whole id is never sent back",
  );
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}],
  });
  answers.length = 0;
  answers.push(JSON.stringify(QUESTION));
  lastCredentials = null;
  const made = last(
    (
      await admin.post(`/v1/courses/${course.id}/coding-exercises/ai`, {
        lessonId: course.lessons[1]!.id,
      })
    ).body,
  );
  assert.equal(made.type, "done");
  assert.deepEqual(lastCredentials, {
    apiKey: "sk-ant-flow-test-key-000000001234",
    workspaceId: "wrkspc_flowtest123",
  });
  const cleared = await admin.patch<Settings>("/v1/platform/ai-settings", {
    workspaceId: null,
  });
  assert.equal(cleared.body.data!.settings.hasWorkspaceId, false);
  assert.equal(cleared.body.data!.settings.workspaceIdHint, null);
});

await test("AI changes a draft on request and keeps its kind", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}],
  });
  answers.length = 0;
  answers.push(JSON.stringify(QUESTION));
  const made = last(
    (
      await admin.post(`/v1/courses/${course.id}/coding-exercises/ai`, {
        lessonId: course.lessons[1]!.id,
      })
    ).body,
  );
  assert.equal(made.type, "done");
  answers.length = 0;
  answers.push(JSON.stringify({ ...QUESTION, title: "Sum, with negatives" }));
  const revised = await admin.post(
    `/v1/coding-exercises/${made.exercise!.id}/ai/revise`,
    { instruction: "add negative numbers" },
  );
  const changed = last(revised.body);
  assert.equal(changed.type, "done", JSON.stringify(events(revised.body)));
  assert.equal(changed.exercise!.id, made.exercise!.id);
  assert.equal(changed.exercise!.title, "Sum, with negatives");

  answers.length = 0;
  answers.push(JSON.stringify({ ...QUESTION, kind: "react" }));
  const wrongKind = last(
    (
      await admin.post(`/v1/coding-exercises/${made.exercise!.id}/ai/revise`, {
        instruction: "make it React",
      })
    ).body,
  );
  assert.equal(wrongKind.type, "error");
  assert.equal(wrongKind.code, "AI_INVALID_QUESTION");
});

await test("learners cannot ask AI, and AI switched off says so", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}],
  });
  const { client: learner } = await signedUpLearner(flow);
  const refused = await learner.post(
    `/v1/courses/${course.id}/coding-exercises/ai`,
    { lessonId: course.lessons[1]!.id },
  );
  assert.equal(refused.status, 403);

  await admin.patch("/v1/platform/ai-settings", { enabled: false });
  const off = last(
    (
      await admin.post(`/v1/courses/${course.id}/coding-exercises/ai`, {
        lessonId: course.lessons[1]!.id,
      })
    ).body,
  );
  assert.equal(off.type, "error");
  assert.equal(off.code, "AI_DISABLED");
  await admin.patch("/v1/platform/ai-settings", { enabled: true });
});

await test("a learner's practice counts into their day and the Coding Lab stats", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}],
  });
  answers.length = 0;
  answers.push(JSON.stringify(QUESTION));
  const made = last(
    (
      await admin.post(`/v1/courses/${course.id}/coding-exercises/ai`, {
        lessonId: course.lessons[1]!.id,
      })
    ).body,
  ).exercise!;
  const published = await admin.post(
    `/v1/coding-exercises/${made.id}/publish`,
    {
      suiteHash: made.editable.suiteHash,
      solutionPassed: true,
      starterFailed: true,
    },
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));

  const { client: learner, userId: learnerId } = await signedUpLearner(flow);
  await enrollForFree(learner, course);
  const list = await learner.get<{
    items: {
      assignmentId: string;
      lessonTitle: string | null;
      topics: string[];
      mode: string;
    }[];
  }>(`/v1/courses/${course.id}/practice`);
  const item = list.body.data!.items[0]!;
  assert.ok(item.lessonTitle);
  assert.deepEqual(item.topics, ["Arrays", "Loops"]);
  assert.equal(item.mode, "practice");

  const opened = await learner.get<{
    assignment: { lessonTitle: string | null };
    exercise: {
      versionId: string;
      suiteHash: string;
      hasEditorial: boolean;
      tests: { cases: { id: string }[] };
    };
    state: { solutionAvailable: boolean };
  }>(`/v1/coding-assignments/${item.assignmentId}`);
  assert.equal(opened.status, 200);
  assert.equal(opened.body.data!.exercise.hasEditorial, true);
  // The editorial opens after three failed submits or a pass.
  assert.equal(opened.body.data!.state.solutionAvailable, false);

  const draft = await learner.put(
    `/v1/coding-assignments/${item.assignmentId}/draft`,
    {
      versionId: opened.body.data!.exercise.versionId,
      files: [{ path: "index.js", content: "function sum(nums) { }" }],
      activeSeconds: 60,
    },
  );
  assert.equal(draft.status, 200, JSON.stringify(draft.body));

  const { versionId, suiteHash, tests } = opened.body.data!.exercise;
  const submitted = await learner.post<{
    passed: boolean;
    firstPass: boolean;
    state: { bestSolveSeconds: number | null; solutionAvailable: boolean };
  }>(`/v1/coding-assignments/${item.assignmentId}/submissions`, {
    versionId,
    suiteHash,
    files: [
      {
        path: "index.js",
        content: "function sum(nums) { return nums.reduce((a,b)=>a+b,0); }",
      },
    ],
    results: tests.cases.map((testCase) => ({ id: testCase.id, passed: true })),
    solveSeconds: 300,
    // More than the time since the last save: the server caps it.
    activeSeconds: 900,
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.data!.firstPass, true);
  assert.equal(submitted.body.data!.state.bestSolveSeconds, 300);
  assert.equal(submitted.body.data!.state.solutionAvailable, true);

  const solution = await learner.post<{ editorial: string }>(
    `/v1/coding-assignments/${item.assignmentId}/solution`,
  );
  assert.equal(solution.status, 200);
  assert.match(solution.body.data!.editorial, /Approach/);

  const stats = await learner.get<{
    solved: { easy: number };
    available: { easy: number };
    submissions: number;
    streak: { current: number; best: number };
    calendar: { submissions: number; solved: number }[];
    activeMinutes: number;
  }>(`/v1/practice/me?courseId=${course.id}`);
  assert.equal(stats.status, 200, JSON.stringify(stats.body));
  const data = stats.body.data!;
  assert.equal(data.solved.easy, 1);
  assert.equal(data.available.easy, 1);
  assert.equal(data.submissions, 1);
  assert.equal(data.streak.current, 1);
  assert.equal(data.calendar.length, 1);
  // 60 s from the draft (a first save may count up to 120 s); the submit's
  // claim is capped by the seconds since that save.
  assert.ok(data.activeMinutes <= 2, `active minutes ${data.activeMinutes}`);

  // The day's ledger has the coding time and one completion.
  const day = await flow.database
    .selectFrom("learning_daily_activity")
    .select(["seconds", "completions"])
    .where("user_id", "=", learnerId)
    .executeTakeFirst();
  assert.ok(day, "a day was credited");
  assert.equal(day.completions, 1);
  assert.ok(day.seconds >= 60 && day.seconds < 120, `seconds ${day.seconds}`);

  const courses = await learner.get<{
    courses: { courseId: string; solved: number; total: number }[];
  }>("/v1/practice/courses");
  const row = courses.body.data!.courses.find(
    (entry) => entry.courseId === course.id,
  );
  assert.deepEqual(row && [row.solved, row.total], [1, 1]);
});

setAiProviderForTests(null);
await flow.close();
