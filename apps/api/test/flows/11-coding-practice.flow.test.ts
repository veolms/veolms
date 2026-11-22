/**
 * Coding practice: questions written by a course's staff in a lecture's
 * Practice tab of the course editor, practised by learners from that
 * lecture in the lessons list. The browser runs the tests; the API checks
 * that a submission belongs to the question's tests and records it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

interface Exercise {
  id: string;
  kind: string;
  editable: {
    id: string;
    versionNumber: number;
    suiteHash: string;
    publishedAt: string | null;
    starterFiles: { path: string; content: string }[];
    entry: { file: string };
    tests: { format: string };
  };
}

interface Practice {
  assignment: { id: string };
  exercise: {
    versionId: string;
    suiteHash: string;
    starterFiles: { path: string; content: string }[];
    tests: { format: string; cases: { id: string; hidden: boolean }[] };
  };
  state: {
    attempts: number;
    passed: boolean;
    solutionAvailable: boolean;
    failedAttempts: number;
  };
  draft: { files: { path: string; content: string }[] } | null;
}

interface PracticeList {
  items: {
    assignmentId: string;
    lessonId: string | null;
    title: string;
    status: "new" | "started" | "done";
  }[];
}

const PASSING_CODE = "function sum(a, b) {\n  return a + b;\n}\n";

/** The `sum` exercise an author would write: problem, starter, solution, two tests. */
const SUM_CONTENT = {
  statement: "Write `sum(a, b)` that returns the sum of `a` and `b`.",
  starterFiles: [{ path: "index.js", content: "function sum(a, b) {\n}\n" }],
  solutionFiles: [{ path: "index.js", content: PASSING_CODE }],
  entry: { file: "index.js", name: "sum" },
  tests: {
    format: "cases",
    cases: [
      {
        id: "t1",
        name: "Adds",
        args: [2, 3],
        expected: 5,
        compare: "deepEqual",
        hidden: false,
      },
      {
        id: "t2",
        name: "Negatives",
        args: [-4, 1],
        expected: -3,
        compare: "deepEqual",
        hidden: true,
      },
    ],
  },
};

/** A new question on a lecture of the course (its second, by default). */
function createExercise(
  course: FlowCourse,
  title = "Add two numbers",
  options: { lessonId?: string; kind?: string; language?: string } = {},
) {
  return admin.post<Exercise>(`/v1/courses/${course.id}/coding-exercises`, {
    lessonId: options.lessonId ?? course.lessons[1]!.id,
    title,
    kind: options.kind ?? "function",
    ...(options.language ? { language: options.language } : {}),
  });
}

