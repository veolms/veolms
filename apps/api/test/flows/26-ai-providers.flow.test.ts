/**
 * More than one AI provider: each with its own key, any model of a
 * connected provider for one-lecture help and for Economy / Balanced /
 * Best, models an admin adds with their price, and the effort setting.
 * The provider is a fake that records which provider, key, model and
 * effort each call got: no network, no cost.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

// The flow environment first: the API's config is read on first import.
import { signedInAdmin, startFlowApp } from "./setup/flow-app.ts";
import { createCourse } from "./setup/flow-courses.ts";
import { setAiProviderForTests } from "../../src/modules/ai/index.ts";

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

const QUIZ = {
  title: "Quick check",
  summary: "Three questions.",
  questions: [1, 2, 3].map((n) => ({
    type: "single_choice",
    prompt: `Which line doubles number ${n}?`,
    explanation: "map gives a new array.",
    options: [
      { text: `Line A${n}`, correct: true },
      { text: `Line B${n}`, correct: false },
      { text: `Line C${n}`, correct: false },
    ],
  })),
};

interface Call {
  provider: string;
  apiKey: string;
  model: string;
  effort: string | null;
  kind: "quiz" | "gate" | "coding" | "test";
}
const calls: Call[] = [];

setAiProviderForTests((provider, credentials) => ({
  async generateJson(request) {
    const kind: Call["kind"] = request.system.startsWith(
      "You write quiz questions",
    )
      ? "quiz"
      : request.system.startsWith("You help the teacher")
        ? "gate"
        : request.system.startsWith("Answer with the JSON")
          ? "test"
          : "coding";
    calls.push({
      provider,
      apiKey: credentials.apiKey,
      model: request.model,
      effort: request.effort,
      kind,
    });
    const text =
      kind === "quiz"
        ? JSON.stringify(QUIZ)
        : kind === "gate"
          ? JSON.stringify({
              worthIt: true,
              brief: "Double numbers.",
              reason: "It teaches map.",
            })
          : kind === "test"
            ? '{"ok":true}'
            : JSON.stringify(CODING_QUESTION);
    return {
      text,
      model: request.model,
      usage: {
        inputTokens: 4_000,
        outputTokens: 1_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      ending: "complete",
    };
  },
}));

type Provider = {
  id: string;
  connected: boolean;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
};
type Model = {
  id: string;
  provider: string;
  available: boolean;
  custom: boolean;
};
type Settings = {
  settings: {
    model: string;
    provider: string;
    tierModels: Record<"economy" | "balanced" | "best", string>;
    effort: string;
    providers: Provider[];
    models: Model[];
  };
  usage: { byModel: { provider: string; model: string; calls: number }[] };
};

const OPENAI_KEY = "sk-openai-flow-test-key-0000004321";
const GEMINI_KEY = "AIza-gemini-flow-test-key-000008765";
const XAI_KEY = "xai-grok-flow-test-key-0000000999";

const settings = async () =>
  (await admin.get<Settings>("/v1/platform/ai-settings")).body.data!.settings;
const patch = (body: object) =>
  admin.patch<Settings>("/v1/platform/ai-settings", body);
const saveKey = (provider: string, body: object) =>
  admin.put<Settings>(`/v1/platform/ai-providers/${provider}`, body);

const events = (body: unknown) =>
  ((body as { raw?: string }).raw ?? "")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as { type: string; code?: string });

async function oneLectureQuestion() {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}],
  });
  calls.length = 0;
  const response = await admin.post(
    `/v1/courses/${course.id}/coding-exercises/ai`,
    { lessonId: course.lessons[1]!.id },
  );
  return events(response.body).at(-1)!;
}

type Job = { status: string; error: string | null };

async function waitForRun(courseId: string) {
  let job: Job | null = null;
  for (let wait = 0; wait < 120; wait += 1) {
    const latest = await admin.get<{ job: Job | null }>(
      `/v1/courses/${courseId}/question-jobs/latest`,
    );
    job = latest.body.data!.job;
    if (job && ["done", "failed", "cancelled"].includes(job.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return job!;
}

await test("every provider is listed; keys are saved per provider and never sent back", async () => {
  // Other files (and earlier runs) share this database and this admin:
  // start clean, below the per-person limit of AI calls.
  await flow.database.deleteFrom("ai_usage").execute();
  await flow.database.deleteFrom("ai_provider_keys").execute();
  await flow.database.deleteFrom("ai_custom_models").execute();
  await flow.database
    .updateTable("ai_settings")
    .set({ tier_models: {}, effort: "auto", model: "claude-opus-5-5" })
    .execute();
  const on = await patch({
    enabled: true,
    apiKey: "sk-ant-flow-test-key-000000002468",
  });
  assert.equal(on.status, 200, JSON.stringify(on.body));
  const fresh = await settings();
  assert.deepEqual(
    fresh.providers.map((provider) => [provider.id, provider.connected]),
    [
      ["anthropic", true],
      ["openai", false],
      ["gemini", false],
      ["xai", false],
    ],
  );
  for (const provider of ["openai", "gemini", "xai"])
    assert.ok(
      fresh.models.some(
        (model) => model.provider === provider && !model.available,
      ),
      `${provider} has models, not usable before its key`,
    );

  const saved = await saveKey("openai", { apiKey: OPENAI_KEY });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const openai = saved.body.data!.settings.providers.find(
    (provider) => provider.id === "openai",
  )!;
  assert.deepEqual([openai.connected, openai.apiKeyLast4], [true, "4321"]);
  assert.ok(!JSON.stringify(saved.body).includes(OPENAI_KEY));

  const workspace = await saveKey("gemini", { workspaceId: "wrkspc_x" });
  assert.equal(workspace.status, 400, "only Claude keys use a workspace");
  const unknown = await patch({ model: "gpt-does-not-exist" });
  assert.equal(unknown.status, 400);
});

await test("one-lecture AI uses the chosen model's provider and key; the ledger shows the model", async () => {
  const chosen = await patch({ model: "gpt-6.2-sol" });
  assert.equal(chosen.body.data!.settings.provider, "openai");
  const done = await oneLectureQuestion();
  assert.equal(done.type, "done", JSON.stringify(done));
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.deepEqual(
      [call.provider, call.apiKey, call.model],
      ["openai", OPENAI_KEY, "gpt-6.2-sol"],
    );
    assert.equal(call.effort, "high", "auto: one question thinks hard");
  }
  const usage = (await admin.get<Settings>("/v1/platform/ai-settings")).body
    .data!.usage;
  assert.ok(
    usage.byModel.some(
      (row) => row.provider === "openai" && row.model === "gpt-6.2-sol",
    ),
  );
});

await test("a platform effort applies to every call; a model without one gets none", async () => {
  await patch({ effort: "low" });
  let done = await oneLectureQuestion();
  assert.equal(done.type, "done");
  assert.ok(calls.every((call) => call.effort === "low"));

  await saveKey("xai", { apiKey: XAI_KEY });
  await patch({ model: "grok-4.3", effort: "auto" });
  done = await oneLectureQuestion();
  assert.equal(done.type, "done");
  assert.ok(
    calls.every(
      (call) =>
        call.provider === "xai" &&
        call.apiKey === XAI_KEY &&
        call.effort === null,
    ),
    "Grok 4.3 has no effort setting",
  );
});

await test("a tier whose provider has no key blocks the run with a clear reason", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}],
  });
  await patch({ tierModels: { best: "gemini-4-carbon" } });
  const estimate = await admin.post<{
    model: string;
    provider: string;
    blocked: string | null;
  }>(`/v1/courses/${course.id}/question-jobs/estimate`, { quality: "best" });
  assert.equal(estimate.body.data!.model, "Gemini 4 Carbon");
  assert.match(estimate.body.data!.blocked ?? "", /Gemini API key/);
  const started = await admin.post(`/v1/courses/${course.id}/question-jobs`, {
    quality: "best",
  });
  assert.equal(started.status, 409);
});

await test("an added model can be chosen for a tier; the run's own effort wins", async () => {
  await saveKey("gemini", { apiKey: GEMINI_KEY });
  const added = await admin.post<Settings>("/v1/platform/ai-models", {
    id: "gemini-3.5-flash-lite",
    provider: "gemini",
    label: "Gemini 3.5 Flash-Lite",
    inputUsdPerMillion: 0.3,
    outputUsdPerMillion: 2.5,
    cacheReadUsdPerMillion: 0.03,
  });
  assert.equal(added.status, 200, JSON.stringify(added.body));
  const model = added.body.data!.settings.models.find(
    (entry) => entry.id === "gemini-3.5-flash-lite",
  )!;
  assert.deepEqual([model.custom, model.available], [true, true]);
  await patch({
    tierModels: { balanced: "gemini-3.5-flash-lite" },
    effort: "low",
  });

  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}],
  });
  calls.length = 0;
  const started = await admin.post(`/v1/courses/${course.id}/question-jobs`, {
    quality: "balanced",
    effort: "high",
    questionsPerQuiz: 3,
    types: ["single_choice"],
  });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const job = await waitForRun(course.id);
  assert.equal(job.status, "done", JSON.stringify(job));
  const writing = calls.filter(
    (call) => call.kind === "quiz" || call.kind === "coding",
  );
  assert.ok(writing.length >= 2);
  assert.ok(
    writing.every(
      (call) =>
        call.provider === "gemini" &&
        call.apiKey === GEMINI_KEY &&
        call.model === "gemini-3.5-flash-lite" &&
        call.effort === "high",
    ),
    JSON.stringify(writing),
  );
  const gate = calls.filter((call) => call.kind === "gate");
  assert.ok(gate.length > 0);
  assert.ok(
    gate.every(
      (call) =>
        call.provider === "gemini" && call.model === "gemini-3.1-flash-lite",
    ),
    "the 'does it teach code' check uses the course provider's cheapest model",
  );

  // A run that picks no effort of its own uses Platform → AI's (low).
  const second = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}],
  });
  calls.length = 0;
  const plain = await admin.post(`/v1/courses/${second.id}/question-jobs`, {
    coding: false,
    questionsPerQuiz: 3,
    types: ["single_choice"],
  });
  assert.equal(plain.status, 201, JSON.stringify(plain.body));
  assert.equal((await waitForRun(second.id)).status, "done");
  const quizCalls = calls.filter((call) => call.kind === "quiz");
  assert.ok(quizCalls.length > 0);
  assert.ok(
    quizCalls.every((call) => call.effort === "low"),
    JSON.stringify(quizCalls),
  );
});

await test("removing an added model puts its tier back to the default; Test checks one provider", async () => {
  const removed = await admin.delete<Settings>(
    "/v1/platform/ai-models/gemini-3.5-flash-lite",
  );
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(
    removed.body.data!.settings.tierModels.balanced,
    "claude-sonnet-5-5",
  );
  const missing = await admin.delete("/v1/platform/ai-models/gpt-6.2-sol");
  assert.equal(missing.status, 404, "built-in models cannot be removed");

  calls.length = 0;
  const tested = await admin.post<{ ok: boolean; model: string }>(
    "/v1/platform/ai-settings/test",
    { provider: "gemini" },
  );
  assert.equal(tested.body.data!.ok, true, JSON.stringify(tested.body));
  assert.equal(calls[0]!.provider, "gemini");
  assert.equal(
    calls[0]!.model,
    "gemini-3.1-flash-lite",
    "the provider's cheapest model",
  );

  const cleared = await saveKey("openai", { apiKey: null });
  assert.equal(
    cleared.body.data!.settings.providers.find(
      (provider) => provider.id === "openai",
    )!.connected,
    false,
  );
});

await test("connecting only one provider moves every model choice to it", async () => {
  // Back to the defaults (all Claude) with no key at all.
  await flow.database.deleteFrom("ai_provider_keys").execute();
  await flow.database
    .updateTable("ai_settings")
    .set({
      tier_models: {},
      model: "claude-opus-5-5",
      api_key_encrypted: null,
      api_key_last4: null,
    })
    .execute();
  const saved = await saveKey("gemini", { apiKey: GEMINI_KEY });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const after = saved.body.data!.settings;
  assert.equal(after.model, "gemini-4-carbon", "one lecture: the best");
  assert.equal(after.tierModels.economy, "gemini-3.1-flash-lite");
  assert.equal(after.tierModels.best, "gemini-4-carbon");
  const balanced = after.models.find(
    (model) => model.id === after.tierModels.balanced,
  )!;
  assert.equal(balanced.provider, "gemini");

  // Connecting another provider later changes nothing that already works.
  const second = await saveKey("openai", { apiKey: OPENAI_KEY });
  assert.equal(second.body.data!.settings.model, "gemini-4-carbon");

  const availability = await admin.get<{
    available: boolean;
    enabled: boolean;
    tiers: { id: string; available: boolean }[];
  }>("/v1/ai/availability");
  assert.equal(availability.body.data!.available, true);
  assert.equal(availability.body.data!.enabled, true);
  assert.ok(availability.body.data!.tiers.every((tier) => tier.available));
});

setAiProviderForTests(null);
await flow.close();
