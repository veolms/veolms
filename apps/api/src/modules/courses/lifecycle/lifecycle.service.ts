import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
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
  function getCourseAndVerifyOwner(courseId: string, creatorId: string) {
    return verifyCourseOwner(database, courseId, creatorId);
  }

  async function validateCourseObject(
    course: NonNullable<Awaited<ReturnType<typeof verifyCourseOwner>>>,
    creatorId: string,
  ): Promise<CourseValidationResponse> {
    const errors: CourseValidationIssue[] = [];
    const warnings: CourseValidationIssue[] = [];
    const courseId = course.id;

    // 1. Basics Validation
    const basicsErrors: string[] = [];
    if (!course.title || course.title.trim().length === 0) {
      const msg = "Course title is required.";
      basicsErrors.push(msg);
      errors.push({ code: "MISSING_TITLE", message: msg, area: "basics" });
    }

    if (!course.description || course.description.trim().length === 0) {
      const msg = "Course description is required.";
      basicsErrors.push(msg);
      errors.push({
        code: "MISSING_DESCRIPTION",
        message: msg,
        area: "basics",
      });
    }

    if (!course.thumbnail_media_id) {
      const msg = "Course thumbnail is required.";
      basicsErrors.push(msg);
      errors.push({
        code: "MISSING_THUMBNAIL",
        message: msg,
        area: "basics",
      });
    }

    // 2. Concurrently load curriculum, access rules, pricing, and settings
    const [sections, lessons, accessRules, pricing, settings] =
      await Promise.all([
        curriculumService.findSectionsByCourseId(courseId),
        curriculumService.findLessonsByCourseId(courseId),
        configurationService.findAccessRuleByCourseId(courseId),
        configurationService.findPricingByCourseId(courseId),
        configurationService.findSettingsByCourseId(courseId),
      ]);

    // 3. Curriculum Validation
    const curriculumErrors: string[] = [];
    if (sections.length === 0) {
      const msg = "Course must contain at least one section.";
      curriculumErrors.push(msg);
      errors.push({
        code: "EMPTY_CURRICULUM",
        message: msg,
        area: "curriculum",
      });
    }

    if (lessons.length === 0) {
      const msg = "Course must contain at least one lesson.";
      curriculumErrors.push(msg);
      errors.push({ code: "NO_LESSONS", message: msg, area: "curriculum" });
    }

    for (const section of sections) {
      const sectionLessons = lessons.filter((l) => l.section_id === section.id);
      if (sectionLessons.length === 0) {
        const msg = `Section "${section.title}" has no lessons.`;
        curriculumErrors.push(msg);
        errors.push({
          code: "EMPTY_SECTION",
          message: msg,
          area: "curriculum",
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

    const mediaAssets =
      mediaIds.size > 0
        ? await mediaService.getMediaAssets(Array.from(mediaIds))
        : [];
    const mediaMap = new Map(mediaAssets.map((m) => [m.id, m]));

    if (course.thumbnail_media_id) {
      const thumb = mediaMap.get(course.thumbnail_media_id);
      if (
        !thumb ||
        thumb.owner_id !== creatorId ||
        (thumb.status !== "uploaded" && thumb.status !== "ready")
      ) {
        const msg = "Thumbnail media must be fully uploaded.";
        basicsErrors.push(msg);
        errors.push({
          code: "INVALID_THUMBNAIL",
          message: msg,
          area: "basics",
        });
      }
    }

    // Validate media status for all lessons
    for (const lesson of lessons) {
      if (!lesson.content_media_id) {
        const msg = `Lesson "${lesson.title}" does not have media content attached.`;
        curriculumErrors.push(msg);
        errors.push({
          code: "LESSON_MISSING_CONTENT",
          message: msg,
          area: "curriculum",
        });
      } else {
        const media = mediaMap.get(lesson.content_media_id);
        if (!media || media.owner_id !== creatorId) {
          const msg = `Media for lesson "${lesson.title}" was not found.`;
          curriculumErrors.push(msg);
          errors.push({
            code: "LESSON_MEDIA_NOT_FOUND",
            message: msg,
            area: "curriculum",
          });
        } else if (lesson.content_type === "video") {
          if (media.status !== "ready") {
            const msg = `Video for lesson "${lesson.title}" is still processing or failed.`;
            curriculumErrors.push(msg);
            errors.push({
              code: "VIDEO_PROCESSING_INCOMPLETE",
              message: msg,
              area: "curriculum",
            });
          }
        } else if (lesson.content_type === "document") {
          if (media.status !== "uploaded" && media.status !== "ready") {
            const msg = `Document for lesson "${lesson.title}" is not completely uploaded.`;
            curriculumErrors.push(msg);
            errors.push({
              code: "DOCUMENT_NOT_UPLOADED",
              message: msg,
              area: "curriculum",
            });
          }
        }
      }
    }

    // 4. Access Rules Validation
    const accessRulesErrors: string[] = [];
    if (!accessRules) {
      const msg = "Course access rules have not been configured.";
      accessRulesErrors.push(msg);
      errors.push({
        code: "MISSING_ACCESS_RULES",
        message: msg,
        area: "accessRules",
      });
    } else {
      if (accessRules.access_type !== "everyone") {
        const msg = "Restricted access is not yet supported.";
        accessRulesErrors.push(msg);
        errors.push({
          code: "INVALID_ACCESS_TYPE",
          message: msg,
          area: "accessRules",
        });
      }
      if (
        accessRules.duration_type === "fixed_duration" &&
        (!accessRules.duration_days || accessRules.duration_days <= 0)
      ) {
        const msg =
          "Fixed duration must specify a duration in days greater than 0.";
        accessRulesErrors.push(msg);
        errors.push({
          code: "INVALID_ACCESS_DURATION",
          message: msg,
          area: "accessRules",
        });
      }
    }

    // 5. Pricing Validation
    const pricingErrors: string[] = [];
    if (!pricing) {
      const msg = "Course pricing has not been configured.";
      pricingErrors.push(msg);
      errors.push({
        code: "MISSING_PRICING",
        message: msg,
        area: "pricing",
      });
    } else {
      if (pricing.pricing_type === "paid") {
        if (pricing.price <= 0) {
          const msg = "Paid courses must have a price greater than 0.";
          pricingErrors.push(msg);
          errors.push({
            code: "INVALID_PRICE",
            message: msg,
            area: "pricing",
          });
        }
        if (pricing.sale_price !== null && pricing.sale_price !== undefined) {
          if (pricing.sale_price > pricing.price) {
            const msg = "Sale price cannot exceed the original price.";
            pricingErrors.push(msg);
            errors.push({
              code: "INVALID_SALE_PRICE",
              message: msg,
              area: "pricing",
            });
          }
        }
      }
    }

    // 6. Extras Validation (Optional, defaults apply)
    const extrasErrors: string[] = [];

    // Assemble section statuses
    const isBasicsValid = basicsErrors.length === 0;
    const isCurriculumValid = curriculumErrors.length === 0;
    const isAccessRulesValid = accessRulesErrors.length === 0;
    const isPricingValid = pricingErrors.length === 0;
    const isExtrasValid = extrasErrors.length === 0;

    let pricingStatus = "Not configured";
    if (pricing) {
      if (pricing.pricing_type === "free") {
        pricingStatus = "Free";
      } else {
        pricingStatus = `${pricing.currency || "USD"} ${pricing.price}`;
      }
    }

    let accessRulesStatus = "Not configured";
    if (accessRules) {
      if (accessRules.access_type === "everyone") {
        accessRulesStatus =
          accessRules.duration_type === "fixed_duration"
            ? `Everyone (${accessRules.duration_days ?? 0} days)`
            : "Everyone";
      } else {
        accessRulesStatus = "Restricted access";
      }
    }

    const extrasStatus = settings?.certificate_enabled
      ? "Certificate Enabled"
      : "Disabled";

    const sectionsValidation = {
      basics: {
        valid: isBasicsValid,
        status: isBasicsValid ? "Completed" : "Incomplete",
        errors: basicsErrors,
      },
      curriculum: {
        valid: isCurriculumValid,
        status: `${sections.length} Sections, ${lessons.length} Lessons`,
        errors: curriculumErrors,
      },
      accessRules: {
        valid: isAccessRulesValid,
        status: accessRulesStatus,
        errors: accessRulesErrors,
      },
      pricing: {
        valid: isPricingValid,
        status: pricingStatus,
        errors: pricingErrors,
      },
      extras: {
        valid: isExtrasValid,
        status: extrasStatus,
        errors: extrasErrors,
      },
    };

    const canPublish =
      isBasicsValid &&
      isCurriculumValid &&
      isAccessRulesValid &&
      isPricingValid &&
      isExtrasValid &&
      errors.length === 0;

    return {
      canPublish,
      valid: canPublish,
      sections: sectionsValidation,
      errors,
      warnings,
    };
  }

  /**
   * Validates a course to ensure all requirements are satisfied prior to publishing.
   */
  async function validateCourse(
    courseId: string,
    creatorId: string,
  ): Promise<CourseValidationResponse> {
    const course = await getCourseAndVerifyOwner(courseId, creatorId);
    return await validateCourseObject(course, creatorId);
  }

  async function publishCourse(courseId: string, creatorId: string) {
    const course = await getCourseAndVerifyOwner(courseId, creatorId);

    const validation = await validateCourseObject(course, creatorId);
    if (!validation.canPublish || validation.errors.length > 0) {
      throw new AppError(
        400,
        "VALIDATION_FAILED",
        `Cannot publish course due to unresolved issues: ${validation.errors.map((i) => i.message).join("; ")}`,
      );
    }

    const now = new Date();
    const updateResult = await courseRepo.updateCourse(
      database,
      courseId,
      course.version,
      {
        status: "published",
        published_at: now,
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
