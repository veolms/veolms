import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { CourseValidationIssue } from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import type { AppServices } from "../../../services/index.ts";
import * as courseRepo from "../course/course.repository.ts";
import {
  createCurriculumService,
  type CurriculumService,
} from "../curriculum/curriculum.service.ts";
import {
  createConfigurationService,
  type ConfigurationService,
} from "../configuration/configuration.service.ts";
import { createMediaService, type MediaService } from "../../media/index.ts";
import {
  createCourseService,
  type CourseService,
} from "../course/course.service.ts";
import {
  assertOptimisticUpdate,
  getCourseAndVerifyOwner as verifyCourseOwner,
} from "../shared/courses.utils.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";

export interface LifecycleServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
  courseService?: CourseService;
  curriculumService?: CurriculumService;
  configurationService?: ConfigurationService;
  mediaService?: MediaService;
}

export function createLifecycleService({
  database,
  services,
  courseService = createCourseService({ database, services }),
  curriculumService = createCurriculumService({ database, services }),
  configurationService = createConfigurationService({ database }),
  mediaService = createMediaService({ database, services }),
}: LifecycleServiceOptions) {
  const outbox = createOutboxService();
  function getCourseAndVerifyOwner(courseId: string, creatorId: string) {
    return verifyCourseOwner(database, courseId, creatorId);
  }

  async function validateCourseObject(
    course: NonNullable<Awaited<ReturnType<typeof verifyCourseOwner>>>,
    creatorId: string,
  ): Promise<CourseValidationIssue[]> {
    const issues: CourseValidationIssue[] = [];
    const courseId = course.id;

    // 1. Course Basics validation
    if (!course.title || course.title.trim().length === 0) {
      issues.push({
        code: "MISSING_TITLE",
        message: "Course title is required.",
      });
    }

    if (!course.description || course.description.trim().length === 0) {
      issues.push({
        code: "MISSING_DESCRIPTION",
        message: "Course description is required.",
      });
    }

    if (!course.thumbnail_media_id) {
      issues.push({
        code: "MISSING_THUMBNAIL",
        message: "Course thumbnail is required.",
      });
    }

    // 2. Curriculum & Configuration concurrently
    const [sections, lessons, accessRules, pricing] = await Promise.all([
      curriculumService.findSectionsByCourseId(courseId),
      curriculumService.findLessonsByCourseId(courseId),
      configurationService.findAccessRuleByCourseId(courseId),
      configurationService.findPricingByCourseId(courseId),
    ]);

    if (sections.length === 0) {
      issues.push({
        code: "EMPTY_CURRICULUM",
        message: "Course must contain at least one section.",
      });
    }

    if (lessons.length === 0) {
      issues.push({
        code: "NO_LESSONS",
        message: "Course must contain at least one lesson.",
      });
    }

    for (const section of sections) {
      const sectionLessons = lessons.filter((l) => l.section_id === section.id);
      if (sectionLessons.length === 0) {
        issues.push({
          code: "EMPTY_SECTION",
          message: `Section "${section.title}" has no lessons.`,
        });
      }
    }

    // Batch fetch media assets
    const mediaIds = new Set<string>();
    if (course.thumbnail_media_id) {
      mediaIds.add(course.thumbnail_media_id);
    }
    for (const lesson of lessons) {
      if (lesson.content_media_id) {
        mediaIds.add(lesson.content_media_id);
      }
    }

    const mediaAssets = await mediaService.getMediaAssets(Array.from(mediaIds));
    const mediaMap = new Map(mediaAssets.map((m) => [m.id, m]));

    if (course.thumbnail_media_id) {
      const thumb = mediaMap.get(course.thumbnail_media_id);
      if (
        !thumb ||
        thumb.owner_id !== creatorId ||
        thumb.status !== "uploaded"
      ) {
        issues.push({
          code: "INVALID_THUMBNAIL",
          message: "Thumbnail media must be fully uploaded.",
        });
      }
    }

    // Validate media status for all lessons
    for (const lesson of lessons) {
      if (!lesson.content_media_id) {
        issues.push({
          code: "LESSON_MISSING_CONTENT",
          message: `Lesson "${lesson.title}" does not have media content attached.`,
        });
      } else {
        const media = mediaMap.get(lesson.content_media_id);
        if (!media || media.owner_id !== creatorId) {
          issues.push({
            code: "LESSON_MEDIA_NOT_FOUND",
            message: `Media for lesson "${lesson.title}" was not found.`,
          });
        } else if (lesson.content_type === "video") {
          if (media.status !== "ready") {
            issues.push({
              code: "VIDEO_PROCESSING_INCOMPLETE",
              message: `Video for lesson "${lesson.title}" is still processing or failed.`,
            });
          }
        } else if (lesson.content_type === "document") {
          if (media.status !== "uploaded") {
            issues.push({
              code: "DOCUMENT_NOT_UPLOADED",
              message: `Document for lesson "${lesson.title}" is not completely uploaded.`,
            });
          }
        }
      }
    }

    // 3. Configuration validation
    if (!accessRules) {
      issues.push({
        code: "MISSING_ACCESS_RULES",
        message: "Course access rules have not been configured.",
      });
    }

    if (!pricing) {
      issues.push({
        code: "MISSING_PRICING",
        message: "Course pricing has not been configured.",
      });
    } else if (pricing.pricing_type === "paid" && pricing.price <= 0) {
      issues.push({
        code: "INVALID_PRICE",
        message: "Paid courses must have a price greater than 0.",
      });
    }

    return issues;
  }

  /**
   * Validates a course to ensure all requirements are satisfied prior to publishing.
   */
  async function validateCourse(
    courseId: string,
    creatorId: string,
  ): Promise<CourseValidationIssue[]> {
    const course = await getCourseAndVerifyOwner(courseId, creatorId);
    return await validateCourseObject(course, creatorId);
  }

  async function publishCourse(courseId: string, creatorId: string) {
    const course = await getCourseAndVerifyOwner(courseId, creatorId);

    const issues = await validateCourseObject(course, creatorId);
    if (issues.length > 0) {
      throw new AppError(
        400,
        "VALIDATION_FAILED",
        `Cannot publish course due to unresolved issues: ${issues.map((i) => i.message).join("; ")}`,
      );
    }

    const now = new Date();
    await database.transaction().execute(async (trx) => {
      const result = await courseRepo.updateCourse(
        trx,
        courseId,
        course.version,
        {
          status: "published",
          published_at: now,
          version: course.version + 1,
          updated_at: now,
        },
      );
      assertOptimisticUpdate(result);
      await outbox.publish(trx, {
        type: "course.published",
        version: 1,
        dedupeKey: `course.published:${course.id}:v${course.version + 1}`,
        occurredAt: now,
        payload: {
          courseId: course.id,
          courseSlug: course.slug,
          courseTitle: course.title,
          creatorUserId: creatorId,
        },
      });
      return result;
    });

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      shortDescription: course.short_description,
      description: course.description,
      difficulty: course.difficulty as
        "beginner" | "intermediate" | "advanced" | null,
      status: "published" as const,
      creatorId: course.creator_id as string,
      categoryId: course.category_id,
      thumbnailMediaId: course.thumbnail_media_id,
      trailerMediaId: course.trailer_media_id,
      instructorAlias: course.instructor_alias ?? null,
      version: course.version + 1,
      createdAt: course.created_at.toISOString(),
      updatedAt: now.toISOString(),
      publishedAt: now.toISOString(),
    };
  }

  async function unpublishCourse(courseId: string, creatorId: string) {
    const course = await getCourseAndVerifyOwner(courseId, creatorId);

    const now = new Date();
    const updateResult = await courseRepo.updateCourse(
      database,
      courseId,
      course.version,
      {
        status: "draft",
        version: course.version + 1,
        updated_at: now,
      },
    );
    assertOptimisticUpdate(updateResult);

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      shortDescription: course.short_description,
      description: course.description,
      difficulty: course.difficulty as
        "beginner" | "intermediate" | "advanced" | null,
      status: "draft" as const,
      creatorId: course.creator_id as string,
      categoryId: course.category_id,
      thumbnailMediaId: course.thumbnail_media_id,
      trailerMediaId: course.trailer_media_id,
      instructorAlias: course.instructor_alias ?? null,
      version: course.version + 1,
      createdAt: course.created_at.toISOString(),
      updatedAt: now.toISOString(),
      publishedAt: course.published_at?.toISOString() ?? null,
    };
  }

  async function previewCourseDraft(courseId: string, creatorId: string) {
    return await courseService.getCourseEditorData(courseId, creatorId);
  }

  return {
    validateCourse,
    publishCourse,
    unpublishCourse,
    previewCourseDraft,
  };
}

export type LifecycleService = ReturnType<typeof createLifecycleService>;
