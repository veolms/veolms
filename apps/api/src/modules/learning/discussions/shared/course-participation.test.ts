import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DatabaseExecutor } from "@veolms/database";
import type { AccessService } from "../../../access/index.ts";
import {
  createDiscussionAccess,
  type DiscussionActor,
} from "./discussion.access.ts";

const courseId = "course-1";
const userId = "user-1";

function createDb(creatorId: string | null): DatabaseExecutor {
  const query = {
    select: () => query,
    where: () => query,
    executeTakeFirst: async () =>
      creatorId === null ? undefined : { creator_id: creatorId },
  };

  return {
    selectFrom: () => query,
  } as unknown as DatabaseExecutor;
}

function createAccess(hasActiveAccess: boolean): AccessService {
  return {
    hasActiveAccess: async () => hasActiveAccess,
  } as unknown as AccessService;
}

const actor: DiscussionActor = { userId, roles: [] };

async function assertParticipationDenied(
  access: ReturnType<typeof createDiscussionAccess>,
  participant: DiscussionActor = actor,
) {
  await assert.rejects(
    access.assertCanParticipateInCourse(
      createDb(null),
      participant,
      courseId,
    ),
    (error: { code?: string }) => error.code === "COURSE_ACCESS_DENIED",
  );
}

describe("discussion course participation", () => {
  it("denies a user without active course access, including open/free courses", async () => {
    await assertParticipationDenied(
      createDiscussionAccess({ access: createAccess(false) }),
    );
  });

  it("denies an unenrolled user for a protected or paid course", async () => {
    await assertParticipationDenied(
      createDiscussionAccess({ access: createAccess(false) }),
    );
  });

  it("allows a user with active course access", async () => {
    await createDiscussionAccess({
      access: createAccess(true),
    }).assertCanParticipateInCourse(createDb(null), actor, courseId);
  });

  it("allows the course creator without an access grant", async () => {
    await createDiscussionAccess({
      access: createAccess(false),
    }).assertCanParticipateInCourse(createDb(userId), actor, courseId);
  });

  it("allows an administrator without an access grant", async () => {
    await createDiscussionAccess({
      access: createAccess(false),
    }).assertCanParticipateInCourse(
      createDb(null),
      { userId, roles: ["admin"] },
      courseId,
    );
  });
});
