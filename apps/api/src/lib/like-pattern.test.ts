import assert from "node:assert/strict";
import { test } from "node:test";
import { containsPattern, escapeLikePattern } from "./like-pattern.ts";

/**
 * What PostgreSQL's LIKE does with a pattern, with backslash as the escape
 * character: "%" is any run of characters, "_" is any one character, and a
 * backslash makes the next character literal.
 */
function like(text: string, pattern: string): boolean {
  let source = "";
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index] ?? "";
    if (character === "\\") {
      index++;
      source += (pattern[index] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (character === "%") {
      source += "[\\s\\S]*";
    } else if (character === "_") {
      source += "[\\s\\S]";
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`).test(text);
}

await test("plain text is left as typed", () => {
  assert.equal(escapeLikePattern("node js"), "node js");
  assert.equal(escapeLikePattern(""), "");
});

await test("%, _ and the backslash are each escaped", () => {
  assert.equal(escapeLikePattern("50%"), "50\\%");
  assert.equal(escapeLikePattern("a_b"), "a\\_b");
  assert.equal(escapeLikePattern("C:\\temp"), "C:\\\\temp");
  assert.equal(escapeLikePattern("%_\\"), "\\%\\_\\\\");
});

await test("a contains pattern is lower-cased and wrapped in wildcards", () => {
  assert.equal(containsPattern("Node"), "%node%");
  assert.equal(containsPattern("50%"), "%50\\%%");
});

await test("a search for 50% finds 50% and not 50 apples", () => {
  const pattern = containsPattern("50%");
  assert.equal(like("save 50% today", pattern), true);
  assert.equal(like("get 50 apples", pattern), false);
  // The unescaped pattern is what matched everything.
  assert.equal(like("get 50 apples", "%50%%"), true);
});

await test("an underscore matches only an underscore", () => {
  const pattern = containsPattern("a_b");
  assert.equal(like("use a_b here", pattern), true);
  assert.equal(like("use axb here", pattern), false);
});

await test("a backslash matches only a backslash", () => {
  const pattern = containsPattern("\\");
  assert.equal(like("path c:\\temp", pattern), true);
  assert.equal(like("path c:/temp", pattern), false);
});

await test("an escaped term can anchor a starts-with pattern", () => {
  const pattern = `${escapeLikePattern("50%")}%`;
  assert.equal(like("50% club", pattern), true);
  assert.equal(like("50 apples fan", pattern), false);
  assert.equal(like("the 50% club", pattern), false);
});