/** Writes the `sum` exercise and publishes it (the author's browser passed the checks). */
async function writeAndPublish(exerciseId: string) {
  const written = await admin.patch<Exercise>(
    `/v1/coding-exercises/${exerciseId}`,
    SUM_CONTENT,
  );
  assert.equal(written.status, 200, JSON.stringify(written.body));
  const published = await admin.post<Exercise>(
    `/v1/coding-exercises/${exerciseId}/publish`,
    {
      suiteHash: written.body.data!.editable.suiteHash,
      solutionPassed: true,
      starterFailed: true,
    },
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return published.body.data!;
}

/** A course whose second lecture (a video lecture) has the published `sum` exercise. */
async function courseWithPractice(pricing: "free" | "paid" = "free") {
  const course = await createCourse(flow, {
    pricing,
    lessons: [{ preview: true }, {}, {}],
  });
  const lessonId = course.lessons[1]!.id;
  const exercise = (await createExercise(course)).body.data!;
  await writeAndPublish(exercise.id);
  return { course, lessonId, exercise };
}

function lecturePractice(
  client: FlowClient,
  course: FlowCourse,
  lessonId: string,
) {
  return client.get<PracticeList>(
    `/v1/courses/${course.id}/lessons/${lessonId}/practice`,
  );
}

async function openFirst(
  client: FlowClient,
  course: FlowCourse,
  lessonId: string,
) {
  const list = await lecturePractice(client, course, lessonId);
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const first = list.body.data!.items[0]!;
  const opened = await client.get<Practice>(
    `/v1/coding-assignments/${first.assignmentId}`,
  );
  assert.equal(opened.status, 200);
  return opened.body.data!;
}

function submission(
  practice: Practice,
  passedIds: string[],
  code = PASSING_CODE,
) {
  return {
    versionId: practice.exercise.versionId,
    suiteHash: practice.exercise.suiteHash,
    files: [{ path: "index.js", content: code }],
    results: practice.exercise.tests.cases.map((testCase) => ({
      id: testCase.id,
      passed: passedIds.includes(testCase.id),
    })),
  };
}

await test("a new question belongs to its lecture, starts blank and needs a problem statement to publish; tests are optional", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}, {}],
  });
  const created = await createExercise(course, "Free practice");
  assert.equal(created.status, 201);
  const blank = created.body.data!;
  assert.deepEqual(blank.editable.starterFiles, [
    { path: "index.js", content: "" },
  ]);
  const listed = await admin.get<{
    exercises: { id: string; lectures: { lessonId: string }[] }[];
  }>(`/v1/courses/${course.id}/coding-exercises`);
  assert.deepEqual(
    listed.body.data!.exercises.map((item) => [
      item.id,
      item.lectures.map((lecture) => lecture.lessonId),
    ]),
    [[blank.id, [course.lessons[1]!.id]]],
  );
  const noLecture = await admin.post(
    `/v1/courses/${course.id}/coding-exercises`,
    { title: "x", kind: "function" },
  );
  assert.equal(noLecture.status, 400, "a question needs its lecture");

  const noStatement = await admin.post(
    `/v1/coding-exercises/${blank.id}/publish`,
    {
      suiteHash: blank.editable.suiteHash,
      solutionPassed: false,
      starterFailed: false,
    },
  );
  assert.equal(noStatement.status, 400);

  const written = await admin.patch<Exercise>(
    `/v1/coding-exercises/${blank.id}`,
    {
      statement: "Print the numbers 1 to 10.",
    },
  );
  const published = await admin.post<Exercise>(
    `/v1/coding-exercises/${blank.id}/publish`,
    {
      suiteHash: written.body.data!.editable.suiteHash,
      solutionPassed: false,
      starterFailed: false,
    },
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));
});

await test("TypeScript and Node.js questions start from their own blank files", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}, {}],
  });
  const ts = (
    await createExercise(course, "Typed sum", { language: "typescript" })
  ).body.data!;
  assert.deepEqual(ts.editable.entry, { file: "index.ts" });
  const tsx = (
    await createExercise(course, "Typed card", {
      kind: "react",
      language: "typescript",
    })
  ).body.data!;
  assert.equal(tsx.editable.entry.file, "App.tsx");
  const node = await createExercise(course, "Event store", { kind: "node" });
  assert.equal(node.status, 201, JSON.stringify(node.body));
  assert.equal(node.body.data!.kind, "node");
  assert.deepEqual(node.body.data!.editable.entry, { file: "index.js" });
  assert.equal(node.body.data!.editable.tests.format, "script");
  const nodeTs = (
    await createExercise(course, "Typed store", {
      kind: "node",
      language: "typescript",
    })
  ).body.data!;
  assert.deepEqual(nodeTs.editable.entry, { file: "index.ts" });
});

await test("publishing refuses tests that changed after the author's browser checked them", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}, {}],
  });
  const exercise = (await createExercise(course)).body.data!;
  const written = (
    await admin.patch<Exercise>(
      `/v1/coding-exercises/${exercise.id}`,
      SUM_CONTENT,
    )
  ).body.data!;
  const staleTests = await admin.post(
    `/v1/coding-exercises/${exercise.id}/publish`,
    {
      suiteHash: "not-the-current-suite",
      solutionPassed: false,
      starterFailed: false,
    },
  );
  assert.equal(staleTests.status, 409);
  const ok = await admin.post<Exercise>(
    `/v1/coding-exercises/${exercise.id}/publish`,
    {
      suiteHash: written.editable.suiteHash,
      solutionPassed: false,
      starterFailed: false,
    },
  );
  assert.equal(ok.status, 200);
});

