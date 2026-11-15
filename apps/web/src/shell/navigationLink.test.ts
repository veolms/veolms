// Run: node --test apps/web/src/shell/navigationLink.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MouseEvent } from "react";
import { leavesClickToBrowser, navigationHref } from "./navigationLink.ts";

const click = (overrides: Partial<MouseEvent<HTMLElement>> = {}) =>
  ({
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  }) as MouseEvent<HTMLElement>;

await test("a plain click is the app's to handle", () => {
  assert.equal(leavesClickToBrowser(click()), false);
});

await test("Ctrl, ⌘, Shift or Alt clicks are left to the browser", () => {
  for (const key of ["ctrlKey", "metaKey", "shiftKey", "altKey"] as const) {
    assert.equal(leavesClickToBrowser(click({ [key]: true })), true, key);
  }
});

await test("any button but the main one is left to the browser", () => {
  assert.equal(leavesClickToBrowser(click({ button: 1 })), true);
});

await test("only app paths become links", () => {
  assert.equal(navigationHref("/chat"), "/chat");
  assert.equal(navigationHref("Settings"), undefined);
});
