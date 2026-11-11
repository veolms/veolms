/**
 * Course editor: a lesson dragged into another section is saved there (the
 * lesson-reorder endpoint takes a lesson of another section of the same
 * course), and the section it left is numbered again without a gap. A
 * lesson of another course is refused.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { grantPlatformRole } from "@veolms/database";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
import { signedUpLearner, startFlowApp } from "./setup/flow-app.ts";
import { createCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
// An admin of their own: the admin's sign-in codes for the day are used up
// by the files before this one.
const staffAccount = await signedUpLearner(flow, "curricstaff");
await grantPlatformRole(flow.database, {
  userId: staffAccount.userId,
  roleId: SYSTEM_ROLES.admin.id,
});
const staff = flow.visitor();
await staff.signIn(staffAccount.learner.email);

const course = await createCourse(flow, {
  title: "Move Course",
  lessons: [{}, {}, {}],
});
const otherCourse = await createCourse(flow, { lessons: [{}] });

async function courseVersion(): Promise<number> {
  const row = await flow.database
    .selectFrom("courses")
    .select("version")
    .where("id", "=", course.id)
    .executeTakeFirstOrThrow();
  return Number(row.version);
}

async function lessonsOf(sectionId: string) {
  return await flow.database
    .selectFrom("course_lessons")
    .select(["id", "position"])
    .where("section_id", "=", sectionId)
    .orderBy("position")
    .execute();
}

async function firstSectionId(): Promise<string> {
  const row = await flow.database
    .selectFrom("course_lessons")
    .select("section_id")
    .where("id", "=", course.lessons[0]!.id)
    .executeTakeFirstOrThrow();
  return row.section_id;
}

test.after(async () => {
  await flow.close();
});

test("a lesson dragged into another section moves there, and the section it left closes the gap", async () => {
  const fromSection = await firstSectionId();
  const created = await staff.post<{ id: string }>(
    `/v1/courses/${course.id}/sections`,
    { title: "Second section" },
  );
  assert.ok(
    created.status === 200 || created.status === 201,
    `section answered ${created.status}: ${JSON.stringify(created.body.error)}`,
  );
  const toSection = created.body.data!.id;
  const moved = course.lessons[0]!.id;

  const response = await staff.post(
    `/v1/courses/${course.id}/sections/${toSection}/lessons/reorder`,
    { orderedLessonIds: [moved], version: await courseVersion() },
  );
  assert.equal(
    response.status,
    200,
    `reorder answered ${response.status}: ${JSON.stringify(response.body.error)}`,
  );

  assert.deepEqual(
    (await lessonsOf(toSection)).map((l) => [l.id, l.position]),
    [[moved, 0]],
  );
  assert.deepEqual(
    (await lessonsOf(fromSection)).map((l) => [l.id, l.position]),
    [
      [course.lessons[1]!.id, 0],
      [course.lessons[2]!.id, 1],
    ],
  );
});

test("a lesson of another course cannot be moved in", async () => {
  const section = await firstSectionId();
  const current = (await lessonsOf(section)).map((l) => l.id);
  const response = await staff.post(
    `/v1/courses/${course.id}/sections/${section}/lessons/reorder`,
    {
      orderedLessonIds: [...current, otherCourse.lessons[0]!.id],
      version: await courseVersion(),
    },
  );
  assert.equal(response.status, 400);
  assert.deepEqual(
    (await lessonsOf(section)).map((l) => l.id),
    current,
  );
});