await test("published questions are listed on their lecture and in the course's practice by lecture", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}, {}],
  });
  const lessonId = course.lessons[1]!.id;
  const first = (await createExercise(course, "First")).body.data!;
  const second = (await createExercise(course, "Second")).body.data!;
  const elsewhere = (
    await createExercise(course, "Third lecture", {
      lessonId: course.lessons[2]!.id,
    })
  ).body.data!;

  const { client } = await signedUpLearner(flow);
  await enrollForFree(client, course);
  const coursePractice = () =>
    client.get<PracticeList>(`/v1/courses/${course.id}/practice`);
  assert.deepEqual(
    (await lecturePractice(client, course, lessonId)).body.data!.items,
    [],
    "drafts are not listed",
  );
  assert.deepEqual((await coursePractice()).body.data!.items, []);

  await writeAndPublish(first.id);
  await writeAndPublish(second.id);
  await writeAndPublish(elsewhere.id);
  const items = (await lecturePractice(client, course, lessonId)).body.data!
    .items;
  assert.deepEqual(
    items.map((item) => [item.title, item.status]),
    [
      ["First", "new"],
      ["Second", "new"],
    ],
  );
  assert.deepEqual(
    (await coursePractice()).body.data!.items.map((item) => [
      item.title,
      item.lessonId,
    ]),
    [
      ["First", lessonId],
      ["Second", lessonId],
      ["Third lecture", course.lessons[2]!.id],
    ],
  );

  const paid = await createCourse(flow, { pricing: "paid" });
  const outsider = await signedUpLearner(flow);
  // Without the course: only free-preview lectures' practice (none here).
  const outside = await outsider.client.get<PracticeList>(
    `/v1/courses/${paid.id}/practice`,
  );
  assert.equal(outside.status, 200);
  assert.deepEqual(outside.body.data!.items, []);
});

await test("without the course, a learner sees practice only on free-preview lectures", async () => {
  const course = await createCourse(flow, {
    pricing: "paid",
    lessons: [{ preview: true }, {}, {}],
  });
  const onPreview = (
    await createExercise(course, "On the preview", {
      lessonId: course.lessons[0]!.id,
    })
  ).body.data!;
  const onPaid = (await createExercise(course, "On a paid lecture")).body.data!;
  await writeAndPublish(onPreview.id);
  await writeAndPublish(onPaid.id);

  const outsider = await signedUpLearner(flow);
  const listed = await outsider.client.get<PracticeList>(
    `/v1/courses/${course.id}/practice`,
  );
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.deepEqual(
    listed.body.data!.items.map((item) => [item.title, item.lessonId]),
    [["On the preview", course.lessons[0]!.id]],
  );
  const opened = await outsider.client.get(
    `/v1/coding-assignments/${listed.body.data!.items[0]!.assignmentId}`,
  );
  assert.equal(opened.status, 200);
});

