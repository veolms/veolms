import type {
  CourseAccessRuleTable,
  CoursePricingTable,
  CourseTable,
  DatabaseExecutor,
} from "@veolms/database";
import type { SuspensionScope } from "@veolms/contracts";
import { sql } from "kysely";
import type { DiscussionAttachmentRow } from "./discussion-attachments.ts";

/**
 * SQL predicate: "the `users` row is a participant of this course".
 *
 * A participant is the course creator, anyone holding live access to it
 * (grant or enrollment), anyone with a role assigned on that course, and
 * anyone who has already posted in it.
 *
 * Who can be mentioned — and who the mention picker lists — used to be an
 * id list built in memory, and for any free published course it was simply
 * "everyone on the platform". That let a user who joined one free course
 * page through every account and send each of them an email. Expressing the
 * rule in SQL also removes the per-keystroke load of every participant id.
 */
export function isCourseParticipant(courseId: string) {
  return sql<boolean>`(
    users.id = (
      select c.creator_id from courses as c
      where c.id = ${courseId} and c.deleted_at is null
    )
    or exists (
      select 1 from access_grants as g
      where g.user_id = users.id
        and g.course_id = ${courseId}
        and g.status = 'active'
        and (g.valid_until is null or g.valid_until > now())
    )
    or exists (
      select 1 from enrollments as e
      where e.user_id = users.id
        and e.course_id = ${courseId}
        and e.status = 'active'
        and (e.access_expires_at is null or e.access_expires_at > now())
    )
    or exists (
      select 1 from role_assignments as ra
      where ra.user_id = users.id and ra.course_id = ${courseId}
    )
    or exists (
      select 1 from learning_threads as lt
      where lt.user_id = users.id and lt.course_id = ${courseId}
    )
  )`;
}

export type MentionSourceType = "thread" | "reply" | "note";

/** The course columns a single-course access decision reads. */
export interface CourseAccessStateRow {
  creator_id: CourseTable["creator_id"];
  status: CourseTable["status"];
  deleted_at: CourseTable["deleted_at"];
  access_type: CourseAccessRuleTable["access_type"] | null;
  pricing_type: CoursePricingTable["pricing_type"] | null;
}

/** A published course with the two columns that say whether it is open. */
export interface PublishedCourseOpennessRow {
  id: string;
  access_type: CourseAccessRuleTable["access_type"] | null;
  pricing_type: CoursePricingTable["pricing_type"] | null;
}

/** The lesson, course and section state a lesson's discussions are read under. */
export interface LessonReadTargetRow {
  courseStatus: CourseTable["status"];
  courseCreatorId: string | null;
  isPublished: boolean;
}

export type ReadyAttachmentRow = DiscussionAttachmentRow & {
  target_id: string | null;
};

/**
 * Reads and writes shared by the discussion features: the academy, the
 * course and lesson lookups every feature validates against, mentions, and
 * the ready attachments of a post.
 */
export interface DiscussionRepository {
  /** The course row by id, deleted or not. */
  findCourseId(
    db: DatabaseExecutor,
    courseId: string,
  ): Promise<{ id: string } | undefined>;

  /** The course row by id unless it has been deleted. */
  findActiveCourseId(
    db: DatabaseExecutor,
    courseId: string,
  ): Promise<{ id: string } | undefined>;

  findCourseCreatorId(
    db: DatabaseExecutor,
    courseId: string,
  ): Promise<{ creator_id: string | null } | undefined>;

  findCourseSlug(
    db: DatabaseExecutor,
    courseId: string,
  ): Promise<{ slug: string } | undefined>;

  findCourseAccessState(
    db: DatabaseExecutor,
    courseId: string,
  ): Promise<CourseAccessStateRow | undefined>;

  listCreatedCourseIds(
    db: DatabaseExecutor,
    creatorId: string,
  ): Promise<Array<{ id: string }>>;

  /** As `listCreatedCourseIds`, without the creator's deleted courses. */
  listActiveCreatedCourseIds(
    db: DatabaseExecutor,
    creatorId: string,
  ): Promise<Array<{ id: string }>>;

  listPublishedCourseOpenness(
    db: DatabaseExecutor,
  ): Promise<PublishedCourseOpennessRow[]>;

  /**
   * Published courses by title, for the workspace's course filter; limited
   * to `courseIds` unless it is "all".
   */
  listPublishedCourseTitles(
    db: DatabaseExecutor,
    courseIds: readonly string[] | "all",
  ): Promise<
    Array<{
      id: string;
      title: string;
      thumbnailUrl: string | null;
      thumbnailMediaId: string | null;
    }>
  >;

  /** The course a lesson belongs to, unless the lesson has been removed. */
  findActiveLessonCourseId(
    db: DatabaseExecutor,
    lessonId: string,
  ): Promise<{ course_id: string } | undefined>;

