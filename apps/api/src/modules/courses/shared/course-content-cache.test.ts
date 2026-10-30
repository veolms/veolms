import assert from "node:assert/strict";
import { test } from "node:test";
import { clearAllCaches, createVeoLMSApi } from "@veolms/api-core";

import { config } from "../../../config.ts";
import {
  getCachedPublicCourseContent,
  type PublicCourseContent,
} from "./course-content-cache.ts";

// The public course cache is cleared by what api-core's factory detects a
// successful request changed (see site-content-changes.ts).

const COURSE = "8f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const OTHER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function content(courseId: string): PublicCourseContent {
  return {
    courseId,
    overview: { course: { id: courseId } },
    curriculum: { course: { id: courseId }, version: "v" },
  } as unknown as PublicCourseContent;
}

/** A loader that counts how often it ran. */
function counter(courseId: string) {
  const loader = async () => {
    loader.calls += 1;
    return content(courseId);
  };
  loader.calls = 0;
  return loader;
}

function read(key: string, load: () => Promise<PublicCourseContent>) {
  return getCachedPublicCourseContent(
    key,
    load,
    key === COURSE || key === OTHER,
  );
}

/** An app with one route that answers `status`, at the given pattern. */
async function appWithRoute(
  method: "PATCH" | "POST" | "PUT",
  pattern: string,
  status = 200,
) {
  const app = await createVeoLMSApi({
    database: {} as never,
    logger: false,
    config,
    modulesDir: "",
  });
  app.route({
    method,
    url: pattern,
    handler: async (_request, reply) => reply.code(status).send({ ok: true }),
  });
  return app;
}

async function send(
  method: "PATCH" | "POST" | "PUT",
  pattern: string,
  url: string,
  status = 200,
) {
  const app = await appWithRoute(method, pattern, status);
  try {
    return await app.inject({ method, url });
  } finally {
    await app.close();
  }
}

await test("a successful write to a course clears it, by id and by slug, before its response is sent", async () => {
  clearAllCaches();
  const byId = counter(COURSE);
  const bySlug = counter(COURSE);
  const other = counter(OTHER);
  await read(COURSE, byId);
  await read("course-slug", bySlug);
  await read(OTHER, other);

  const response = await send(
    "PATCH",
    "/v1/courses/:courseId/details",
    `/v1/courses/${COURSE}/details`,
  );
  assert.equal(response.statusCode, 200);

  await read(COURSE, byId);
  await read("course-slug", bySlug);
  await read(OTHER, other);
  assert.deepEqual([byId.calls, bySlug.calls, other.calls], [2, 2, 1]);
});

await test("a failed write, or learner activity on a course, clears nothing", async () => {
  clearAllCaches();
  const course = counter(COURSE);
  await read(COURSE, course);

  await send(
    "PATCH",
    "/v1/courses/:courseId/details",
    `/v1/courses/${COURSE}/details`,
    409,
  );
  await send(
    "POST",
    "/v1/courses/:courseId/lessons/:lessonId/threads",
    `/v1/courses/${COURSE}/lessons/${OTHER}/threads`,
  );

  await read(COURSE, course);
  assert.equal(course.calls, 1);
});

await test("a site-wide change clears every course", async () => {
  clearAllCaches();
  const course = counter(COURSE);
  const other = counter(OTHER);
  await read(COURSE, course);
  await read(OTHER, other);

  await send("PUT", "/v1/categories/:categoryId", `/v1/categories/${OTHER}`);

  await read(COURSE, course);
  await read(OTHER, other);
  assert.deepEqual([course.calls, other.calls], [2, 2]);
});

await test("a failed load (an unknown or unpublished course) is not kept", async () => {
  clearAllCaches();
  let calls = 0;
  const failing = async (): Promise<PublicCourseContent> => {
    calls += 1;
    throw new Error("Course not found.");
  };
  await assert.rejects(read("no-such-slug", failing));
  await assert.rejects(read("no-such-slug", failing));
  assert.equal(calls, 2);
});
