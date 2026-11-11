/**
 * A reading lesson whose text is a PDF: who is given the file, by the same
 * rule as the lesson's other content, and that it is handed only to the
 * lesson page's own request (a browser opening its address in a tab, an
 * iframe or an embed is refused), never cached.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { signedUpLearner, startFlowApp } from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import {
  createCourse,
  enrollForFree,
  FLOW_LESSON_PDF,
} from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();

function readPdf(
  client: FlowClient,
  course: FlowCourse,
  lessonIndex: number,
  headers: Record<string, string> = {},
) {
  return client.request(
    "GET",
    `/v1/courses/${course.id}/lessons/${course.lessons[lessonIndex]!.id}/document`,
    undefined,
    headers,
  );
}

// Lesson 1 is a free preview; lesson 2 is a locked PDF reading; lesson 3 a
// locked video.
const paidCourse = () =>
  createCourse(flow, {
    pricing: "paid",
    lessons: [{ preview: true, pdf: true }, { pdf: true }, {}],
  });

await test("a visitor is asked to sign in for a locked PDF reading, and is given a preview one", async () => {
  const course = await paidCourse();
  const visitor = flow.visitor();

  const locked = await readPdf(visitor, course, 1);
  assert.equal(locked.status, 401);
  assert.equal(locked.body.error?.code, "LESSON_LOGIN_REQUIRED");
  assert.equal(locked.body.raw, undefined, "no file is sent");

  const preview = await readPdf(visitor, course, 0);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.raw, FLOW_LESSON_PDF.toString());
});

await test("a learner without the course is refused its PDF reading", async () => {
  const course = await paidCourse();
  const { client } = await signedUpLearner(flow);

  const locked = await readPdf(client, course, 1);
  assert.equal(locked.status, 403);
  assert.equal(locked.body.error?.code, "COURSE_ACCESS_DENIED");
  assert.equal(locked.body.raw, undefined, "no file is sent");
});

await test("a learner with the course reads the PDF, never cached and only from the lesson page", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{}, { pdf: true }],
  });
  const { client } = await signedUpLearner(flow);
  assert.equal((await enrollForFree(client, course)).status, 200);

  // The lesson page's own request (fetch), and a browser too old to say.
  const pageRequests: Record<string, string>[] = [
    { "sec-fetch-dest": "empty" },
    {},
  ];
  for (const headers of pageRequests) {
    const read = await readPdf(client, course, 1, headers);
    assert.equal(read.status, 200);
    assert.equal(read.headers["content-type"], "application/pdf");
    assert.equal(read.headers["cache-control"], "private, no-store");
    assert.equal(read.body.raw, FLOW_LESSON_PDF.toString());
  }

  // Its address opened in a tab, an iframe or an embed, where the browser's
  // own viewer would offer to save and print it.
  for (const destination of ["document", "iframe", "embed", "object"]) {
    const opened = await readPdf(client, course, 1, {
      "sec-fetch-dest": destination,
    });
    assert.equal(opened.status, 403, destination);
    assert.equal(opened.body.error?.code, "LESSON_DOCUMENT_READER_ONLY");
    assert.equal(opened.body.raw, undefined, "no file is sent");
  }
});

await test("a lesson with no PDF, or no such lesson, gives no file", async () => {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: [{}, { pdf: true }],
  });
  const { client } = await signedUpLearner(flow);
  assert.equal((await enrollForFree(client, course)).status, 200);

  const video = await readPdf(client, course, 0);
  assert.equal(video.status, 404);
  assert.equal(video.body.error?.code, "LESSON_DOCUMENT_NOT_FOUND");

  const missing = await client.get(
    `/v1/courses/${course.id}/lessons/${crypto.randomUUID()}/document`,
  );
  assert.equal(missing.status, 404);
});

await flow.close();
