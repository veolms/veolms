import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findLastPlayedIndex,
  resolveResumeContext,
  type ResumeCurriculumLesson,
  type ResumeProgressRow,
} from "./learning-progress.service.ts";

const COURSE = "99999999-9999-4999-8999-999999999999";
const lesson = (n: number): ResumeCurriculumLesson => ({
  id: `0000000${n}-0000-4000-8000-000000000000`,
  title: `Lesson ${n}`,
  sectionTitle: "Section",
});
const LESSONS = [1, 2, 3, 4].map(lesson);

const row = (
  n: number,
  progress: number,
  options: { updatedAt?: string; position?: number; playedAt?: string } = {},
): ResumeProgressRow => ({
  lesson_id: lesson(n).id,
  progress_percent: progress,
  updated_at: new Date(options.updatedAt ?? "2026-10-20T10:00:00Z"),
  position_seconds: options.position ?? null,
  position_updated_at: options.playedAt ? new Date(options.playedAt) : null,
});

const resume = (rows: ResumeProgressRow[]) =>
  resolveResumeContext(COURSE, "course", LESSONS, rows).resumeLesson;

void test("resumes the lesson played last, where it was left", () => {
  const lessonPlayed = resume([
    // Further along and its progress moved later, but played earlier.
    row(3, 60, {
      updatedAt: "2026-10-22T10:00:00Z",
      position: 300,
      playedAt: "2026-10-21T10:00:00Z",
    }),
    // A part watched again on another device: progress did not move.
    row(1, 80, {
      updatedAt: "2026-10-01T10:00:00Z",
      position: 42,
      playedAt: "2026-10-22T12:00:00Z",
    }),
  ]);
  assert.equal(lessonPlayed?.lessonNumber, 1);
  assert.equal(lessonPlayed?.positionSeconds, 42);
});

void test("moves on to the next unfinished lesson once the last played is finished", () => {
  const next = resume([
    row(2, 100, { position: 590, playedAt: "2026-10-22T12:00:00Z" }),
    row(3, 100),
    row(1, 40, { position: 30, playedAt: "2026-10-20T12:00:00Z" }),
  ]);
  assert.equal(next?.lessonNumber, 4);
  assert.equal(next?.positionSeconds, undefined);
});

void test("falls back to the first unfinished lesson when every later one is finished", () => {
  const first = resume([
    row(4, 100, { position: 10, playedAt: "2026-10-22T12:00:00Z" }),
    row(1, 100),
  ]);
  assert.equal(first?.lessonNumber, 2);
});

void test("without any saved position, keeps the old rule (progress that moved last)", () => {
  const lessonByProgress = resume([
    row(1, 30, { updatedAt: "2026-10-20T10:00:00Z" }),
    row(3, 50, { updatedAt: "2026-10-21T10:00:00Z" }),
  ]);
  assert.equal(lessonByProgress?.lessonNumber, 3);
});

void test("finds no last played lesson without a saved position", () => {
  assert.equal(findLastPlayedIndex(LESSONS, [row(2, 50)]), -1);
  assert.equal(
    findLastPlayedIndex(LESSONS, [
      row(2, 50, { position: 5, playedAt: "2026-10-20T10:00:00Z" }),
      row(4, 10, { position: 7, playedAt: "2026-10-21T10:00:00Z" }),
    ]),
    3,
  );
});

// Lessons with their videos' lengths (600 s each).
const TIMED = LESSONS.map((entry) => ({ ...entry, durationSeconds: 600 }));
const resumeTimed = (rows: ResumeProgressRow[]) =>
  resolveResumeContext(COURSE, "course", TIMED, rows).resumeLesson;

void test("a finished lesson watched again and left partway is where the learner carries on", () => {
  // Going through the course a second time: lesson 2 and every later one
  // are done, and lesson 2 was left at 4 minutes (support ticket #1025).
  const again = resumeTimed([
    row(2, 100, { position: 240, playedAt: "2026-10-22T12:00:00Z" }),
    row(3, 100),
    row(1, 100, { position: 600, playedAt: "2026-10-21T12:00:00Z" }),
  ]);
  assert.equal(again?.lessonNumber, 2);
  assert.equal(again?.positionSeconds, 240);
});

void test("a finished lesson opened again, left before it played, is where the learner carries on", () => {
  // Starting the course over: lesson 2 is opened again and left while its
  // video loads. The page notes it at 1 second (useLessonProgressState),
  // after lesson 3 was last played partway.
  const reopened = resumeTimed([
    row(3, 80, { position: 300, playedAt: "2026-10-21T12:00:00Z" }),
    row(2, 100, { position: 1, playedAt: "2026-10-22T12:00:00Z" }),
    row(1, 100),
  ]);
  assert.equal(reopened?.lessonNumber, 2);
});

void test("a finished lesson watched again to its end still moves on", () => {
  const next = resumeTimed([
    row(2, 100, { position: 595, playedAt: "2026-10-22T12:00:00Z" }),
    row(3, 100),
  ]);
  assert.equal(next?.lessonNumber, 4);
});
