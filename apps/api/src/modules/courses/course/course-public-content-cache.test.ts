import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheTags, clearAllCaches, invalidateCache } from "@veolms/api-core";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import type { AppServices } from "../../../services/index.ts";
import { createCourseService } from "./course.service.ts";

// The public course (the signed-out overview, the curriculum course pages
// are built from, and the version every access answer carries) is read
// from one cache shared by every course service; a signed-in viewer's
// overview is built fresh each time.

const COURSE = "00000000-0000-4000-8000-000000000002";
const OWNER = "00000000-0000-4000-8000-000000000001";
const LEARNER = "00000000-0000-4000-8000-0000000000aa";

const courseRow = {
  id: COURSE,
  slug: "course-two",
  title: "Course two",
  short_description: null,
  description: null,
  difficulty: "beginner",
  status: "published",
  creator_id: OWNER,
  category_id: null,
  thumbnail_media_id: null,
  trailer_media_id: null,
  instructor_alias: null,
  deleted_at: null,
};

/** Answers every single-row read with the course and every list with []. */
function fakeDatabase() {
  const builder = (): unknown =>
    new Proxy(
      {},
      {
        get: (_target, key) => {
          if (key === "then") return undefined;
          if (key === "executeTakeFirst") return async () => courseRow;
          if (key === "execute") return async () => [];
          return () => builder();
        },
      },
    );
  return { selectFrom: () => builder() } as unknown as Kysely<Database>;
}

const section = {
  id: "00000000-0000-4000-8000-0000000000s1".replace("s1", "51"),
  course_id: COURSE,
  title: "Section",
  description: null,
  position: 1,
  deleted_at: null,
};

function lesson(title: string, position: number, isPublished: boolean) {
  return {
    id: `00000000-0000-4000-8000-00000000010${position}`,
    course_id: COURSE,
    section_id: section.id,
    title,
    description: null,
    content_type: "video",
    content_media_id: null,
    position,
    is_published: isPublished,
    is_preview: false,
    duration_seconds: null,
    deleted_at: null,
  };
}

/** A course service that counts how often the curriculum is read. */
function build() {
  const reads = { lessons: 0 };
  const service = createCourseService({
    database: fakeDatabase(),
    services: {} as AppServices,
    authService: { listUserDisplayNamesByIds: async () => [] } as never,
    categoryService: { findCategoryById: async () => null } as never,
    curriculumService: {
      findSectionsByCourseId: async () => [section],
      findLessonsByCourseId: async () => {
        reads.lessons += 1;
        return [lesson("published", 1, true), lesson("draft", 2, false)];
      },
      listResourcesByCourseId: async () => [],
    } as never,
    configurationService: {
      findAccessRuleByCourseId: async () => null,
      findPricingByCourseId: async () => ({
        pricing_type: "free",
        price: 0,
        currency: "INR",
        sale_price: null,
      }),
      findSettingsByCourseId: async () => null,
    } as never,
    includesService: {
      listIncludesForAuthorizedCourse: async () => [],
    } as never,
    mediaService: { getMediaAssets: async () => [] } as never,
    deletionService: {} as never,
  });
  return { service, reads };
}

await test("the signed-out overview, the curriculum and its version are built once and shared by every course service", async () => {
  clearAllCaches();
  const one = build();
  const another = build();

  const overview = await one.service.getCourseOverviewData(COURSE);
  const curriculum = await another.service.getPublicCurriculum(COURSE);
  const version = await one.service.getPublicCurriculumVersion(COURSE);

  assert.equal(one.reads.lessons + another.reads.lessons, 1);
  assert.equal(overview.course.id, COURSE);
  assert.equal(overview.pricing?.pricingType, "free");
  assert.equal("pricing" in curriculum, false);
  assert.equal(version, curriculum.version);
});

await test("after the course changes, the next read builds it again", async () => {
  clearAllCaches();
  const { service, reads } = build();
  await service.getPublicCurriculum(COURSE);
  invalidateCache([cacheTags.course(COURSE)]);
  await service.getPublicCurriculum(COURSE);
  assert.equal(reads.lessons, 2);
});

await test("a signed-in overview is worked out for its viewer from the shared course content", async () => {
  clearAllCaches();
  const { service, reads } = build();
  const learner = { id: LEARNER, roles: ["student"] };
  const owner = { id: OWNER, roles: ["instructor"] };
  const lessonTitles = (overview: {
    sections: Array<{ lessons?: Array<{ title: string }> }>;
  }) =>
    overview.sections.flatMap((entry) =>
      (entry.lessons ?? []).map((item) => item.title),
    );

  const visitor = await service.getCourseOverviewData(COURSE);
  const asLearner = await service.getCourseOverviewData(COURSE, learner);
  const asOwner = await service.getCourseOverviewData(COURSE, owner);

  assert.equal(reads.lessons, 1, "the course is read once for every viewer");
  assert.deepEqual(lessonTitles(visitor), ["published"]);
  assert.deepEqual(lessonTitles(asLearner), ["published"]);
  assert.deepEqual(
    lessonTitles(asOwner),
    ["published", "draft"],
    "its creator also sees the unpublished lesson",
  );
});
