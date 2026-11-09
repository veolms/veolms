import { cacheTags, invalidateCache } from "@veolms/api-core";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import type { AppServices } from "../../services/index.ts";
import { createCurriculumService } from "../courses/index.ts";

/** The section a course workshop's recordings go to when none is picked. */
export const WORKSHOP_RECORDINGS_SECTION = "Workshop recordings";

export interface WorkshopCourseLessons {
  /** The course's sections, for the admin's picker. */
  listSections(courseId: string): Promise<{ id: string; title: string }[]>;
  /**
   * Publishes a recording as a video lesson of the course, or points the
   * lesson it was published as before at the new video. Returns the lesson.
   * Uses the course's own curriculum rules, so the actor must be allowed to
   * add lessons to that course.
   */
  publishRecording(input: {
    courseId: string;
    sectionId: string | null;
    title: string;
    mediaId: string;
    existingLessonId: string | null;
    actor: { id: string; roles: readonly string[] };
  }): Promise<string>;
}

/**
 * A course workshop's recording belongs in the course, beside its other
 * lessons, so learners find it where they already learn. This goes through
 * the curriculum service the course editor uses: the same permissions, the
 * same video processing (the transcode is queued when the video is set),
 * and the same course caches and static pages are refreshed afterwards.
 */
export function createWorkshopCourseLessons({
  database,
  services,
  logger,
}: {
  database: Kysely<Database>;
  services: AppServices;
  logger: FastifyBaseLogger;
}): WorkshopCourseLessons {
  const curriculum = createCurriculumService({ database, services });

  function courseChanged(courseId: string): void {
    invalidateCache([cacheTags.course(courseId), cacheTags.catalog]);
    services.courseStaticPages?.requestRefresh({ courseId });
  }

  return {
    async listSections(courseId) {
      const sections = await curriculum.findSectionsByCourseId(courseId);
      return sections.map((section) => ({
        id: section.id,
        title: section.title,
      }));
    },

    async publishRecording(input) {
      const { courseId, actor } = input;
      let lessonId = input.existingLessonId;
      if (lessonId) {
        const lesson = await curriculum.findLessonById(lessonId, courseId);
        if (!lesson || lesson.deleted_at) lessonId = null;
      }
      if (!lessonId) {
        const sections = await curriculum.findSectionsByCourseId(courseId);
        let sectionId =
          input.sectionId &&
          sections.some((section) => section.id === input.sectionId)
            ? input.sectionId
            : (sections.find(
                (section) => section.title === WORKSHOP_RECORDINGS_SECTION,
              )?.id ?? null);
        if (!sectionId) {
          const created = await curriculum.createCourseSection(
            courseId,
            actor.id,
            WORKSHOP_RECORDINGS_SECTION,
            actor.roles,
          );
          sectionId = created.id;
        }
        const lesson = await curriculum.createCourseLesson(
          courseId,
          sectionId,
          actor.id,
          { title: input.title, contentType: "video" },
          actor.roles,
        );
        lessonId = lesson.id;
      }
      await curriculum.updateCourseLesson(
        courseId,
        lessonId,
        actor.id,
        { contentMediaId: input.mediaId },
        logger,
        actor.roles,
      );
      courseChanged(courseId);
      return lessonId;
    },
  };
}
