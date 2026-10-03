import type { RecentUpdatesQuery, RecentUpdatesResponse } from "@veolms/contracts";

import {
  createRecentUpdatesRepository,
  type RecentUpdatesRepository,
} from "./recent-updates.repository.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecentUpdatesService {
  list(userId: string, query: RecentUpdatesQuery): Promise<RecentUpdatesResponse>;
}

export function createRecentUpdatesService({
  repository,
  now = () => new Date(),
}: {
  repository: RecentUpdatesRepository;
  now?: () => Date;
}): RecentUpdatesService {
  async function list(userId: string, query: RecentUpdatesQuery): Promise<RecentUpdatesResponse> {
    const currentTime = now();
    const cutoff = new Date(currentTime.getTime() - query.days * DAY_MS);
    const courses = await repository.listRecentUpdateCourses({
      userId,
      now: currentTime,
      cutoff,
      limit: query.limit,
    });

    if (courses.length === 0) return { courses: [] };

    const lessonRows = await repository.listRecentUpdateLessons({
      courseIds: courses.map((course) => course.course_id),
      cutoff,
      lessonsPerCourse: query.lessonsPerCourse,
    });
    const lessonsByCourse = new Map<string, typeof lessonRows>();
    for (const lesson of lessonRows) {
      const current = lessonsByCourse.get(lesson.course_id) ?? [];
      current.push(lesson);
      lessonsByCourse.set(lesson.course_id, current);
    }

    return {
      courses: courses.map((course) => ({
        courseId: course.course_id,
        courseSlug: course.course_slug,
        courseTitle: course.course_title,
        courseThumbnailUrl: course.course_thumbnail_url,
        courseThumbnailMediaId: course.course_thumbnail_media_id,
        recentLessonCount: Number(course.recent_lesson_count),
        latestUpdatedAt: course.latest_updated_at.toISOString(),
        lessons: (lessonsByCourse.get(course.course_id) ?? []).map((lesson) => ({
          lessonId: lesson.lesson_id,
          lessonTitle: lesson.lesson_title,
          lessonNumber: Number(lesson.lesson_number),
          updatedAt: lesson.lesson_updated_at.toISOString(),
        })),
      })),
    };
  }

  return { list };
}

export function createDefaultRecentUpdatesService({
  database,
  now,
}: {
  database: Parameters<typeof createRecentUpdatesRepository>[0]["database"];
  now?: () => Date;
}) {
  return createRecentUpdatesService({
    repository: createRecentUpdatesRepository({ database }),
    now,
  });
}
