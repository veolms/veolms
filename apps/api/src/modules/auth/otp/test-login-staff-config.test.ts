import assert from "node:assert/strict";
import { test } from "node:test";

import { loadServerConfig } from "@veolms/config";

// TEST_LOGIN_STAFF_ALLOWED lets a shared test account (TEST_LOGIN_ACCOUNTS)
// be staff, for a demo admin on a development server. A shared code must
// never open a staff account in production, so production refuses to start
// with it set.

await test("development accepts it", () => {
  const config = loadServerConfig({
    NODE_ENV: "development",
    TEST_LOGIN_STAFF_ALLOWED: "true",
  });
  assert.equal(config.TEST_LOGIN_STAFF_ALLOWED, true);
});

await test("production refuses to start with it set", () => {
  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: "production",
        TEST_LOGIN_STAFF_ALLOWED: "true",
      }),
    /TEST_LOGIN_STAFF_ALLOWED/u,
  );
});

await test("unset, it is off", () => {
  assert.equal(
    loadServerConfig({ NODE_ENV: "development" }).TEST_LOGIN_STAFF_ALLOWED,
    false,
  );
});
