import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";
import type { RawBuilder } from "kysely";
import { hasAcademyPermission } from "../../../authorization/index.ts";
import {
  createAccessService,
  type AccessService,
} from "../../../access/index.ts";
import { DiscussionErrors } from "./discussion.errors.ts";
import type { DiscussionActor } from "./discussion.access.ts";
import { createDiscussionRepository } from "./discussion.repository.ts";

export interface LessonDiscussionReadAccess {
  /** Whether the caller may see authenticated-only discussion state such as notes. */
  canReadPrivateState: boolean;
  /** Whether the caller is an administrator or the course's creator. */
  canModerate: boolean;
}

export interface PublicLessonDiscussionSqlAliases {
  course: string;
  lesson: string;
  section: string;
  pricing: string;
  /** The course's access rules row (left-joined; a course may have none). */
  accessRules: string;
}

/**
 * The visibility rule of public discovery queries (discussions shown outside
 * their lesson, such as a home page's popular ones): the course is published,
 * the lesson is published and not deleted, the section is not deleted, and
 * the course is free or the lesson is previewable. Reading a lesson's own
 * discussions is wider than this, see `assertCanReadLesson`.
 *
 * "Free" means open: free and not access-restricted. A restricted course
 * needs a grant even when it costs nothing, so its discussions are not
 * offered for discovery either.
 */
export function publicLessonDiscussionPredicate({
  course,
  lesson,
  section,
  pricing,
  accessRules,
}: PublicLessonDiscussionSqlAliases): RawBuilder<boolean> {
  return sql<boolean>`(
    ${sql.ref(`${course}.status`)} = 'published'
    and ${sql.ref(`${course}.deleted_at`)} is null
    and ${sql.ref(`${lesson}.is_published`)} = true
    and ${sql.ref(`${lesson}.deleted_at`)} is null
    and ${sql.ref(`${section}.deleted_at`)} is null
    and (
      ${sql.ref(`${lesson}.is_preview`)} = true
      or (
        ${sql.ref(`${pricing}.pricing_type`)} = 'free'
        and ${sql.ref(`${accessRules}.access_type`)} is distinct from 'restricted'
      )
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
  const discussionRepo = createDiscussionRepository();

  return {
    async assertCanReadLesson(db, { courseId, lessonId, actor }) {
      const lesson = await discussionRepo.findLessonReadTarget(db, {
        courseId,
        lessonId,
      });

      if (!lesson || lesson.isPublished === false) {
        throw DiscussionErrors.notFound("Lesson discussion");
      }
      // An archived course's discussions stay readable to a learner who
      // holds access to it. A draft's are read by nobody here, as before.
      if (
        !(await access.isCourseOpenToLearner(db, actor?.userId, {
          id: courseId,
          status: lesson.courseStatus,
        }))
      ) {
        throw DiscussionErrors.notFound("Lesson discussion");
      }

      const isCourseOwner = Boolean(
        actor && lesson.courseCreatorId === actor.userId,
      );
      if (
        isCourseOwner ||
        (await hasAcademyPermission(db, actor?.userId, "discussion.moderate"))
      ) {
        return { canReadPrivateState: true, canModerate: true };
      }

      // "View discussions" for every course reads a lesson's discussion as a
      // member of the course does; hidden posts stay with moderators.
      if (
        actor &&
        ((await hasAcademyPermission(db, actor.userId, "discussion.read")) ||
          (await access.hasActiveAccess(db, actor.userId, courseId)))
      ) {
        return { canReadPrivateState: true, canModerate: false };
      }

      // Anyone may read the discussions of a published lesson of a published
      // course, signed in or not, with access to the course or without. They
      // are read-only to such a reader: taking part (posting, replying,
      // reacting) is checked where it happens and still needs access, and
      // private state such as notes stays with those who have it.
      return { canReadPrivateState: false, canModerate: false };
    },
  };
}
