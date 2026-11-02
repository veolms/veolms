import assert from "node:assert/strict";
import { test } from "node:test";

import { loadServerConfig } from "@veolms/config";

// LOCAL_FIXED_OTP makes every sign-in code the same for any account. It is
// for a developer's machine only: production must refuse to start with it.

await test("development accepts a six-digit fixed code", () => {
  const config = loadServerConfig({
    NODE_ENV: "development",
    LOCAL_FIXED_OTP: "123456",
  });
  assert.equal(config.LOCAL_FIXED_OTP, "123456");
});

await test("anything but six digits is refused", () => {
  for (const value of ["12345", "1234567", "abcdef"]) {
    assert.throws(() =>
      loadServerConfig({ NODE_ENV: "development", LOCAL_FIXED_OTP: value }),
    );
  }
});

await test("production refuses to start with it set", () => {
  assert.throws(
    () =>
      loadServerConfig({ NODE_ENV: "production", LOCAL_FIXED_OTP: "123456" }),
    /LOCAL_FIXED_OTP/u,
  );
});

await test("unset, nothing is fixed", () => {
  assert.equal(
    loadServerConfig({ NODE_ENV: "development" }).LOCAL_FIXED_OTP,
    undefined,
  );
});
