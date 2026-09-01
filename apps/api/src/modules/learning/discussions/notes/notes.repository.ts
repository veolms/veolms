import type { DatabaseExecutor } from "@veolms/database";
import type {
  ListLearningNotesQuery,
  UpdateLearningNoteRequest,
} from "@veolms/contracts";
import { sql } from "kysely";
import {
  createdAtIdDescSql,
  type DiscussionListCursor,
} from "../shared/discussion.utils.ts";

const noteSelect = [
  "n.id",
  "n.user_id as userId",
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

  findNoteById(db: DatabaseExecutor, noteId: string): Promise<any | null>;

  listNotes(
    db: DatabaseExecutor,
    userId: string,
    options: ListLearningNotesQuery & { pageCursor?: DiscussionListCursor },
  ): Promise<any[]>;

  countNotes(
    db: DatabaseExecutor,
    userId: string,
    options: ListLearningNotesQuery,
  ): Promise<number>;

  getCourseNotesOverview(
    db: DatabaseExecutor,
    courseId: string,
    userId: string,
  ): Promise<{
    course: { id: string; title: string } | null;
    sections: any[];
    lessons: any[];
    notes: any[];
  }>;

  updateNote(
    db: DatabaseExecutor,
    noteId: string,
    updates: UpdateLearningNoteRequest & { plainText?: string },
  ): Promise<void>;

  deleteNote(db: DatabaseExecutor, noteId: string): Promise<void>;
}

function applyNoteFilters(
  query: any,
  userId: string,
  options: ListLearningNotesQuery,
) {
  query = query.where("n.user_id", "=", userId);

  if (options.courseId) {
    query = query.where("n.course_id", "=", options.courseId);
  }

  if (options.lessonId) {
    query = query.where("n.lesson_id", "=", options.lessonId);
  }

  if (options.visibility) {
    query = query.where("n.visibility", "=", options.visibility);
  }

  if (options.query) {
    const searchPattern = `%${options.query.toLowerCase()}%`;
    query = query.where((eb: any) =>
      eb.or([
        eb(sql`lower(n.title)`, "like", searchPattern),
        eb(sql`lower(n.plain_text)`, "like", searchPattern),
      ]),
    );
  }

  if (options.tag) {
    query = query.where(sql<boolean>`${options.tag} = ANY(n.tags)`);
  }

  return query;
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
        .innerJoin("courses as c", "c.id", "n.course_id")
        .innerJoin("course_lessons as l", "l.id", "n.lesson_id")
        .leftJoin("course_sections as s", "s.id", "l.section_id")
        .select([...noteSelect])
        .where("n.id", "=", noteId)
        .executeTakeFirst();

      return row ?? null;
    },

    async listNotes(db, userId, options) {
      let query = db
        .selectFrom("learning_notes as n")
        .innerJoin("courses as c", "c.id", "n.course_id")
        .innerJoin("course_lessons as l", "l.id", "n.lesson_id")
        .leftJoin("course_sections as s", "s.id", "l.section_id")
        .select([...noteSelect]);

      query = applyNoteFilters(query, userId, options);

      if (options.pageCursor) {
        query = query.where(createdAtIdDescSql("n", options.pageCursor));
      }

      return query
        .orderBy("n.created_at", "desc")
        .orderBy("n.id", "desc")
        .limit(options.limit + 1)
        .execute();
    },

    async countNotes(db, userId, options) {
      let query = db
        .selectFrom("learning_notes as n")
        .select(sql<number>`count(*)::int`.as("count"));

      query = applyNoteFilters(query, userId, options);

      const row = await query.executeTakeFirst();
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
          .innerJoin("course_lessons as l", "l.id", "n.lesson_id")
          .leftJoin("course_sections as s", "s.id", "l.section_id")
          .select([
            "n.id",
            "n.user_id as userId",
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
        sections,
        lessons,
        notes,
      };
    },

    async updateNote(db, noteId, updates) {
      const updateData: Record<string, any> = {
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
      await db.deleteFrom("learning_notes").where("id", "=", noteId).execute();
    },
  };
}
