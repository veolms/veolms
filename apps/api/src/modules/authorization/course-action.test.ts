import assert from "node:assert/strict";
import { test } from "node:test";
import type { PermissionCheckContext } from "./authorization.repository.ts";
import { canActOnCourseWith } from "./course-action.ts";

const course = { id: "course-1", creator_id: "owner" };

function recordingChecker(allowed: boolean) {
  const calls: PermissionCheckContext[] = [];
  const check = async (context: PermissionCheckContext) => {
    calls.push(context);
    return { allowed };
  };
  return { calls, check };
}

await test("an owner's own-course roles count on their course", async () => {
  const { calls, check } = recordingChecker(true);
  const allowed = await canActOnCourseWith(check, {
    userId: "owner",
    permission: "course.publish",
    course,
  });
  assert.equal(allowed, true);
  assert.equal(calls[0]?.excludeOwnCoursesOnlyRoles, false);
  assert.equal(calls[0]?.courseId, "course-1");
});

await test("on someone else's course own-course roles are left out", async () => {
  const { calls, check } = recordingChecker(false);
  const allowed = await canActOnCourseWith(check, {
    userId: "other-instructor",
    permission: "course.details.update",
    course,
  });
  assert.equal(allowed, false);
  assert.equal(calls[0]?.excludeOwnCoursesOnlyRoles, true);
});

await test("an owner without the permission is refused", async () => {
  const { check } = recordingChecker(false);
  assert.equal(
    await canActOnCourseWith(check, {
      userId: "owner",
      permission: "course.delete",
      course,
    }),
    false,
  );
});

await test("a course with no creator is never treated as owned", async () => {
  const { calls, check } = recordingChecker(true);
  await canActOnCourseWith(check, {
    userId: "someone",
    permission: "course.read",
    course: { id: "course-2", creator_id: null },
  });
  assert.equal(calls[0]?.excludeOwnCoursesOnlyRoles, true);
});

await test("signed-out users are refused without a lookup", async () => {
  const { calls, check } = recordingChecker(true);
  assert.equal(
    await canActOnCourseWith(check, {
      userId: null,
      permission: "course.read",
      course,
    }),
    false,
  );
  assert.equal(calls.length, 0);
});
