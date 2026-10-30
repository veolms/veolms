import assert from "node:assert/strict";
import { test } from "node:test";
import { givesLessonItsFirstMedia } from "./lesson-first-media.ts";

const VIDEO = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

await test("a lesson with no media that is given some gets its first media", () => {
  assert.equal(givesLessonItsFirstMedia(null, VIDEO), true);
});

await test("a lesson with no media that is left with none does not", () => {
  // `null`: the editor's save of a lesson with no video, or a lesson made a
  // quiz lesson. `undefined` never reaches here, but is no media either.
  assert.equal(givesLessonItsFirstMedia(null, null), false);
  assert.equal(givesLessonItsFirstMedia(null, undefined), false);
});

await test("replacing a video, or saving the same one, is not a first media", () => {
  assert.equal(givesLessonItsFirstMedia(VIDEO, OTHER), false);
  assert.equal(givesLessonItsFirstMedia(VIDEO, VIDEO), false);
});

await test("taking media off is not a first media", () => {
  assert.equal(givesLessonItsFirstMedia(VIDEO, null), false);
});
