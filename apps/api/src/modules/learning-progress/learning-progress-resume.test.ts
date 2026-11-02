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
