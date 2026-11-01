import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAliasedBasicsUpdate } from "./basics-aliased-field.ts";

type Level = "beginner" | "intermediate" | "advanced";
// As `updateCourseBasics` reads a level: `difficulty`, alias `difficultyLevel`.
const level = (updates: {
  difficulty?: Level | null;
  difficultyLevel?: Level | null;
}) => resolveAliasedBasicsUpdate(updates.difficulty, updates.difficultyLevel);

await test("no level field leaves the level as it is", () => {
  assert.equal(level({}), undefined);
  assert.equal(
    level({ difficulty: undefined, difficultyLevel: undefined }),
    undefined,
  );
});

await test("null in either field removes the level", () => {
  // The case that used to resolve to undefined and was skipped by the write.
  assert.equal(level({ difficulty: null }), null);
  assert.equal(level({ difficultyLevel: null }), null);
  assert.equal(level({ difficulty: null, difficultyLevel: null }), null);
});

await test("a level in either field sets it", () => {
  assert.equal(level({ difficulty: "beginner" }), "beginner");
  assert.equal(level({ difficultyLevel: "advanced" }), "advanced");
});

await test("a named level wins over a null in the other field", () => {
  assert.equal(
    level({ difficulty: null, difficultyLevel: "advanced" }),
    "advanced",
  );
  assert.equal(
    level({ difficulty: "beginner", difficultyLevel: null }),
    "beginner",
  );
});

await test("difficulty wins when both fields name a level", () => {
  assert.equal(
    level({ difficulty: "beginner", difficultyLevel: "advanced" }),
    "beginner",
  );
});
