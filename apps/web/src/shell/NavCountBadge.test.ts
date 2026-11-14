// Run: node --test apps/web/src/shell/NavCountBadge.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBadgeCount } from "./navCount.ts";
import {
  normalizeSidebarDockItems,
  normalizeSidebarDockOrder,
} from "../settings/settingsPreferences.ts";

await test("a count up to the cap is shown as it is", () => {
  assert.equal(formatBadgeCount(9, 9), "9");
  assert.equal(formatBadgeCount(42, 99), "42");
});

await test("past the cap it reads 9+ (or 99+)", () => {
  assert.equal(formatBadgeCount(10, 9), "9+");
  assert.equal(formatBadgeCount(120, 99), "99+");
});

await test("the default dock has Notifications where Read mode was", () => {
  assert.deepEqual(normalizeSidebarDockItems(undefined), [
    "appearance",
    "notifications",
    "settings",
  ]);
});

await test("a dock saved with Read mode shows Notifications in its place", () => {
  assert.deepEqual(
    normalizeSidebarDockItems(["settings", "reading-mode", "theme"]),
    ["settings", "notifications", "theme"],
  );
  assert.equal(
    normalizeSidebarDockOrder(["reading-mode", "theme"]).filter(
      (item) => item === "notifications",
    ).length,
    1,
  );
});
