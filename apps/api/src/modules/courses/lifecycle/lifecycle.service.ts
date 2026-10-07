import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  CourseStatusResponse,
  CourseValidationIssue,
  CourseValidationResponse,
} from "@veolms/contracts";
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
import { ADMIN_ROLE } from "../../auth/index.ts";

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
  function getCourseAndVerifyOwner(
    courseId: string,
    creatorId: string,
    userRoles?: readonly string[],
  ) {
    return verifyCourseOwner(database, courseId, creatorId, userRoles);
  }

  async function validateCourseObject(
    course: NonNullable<Awaited<ReturnType<typeof verifyCourseOwner>>>,
    creatorId: string,
    userRoles?: readonly string[],
  ): Promise<CourseValidationResponse> {
    const isAdmin = userRoles?.includes(ADMIN_ROLE);
    const errors: CourseValidationIssue[] = [];
    // Records one problem under its wizard step and in the overall list, in
    // the order found (the editor shows the first as the headline).
    const report = (areaErrors: string[], message: string) => {
      areaErrors.push(message);
      errors.push({ message });
    };
    const courseId = course.id;

    // 1. Basics Validation
    const basicsErrors: string[] = [];
    if (!course.title || course.title.trim().length === 0) {
      report(basicsErrors, "Course title is required.");
    }

    if (!course.description || course.description.trim().length === 0) {
      report(basicsErrors, "Course description is required.");
    }

    if (!course.thumbnail_media_id) {
      report(basicsErrors, "Course thumbnail is required.");
    }

    // 2. Concurrently load curriculum, access rules, and pricing
    const [sections, lessons, accessRules, pricing] = await Promise.all([
      curriculumService.findSectionsByCourseId(courseId),
      curriculumService.findLessonsByCourseId(courseId),
      configurationService.findAccessRuleByCourseId(courseId),
      configurationService.findPricingByCourseId(courseId),
    ]);

    // 3. Curriculum Validation
    const curriculumErrors: string[] = [];
    if (sections.length === 0) {
      report(curriculumErrors, "Course must contain at least one section.");
    }

    if (lessons.length === 0) {
      report(curriculumErrors, "Course must contain at least one lesson.");
    }

    for (const section of sections) {
      const sectionLessons = lessons.filter((l) => l.section_id === section.id);
      if (sectionLessons.length === 0) {
        report(curriculumErrors, `Section "${section.title}" has no lessons.`);
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

    const mediaAssets =
      mediaIds.size > 0
        ? await mediaService.getMediaAssets(Array.from(mediaIds))
        : [];
    const mediaMap = new Map(mediaAssets.map((m) => [m.id, m]));

    if (course.thumbnail_media_id) {
      const thumb = mediaMap.get(course.thumbnail_media_id);
      if (
        !thumb ||
        (!isAdmin && thumb.owner_id !== course.creator_id) ||
        (thumb.status !== "uploaded" && thumb.status !== "ready")
      ) {
        report(basicsErrors, "Thumbnail media must be fully uploaded.");
      }
    }

    // Quiz lessons are self-contained and intentionally do not have a media
    // asset. Video/document lessons still use the existing media validation.
    for (const lesson of lessons) {
      if (lesson.content_type === "quiz") {
        continue;
      }
      if (!lesson.content_media_id) {
        report(
          curriculumErrors,
          `Lesson "${lesson.title}" does not have media content attached.`,
        );
      } else {
        const media = mediaMap.get(lesson.content_media_id);
        if (!media || (!isAdmin && media.owner_id !== course.creator_id)) {
          report(
            curriculumErrors,
            `Media for lesson "${lesson.title}" was not found.`,
          );
        } else if (lesson.content_type === "video") {
          if (media.status !== "ready") {
            report(
              curriculumErrors,
              `Video for lesson "${lesson.title}" is still processing or failed.`,
            );
          }
        } else if (lesson.content_type === "document") {
          if (media.status !== "uploaded" && media.status !== "ready") {
            report(
              curriculumErrors,
              `Document for lesson "${lesson.title}" is not completely uploaded.`,
            );
          }
        }
      }
    }

    // 4. Access Rules Validation
    const accessRulesErrors: string[] = [];
    if (!accessRules) {
      report(
        accessRulesErrors,
        "Course access rules have not been configured.",
      );
    } else {
      if (accessRules.access_type !== "everyone") {
        report(accessRulesErrors, "Restricted access is not yet supported.");
      }
      if (
        accessRules.duration_type === "fixed_duration" &&
        (!accessRules.duration_days || accessRules.duration_days <= 0)
      ) {
        report(
          accessRulesErrors,
          "Fixed duration must specify a duration in days greater than 0.",
        );
      }
    }

    // 5. Pricing Validation
    const pricingErrors: string[] = [];
    if (!pricing) {
      report(pricingErrors, "Course pricing has not been configured.");
    } else {
      if (pricing.pricing_type === "paid") {
        if (pricing.price <= 0) {
          report(
            pricingErrors,
            "Paid courses must have a price greater than 0.",
          );
        }
        if (pricing.sale_price !== null && pricing.sale_price !== undefined) {
          if (pricing.sale_price > pricing.price) {
            report(
              pricingErrors,
              "Sale price cannot exceed the original price.",
            );
          }
        }
      }
    }

    // 6. Extras Validation (Optional, defaults apply)
    const extrasErrors: string[] = [];

    const toStep = (stepErrors: string[]) => ({
      valid: stepErrors.length === 0,
      errors: stepErrors,
    });

    return {
      canPublish: errors.length === 0,
      sections: {
        basics: toStep(basicsErrors),
        curriculum: toStep(curriculumErrors),
        accessRules: toStep(accessRulesErrors),
        pricing: toStep(pricingErrors),
        extras: toStep(extrasErrors),
      },
      errors,
    };
  }

  /**
   * Validates a course to ensure all requirements are satisfied prior to publishing.
   */
  async function validateCourse(
    courseId: string,
    creatorId: string,
    userRoles?: readonly string[],
  ): Promise<CourseValidationResponse> {
    const course = await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
    );
    return await validateCourseObject(course, creatorId, userRoles);
  }

  async function publishCourse(
    courseId: string,
    creatorId: string,
    userRoles?: readonly string[],
  ) {
    const course = await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
    );

    const validation = await validateCourseObject(course, creatorId, userRoles);
    if (!validation.canPublish || validation.errors.length > 0) {
      throw new AppError(
        400,
        "VALIDATION_FAILED",
        `Cannot publish course due to unresolved issues: ${validation.errors.map((i) => i.message).join("; ")}`,
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
          creatorUserId: course.creator_id,
        },
      });
      return result;
    });

    return {
      id: course.id,
      slug: course.slug,
      status: "published",
      version: course.version + 1,
    } satisfies CourseStatusResponse;
  }

  async function unpublishCourse(
    courseId: string,
    creatorId: string,
    userRoles?: readonly string[],
  ) {
    const course = await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
    );

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
      status: "draft",
      version: course.version + 1,
    } satisfies CourseStatusResponse;
  }

  async function previewCourseDraft(
    courseId: string,
    creatorId: string,
    userRoles?: readonly string[],
  ) {
    return await courseService.getCourseEditorData(
      courseId,
      creatorId,
      userRoles,
    );
  }

  return {
    validateCourse,
    publishCourse,
    unpublishCourse,
    previewCourseDraft,
  };
}

export type LifecycleService = ReturnType<typeof createLifecycleService>;
