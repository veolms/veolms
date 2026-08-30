import crypto from "node:crypto";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CourseNotesOverviewResponse,
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
      visibility?: "public" | "unlisted" | "private";
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

  getCourseNotesOverview(
    db: DatabaseExecutor,
    courseId: string,
    userId: string,
  ): Promise<CourseNotesOverviewResponse>;

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
      sectionId: row.sectionId,
      sectionTitle: row.sectionTitle,
      sectionPosition: row.sectionPosition !== undefined ? Number(row.sectionPosition) : undefined,
      lessonId: row.lessonId,
      lessonTitle: row.lessonTitle,
      lessonPosition: row.lessonPosition !== undefined ? Number(row.lessonPosition) : undefined,
      timestampSeconds: row.timestampSeconds ?? null,
      title: row.title ?? null,
      content: row.content,
      plainText: row.plainText,
      visibility: row.visibility || "private",
      tags: row.tags || [],
      likesCount: Number(row.likesCount || 0),
      repliesCount: Number(row.repliesCount || 0),
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

    async getCourseNotesOverview(db, courseId, userId) {
      const overview = await notesRepo.getCourseNotesOverview(db, courseId, userId);
      if (!overview.course) {
        throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
      }

      const allNotes = overview.notes.map(mapNoteRow);
      const notesByLessonId = new Map<string, LearningNote[]>();

      for (const note of allNotes) {
        const list = notesByLessonId.get(note.lessonId) || [];
        list.push(note);
        notesByLessonId.set(note.lessonId, list);
      }

      const lessonsBySectionId = new Map<string, any[]>();
      const unassignedLessons: any[] = [];

      for (const lesson of overview.lessons) {
        const lessonNotes = notesByLessonId.get(lesson.id) || [];
        const lessonItem = {
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          lessonPosition: Number(lesson.position || 0),
          notesCount: lessonNotes.length,
          notes: lessonNotes,
        };

        if (lesson.sectionId) {
          const list = lessonsBySectionId.get(lesson.sectionId) || [];
          list.push(lessonItem);
          lessonsBySectionId.set(lesson.sectionId, list);
        } else {
          unassignedLessons.push(lessonItem);
        }
      }

      const sections = overview.sections.map((sec) => {
        const lessons = lessonsBySectionId.get(sec.id) || [];
        const sectionNotesCount = lessons.reduce((sum, l) => sum + l.notesCount, 0);

        return {
          sectionId: sec.id,
          sectionTitle: sec.title,
          sectionPosition: Number(sec.position || 0),
          notesCount: sectionNotesCount,
          lessons,
        };
      });

      if (unassignedLessons.length > 0) {
        const unassignedNotesCount = unassignedLessons.reduce((sum, l) => sum + l.notesCount, 0);
        sections.push({
          sectionId: "00000000-0000-0000-0000-000000000000",
          sectionTitle: "General Lessons",
          sectionPosition: sections.length + 1,
          notesCount: unassignedNotesCount,
          lessons: unassignedLessons,
        });
      }

      return {
        courseId: overview.course.id,
        courseTitle: overview.course.title,
        totalNotesCount: allNotes.length,
        sections,
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
