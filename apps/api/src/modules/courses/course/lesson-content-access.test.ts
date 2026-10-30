import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createLessonContentAccess,
  findFirstPublishedLessonId,
  isLessonDescriptionPublic,
} from "./lesson-content-access.ts";

const OWNER = "00000000-0000-4000-8000-000000000001";
const LEARNER = "00000000-0000-4000-8000-000000000002";
const course = { creator_id: OWNER };
const locked = { is_preview: false, isFirstLesson: false };

function accessFor(input: {
  viewer?: { id: string; roles?: string[]; learnerView?: boolean };
  pricingType?: string | null;
  accessType?: string | null;
  holds?: boolean;
}) {
  let lookups = 0;
  const decide = createLessonContentAccess({
    viewer: input.viewer,
    course,
    pricingType: input.pricingType ?? "paid",
    accessType: input.accessType ?? "open",
    holdsCourse: () => {
      lookups += 1;
      return Promise.resolve(input.holds ?? false);
    },
  });
  return { decide, lookups: () => lookups };
}

await test("a paid lesson asks a visitor to sign in and a learner to get the course", async () => {
  assert.equal(await accessFor({}).decide(locked), "login");
  assert.equal(
    await accessFor({ viewer: { id: LEARNER } }).decide(locked),
    "access",
  );
  assert.equal(
    await accessFor({ viewer: { id: LEARNER }, holds: true }).decide(locked),
    "open",
  );
});

await test("a preview lesson is open to everyone", async () => {
  const preview = { is_preview: true, isFirstLesson: false };
  assert.equal(await accessFor({}).decide(preview), "open");
  assert.equal(
    await accessFor({ viewer: { id: LEARNER } }).decide(preview),
    "open",
  );
});

await test("the creator and an admin read every lesson, in Student view too", async () => {
  assert.equal(
    await accessFor({ viewer: { id: OWNER, learnerView: true } }).decide(
      locked,
    ),
    "open",
  );
  assert.equal(
    await accessFor({ viewer: { id: LEARNER, roles: ["Admin"] } }).decide(
      locked,
    ),
    "open",
  );
});

await test("an open free course is open when signed in, and its first lesson to visitors", async () => {
  const free = { pricingType: "free", accessType: "open" };
  assert.equal(
    await accessFor({ ...free, viewer: { id: LEARNER } }).decide(locked),
    "open",
  );
  assert.equal(await accessFor(free).decide(locked), "login");
  assert.equal(
    await accessFor(free).decide({ is_preview: false, isFirstLesson: true }),
    "open",
  );
});

await test("a restricted free course needs a grant", async () => {
  const restricted = { pricingType: "free", accessType: "restricted" };
  assert.equal(
    await accessFor({ ...restricted, viewer: { id: LEARNER } }).decide(locked),
    "access",
  );
  assert.equal(
    await accessFor(restricted).decide({
      is_preview: false,
      isFirstLesson: true,
    }),
    "login",
  );
});

await test("the viewer's hold on the course is looked up once, and only when needed", async () => {
  const { decide, lookups } = accessFor({ viewer: { id: LEARNER } });
  await decide({ is_preview: true, isFirstLesson: false });
  assert.equal(lookups(), 0);
  await decide(locked);
  await decide(locked);
  assert.equal(lookups(), 1);
});

await test("the first published lesson follows section, then lesson, order", () => {
  const sections = [
    { id: "s2", position: 2 },
    { id: "s1", position: 1 },
  ];
  const lessons = [
    { id: "a", section_id: "s2", position: 0, is_published: true },
    { id: "b", section_id: "s1", position: 1, is_published: true },
    { id: "c", section_id: "s1", position: 0, is_published: false },
    { id: "d", section_id: "gone", position: 0, is_published: true },
  ];
  assert.equal(findFirstPublishedLessonId(sections, lessons), "b");
  assert.equal(findFirstPublishedLessonId(sections, []), undefined);
});

await test("a video's or a quiz's description is for everyone; a reading lesson's text is not", () => {
  assert.equal(isLessonDescriptionPublic({ content_type: "video" }), true);
  assert.equal(isLessonDescriptionPublic({ content_type: "quiz" }), true);
  assert.equal(isLessonDescriptionPublic({ content_type: "document" }), false);
});
