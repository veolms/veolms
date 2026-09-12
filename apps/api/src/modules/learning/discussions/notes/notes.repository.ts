import type {
  Database,
  DatabaseExecutor,
  LearningNoteTable,
} from "@veolms/database";
import type {
  DiscussionVisibility,
  ListLearningNotesQuery,
  UpdateLearningNoteRequest,
} from "@veolms/contracts";
import type { ExpressionBuilder, SelectQueryBuilder, Updateable } from "kysely";
import { sql } from "kysely";
import { withWriteTransaction } from "../shared/discussion.mentions.ts";
import {
  createdAtIdDescSql,
  type DiscussionListCursor,
} from "../shared/discussion.utils.ts";

export interface NoteRow {
  id: string;
  userId: string;
  authorName?: string | null;
  authorUsername?: string | null;
  courseId: string;
  courseTitle?: string;
  sectionId: string | null;
  sectionTitle: string | null;
  sectionPosition: number | null;
  lessonId: string;
  lessonTitle: string;
  lessonPosition: number;
  timestampSeconds: number | null;
  title: string | null;
  content: string;
  plainText: string;
  visibility: DiscussionVisibility;
  tags: string[];
  likesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseSectionRow {
  id: string;
  title: string;
  position: number;
}

export interface CourseLessonRow {
  id: string;
  sectionId: string | null;
  title: string;
  position: number;
}

export type NoteFilterOptions = ListLearningNotesQuery & {
  pageCursor?: DiscussionListCursor;
  accessibleCourseIds?: readonly string[];
};

// Kysely represents a `"learning_notes as n"` aliased query with the alias
// added as its own entry on the DB generic, not the bare table name.
type NotesAliasedDB = Database & { n: LearningNoteTable };

const noteSelect = [
  "n.id",
  "n.user_id as userId",
  "u.display_name as authorName",
  "u.username as authorUsername",
  "n.course_id as courseId",
  "c.title as courseTitle",
  "s.id as sectionId",
  "s.title as sectionTitle",
  "s.position as sectionPosition",
  "n.lesson_id as lessonId",
  "l.title as lessonTitle",
  "l.position as lessonPosition",
  "n.timestamp_seconds as timestampSeconds",
  "n.title",
  "n.content",
  "n.plain_text as plainText",
  "n.visibility as visibility",
  "n.tags",
  "n.likes_count as likesCount",
  "n.created_at as createdAt",
  "n.updated_at as updatedAt",
] as const;

export interface NotesRepository {
  createNote(
    db: DatabaseExecutor,
    note: {
      id: string;
      academyId: string;
      userId: string;
      courseId: string;
      lessonId: string;
      timestampSeconds: number | null;
      title: string | null;
      content: string;
      plainText: string;
      tags: string[];
      visibility: "public" | "unlisted" | "private";
    },
  ): Promise<void>;

  findNoteById(db: DatabaseExecutor, noteId: string): Promise<NoteRow | null>;

  listNotes(
    db: DatabaseExecutor,
    userId: string,
    options: NoteFilterOptions,
  ): Promise<NoteRow[]>;

  countNotes(
    db: DatabaseExecutor,
    userId: string,
    options: NoteFilterOptions,
  ): Promise<number>;

  getCourseNotesOverview(
    db: DatabaseExecutor,
    courseId: string,
    userId: string,
  ): Promise<{
    course: { id: string; title: string } | null;
    sections: CourseSectionRow[];
    lessons: CourseLessonRow[];
    notes: NoteRow[];
  }>;

  incrementLikesCount(
    db: DatabaseExecutor,
    noteId: string,
    delta: number,
  ): Promise<void>;

  updateNote(
    db: DatabaseExecutor,
    noteId: string,
    updates: UpdateLearningNoteRequest & { plainText?: string },
  ): Promise<void>;

