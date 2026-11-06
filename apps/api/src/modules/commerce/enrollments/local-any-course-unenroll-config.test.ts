import assert from "node:assert/strict";
import { test } from "node:test";

import { loadServerConfig } from "@veolms/config";

// LOCAL_ANY_COURSE_UNENROLL lets every account leave any course, bought ones
// included. It is for a developer's machine only: production must refuse to
// start with it set.

await test("development accepts it", () => {
  const config = loadServerConfig({
    NODE_ENV: "development",
    LOCAL_ANY_COURSE_UNENROLL: "true",
  });
  assert.equal(config.LOCAL_ANY_COURSE_UNENROLL, true);
});

await test("anything but true or false is refused", () => {
  assert.throws(() =>
    loadServerConfig({
      NODE_ENV: "development",
      LOCAL_ANY_COURSE_UNENROLL: "yes",
    }),
  );
});

await test("production refuses to start with it set", () => {
  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: "production",
        LOCAL_ANY_COURSE_UNENROLL: "true",
      }),
    /LOCAL_ANY_COURSE_UNENROLL/u,
  );
});

await test("unset, it is off", () => {
  assert.equal(
    loadServerConfig({ NODE_ENV: "development" }).LOCAL_ANY_COURSE_UNENROLL,
    false,
  );
});
