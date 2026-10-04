import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";
import type { RawBuilder } from "kysely";
import { ADMIN_ROLE } from "../../../auth/index.ts";
import {
  createAccessService,
  type AccessService,
} from "../../../access/index.ts";
import { DiscussionErrors } from "./discussion.errors.ts";
import type { DiscussionActor } from "./discussion.access.ts";

export interface LessonDiscussionReadAccess {
  /** Whether the caller may see authenticated-only discussion state such as notes. */
  canReadPrivateState: boolean;
}

export interface PublicLessonDiscussionSqlAliases {
  course: string;
  lesson: string;
  section: string;
  pricing: string;
}

export function isPublicLessonDiscussion(input: {
  courseStatus: string;
  isPublished: boolean;
  isPreview: boolean;
  pricingType: string | null;
}): boolean {
  return (
    input.courseStatus === "published" &&
    input.isPublished &&
    (input.isPreview || input.pricingType === "free")
  );
}

/**
 * The anonymous lesson discussion visibility rule shared by lesson reads and
 * public discovery queries. Anonymous discussion content is readable only
 * when the course is published, the lesson is published and not deleted, the
 * section is not deleted, and the course is free or the lesson is previewable.
 */
export function publicLessonDiscussionPredicate({
  course,
  lesson,
  section,
  pricing,
}: PublicLessonDiscussionSqlAliases): RawBuilder<boolean> {
  return sql<boolean>`(
    ${sql.ref(`${course}.status`)} = 'published'
    and ${sql.ref(`${course}.deleted_at`)} is null
    and ${sql.ref(`${lesson}.is_published`)} = true
    and ${sql.ref(`${lesson}.deleted_at`)} is null
    and ${sql.ref(`${section}.deleted_at`)} is null
    and (
      ${sql.ref(`${lesson}.is_preview`)} = true
      or ${sql.ref(`${pricing}.pricing_type`)} = 'free'
    )
  )`;
}

export interface LessonDiscussionAccess {
  assertCanReadLesson(
    db: DatabaseExecutor,
    input: {
      courseId: string;
      lessonId: string;
      actor: DiscussionActor | null;
    },
  ): Promise<LessonDiscussionReadAccess>;
}

export function createLessonDiscussionAccess(options?: {
  access?: AccessService;
}): LessonDiscussionAccess {
  const access = options?.access ?? createAccessService();

  return {
    async assertCanReadLesson(db, { courseId, lessonId, actor }) {
      const lesson = await db
        .selectFrom("course_lessons")
        .innerJoin("courses", "courses.id", "course_lessons.course_id")
        .leftJoin("course_pricing", "course_pricing.course_id", "courses.id")
        .innerJoin(
          "course_sections",
          "course_sections.id",
          "course_lessons.section_id",
        )
        .select([
          "courses.status as courseStatus",
          "courses.creator_id as courseCreatorId",
          "course_pricing.pricing_type as pricingType",
          "course_lessons.is_preview as isPreview",
          "course_lessons.is_published as isPublished",
        ])
        .where("course_lessons.id", "=", lessonId)
        .where("course_lessons.course_id", "=", courseId)
        .where("course_lessons.deleted_at", "is", null)
        .where("course_sections.deleted_at", "is", null)
        .where("courses.deleted_at", "is", null)
        .executeTakeFirst();

      if (
        !lesson ||
        lesson.courseStatus !== "published" ||
        lesson.isPublished === false
      ) {
        throw DiscussionErrors.notFound("Lesson discussion");
      }

      const isAdmin = Boolean(
        actor?.roles.some((role) => role.toLowerCase() === ADMIN_ROLE),
      );
      const isCourseOwner = Boolean(
        actor && lesson.courseCreatorId === actor.userId,
      );
      const hasActiveAccess = Boolean(
        actor && (await access.hasActiveAccess(db, actor.userId, courseId)),
      );

      if (isAdmin || isCourseOwner || hasActiveAccess) {
        return { canReadPrivateState: true };
      }

      // Keep lesson-level discussion reads aligned with playback: published
      // free courses and explicitly previewed lessons are public.
      if (
        isPublicLessonDiscussion({
          courseStatus: lesson.courseStatus,
          isPublished: lesson.isPublished,
          isPreview: lesson.isPreview,
          pricingType: lesson.pricingType,
        })
      ) {
        return { canReadPrivateState: false };
      }

      if (!actor) throw DiscussionErrors.unauthorized();
      throw DiscussionErrors.courseAccessDenied();
    },
  };
}