  findLessonReadTarget(
    db: DatabaseExecutor,
    input: { courseId: string; lessonId: string },
  ): Promise<LessonReadTargetRow | undefined>;

  /** The lesson id when lesson, section and course all still exist. */
  findUploadLessonId(
    db: DatabaseExecutor,
    input: { courseId: string; lessonId: string },
  ): Promise<{ id: string } | undefined>;

  findActiveSuspension(
    db: DatabaseExecutor,
    input: {
      userId: string;
      courseId: string;
      scopes: SuspensionScope[];
    },
  ): Promise<{ reason: string; scope: SuspensionScope } | undefined>;

  findUserNames(
    db: DatabaseExecutor,
    userId: string,
  ): Promise<{ display_name: string; username: string } | undefined>;

  /** Active accounts among `usernames` that take part in the course. */
  listCourseParticipantIdsByUsername(
    db: DatabaseExecutor,
    usernames: readonly string[],
    courseId: string,
  ): Promise<Array<{ id: string }>>;

  listMentionsBySource(
    db: DatabaseExecutor,
    sourceType: MentionSourceType,
    sourceId: string,
  ): Promise<Array<{ id: string; mentioned_user_id: string }>>;

  deleteMentionsByIds(db: DatabaseExecutor, ids: string[]): Promise<void>;

  deleteMentionsBySource(
    db: DatabaseExecutor,
    sourceType: MentionSourceType,
    sourceId: string,
  ): Promise<void>;

  /** Returns nothing when the user is already mentioned in the source. */
  insertMention(
    db: DatabaseExecutor,
    mention: {
      id: string;
      sourceType: MentionSourceType;
      sourceId: string;
      mentionedUserId: string;
    },
  ): Promise<{ id: string } | undefined>;

  findThreadTitleAndAuthor(
    db: DatabaseExecutor,
    threadId: string,
  ): Promise<{ title: string | null; user_id: string } | undefined>;

  listThreadFollowerIds(
    db: DatabaseExecutor,
    threadId: string,
  ): Promise<Array<{ user_id: string }>>;

  /** Ready attachments of the given posts, in upload order. */
  listReadyAttachmentRows(
    db: DatabaseExecutor,
    targetType: "thread" | "reply",
    targetIds: readonly string[],
  ): Promise<ReadyAttachmentRow[]>;
}

