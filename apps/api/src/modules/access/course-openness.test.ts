import assert from "node:assert/strict";
import { test } from "node:test";

import { createAccessService } from "./access.service.ts";
import {
  isCourseOpenForEnrolment,
  isCourseOpenToLearner,
  isOpenFreeCourse,
  isRestrictedFreeCourse,
  learnerCourseGate,
} from "./course-openness.ts";

// Audit finding B2: a free course set to "restricted" was closed to anyone
// without a grant on every read path, but checkout still enrolled anyone who
// asked, and the enrolment was the grant.

const pricingTypes = ["free", "paid", null, undefined];

await test("a free course that is access-restricted cannot be self-enrolled", () => {
  assert.equal(
    isRestrictedFreeCourse({ pricing_type: "free", access_type: "restricted" }),
    true,
  );
});

await test("nor can a restricted course with no pricing row, which checkout would charge nothing for", () => {
  assert.equal(
    isRestrictedFreeCourse({
      pricing_type: undefined,
      access_type: "restricted",
    }),
    true,
  );
  assert.equal(
    isRestrictedFreeCourse({ pricing_type: null, access_type: "restricted" }),
    true,
  );
});

await test("a restricted course that is sold can be bought: buying it is how its grant is obtained", () => {
  assert.equal(
    isRestrictedFreeCourse({ pricing_type: "paid", access_type: "restricted" }),
    false,
  );
});

await test("a course open to everyone, or with no access rule, is never closed to self-enrolment", () => {
  for (const pricing_type of pricingTypes) {
    for (const access_type of ["everyone", null, undefined]) {
      assert.equal(
        isRestrictedFreeCourse({ pricing_type, access_type }),
        false,
        `pricing ${String(pricing_type)}, access ${String(access_type)}`,
      );
    }
  }
});

await test("no course is both open without a grant and closed to self-enrolment", () => {
  for (const pricing_type of pricingTypes) {
    for (const access_type of ["everyone", "restricted", null, undefined]) {
      const course = { pricing_type, access_type };
      assert.equal(
        isOpenFreeCourse(course) && isRestrictedFreeCourse(course),
        false,
        `pricing ${String(pricing_type)}, access ${String(access_type)}`,
      );
    }
  }
});

await test("a restricted free course is closed on both sides: not open to read, not open to enrol", () => {
  const course = { pricing_type: "free", access_type: "restricted" };
  assert.equal(isOpenFreeCourse(course), false);
  assert.equal(isRestrictedFreeCourse(course), true);
});

// Audit finding B1, owner decision of 14 Oct 2026: archiving a course stops
// new purchases and enrolments, and takes nothing from those who have it.

await test("a published course is shown to every learner, with access or without", () => {
  assert.equal(learnerCourseGate("published"), "open");
  assert.equal(isCourseOpenToLearner("published", false), true);
  assert.equal(isCourseOpenToLearner("published", true), true);
});

await test("an archived course is shown to a learner who holds access, and to no other", () => {
  assert.equal(learnerCourseGate("archived"), "holders_only");
  assert.equal(isCourseOpenToLearner("archived", true), true);
  assert.equal(isCourseOpenToLearner("archived", false), false);
});

await test("a draft is shown to no learner, a grant for it included", () => {
  assert.equal(learnerCourseGate("draft"), "closed");
  assert.equal(isCourseOpenToLearner("draft", true), false);
  assert.equal(isCourseOpenToLearner("draft", false), false);
});

await test("a status nobody defined, or none at all, is closed rather than open", () => {
  for (const status of [
    "",
    "deleted",
    "PUBLISHED",
    "Archived",
    null,
    undefined,
  ]) {
    assert.equal(learnerCourseGate(status), "closed", String(status));
    assert.equal(isCourseOpenToLearner(status, true), false, String(status));
  }
});

await test("only a published course takes new enrolments: an archived one keeps its learners and adds none", () => {
  assert.equal(isCourseOpenForEnrolment("published"), true);
  assert.equal(isCourseOpenForEnrolment("archived"), false);
  assert.equal(isCourseOpenForEnrolment("draft"), false);
  assert.equal(isCourseOpenForEnrolment(undefined), false);
});

await test("holding access never opens more than the course's status allows, and never less than before", () => {
  // Published and draft answer the same whatever the learner holds, as they
  // did before archived courses were kept; only archived depends on it.
  for (const status of ["published", "draft"]) {
    assert.equal(
      isCourseOpenToLearner(status, true),
      isCourseOpenToLearner(status, false),
      status,
    );
  }
});

// The service asks the same rule and reads the grant only when the answer
// depends on it: no grant read for a published course or a draft, and none
// for a visitor who is not signed in.
const grantReads: string[] = [];
function fakeDatabase(
  grant: { status: string; valid_until: Date | null } | undefined,
) {
  const builder = {
    selectAll: () => builder,
    where: () => builder,
    executeTakeFirst: async () => {
      grantReads.push("read");
      return grant;
    },
  };
  return { selectFrom: () => builder } as unknown as Parameters<
    ReturnType<typeof createAccessService>["isCourseOpenToLearner"]
  >[0];
}
const COURSE = "00000000-0000-4000-8000-000000000002";
const LEARNER = "00000000-0000-4000-8000-0000000000aa";
const liveGrant = { status: "active", valid_until: null };

await test("the service: archived with a live grant opens, with a revoked or lapsed one it does not", async () => {
  const service = createAccessService();
  const archived = { id: COURSE, status: "archived" };
  assert.equal(
    await service.isCourseOpenToLearner(
      fakeDatabase(liveGrant),
      LEARNER,
      archived,
    ),
    true,
  );
  assert.equal(
    await service.isCourseOpenToLearner(
      fakeDatabase({ status: "revoked", valid_until: null }),
      LEARNER,
      archived,
    ),
    false,
  );
  assert.equal(
    await service.isCourseOpenToLearner(
      fakeDatabase({
        status: "active",
        valid_until: new Date(Date.now() - 1000),
      }),
      LEARNER,
      archived,
    ),
    false,
  );
  assert.equal(
    await service.isCourseOpenToLearner(
      fakeDatabase(undefined),
      LEARNER,
      archived,
    ),
    false,
  );
});

await test("the service: a visitor who is not signed in is never shown an archived course, and no grant is read", async () => {
  const service = createAccessService();
  grantReads.length = 0;
  assert.equal(
    await service.isCourseOpenToLearner(fakeDatabase(liveGrant), undefined, {
      id: COURSE,
      status: "archived",
    }),
    false,
  );
  assert.equal(
    await service.isCourseOpenToLearner(fakeDatabase(liveGrant), null, {
      id: COURSE,
      status: "archived",
    }),
    false,
  );
  assert.deepEqual(grantReads, []);
});

await test("the service: published and draft are answered from the status alone, without reading a grant", async () => {
  const service = createAccessService();
  grantReads.length = 0;
  assert.equal(
    await service.isCourseOpenToLearner(fakeDatabase(undefined), LEARNER, {
      id: COURSE,
      status: "published",
    }),
    true,
  );
  assert.equal(
    await service.isCourseOpenToLearner(fakeDatabase(liveGrant), LEARNER, {
      id: COURSE,
      status: "draft",
    }),
    false,
  );
  assert.deepEqual(grantReads, []);
});
