import assert from "node:assert/strict";
import { test } from "node:test";
import { UNPLACED_SORT_POSITION } from "./course.repository.ts";
import {
  decodePublishedCourseCursor,
  encodePublishedCourseCursor,
} from "./published-course-cursor.ts";

const id = "6f1c1f2e-7f43-4c55-9a1e-2b9a8d5c3e10";
const time = "2026-11-01 10:00:00.123456+00";

await test("a latest cursor carries the course's place and time", () => {
  const cursor = encodePublishedCourseCursor(
    { id, title: "A", created_at_cursor: time, sort_position: 3 },
    "latest",
  );
  assert.deepEqual(decodePublishedCourseCursor(cursor, "latest"), {
    value: time,
    id,
    position: 3,
  });
});

await test("a course with no place is cursored after every placed one", () => {
  const cursor = encodePublishedCourseCursor(
    { id, title: "A", created_at_cursor: time, sort_position: null },
    "latest",
  );
  assert.equal(
    decodePublishedCourseCursor(cursor, "latest").position,
    UNPLACED_SORT_POSITION,
  );
});

await test("a cursor from before places is read as not placed", () => {
  const cursor = `${encodeURIComponent(time)}~${id}`;
  assert.deepEqual(decodePublishedCourseCursor(cursor, "latest"), {
    value: time,
    id,
  });
});

await test("a title cursor keeps the title, even one with a bar in it", () => {
  const cursor = encodePublishedCourseCursor(
    { id, title: "Design | Code", created_at_cursor: time, sort_position: 1 },
    "title",
  );
  assert.deepEqual(decodePublishedCourseCursor(cursor, "title"), {
    value: "Design | Code",
    id,
  });
});

await test("a malformed place or time is refused", () => {
  for (const value of [
    "x|" + time,
    "-1|" + time,
    "99999999999|" + time,
    "2|nope",
  ]) {
    assert.throws(
      () =>
        decodePublishedCourseCursor(
          `${encodeURIComponent(value)}~${id}`,
          "latest",
        ),
      { code: "INVALID_COURSE_CURSOR" },
    );
  }
});