export function createDiscussionRepository(): DiscussionRepository {
  return {
    async findCourseId(db, courseId) {
      return db
        .selectFrom("courses")
        .select("id")
        .where("id", "=", courseId)
        .executeTakeFirst();
    },

    async findActiveCourseId(db, courseId) {
      return db
        .selectFrom("courses")
        .select("id")
        .where("id", "=", courseId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
    },

    async findCourseCreatorId(db, courseId) {
      return db
        .selectFrom("courses")
        .select("creator_id")
        .where("id", "=", courseId)
        .executeTakeFirst();
    },

    async findCourseSlug(db, courseId) {
      return db
        .selectFrom("courses")
        .select("slug")
        .where("id", "=", courseId)
        .executeTakeFirst();
    },

    async findCourseAccessState(db, courseId) {
      return db
        .selectFrom("courses as c")
        .leftJoin("course_access_rules as ar", "ar.course_id", "c.id")
        .leftJoin("course_pricing as p", "p.course_id", "c.id")
        .select([
          "c.creator_id",
          "c.status",
          "c.deleted_at",
          "ar.access_type",
          "p.pricing_type",
        ])
        .where("c.id", "=", courseId)
        .executeTakeFirst();
    },

    async listCreatedCourseIds(db, creatorId) {
      return db
        .selectFrom("courses")
        .select("id")
        .where("creator_id", "=", creatorId)
        .execute();
    },

    async listActiveCreatedCourseIds(db, creatorId) {
      return db
        .selectFrom("courses")
        .select("id")
        .where("creator_id", "=", creatorId)
        .where("deleted_at", "is", null)
        .execute();
    },

    async listPublishedCourseOpenness(db) {
      return db
        .selectFrom("courses as c")
        .leftJoin("course_access_rules as ar", "ar.course_id", "c.id")
        .leftJoin("course_pricing as p", "p.course_id", "c.id")
        .select(["c.id", "ar.access_type", "p.pricing_type"])
        .where("c.status", "=", "published")
        .where("c.deleted_at", "is", null)
        .execute();
    },

    async listPublishedCourseTitles(db, courseIds) {
      let coursesQuery = db
        .selectFrom("courses")
        .select([
          "id",
          "title",
          "thumbnail_url as thumbnailUrl",
          "thumbnail_media_id as thumbnailMediaId",
        ])
        .where("status", "=", "published")
        .where("deleted_at", "is", null);

      if (courseIds !== "all") {
        coursesQuery = coursesQuery.where("id", "in", [...courseIds]);
      }

      return coursesQuery.orderBy("title", "asc").execute();
    },

    async findActiveLessonCourseId(db, lessonId) {
      return db
        .selectFrom("course_lessons")
        .select("course_id")
        .where("id", "=", lessonId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
    },

    async findLessonReadTarget(db, { courseId, lessonId }) {
      return db
        .selectFrom("course_lessons")
        .innerJoin("courses", "courses.id", "course_lessons.course_id")
        .innerJoin(
          "course_sections",
          "course_sections.id",
          "course_lessons.section_id",
        )
        .select([
          "courses.status as courseStatus",
          "courses.creator_id as courseCreatorId",
          "course_lessons.is_published as isPublished",
        ])
        .where("course_lessons.id", "=", lessonId)
        .where("course_lessons.course_id", "=", courseId)
        .where("course_lessons.deleted_at", "is", null)
        .where("course_sections.deleted_at", "is", null)
        .where("courses.deleted_at", "is", null)
        .executeTakeFirst();
    },

    async findUploadLessonId(db, { courseId, lessonId }) {
      return db
        .selectFrom("course_lessons")
        .innerJoin("courses", "courses.id", "course_lessons.course_id")
        .innerJoin(
          "course_sections",
          "course_sections.id",
          "course_lessons.section_id",
        )
        .select("course_lessons.id")
        .where("course_lessons.id", "=", lessonId)
        .where("course_lessons.course_id", "=", courseId)
        .where("course_lessons.deleted_at", "is", null)
        .where("course_sections.deleted_at", "is", null)
        .where("courses.deleted_at", "is", null)
        .executeTakeFirst();
    },

    async findActiveSuspension(db, { userId, courseId, scopes }) {
      return db
        .selectFrom("learning_suspensions")
        .select(["reason", "scope"])
        .where("user_id", "=", userId)
        .where("is_active", "=", true)
        .where("scope", "in", scopes)
        .where((eb) =>
          eb.or([eb("course_id", "is", null), eb("course_id", "=", courseId)]),
        )
        .where((eb) =>
          eb.or([
            eb("expires_at", "is", null),
            eb("expires_at", ">", new Date()),
          ]),
        )
        .executeTakeFirst();
    },

    async findUserNames(db, userId) {
      return db
        .selectFrom("users")
        .select(["display_name", "username"])
        .where("id", "=", userId)
        .executeTakeFirst();
    },

    async listCourseParticipantIdsByUsername(db, usernames, courseId) {
      return db
        .selectFrom("users")
        .select("id")
        .where("is_deleted", "=", false)
        .where(sql<string>`lower(username)`, "in", [...usernames])
        .where(isCourseParticipant(courseId))
        .execute();
    },

    async listMentionsBySource(db, sourceType, sourceId) {
      return db
        .selectFrom("learning_mentions")
        .select(["id", "mentioned_user_id"])
        .where("source_type", "=", sourceType)
        .where("source_id", "=", sourceId)
        .execute();
    },

    async deleteMentionsByIds(db, ids) {
      await db.deleteFrom("learning_mentions").where("id", "in", ids).execute();
    },

    async deleteMentionsBySource(db, sourceType, sourceId) {
      await db
        .deleteFrom("learning_mentions")
        .where("source_type", "=", sourceType)
        .where("source_id", "=", sourceId)
        .execute();
    },

    async insertMention(db, mention) {
      return db
        .insertInto("learning_mentions")
        .values({
          id: mention.id,
          source_type: mention.sourceType,
          source_id: mention.sourceId,
          mentioned_user_id: mention.mentionedUserId,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["source_type", "source_id", "mentioned_user_id"])
            .doNothing(),
        )
        .returning("id")
        .executeTakeFirst();
    },

    async findThreadTitleAndAuthor(db, threadId) {
      return db
        .selectFrom("learning_threads")
        .select(["title", "user_id"])
        .where("id", "=", threadId)
        .executeTakeFirst();
    },

    async listThreadFollowerIds(db, threadId) {
      return db
        .selectFrom("learning_follows")
        .select("user_id")
        .where("thread_id", "=", threadId)
        .execute();
    },

    async listReadyAttachmentRows(db, targetType, targetIds) {
      return db
        .selectFrom("learning_attachments")
        .select([
          "id",
          "target_id",
          "kind",
          "file_name",
          "storage_key",
          "file_url",
          "mime_type",
          "file_size",
          "metadata",
        ])
        .where("target_type", "=", targetType)
        .where("target_id", "in", [...targetIds])
        .where("status", "=", "ready")
        .orderBy("created_at", "asc")
        .orderBy("id", "asc")
        .execute();
    },
  };
}