  deleteNote(db: DatabaseExecutor, noteId: string): Promise<void>;
}

function applyNoteFilters<O>(
  query: SelectQueryBuilder<NotesAliasedDB, "n", O>,
  userId: string,
  options: NoteFilterOptions,
): SelectQueryBuilder<NotesAliasedDB, "n", O> {
  let q = query;

  if (options.courseId) {
    q = q.where("n.course_id", "=", options.courseId);
  } else if (
    options.accessibleCourseIds &&
    options.accessibleCourseIds.length > 0
  ) {
    q = q.where("n.course_id", "in", [...options.accessibleCourseIds]);
  }

  if (options.lessonId) {
    q = q.where("n.lesson_id", "=", options.lessonId);
  }

  if (options.mine) {
    q = q.where("n.user_id", "=", userId);
    if (options.visibility) {
      q = q.where("n.visibility", "=", options.visibility);
    }
  } else if (options.visibility === "private") {
    q = q.where("n.visibility", "=", "private").where("n.user_id", "=", userId);
  } else if (options.visibility === "unlisted") {
    q = q
      .where("n.visibility", "=", "unlisted")
      .where("n.user_id", "=", userId);
  } else if (options.visibility === "public") {
    q = q.where("n.visibility", "=", "public");
  } else {
    // If no visibility is specified and mine is not explicitly set:
    // If courseId or lessonId is specified, include public notes or user's own notes.
    // Otherwise (general listing with no params), default to user's own notes.
    if (options.courseId || options.lessonId) {
      q = q.where((eb: ExpressionBuilder<NotesAliasedDB, "n">) =>
        eb.or([
          eb("n.visibility", "=", "public"),
          eb("n.user_id", "=", userId),
        ]),
      );
    } else {
      q = q.where("n.user_id", "=", userId);
    }
  }

  if (options.query) {
    const searchPattern = `%${options.query.toLowerCase()}%`;
    q = q.where((eb: ExpressionBuilder<NotesAliasedDB, "n">) =>
      eb.or([
        eb(sql`lower(n.title)`, "like", searchPattern),
        eb(sql`lower(n.plain_text)`, "like", searchPattern),
      ]),
    );
  }

  if (options.tag) {
    q = q.where(sql<boolean>`${options.tag} = ANY(n.tags)`);
  }

  return q;
}

export function createNotesRepository(): NotesRepository {
  return {
    async createNote(db, note) {
      await db
        .insertInto("learning_notes")
        .values({
          id: note.id,
          academy_id: note.academyId,
          user_id: note.userId,
          course_id: note.courseId,
          lesson_id: note.lessonId,
          timestamp_seconds: note.timestampSeconds,
          title: note.title,
          content: note.content,
          plain_text: note.plainText,
          tags: note.tags,
          visibility: note.visibility,
        })
        .execute();
    },

    async findNoteById(db, noteId) {
      const row = await db
        .selectFrom("learning_notes as n")
        .innerJoin("users as u", "u.id", "n.user_id")
        .innerJoin("courses as c", "c.id", "n.course_id")
        .innerJoin("course_lessons as l", "l.id", "n.lesson_id")
        .leftJoin("course_sections as s", "s.id", "l.section_id")
        .select([...noteSelect])
        .where("n.id", "=", noteId)
        .executeTakeFirst();

      return (row as NoteRow | undefined) ?? null;
    },

    async listNotes(db, userId, options) {
      let filtered = db.selectFrom("learning_notes as n");
      filtered = applyNoteFilters(filtered, userId, options);
      if (options.pageCursor) {
        filtered = filtered.where(createdAtIdDescSql("n", options.pageCursor));
      }

      const rows = await filtered
        .innerJoin("users as u", "u.id", "n.user_id")
        .innerJoin("courses as c", "c.id", "n.course_id")
        .innerJoin("course_lessons as l", "l.id", "n.lesson_id")
        .leftJoin("course_sections as s", "s.id", "l.section_id")
        .select([...noteSelect])
        .orderBy("n.created_at", "desc")
        .orderBy("n.id", "desc")
        .limit(options.limit + 1)
        .execute();

      return rows as NoteRow[];
    },

    async countNotes(db, userId, options) {
      let query = db.selectFrom("learning_notes as n");
      query = applyNoteFilters(query, userId, options);

      const row = await query
        .select(sql<number>`count(*)::int`.as("count"))
        .executeTakeFirst();
      return Number(row?.count ?? 0);
    },

    async getCourseNotesOverview(db, courseId, userId) {
      const course = await db
        .selectFrom("courses")
        .select(["id", "title"])
        .where("id", "=", courseId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (!course) {
        return { course: null, sections: [], lessons: [], notes: [] };
      }

      const [sections, lessons, notes] = await Promise.all([
        db
          .selectFrom("course_sections")
          .select(["id", "title", "position"])
          .where("course_id", "=", courseId)
          .where("deleted_at", "is", null)
          .orderBy("position", "asc")
          .execute(),
        db
          .selectFrom("course_lessons")
          .select(["id", "section_id as sectionId", "title", "position"])
          .where("course_id", "=", courseId)
          .where("deleted_at", "is", null)
          .orderBy("position", "asc")
          .execute(),
        db
          .selectFrom("learning_notes as n")
          .innerJoin("users as u", "u.id", "n.user_id")
          .innerJoin("course_lessons as l", "l.id", "n.lesson_id")
          .leftJoin("course_sections as s", "s.id", "l.section_id")
          .select([
            "n.id",
            "n.user_id as userId",
            "u.display_name as authorName",
            "u.username as authorUsername",
            "n.course_id as courseId",
            "s.id as sectionId",
            "s.title as sectionTitle",
            "s.position as sectionPosition",
            "n.lesson_id as lessonId",
            "l.title as lessonTitle",
            "l.position as lessonPosition",
            "n.timestamp_seconds as timestampSeconds",
            "n.title",
            "n.content",
            "n.plain_text as plainText",
            "n.visibility as visibility",
            "n.tags",
            "n.likes_count as likesCount",
            "n.created_at as createdAt",
            "n.updated_at as updatedAt",
          ])
          .where("n.course_id", "=", courseId)
          .where("n.user_id", "=", userId)
          .orderBy("n.timestamp_seconds", "asc")
          .orderBy("n.created_at", "asc")
          .execute(),
      ]);

      return {
        course,
        sections: sections as CourseSectionRow[],
        lessons: lessons as CourseLessonRow[],
        notes: notes as NoteRow[],
      };
    },

    async incrementLikesCount(db, noteId, delta) {
      await db
        .updateTable("learning_notes")
        .set((eb) => ({
          likes_count: sql`GREATEST(0, ${eb.ref("likes_count")} + ${delta})`,
          updated_at: new Date(),
        }))
        .where("id", "=", noteId)
        .execute();
    },

    async updateNote(db, noteId, updates) {
      const updateData: Updateable<LearningNoteTable> = {
        updated_at: new Date(),
      };
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.plainText !== undefined)
        updateData.plain_text = updates.plainText;
      if (updates.timestampSeconds !== undefined)
        updateData.timestamp_seconds = updates.timestampSeconds;
      if (updates.tags !== undefined) updateData.tags = updates.tags;
      if (updates.visibility !== undefined)
        updateData.visibility = updates.visibility;

      await db
        .updateTable("learning_notes")
        .set(updateData)
        .where("id", "=", noteId)
        .execute();
    },

    async deleteNote(db, noteId) {
      // Notes are hard-deleted (unlike threads/replies, which soft-delete),
      // so the polymorphic learning_attachments/learning_likes rows pointing
      // at this note (no DB-level FK is possible across target types) would
      // otherwise be orphaned. Clean them up in the same transaction as the
      // note row itself.
      await withWriteTransaction(db, async (trx) => {
        await trx
          .deleteFrom("learning_attachments")
          .where("target_type", "=", "note")
          .where("target_id", "=", noteId)
          .execute();

        await trx
          .deleteFrom("learning_likes")
          .where("target_type", "=", "note")
          .where("target_id", "=", noteId)
          .execute();

        await trx
          .deleteFrom("learning_notes")
          .where("id", "=", noteId)
          .execute();
      });
    },
  };
}
