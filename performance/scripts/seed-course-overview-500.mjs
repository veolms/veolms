import { randomUUID } from "node:crypto";

import { createDatabase } from "../../packages/database/src/client.ts";

const DEFAULT_LOCAL_DATABASE_URL =
  "postgresql://veolms:veolms@localhost:5433/veolms";
const TEST_COURSE_SLUG = "performance-500-lessons-course";
const SECTION_COUNT = 25;
const LESSONS_PER_SECTION = 20;

const databaseUrl = process.env.DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;
const databaseHost = new URL(databaseUrl).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
  throw new Error(
    `Refusing to seed a non-local database host: ${databaseHost}.`,
  );
}

const database = createDatabase(databaseUrl);

try {
  const existing = await database
    .selectFrom("courses")
    .select(["id", "slug", "title"])
    .where("slug", "=", TEST_COURSE_SLUG)
    .executeTakeFirst();

  if (existing) {
    const lessonCount = await database
      .selectFrom("course_lessons")
      .select((expressionBuilder) =>
        expressionBuilder.fn.count("id").as("count"),
      )
      .where("course_id", "=", existing.id)
      .where("deleted_at", "is", null)
      .executeTakeFirstOrThrow();

    console.log(
      JSON.stringify({
        created: false,
        courseId: existing.id,
        slug: existing.slug,
        title: existing.title,
        lessons: Number(lessonCount.count),
      }),
    );
    process.exitCode = 0;
  } else {
    const now = new Date();
    const courseId = randomUUID();
    const sectionRows = Array.from({ length: SECTION_COUNT }, (_, index) => ({
      id: randomUUID(),
      course_id: courseId,
      title: `Performance Section ${index + 1}`,
      position: index + 1,
      created_at: now,
      updated_at: now,
    }));
    const lessonRows = sectionRows.flatMap((section, sectionIndex) =>
      Array.from({ length: LESSONS_PER_SECTION }, (_, lessonIndex) => ({
        id: randomUUID(),
        course_id: courseId,
        section_id: section.id,
        title: `Lesson ${sectionIndex * LESSONS_PER_SECTION + lessonIndex + 1}`,
        description: "Performance test lesson.",
        content_type: "document",
        content_media_id: null,
        position: lessonIndex + 1,
        is_preview: lessonIndex === 0,
        is_published: true,
        created_at: now,
        updated_at: now,
      })),
    );

    await database.transaction().execute(async (transaction) => {
      await transaction
        .insertInto("courses")
        .values({
          id: courseId,
          slug: TEST_COURSE_SLUG,
          title: "Performance Test Course — 500 Lessons",
          short_description: "Local performance test course.",
          description:
            "This local-only course is used to measure course overview performance with a large curriculum.",
          status: "published",
          creator_id: null,
          category_id: null,
          difficulty: "intermediate",
          thumbnail_media_id: null,
          trailer_media_id: null,
          instructor_alias: "Performance Test",
          version: 1,
          created_at: now,
          updated_at: now,
          published_at: now,
          deleted_at: null,
        })
        .execute();

      await transaction
        .insertInto("course_sections")
        .values(sectionRows)
        .execute();

      await transaction
        .insertInto("course_lessons")
        .values(lessonRows)
        .execute();

      await transaction
        .insertInto("course_access_rules")
        .values({
          id: randomUUID(),
          course_id: courseId,
          access_type: "everyone",
          duration_type: "lifetime",
          duration_days: null,
          created_at: now,
          updated_at: now,
        })
        .execute();

      await transaction
        .insertInto("course_pricing")
        .values({
          id: randomUUID(),
          course_id: courseId,
          pricing_type: "free",
          price: 0,
          currency: "INR",
          sale_price: null,
          created_at: now,
          updated_at: now,
        })
        .execute();

      await transaction
        .insertInto("course_includes")
        .values([
          {
            id: randomUUID(),
            course_id: courseId,
            text: "500 curriculum lessons",
            icon: null,
            position: 1,
            created_at: now,
            updated_at: now,
          },
          {
            id: randomUUID(),
            course_id: courseId,
            text: "Local performance testing only",
            icon: null,
            position: 2,
            created_at: now,
            updated_at: now,
          },
        ])
        .execute();
    });

    console.log(
      JSON.stringify({
        created: true,
        courseId,
        slug: TEST_COURSE_SLUG,
        sections: sectionRows.length,
        lessons: lessonRows.length,
        url: `/courses/${TEST_COURSE_SLUG}/overview`,
      }),
    );
  }
} finally {
  await database.destroy();
}
