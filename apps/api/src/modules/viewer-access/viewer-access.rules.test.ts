import assert from "node:assert/strict";
import { test } from "node:test";

import { createLessonContentAccess } from "../courses/course/lesson-content-access.ts";
import {
  decideCourseAccess,
  isGrantInForce,
  type AccessViewer,
} from "./viewer-access.rules.ts";

const OWNER = "00000000-0000-4000-8000-000000000001";
const LEARNER = "00000000-0000-4000-8000-000000000002";

const viewers: Record<string, AccessViewer | undefined> = {
  guest: undefined,
  learner: {
    id: LEARNER,
    roles: ["student"],
    learnerView: false,
    previewsEveryCourse: false,
  },
  owner: {
    id: OWNER,
    roles: [],
    learnerView: false,
    previewsEveryCourse: false,
  },
  ownerInStudentView: {
    id: OWNER,
    roles: [],
    learnerView: true,
    previewsEveryCourse: false,
  },
  admin: {
    id: LEARNER,
    roles: ["Admin"],
    learnerView: false,
    previewsEveryCourse: false,
  },
  reviewer: {
    id: LEARNER,
    roles: [],
    learnerView: false,
    previewsEveryCourse: true,
  },
};

const pricingTypes = ["free", "paid", null];
const accessTypes = ["open", "restricted", null];

await test("a lesson shown unlocked is one whose text the server hands out", async () => {
  for (const [name, viewer] of Object.entries(viewers)) {
    for (const storedPricingType of pricingTypes) {
      for (const accessType of accessTypes) {
        for (const holdsGrant of [false, true]) {
          if (!viewer && holdsGrant) continue;
          const decision = decideCourseAccess({
            course: {
              creatorId: OWNER,
              storedPricingType,
              accessType,
              canSelfEnroll: true,
            },
            viewer,
            holdsGrant,
          });
          const server = createLessonContentAccess({
            viewer,
            course: { creator_id: OWNER },
            pricingType: storedPricingType,
            accessType,
            accessScope: () =>
              Promise.resolve(holdsGrant ? { sectionIds: null } : null),
          });
          const label = `${name} ${storedPricingType}/${accessType} grant=${holdsGrant}`;

          const laterLessonOpens =
            (await server({ is_preview: false, isFirstLesson: false })) ===
            "open";
          assert.equal(decision.access === "full", laterLessonOpens, label);

          const firstLessonOpens =
            (await server({ is_preview: false, isFirstLesson: true })) ===
            "open";
          assert.equal(
            decision.access === "full" || decision.firstLessonOpen,
            firstLessonOpens,
            label,
          );

          // Preview lessons open for everyone, whatever else holds.
          assert.equal(
            await server({ is_preview: true, isFirstLesson: false }),
            "open",
            label,
          );
        }
      }
    }
  }
});

await test("the viewer's role: managers are the creator and admins, outside the Student view", () => {
  const roleOf = (viewer: AccessViewer | undefined) =>
    decideCourseAccess({
      course: {
        creatorId: OWNER,
        storedPricingType: "paid",
        accessType: "open",
        canSelfEnroll: true,
      },
      viewer,
      holdsGrant: false,
    }).viewer;
  assert.equal(roleOf(viewers.guest), "guest");
  assert.equal(roleOf(viewers.learner), "learner");
  assert.equal(roleOf(viewers.owner), "manager");
  assert.equal(roleOf(viewers.admin), "manager");
  assert.equal(roleOf(viewers.ownerInStudentView), "learner");
  assert.equal(roleOf(viewers.reviewer), "learner");
});

await test("what locked lessons need: sign in, buy the course, or a grant from staff", () => {
  const needOf = (
    viewer: AccessViewer | undefined,
    course: {
      storedPricingType: string;
      accessType: string;
      canSelfEnroll: boolean;
    },
  ) =>
    decideCourseAccess({
      course: { creatorId: OWNER, ...course },
      viewer,
      holdsGrant: false,
    }).lockedLessonsNeed;
  const paid = {
    storedPricingType: "paid",
    accessType: "open",
    canSelfEnroll: true,
  };
  const restrictedFree = {
    storedPricingType: "free",
    accessType: "restricted",
    canSelfEnroll: false,
  };
  const openFree = {
    storedPricingType: "free",
    accessType: "open",
    canSelfEnroll: true,
  };
  assert.equal(needOf(undefined, paid), "sign-in");
  assert.equal(needOf(viewers.learner, paid), "purchase");
  assert.equal(needOf(viewers.learner, restrictedFree), "grant");
  assert.equal(needOf(viewers.learner, openFree), null);
  assert.equal(needOf(viewers.owner, paid), null);
});

await test("a grant counts while active and before its end", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  assert.equal(
    isGrantInForce({ status: "active", validUntil: null }, now),
    true,
  );
  assert.equal(
    isGrantInForce(
      { status: "active", validUntil: "2026-10-21T00:00:00Z" },
      now,
    ),
    true,
  );
  assert.equal(
    isGrantInForce(
      { status: "active", validUntil: new Date("2026-10-19") },
      now,
    ),
    false,
  );
  assert.equal(
    isGrantInForce({ status: "revoked", validUntil: null }, now),
    false,
  );
  assert.equal(isGrantInForce({ status: "expired" }, now), false);
});
