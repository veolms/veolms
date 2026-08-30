import type { DatabaseExecutor } from "@veolms/database";
import type {
  DiscussionVisibility,
  ListLearningNotesQuery,
  UpdateLearningNoteRequest,
} from "@veolms/contracts";
import { sql } from "kysely";

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
      visibility: DiscussionVisibility;
    },
  ): Promise<void>;

  findNoteById(
    db: DatabaseExecutor,
    noteId: string,
  ): Promise<any | null>;

  listNotes(
    db: DatabaseExecutor,
    userId: string,
    options: ListLearningNotesQuery,
  ): Promise<any[]>;

  updateNote(
    db: DatabaseExecutor,
    noteId: string,
    updates: UpdateLearningNoteRequest,
  ): Promise<void>;

  softDeleteNote(
    db: DatabaseExecutor,
    noteId: string,
  ): Promise<void>;
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
        .select([
          "n.id",
          "n.user_id as userId",
          "n.course_id as courseId",
          "c.title as courseTitle",
          "n.lesson_id as lessonId",
          "l.title as lessonTitle",
          "n.timestamp_seconds as timestampSeconds",
          "n.title",
          "n.content",
          "n.plain_text as plainText",
          "n.tags",
          "n.visibility",
          "n.created_at as createdAt",
          "n.updated_at as updatedAt",
        ])
        .where("n.id", "=", noteId)
        .where("n.deleted_at", "is", null)
        .executeTakeFirst();

      return row ?? null;
    },

    async listNotes(db, userId, options) {
      let query = db
        .selectFrom("learning_notes as n")
        .innerJoin("courses as c", "c.id", "n.course_id")
        .innerJoin("course_lessons as l", "l.id", "n.lesson_id")
        .select([
          "n.id",
          "n.user_id as userId",
          "n.course_id as courseId",
          "c.title as courseTitle",
          "n.lesson_id as lessonId",
          "l.title as lessonTitle",
          "n.timestamp_seconds as timestampSeconds",
          "n.title",
          "n.content",
          "n.plain_text as plainText",
          "n.tags",
          "n.visibility",
          "n.created_at as createdAt",
          "n.updated_at as updatedAt",
        ])
        .where("n.user_id", "=", userId)
        .where("n.deleted_at", "is", null);

      if (options.courseId) {
        query = query.where("n.course_id", "=", options.courseId);
      }

      if (options.lessonId) {
        query = query.where("n.lesson_id", "=", options.lessonId);
      }

      if (options.query) {
        const searchPattern = `%${options.query.toLowerCase()}%`;
        query = query.where((eb) =>
          eb.or([
            eb(sql`lower(n.title)`, "like", searchPattern),
            eb(sql`lower(n.plain_text)`, "like", searchPattern),
          ]),
        );
      }

      if (options.tag) {
        query = query.where(sql<boolean>`${options.tag} = ANY(n.tags)`);
      }

      return query.orderBy("n.created_at", "desc").limit(options.limit).execute();
    },

    async updateNote(db, noteId, updates) {
      const updateData: Record<string, any> = {
        updated_at: new Date(),
      };
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.plainText !== undefined) updateData.plain_text = updates.plainText;
      if (updates.timestampSeconds !== undefined)
        updateData.timestamp_seconds = updates.timestampSeconds;
      if (updates.tags !== undefined) updateData.tags = updates.tags;
      if (updates.visibility !== undefined) updateData.visibility = updates.visibility;

      await db
        .updateTable("learning_notes")
        .set(updateData)
        .where("id", "=", noteId)
        .execute();
    },

    async softDeleteNote(db, noteId) {
      await db
        .updateTable("learning_notes")
        .set({
          deleted_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", noteId)
        .execute();
    },
  };
}
