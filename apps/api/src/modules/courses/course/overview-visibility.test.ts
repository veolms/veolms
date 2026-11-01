import assert from "node:assert/strict";
import { test } from "node:test";

import { presentCurriculum } from "../shared/courses.presenters.ts";
import {
  isLessonListedInOverview,
  resolveOverviewVisibility,
} from "./overview-visibility.ts";

const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const published = { status: "published", creator_id: OWNER };
const draft = { status: "draft", creator_id: OWNER };

await test("a published course opens for everyone, managed only by its creator and admins", () => {
  assert.deepEqual(resolveOverviewVisibility(published, undefined), {
    mayOpen: true,
    managesCourse: false,
  });
  assert.deepEqual(
    resolveOverviewVisibility(published, { id: OTHER, roles: ["student"] }),
    { mayOpen: true, managesCourse: false },
  );
  assert.deepEqual(
    resolveOverviewVisibility(published, { id: OTHER, roles: ["instructor"] }),
    { mayOpen: true, managesCourse: false },
  );
  assert.deepEqual(
    resolveOverviewVisibility(published, { id: OWNER, roles: ["instructor"] }),
    { mayOpen: true, managesCourse: true },
  );
  assert.deepEqual(
    resolveOverviewVisibility(published, { id: OTHER, roles: ["admin"] }),
    { mayOpen: true, managesCourse: true },
  );
});

await test("a draft opens for its creator and admins only", () => {
  assert.equal(resolveOverviewVisibility(draft, undefined).mayOpen, false);
  assert.equal(
    resolveOverviewVisibility(draft, { id: OTHER, roles: ["instructor"] })
      .mayOpen,
    false,
  );
  assert.equal(
    resolveOverviewVisibility(draft, { id: OWNER, roles: [] }).mayOpen,
    true,
  );
  assert.equal(
    resolveOverviewVisibility(draft, { id: OTHER, roles: ["admin"] }).mayOpen,
    true,
  );
});

await test("Student view still opens a draft but no longer manages the course", () => {
  assert.deepEqual(
    resolveOverviewVisibility(draft, {
      id: OWNER,
      roles: ["instructor"],
      learnerView: true,
    }),
    { mayOpen: true, managesCourse: false },
  );
  // The header narrows only: it gives a learner nothing.
  assert.deepEqual(
    resolveOverviewVisibility(draft, {
      id: OTHER,
      roles: ["student"],
      learnerView: true,
    }),
    { mayOpen: false, managesCourse: false },
  );
});

await test("an unpublished lesson is listed only for whoever manages the course", () => {
  assert.equal(
    isLessonListedInOverview({ is_published: true }, { managesCourse: false }),
    true,
  );
  assert.equal(
    isLessonListedInOverview({ is_published: false }, { managesCourse: false }),
    false,
  );
  assert.equal(
    isLessonListedInOverview({ is_published: false }, { managesCourse: true }),
    true,
  );
});

const curriculum = {
  sections: [{ id: "s1", title: "Section", position: 0 }],
  lessons: [
    {
      id: "l1",
      section_id: "s1",
      title: "With text",
      description: "Some text",
      content_type: "video" as const,
      content_media_id: null,
      position: 0,
      is_preview: false,
      is_published: true,
    },
    {
      id: "l2",
      section_id: "s1",
      title: "Without text",
      description: null,
      content_type: "video" as const,
      content_media_id: null,
      position: 1,
      is_preview: false,
      is_published: true,
    },
  ],
  resources: [],
  mediaById: new Map(),
};

await test("the curriculum carries lesson descriptions unless told to leave them out", () => {
  const lessons = presentCurriculum(curriculum)[0]!.lessons!;
  assert.deepEqual(
    lessons.map((lesson) => lesson.description),
    ["Some text", null],
  );
});

await test("left out, every description is null and the key is still there", () => {
  const withText = presentCurriculum(curriculum)[0]!.lessons!;
  const without = presentCurriculum({
    ...curriculum,
    omitLessonDescriptions: true,
  })[0]!.lessons!;
  for (const lesson of without) {
    assert.equal(Object.hasOwn(lesson, "description"), true);
    assert.equal(lesson.description, null);
  }
  // Nothing else about a lesson changes.
  assert.deepEqual(
    without.map((lesson) => ({ ...lesson, description: undefined })),
    withText.map((lesson) => ({ ...lesson, description: undefined })),
  );
});
