import assert from "node:assert/strict";
import { test } from "node:test";
import {
  permissionCatalogue,
  permissions,
  reservedPermissions,
  withImpliedPermissions,
} from "@veolms/contracts";

await test("every permission is in exactly one catalogue group, or reserved", () => {
  const seen = new Map<string, string>();
  for (const group of permissionCatalogue) {
    for (const { key } of group.entries) {
      assert.ok(
        !seen.has(key),
        `${key} is in both "${seen.get(key)}" and "${group.area}"`,
      );
      seen.set(key, group.area);
    }
  }
  const reserved = new Set<string>(reservedPermissions);
  for (const key of reserved) {
    assert.ok(!seen.has(key), `${key} is both reserved and offered`);
  }
  const missing = permissions.filter(
    (key) => !seen.has(key) && !reserved.has(key),
  );
  assert.deepEqual(missing, [], "permissions missing from the catalogue");
});

await test("implies only names known keys, never the key itself", () => {
  const known = new Set<string>(permissions);
  for (const group of permissionCatalogue) {
    for (const item of group.entries) {
      for (const implied of item.implies) {
        assert.ok(known.has(implied), `${item.key} implies unknown ${implied}`);
        assert.notEqual(implied, item.key, `${item.key} implies itself`);
      }
    }
  }
});

await test("withImpliedPermissions follows implies transitively", () => {
  assert.deepEqual(
    [...withImpliedPermissions(["lesson.video.import_youtube"])].sort(),
    [
      "course.read",
      "lesson.read",
      "lesson.video.import_youtube",
      "lesson.video.update",
    ],
  );
  assert.deepEqual([...withImpliedPermissions(["lesson.create"])].sort(), [
    "course.read",
    "lesson.create",
    "lesson.read",
  ]);
});

await test("permission keys are unique", () => {
  assert.equal(new Set(permissions).size, permissions.length);
});
