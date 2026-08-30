import crypto from "node:crypto";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CreateLearningNoteRequest,
  LearningNote,
  LearningNotesListResponse,
  ListLearningNotesQuery,
  UpdateLearningNoteRequest,
} from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
import type { NotesRepository } from "./notes.repository.ts";

export interface NotesService {
  createNote(
    db: DatabaseExecutor,
    input: CreateLearningNoteRequest & {
      userId: string;
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

export function createNotesService(notesRepo: NotesRepository): NotesService {
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
      tags: Array.isArray(row.tags) ? row.tags : [],
      visibility: row.visibility,
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
      const id = crypto.randomUUID();
      const plainText =
        input.plainText || input.content.replace(/<[^>]+>/g, "").trim();

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
        visibility: input.visibility || "private",
      });

      const note = await notesRepo.findNoteById(db, id);
      return mapNoteRow(note);
    },

    async getNote(db, noteId, userId) {
      const note = await notesRepo.findNoteById(db, noteId);
      if (!note) {
        throw httpError(404, "NOTE_NOT_FOUND", "Note not found");
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
        throw httpError(404, "NOTE_NOT_FOUND", "Note not found");
      }

      if (note.userId !== userId) {
        throw httpError(403, "FORBIDDEN", "You cannot edit this note");
      }

      await notesRepo.updateNote(db, noteId, updates);
      const updated = await notesRepo.findNoteById(db, noteId);
      return mapNoteRow(updated);
    },

    async deleteNote(db, noteId, userId) {
      const note = await notesRepo.findNoteById(db, noteId);
      if (!note) {
        throw httpError(404, "NOTE_NOT_FOUND", "Note not found");
      }

      if (note.userId !== userId) {
        throw httpError(403, "FORBIDDEN", "You cannot delete this note");
      }

      await notesRepo.softDeleteNote(db, noteId);
    },
  };
}