await test("publishing an edit moves the lecture to the new version; the learner keeps their code", async () => {
  const { course, lessonId, exercise } = await courseWithPractice("free");
  const { client } = await signedUpLearner(flow);
  await enrollForFree(client, course);
  const first = await openFirst(client, course, lessonId);
  const draftCode = "function sum(a, b) {\n  return 0;\n}\n";
  const saved = await client.put(
    `/v1/coding-assignments/${first.assignment.id}/draft`,
    {
      versionId: first.exercise.versionId,
      files: [{ path: "index.js", content: draftCode }],
    },
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  const edited = await admin.patch<Exercise>(
    `/v1/coding-exercises/${exercise.id}`,
    {
      statement: "Write `sum(a, b)`. Edited: it must also handle negatives.",
    },
  );
  const republished = await admin.post<Exercise>(
    `/v1/coding-exercises/${exercise.id}/publish`,
    {
      suiteHash: edited.body.data!.editable.suiteHash,
      solutionPassed: false,
      starterFailed: false,
    },
  );
  assert.equal(republished.status, 200, JSON.stringify(republished.body));
  assert.equal(republished.body.data!.editable.versionNumber, 2);

  const reopened = await openFirst(client, course, lessonId);
  assert.notEqual(
    reopened.exercise.versionId,
    first.exercise.versionId,
    "the lecture shows version 2",
  );
  assert.equal(reopened.exercise.versionId, republished.body.data!.editable.id);
  assert.match(
    reopened.draft!.files[0]!.content,
    /return 0/,
    "the learner's code is kept",
  );
});

await test("a learner without the course is refused; one with it gets the exercise without its solution", async () => {
  const paid = await courseWithPractice("paid");
  const outsider = await signedUpLearner(flow);
  assert.equal(
    (await lecturePractice(outsider.client, paid.course, paid.lessonId)).status,
    403,
  );

  const free = await courseWithPractice("free");
  const learner = await signedUpLearner(flow);
  assert.equal((await enrollForFree(learner.client, free.course)).status, 200);
  const practice = await openFirst(learner.client, free.course, free.lessonId);
  const raw = JSON.stringify(practice);
  assert.ok(!raw.includes("solutionFiles"), "the solution is never sent");
  assert.ok(!raw.includes("return a + b"), "the solution's code is never sent");
  // Hidden tests come along (the browser runs them on submit).
  assert.ok(practice.exercise.tests.cases.some((item) => item.hidden));
});

await test("passing shows the practice as done under the lecture", async () => {
  const { course, lessonId } = await courseWithPractice("free");
  const { client } = await signedUpLearner(flow);
  await enrollForFree(client, course);
  const practice = await openFirst(client, course, lessonId);
  const url = `/v1/coding-assignments/${practice.assignment.id}/submissions`;

  const failed = await client.post<{ passed: boolean }>(
    url,
    submission(practice, ["t1"]),
  );
  assert.equal(failed.body.data!.passed, false);
  assert.equal(
    (await lecturePractice(client, course, lessonId)).body.data!.items[0]!
      .status,
    "started",
  );

  const passed = await client.post<{ passed: boolean; firstPass: boolean }>(
    url,
    submission(practice, ["t1", "t2"]),
  );
  assert.equal(passed.body.data!.passed, true);
  assert.equal(passed.body.data!.firstPass, true);
  assert.equal(
    (await lecturePractice(client, course, lessonId)).body.data!.items[0]!
      .status,
    "done",
  );
});

await test("an exercise without tests is marked done by the learner's submit", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}, {}],
  });
  const lessonId = course.lessons[1]!.id;
  const exercise = (await createExercise(course, "Explore")).body.data!;
  const written = await admin.patch<Exercise>(
    `/v1/coding-exercises/${exercise.id}`,
    {
      statement: "Try a few array methods.",
    },
  );
  await admin.post(`/v1/coding-exercises/${exercise.id}/publish`, {
    suiteHash: written.body.data!.editable.suiteHash,
    solutionPassed: false,
    starterFailed: false,
  });

  const { client } = await signedUpLearner(flow);
  await enrollForFree(client, course);
  const practice = await openFirst(client, course, lessonId);
  const done = await client.post<{ passed: boolean }>(
    `/v1/coding-assignments/${practice.assignment.id}/submissions`,
    {
      versionId: practice.exercise.versionId,
      suiteHash: practice.exercise.suiteHash,
      files: [{ path: "index.js", content: "[1, 2].map(String);" }],
      results: [],
    },
  );
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.data!.passed, true);
});

