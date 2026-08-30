import crypto from "node:crypto";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CreateLearningNoteRequest,
  LearningNote,
  LearningNotesListResponse,
  ListLearningNotesQuery,
  UpdateLearningNoteRequest,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import { extractPlainText } from "../shared/discussion.utils.ts";
import type { NotesRepository } from "./notes.repository.ts";

export interface NotesService {
  createNote(
    db: DatabaseExecutor,
    input: {
      userId: string;
      courseId: string;
      lessonId: string;
      title?: string;
      content: string;
      timestampSeconds?: number | null;
      tags?: string[];
    },
  ): Promise<LearningNote>;

  getNote(
    db: DatabaseExecutor,
    noteId: string,
    userId: string,
  ): Promise<LearningNote>;

  listNotes(
    db: DatabaseExecutor,
    userId: string,
    query: ListLearningNotesQuery,
  ): Promise<LearningNotesListResponse>;

  updateNote(
    db: DatabaseExecutor,
    noteId: string,
    userId: string,
    updates: UpdateLearningNoteRequest,
  ): Promise<LearningNote>;

  deleteNote(
    db: DatabaseExecutor,
    noteId: string,
    userId: string,
  ): Promise<void>;
}

export function createNotesService(
  notesRepo: NotesRepository,
): NotesService {
  async function resolveAcademyId(db: DatabaseExecutor): Promise<string> {
    const academy = await db.selectFrom("academy").select("id").executeTakeFirst();
    return academy?.id || "00000000-0000-0000-0000-000000000000";
  }

  function mapNoteRow(row: any): LearningNote {
    return {
      id: row.id,
      userId: row.userId,
      courseId: row.courseId,
      courseTitle: row.courseTitle,
      lessonId: row.lessonId,
      lessonTitle: row.lessonTitle,
      timestampSeconds: row.timestampSeconds ?? null,
      title: row.title ?? null,
      content: row.content,
      plainText: row.plainText,
      tags: row.tags || [],
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt),
    };
  }

  return {
    async createNote(db, input) {
      const academyId = await resolveAcademyId(db);

      // Validate course and lesson hierarchy
      const course = await db
        .selectFrom("courses")
        .selectAll()
        .where("id", "=", input.courseId)
        .executeTakeFirst();

      if (!course) {
        throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
      }

      const lesson = await db
        .selectFrom("course_lessons")
        .selectAll()
        .where("id", "=", input.lessonId)
        .executeTakeFirst();

      if (!lesson || lesson.course_id !== input.courseId) {
        throw httpError(400, "INVALID_LESSON", "Lesson does not belong to this course");
      }

      const id = crypto.randomUUID();
      const plainText = extractPlainText(input.content);

      await notesRepo.createNote(db, {
        id,
        academyId,
        userId: input.userId,
        courseId: input.courseId,
        lessonId: input.lessonId,
        timestampSeconds: input.timestampSeconds ?? null,
        title: input.title || null,
        content: input.content,
        plainText,
        tags: input.tags || [],
      });

      const created = await notesRepo.findNoteById(db, id);
      if (!created) {
        throw httpError(500, "CREATE_FAILED", "Failed to retrieve created note");
      }

      return mapNoteRow(created);
    },

    async getNote(db, noteId, userId) {
      const note = await notesRepo.findNoteById(db, noteId);
      if (!note) {
        throw httpError(404, "NOTE_NOT_FOUND", "Private note not found");
      }

      if (note.userId !== userId) {
        throw httpError(403, "FORBIDDEN", "You do not have access to this note");
      }

      return mapNoteRow(note);
    },

    async listNotes(db, userId, query) {
      const rows = await notesRepo.listNotes(db, userId, query);
      const notes = rows.map(mapNoteRow);

      return {
        notes,
        nextCursor: null,
        totalCount: notes.length,
      };
    },

    async updateNote(db, noteId, userId, updates) {
      const note = await notesRepo.findNoteById(db, noteId);
      if (!note) {
        throw httpError(404, "NOTE_NOT_FOUND", "Private note not found");
      }

      if (note.userId !== userId) {
        throw httpError(403, "FORBIDDEN", "You do not have access to this note");
      }

      const plainText = updates.content ? extractPlainText(updates.content) : undefined;
      await notesRepo.updateNote(db, noteId, {
        ...updates,
        ...(plainText ? { plainText } : {}),
      });

      const updated = await notesRepo.findNoteById(db, noteId);
      return mapNoteRow(updated);
    },

    async deleteNote(db, noteId, userId) {
      const note = await notesRepo.findNoteById(db, noteId);
      if (!note) {
        throw httpError(404, "NOTE_NOT_FOUND", "Private note not found");
      }

      if (note.userId !== userId) {
        throw httpError(403, "FORBIDDEN", "You do not have access to this note");
      }

      await notesRepo.softDeleteNote(db, noteId);
    },
  };
}
