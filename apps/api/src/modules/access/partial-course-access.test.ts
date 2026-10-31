import assert from "node:assert/strict";
import { test } from "node:test";

import { createLessonContentAccess } from "../courses/course/lesson-content-access.ts";
import {
  resolveResumeContext,
  type ResumeCurriculumLesson,
  type ResumeProgressRow,
} from "../learning-progress/learning-progress.service.ts";
import { decideCourseAccess } from "../viewer-access/viewer-access.rules.ts";
import { grantSectionIds, scopeOpensSection } from "./course-openness.ts";

// A learner holding part of a course: a link gave them sections A and C.
const A = "0000000a-0000-4000-8000-000000000000";
const B = "0000000b-0000-4000-8000-000000000000";
const C = "0000000c-0000-4000-8000-000000000000";
const LEARNER = "00000000-0000-4000-8000-000000000002";
const learner = {
  id: LEARNER,
  roles: ["student"],
  learnerView: false,
  previewsEveryCourse: false,
};
const paidCourse = {
  creatorId: "00000000-0000-4000-8000-000000000001",
  storedPricingType: "paid",
  accessType: "open",
  canSelfEnroll: true,
};

void test("only a grant a link gave can open part of a course", () => {
  assert.deepEqual(
    grantSectionIds({ source: "linked_course", section_ids: [A, C] }),
    [A, C],
  );
  assert.equal(
    grantSectionIds({ source: "linked_course", section_ids: null }),
    null,
  );
  // A purchase written over a partial link opens the whole course.
  assert.equal(
    grantSectionIds({ source: "purchase", section_ids: [A, C] }),
    null,
  );
});

void test("a scope opens its sections, all of them, or nothing", () => {
  assert.equal(scopeOpensSection({ sectionIds: [A, C] }, A), true);
  assert.equal(scopeOpensSection({ sectionIds: [A, C] }, B), false);
  assert.equal(scopeOpensSection({ sectionIds: [A, C] }, undefined), false);
  assert.equal(scopeOpensSection({ sectionIds: null }, B), true);
  assert.equal(scopeOpensSection(null, A), false);
});

void test("part of a course is limited access with its sections open", () => {
  const decision = decideCourseAccess({
    course: paidCourse,
    viewer: learner,
    holdsGrant: true,
    grantSectionIds: [A, C],
  });
  assert.equal(decision.access, "limited");
  assert.deepEqual(decision.openSectionIds, [A, C]);
  // What opens the rest is buying the whole course.
  assert.equal(decision.lockedLessonsNeed, "purchase");

  const whole = decideCourseAccess({
    course: paidCourse,
    viewer: learner,
    holdsGrant: true,
    grantSectionIds: null,
  });
  assert.equal(whole.access, "full");
  assert.equal(whole.openSectionIds, undefined);
});

void test("lesson text opens in the learner's sections only", async () => {
  const access = createLessonContentAccess({
    viewer: { id: LEARNER, roles: ["student"] },
    course: { creator_id: paidCourse.creatorId },
    pricingType: "paid",
    accessType: "open",
    accessScope: () => Promise.resolve({ sectionIds: [A, C] }),
  });
  const lesson = (section_id: string, is_preview = false) => ({
    is_preview,
    isFirstLesson: false,
    section_id,
  });
  assert.equal(await access(lesson(A)), "open");
  assert.equal(await access(lesson(B)), "access");
  // A preview lesson opens for everyone, in any section.
  assert.equal(await access(lesson(B, true)), "open");
});

void test("resume passes over lessons outside the learner's sections", () => {
  const COURSE = "99999999-9999-4999-8999-999999999999";
  const lessons: ResumeCurriculumLesson[] = [
    { id: `00000001-0000-4000-8000-000000000000`, sectionId: A },
    { id: `00000002-0000-4000-8000-000000000000`, sectionId: B },
    { id: `00000003-0000-4000-8000-000000000000`, sectionId: B },
    { id: `00000004-0000-4000-8000-000000000000`, sectionId: C },
    { id: `00000005-0000-4000-8000-000000000000`, sectionId: C },
  ].map((lesson, index) => ({
    ...lesson,
    title: `Lesson ${index + 1}`,
    sectionTitle: "Section",
  }));
  const rows: ResumeProgressRow[] = [
    {
      lesson_id: lessons[0]!.id,
      progress_percent: 100,
      updated_at: new Date("2026-10-20T10:00:00Z"),
      position_seconds: 600,
      position_updated_at: new Date("2026-10-20T10:00:00Z"),
    },
  ];
  const opens = (lesson: ResumeCurriculumLesson) => lesson.sectionId !== B;

  const context = resolveResumeContext(COURSE, "course", lessons, rows, opens);
  // Lesson 1 is done; 2 and 3 are locked, so 4 is next. Numbers stay the
  // course's own.
  assert.equal(context.resumeLesson?.lessonNumber, 4);
  assert.deepEqual(
    context.upcomingLessons.map((lesson) => lesson.lessonNumber),
    [5],
  );
  assert.equal(context.totalLessons, 3);
  assert.equal(context.completedLessons, 1);
});
