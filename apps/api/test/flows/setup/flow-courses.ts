/**
 * Courses for the flow tests, written straight to the database in the shape
 * the course editor leaves them: a course, its pricing and access rule, one
 * section, and lessons whose videos are already transcoded. Uploading and
 * transcoding a real video needs object storage, which these tests do not
 * reach; everything a learner does with the course afterwards goes through
 * the API.
 */
import { clearAllCaches } from "@veolms/api-core";

import type { FlowApp, FlowClient } from "./flow-app.ts";
import { FLOW_ADMIN } from "./flow-fixtures.ts";

export interface FlowLesson {
  title?: string;
  /** Open to everyone, signed in or not. */
  preview?: boolean;
  /** Unpublished lessons are shown to nobody but staff. */
  published?: boolean;
  /** The lesson's video: transcoded, still being prepared, or none. */
  video?: "ready" | "processing" | "none";
}

export interface FlowCourseOptions {
  /** Shown on the course page; a numbered "Flow Course" when left out. */
  title?: string;
  status?: "draft" | "published" | "archived";
  pricing?: "free" | "paid";
  /**
   * In rupees, as the course editor stores it (orders and the gateway
   * count paise). Paid courses only.
   */
  price?: number;
  access?: "everyone" | "restricted";
  lessons?: FlowLesson[];
  /** How long each lesson's video is said to be, in seconds. */
  videoSeconds?: number;
}

export interface FlowCourse {
  id: string;
  slug: string;
  title: string;
  price: number;
  lessons: { id: string; mediaId: string | null; number: number | null }[];
}

let courseCounter = 0;

export async function createCourse(
  flow: FlowApp,
  options: FlowCourseOptions = {},
): Promise<FlowCourse> {
  courseCounter += 1;
  const id = crypto.randomUUID();
  const slug = `flow-course-${process.pid}-${courseCounter}-${id.slice(0, 8)}`;
  const title = options.title ?? `Flow Course ${courseCounter}`;
  const status = options.status ?? "published";
  const pricing = options.pricing ?? "paid";
  const price = pricing === "free" ? 0 : (options.price ?? 499);
  const lessons = options.lessons ?? [{ preview: true }, {}, {}];
  const db = flow.database;
  const now = new Date();

  await db
    .insertInto("courses")
    .values({
      id,
      slug,
      title,
      short_description: "A course made by the flow tests.",
      description: "A course made by the flow tests.",
      status,
      creator_id: FLOW_ADMIN.id,
      category_id: null,
      difficulty: "beginner",
      thumbnail_media_id: null,
      thumbnail_url: null,
      trailer_media_id: null,
      banner_media_id: null,
      instructor_alias: null,
      published_at: status === "draft" ? null : now,
      deleted_at: null,
    })
    .execute();

  await db
    .insertInto("course_pricing")
    .values({
      id: crypto.randomUUID(),
      course_id: id,
      pricing_type: pricing,
      price,
      sale_price: price,
    })
    .execute();

  await db
    .insertInto("course_access_rules")
    .values({
      id: crypto.randomUUID(),
      course_id: id,
      access_type: options.access ?? "everyone",
      duration_type: "lifetime",
      duration_days: null,
    })
    .execute();

  const sectionId = crypto.randomUUID();
  await db
    .insertInto("course_sections")
    .values({
      id: sectionId,
      course_id: id,
      title: "Section 1",
      position: 1,
      deleted_at: null,
    })
    .execute();

  const created: FlowCourse["lessons"] = [];
  let publishedNumber = 0;
  for (const [index, lesson] of lessons.entries()) {
    const video = lesson.video ?? "ready";
    let mediaId: string | null = null;
    if (video !== "none") {
      mediaId = crypto.randomUUID();
      await db
        .insertInto("media_assets")
        .values({
          id: mediaId,
          owner_id: FLOW_ADMIN.id,
          type: "video",
          storage_provider: "s3",
          storage_key: `videos/${mediaId}`,
          original_filename: `lesson-${index + 1}.mp4`,
          mime_type: "video/mp4",
          size_bytes: 1_048_576,
          width: 1920,
          height: 1080,
          duration_seconds: options.videoSeconds ?? 600,
          metadata: JSON.stringify({}),
          status: video === "ready" ? "ready" : "processing",
          upload_id: null,
          upload_part_size: null,
        })
        .execute();
    }
    const lessonId = crypto.randomUUID();
    const published = lesson.published ?? true;
    await db
      .insertInto("course_lessons")
      .values({
        id: lessonId,
        course_id: id,
        section_id: sectionId,
        title: lesson.title ?? `Lesson ${index + 1}`,
        description: `What lesson ${index + 1} teaches.`,
        content_type: "video",
        content_media_id: mediaId,
        position: index + 1,
        is_preview: lesson.preview ?? false,
        is_published: published,
        deleted_at: null,
      })
      .execute();
    created.push({
      id: lessonId,
      mediaId,
      number: published ? ++publishedNumber : null,
    });
  }

  // The course editor's saves clear the API's caches of the catalogue and
  // the course; a course written straight to the database must do the same,
  // or a page cached earlier (the catalogue, say) would not list it.
  clearAllCaches();

  return { id, slug, title, price, lessons: created };
}

/** What the course page is told about this viewer (`GET /courses/:slug/access`). */
export interface CourseAccess {
  viewer: "guest" | "learner" | "manager";
  access: "full" | "limited";
  firstLessonOpen: boolean;
  lockedLessonsNeed: "sign-in" | "purchase" | "grant" | null;
  enrolled: boolean;
  canSelfEnroll: boolean;
  progress: { percent: number; started: boolean } | null;
  resume: {
    totalLessons: number;
    completedLessons: number;
    resumeLesson: { lessonNumber: number } | null;
  } | null;
}

export async function courseAccess(
  client: FlowClient,
  course: FlowCourse,
): Promise<{ status: number; access: CourseAccess | undefined }> {
  const response = await client.get<CourseAccess>(
    `/v1/courses/${course.slug}/access`,
  );
  return { status: response.status, access: response.body.data };
}

export interface PlaybackBootstrap {
  lessonId: string;
  manifestUrl: string;
  segmentToken?: string;
  resumePosition?: { seconds: number; savedAt: string } | null;
}

/** The player asking to start a lesson's video, as the lesson page does. */
export function play(
  client: FlowClient,
  course: FlowCourse,
  lessonNumber: number,
  query = "",
) {
  return client.get<PlaybackBootstrap>(
    `/v1/courses/${course.slug}/lessons/${lessonNumber}/playback-bootstrap${query}`,
  );
}

/** "Enroll for free" on the course page. */
export async function enrollForFree(client: FlowClient, course: FlowCourse) {
  return client.post<{ order: { id: string; status: string }; gateway: null }>(
    "/v1/checkout/orders",
    { items: [{ itemType: "course", courseId: course.id }] },
  );
}

/** The course ids in the learner's My Courses. */
export async function myCourseIds(client: FlowClient): Promise<string[]> {
  const response = await client.get<{ courses: { courseId: string }[] }>(
    "/v1/enrollments/courses",
  );
  if (response.status !== 200) {
    throw new Error(`My Courses answered ${response.status}`);
  }
  return response.body.data!.courses.map((course) => course.courseId);
}
