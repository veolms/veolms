import assert from "node:assert/strict";
import { test } from "node:test";

import { detectSiteContentChange } from "@veolms/api-core";

const COURSE = "8f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const USER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function change(
  method: string,
  url: string,
  routeUrl: string,
  userRoles?: readonly string[],
) {
  return detectSiteContentChange({ method, url, routeUrl, userRoles });
}

await test("edits to a course are changes to that course", () => {
  const cases: Array<[string, string, string]> = [
    ["PATCH", `/v1/courses/${COURSE}/basics`, "/v1/courses/:courseId/basics"],
    ["PUT", `/v1/courses/${COURSE}/pricing`, "/v1/courses/:courseId/pricing"],
    ["POST", `/v1/courses/${COURSE}/publish`, "/v1/courses/:courseId/publish"],
    [
      "PUT",
      `/v1/courses/${COURSE}/sections/reorder`,
      "/v1/courses/:courseId/sections/reorder",
    ],
    ["DELETE", `/v1/courses/${COURSE}`, "/v1/courses/:courseId"],
    [
      "POST",
      `/v1/bin/courses/${COURSE}/restore`,
      "/v1/bin/courses/:courseId/restore",
    ],
  ];
  for (const [method, url, routeUrl] of cases) {
    assert.deepEqual(
      change(method, url, routeUrl),
      { scope: "course", courseId: COURSE },
      `${method} ${url}`,
    );
  }
});

await test("learner activity and routes that only name a course are not changes", () => {
  const cases: Array<[string, string, string]> = [
    [
      "POST",
      `/v1/courses/${COURSE}/lessons/${USER}/discussions`,
      "/v1/courses/:courseId/lessons/:lessonId/discussions",
    ],
    [
      "POST",
      `/v1/courses/${COURSE}/quiz-assignments`,
      "/v1/courses/:courseId/quiz-assignments",
    ],
    [
      "DELETE",
      `/v1/access/users/${USER}/courses/${COURSE}`,
      "/v1/access/users/:userId/courses/:courseId",
    ],
    [
      "POST",
      `/v1/access/users/${USER}/courses/${COURSE}/restore`,
      "/v1/access/users/:userId/courses/:courseId/restore",
    ],
    [
      "DELETE",
      `/v1/enrollments/courses/${COURSE}`,
      "/v1/enrollments/courses/:courseId",
    ],
    [
      "POST",
      `/v1/courses/${COURSE}/static-page-refresh`,
      "/v1/courses/:courseId/static-page-refresh",
    ],
    ["GET", `/v1/courses/${COURSE}/editor`, "/v1/courses/:courseId/editor"],
  ];
  for (const [method, url, routeUrl] of cases) {
    assert.equal(change(method, url, routeUrl), null, `${method} ${url}`);
  }
});

await test("site-wide content: settings, home page, brand, categories, videos", () => {
  const cases: Array<[string, string, string, string]> = [
    [
      "PATCH",
      "/v1/platform/settings",
      "/v1/platform/settings",
      "platform settings",
    ],
    ["PUT", "/v1/home/page-settings", "/v1/home/page-settings", "home page"],
    ["PUT", "/v1/academy/brand", "/v1/academy/brand", "academy brand"],
    [
      "POST",
      "/v1/academy/brand/logo/complete",
      "/v1/academy/brand/logo/complete",
      "academy brand",
    ],
    ["POST", "/v1/categories", "/v1/categories", "categories"],
    [
      "DELETE",
      `/v1/categories/${USER}`,
      "/v1/categories/:categoryId",
      "categories",
    ],
    [
      "POST",
      "/v1/webhooks/mediaconvert",
      "/v1/webhooks/mediaconvert",
      "video transcode",
    ],
    [
      "POST",
      `/v1/media/${USER}/upload-complete`,
      "/v1/media/:mediaId/upload-complete",
      "video upload",
    ],
  ];
  for (const [method, url, routeUrl, reason] of cases) {
    assert.deepEqual(
      change(method, url, routeUrl),
      { scope: "site", reason },
      `${method} ${url}`,
    );
  }
  assert.equal(change("POST", "/v1/media/presign", "/v1/media/presign"), null);
});

await test("a profile edit matters only from staff, who teach courses", () => {
  assert.equal(
    change("PATCH", "/v1/auth/me", "/v1/auth/me", ["student"]),
    null,
  );
  assert.deepEqual(
    change("PATCH", "/v1/auth/me", "/v1/auth/me", ["Instructor"]),
    { scope: "site", reason: "instructor profile" },
  );
});