await test("a submission for other tests, or with results missing, is refused and not stored", async () => {
  const { course, lessonId } = await courseWithPractice("free");
  const { client, userId } = await signedUpLearner(flow);
  await enrollForFree(client, course);
  const practice = await openFirst(client, course, lessonId);
  const url = `/v1/coding-assignments/${practice.assignment.id}/submissions`;

  assert.equal(
    (
      await client.post(url, {
        ...submission(practice, ["t1", "t2"]),
        suiteHash: "other",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await client.post(url, {
        ...submission(practice, ["t1", "t2"]),
        results: [{ id: "t1", passed: true }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await client.post(url, {
        ...submission(practice, ["t1", "t2"]),
        results: [
          ...submission(practice, ["t1", "t2"]).results,
          { id: "t9", passed: true },
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await client.post(url, {
        ...submission(practice, ["t1", "t2"]),
        files: [{ path: "other.js", content: "1" }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await client.post(url, {
        ...submission(practice, ["t1", "t2"]),
        files: [{ path: "index.js", content: "x".repeat(70 * 1024) }],
      })
    ).status,
    400,
  );
  const stored = await flow.database
    .selectFrom("coding_submissions")
    .select("id")
    .where("user_id", "=", userId)
    .execute();
  assert.equal(stored.length, 0);
});

await test("only the five newest failed submits keep their code; reopening brings back the newest", async () => {
  const { course, lessonId } = await courseWithPractice("free");
  const { client, userId } = await signedUpLearner(flow);
  await enrollForFree(client, course);
  const practice = await openFirst(client, course, lessonId);
  for (let attempt = 0; attempt < 7; attempt += 1)
    await client.post(
      `/v1/coding-assignments/${practice.assignment.id}/submissions`,
      submission(practice, ["t1"], `function sum(a, b) { return ${attempt}; }`),
    );
  const rows = await flow.database
    .selectFrom("coding_submissions")
    .select(["files", "failed_test_ids"])
    .where("user_id", "=", userId)
    .execute();
  assert.equal(rows.length, 7);
  assert.equal(rows.filter((row) => row.files !== null).length, 5);
  assert.ok(rows.every((row) => row.failed_test_ids.includes("t2")));

  const reopened = await openFirst(client, course, lessonId);
  assert.match(reopened.draft!.files[0]!.content, /return 6/);
});

await test("learners cannot list, write or read results of a course's exercises", async () => {
  const { course, lessonId } = await courseWithPractice("free");
  const { client } = await signedUpLearner(flow);
  await enrollForFree(client, course);
  const practice = await openFirst(client, course, lessonId);
  assert.equal(
    (await client.get(`/v1/courses/${course.id}/coding-exercises`)).status,
    403,
  );
  assert.equal(
    (
      await client.post(`/v1/courses/${course.id}/coding-exercises`, {
        lessonId,
        title: "x",
        kind: "function",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await client.get(
        `/v1/coding-assignments/${practice.assignment.id}/analytics`,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.get(
        `/v1/coding-assignments/${practice.assignment.id}/analytics`,
      )
    ).status,
    200,
  );
});

await test("practised work is protected from deleting, and a question goes only on a lecture of its course", async () => {
  const { course, lessonId, exercise } = await courseWithPractice("free");
  const { client } = await signedUpLearner(flow);
  await enrollForFree(client, course);
  const practice = await openFirst(client, course, lessonId);
  await client.post(
    `/v1/coding-assignments/${practice.assignment.id}/submissions`,
    submission(practice, ["t1"]),
  );
  assert.equal(
    (await admin.delete(`/v1/coding-exercises/${exercise.id}`)).status,
    409,
  );

  const other = await createCourse(flow, {
    pricing: "free",
    lessons: [{ preview: true }, {}],
  });
  const foreignLecture = await createExercise(course, "Elsewhere", {
    lessonId: other.lessons[1]!.id,
  });
  assert.equal(foreignLecture.status, 404);
});

await test("more than 30 submits in an hour are refused", async () => {
  const { course, lessonId } = await courseWithPractice("free");
  const { client } = await signedUpLearner(flow);
  await enrollForFree(client, course);
  const practice = await openFirst(client, course, lessonId);
  let lastStatus = 0;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    lastStatus = (
      await client.post(
        `/v1/coding-assignments/${practice.assignment.id}/submissions`,
        submission(practice, ["t1"]),
      )
    ).status;
  }
  assert.equal(lastStatus, 429);
});

await flow.close();
