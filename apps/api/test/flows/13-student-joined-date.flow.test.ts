/**
 * A student brought over from the old platform keeps the date they joined
 * there (`users.joined_at`): the student page shows it, and the Students
 * list sorts "recent" by it, page after page. Everyone else's joined date
 * is when they signed up here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

// One label for both, so a search lists just these two.
const label = `jd${Date.now().toString(36)}`;
const imported = await signedUpLearner(flow, `${label}old`);
const signedUp = await signedUpLearner(flow, `${label}new`);
const originallyJoined = new Date("2024-08-26T16:14:21.000Z");
await flow.database
  .updateTable("users")
  .set({ joined_at: originallyJoined })
  .where("id", "=", imported.userId)
  .execute();

interface ListPage {
  students: { id: string; joinedAt: string }[];
  nextCursor: string | null;
}

test.after(async () => {
  await flow.close();
});

test("the student page shows when an imported student joined the old platform", async () => {
  const page = await admin.get<{ student: { joinedAt: string } }>(
    `/v1/students/${imported.learner.username}`,
  );
  assert.equal(page.status, 200);
  assert.equal(
    page.body.data?.student.joinedAt,
    originallyJoined.toISOString(),
  );

  const other = await admin.get<{ student: { joinedAt: string } }>(
    `/v1/students/${signedUp.learner.username}`,
  );
  // Signed up here: today.
  assert.ok(
    Date.now() - Date.parse(other.body.data!.student.joinedAt) < 60 * 60_000,
  );
});

test("the list sorts recent by joined date, across pages", async () => {
  const first = await admin.get<ListPage>(
    `/v1/students?search=${label}&sortBy=recent&limit=1`,
  );
  assert.equal(first.status, 200);
  assert.deepEqual(
    first.body.data?.students.map((student) => student.id),
    [signedUp.userId],
  );
  assert.ok(first.body.data?.nextCursor);

  const second = await admin.get<ListPage>(
    `/v1/students?search=${label}&sortBy=recent&limit=1&cursor=${encodeURIComponent(first.body.data!.nextCursor!)}`,
  );
  assert.equal(second.status, 200);
  assert.deepEqual(
    second.body.data?.students.map((student) => student.id),
    [imported.userId],
  );
  assert.equal(
    second.body.data?.students[0]?.joinedAt,
    originallyJoined.toISOString(),
  );
});
