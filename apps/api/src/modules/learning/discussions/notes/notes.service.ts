import crypto from "node:crypto";
import type { Database, DatabaseExecutor } from "@veolms/database";
import type { Transaction } from "kysely";
import type {
  CourseNotesOverviewResponse,
  CreateLearningNoteRequest,
  LearningNote,
  LearningNotesListResponse,
  LessonNotesOverviewItem,
  ListLearningNotesQuery,
  UpdateLearningNoteRequest,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import {
  decodeDiscussionCursor,
  encodeDiscussionCursor,
  extractPlainText,
  resolveAcademyId,
  takePage,
  toDate,
} from "../shared/discussion.utils.ts";
import {
  createDiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import { withWriteTransaction } from "../shared/discussion.mentions.ts";
import type { NoteRow, NotesRepository } from "./notes.repository.ts";

interface NoteAttachmentItem {
  id: string;
  kind: "image" | "screenshot" | "code" | "document";
  file_name: string;
  file_url: string;
  mime_type: string;
  file_size: number;
  metadata: unknown;
}

// Links caller-owned, ready attachments to a note in two batched queries
// (one lookup + one update) instead of one round trip per attachment id.
async function linkOwnedAttachments(
  trx: Transaction<Database>,
  attachmentIds: string[],
  ownerId: string,
  noteId: string,
): Promise<void> {
  if (attachmentIds.length === 0) return;

  const attachments = await trx
    .selectFrom("learning_attachments")
    .select(["id", "owner_id", "status"])
    .where("id", "in", attachmentIds)
    .execute();

  const validIds = attachments
    .filter((a) => a.owner_id === ownerId && a.status === "ready")
    .map((a) => a.id);

  if (validIds.length === 0) return;

  await trx
    .updateTable("learning_attachments")
    .set({ target_type: "note", target_id: noteId })
    .where("id", "in", validIds)
    .execute();
}

export interface NotesService {
  createNote(
    db: DatabaseExecutor,
    input: {
      userId: string;
      roles: readonly string[];
      courseId: string;
      lessonId: string;
      title?: string;
      content: string;
      timestampSeconds?: number | null;
      visibility?: "public" | "unlisted" | "private";
      tags?: string[];
      attachmentIds?: string[];
    },
  ): Promise<LearningNote>;

  getNote(
    db: DatabaseExecutor,
    noteId: string,
    actor: DiscussionActor,
  ): Promise<LearningNote>;

  listNotes(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    query: ListLearningNotesQuery,
  ): Promise<LearningNotesListResponse>;

  getCourseNotesOverview(
    db: DatabaseExecutor,
    courseId: string,
    actor: DiscussionActor,
  ): Promise<CourseNotesOverviewResponse>;

  updateNote(
    db: DatabaseExecutor,
    noteId: string,
    actor: DiscussionActor,
    updates: UpdateLearningNoteRequest,
  ): Promise<LearningNote>;

  deleteNote(
    db: DatabaseExecutor,
    noteId: string,
    actor: DiscussionActor,
  ): Promise<void>;
}

export function createNotesService(notesRepo: NotesRepository): NotesService {
  const courseAccess = createDiscussionAccess();

  function mapNoteRow(
    row: NoteRow,
    currentUserId?: string,
    attachments: NoteAttachmentItem[] = [],
    isLiked = false,
  ): LearningNote {
    const isOwn = currentUserId ? row.userId === currentUserId : false;
    return {
      id: row.id,
      userId: row.userId,
      authorName: row.authorName ?? null,
      authorUsername: row.authorUsername ?? null,
      courseId: row.courseId,
      courseTitle: row.courseTitle,
      sectionId: row.sectionId ?? undefined,
      sectionTitle: row.sectionTitle ?? undefined,
      sectionPosition:
        row.sectionPosition !== undefined && row.sectionPosition !== null
          ? Number(row.sectionPosition)
          : undefined,
      lessonId: row.lessonId,
      lessonTitle: row.lessonTitle,
      lessonPosition:
        row.lessonPosition !== undefined && row.lessonPosition !== null
          ? Number(row.lessonPosition)
          : undefined,
      timestampSeconds: row.timestampSeconds ?? null,
      title: row.title ?? null,
      content: row.content,
      plainText: row.plainText,
      visibility: row.visibility || "private",
      tags: row.tags || [],
      likesCount: Number(row.likesCount || 0),
      repliesCount: 0,
      isLiked,
      isOwn,
      attachments: attachments.map((a) => ({
        id: a.id,
        kind: a.kind,
        fileName: a.file_name,
        fileUrl: a.file_url,
        mimeType: a.mime_type,
        fileSize: Number(a.file_size || 0),
        metadata: a.metadata
          ? typeof a.metadata === "string"
            ? JSON.parse(a.metadata)
            : (a.metadata as Record<string, unknown>)
          : null,
      })),
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

  function assertOwnNote<T extends { userId: string } | null>(
    note: T,
    userId: string,
  ): asserts note is NonNullable<T> {
    if (!note || note.userId !== userId) {
      throw httpError(404, "NOTE_NOT_FOUND", "Learning note not found");
    }
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

      await courseAccess.assertCanAccessCourse(
        db,
        { userId: input.userId, roles: input.roles },
        input.courseId,
      );

      const lesson = await db
        .selectFrom("course_lessons")
        .selectAll()
        .where("id", "=", input.lessonId)
        .executeTakeFirst();

      if (!lesson || lesson.course_id !== input.courseId) {
        throw httpError(
          400,
          "INVALID_LESSON",
          "Lesson does not belong to this course",
        );
      }

      const id = crypto.randomUUID();
      const plainText = extractPlainText(input.content);

      return withWriteTransaction(db, async (trx) => {
        await notesRepo.createNote(trx, {
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
          visibility: input.visibility ?? "private",
        });

        // Link verified attachments owned by the caller
        if (input.attachmentIds && input.attachmentIds.length > 0) {
          await linkOwnedAttachments(
            trx,
            input.attachmentIds,
            input.userId,
            id,
          );
        }

        const created = await notesRepo.findNoteById(trx, id);
        if (!created) {
          throw httpError(
            500,
            "CREATE_FAILED",
            "Failed to retrieve created note",
          );
        }

        const attachments = await trx
          .selectFrom("learning_attachments")
          .select([
            "id",
            "kind",
            "file_name",
            "file_url",
            "mime_type",
            "file_size",
            "metadata",
          ])
          .where("target_type", "=", "note")
          .where("target_id", "=", id)
          .where("status", "=", "ready")
          .orderBy("created_at", "asc")
          .execute();

        return mapNoteRow(created, input.userId, attachments, false);
      });
    },

    async getNote(db, noteId, actor) {
      const note = await notesRepo.findNoteById(db, noteId);
      if (!note) {
        throw httpError(404, "NOTE_NOT_FOUND", "Learning note not found");
      }

      const isOwner = note.userId === actor.userId;
      if (!isOwner) {
        if (note.visibility === "private") {
          throw httpError(404, "NOTE_NOT_FOUND", "Learning note not found");
        }
        await courseAccess.assertCanAccessCourse(db, actor, note.courseId);
      }

      const [attachments, likeRow] = await Promise.all([
        db
          .selectFrom("learning_attachments")
          .select([
            "id",
            "kind",
            "file_name",
            "file_url",
            "mime_type",
            "file_size",
            "metadata",
          ])
          .where("target_type", "=", "note")
          .where("target_id", "=", noteId)
          .where("status", "=", "ready")
          .orderBy("created_at", "asc")
          .execute(),
        db
          .selectFrom("learning_likes")
          .select("id")
          .where("user_id", "=", actor.userId)
          .where("target_type", "=", "note")
          .where("target_id", "=", noteId)
          .executeTakeFirst(),
      ]);

      return mapNoteRow(note, actor.userId, attachments, Boolean(likeRow));
    },

    async listNotes(db, actor, query) {
      if (query.courseId) {
        await courseAccess.assertCanAccessCourse(db, actor, query.courseId);
      }

      const accessibleCourseIds = query.courseId
        ? undefined
        : await courseAccess.listAccessibleCourseIds(db, actor);

      if (
        accessibleCourseIds &&
        accessibleCourseIds !== "all" &&
        accessibleCourseIds.length === 0
      ) {
        return { notes: [], nextCursor: null, totalCount: 0 };
      }

      const pageCursor = decodeDiscussionCursor(query.cursor);
      const listOptions = {
        ...query,
        pageCursor,
        ...(accessibleCourseIds && accessibleCourseIds !== "all"
          ? { accessibleCourseIds }
          : {}),
      };

      const [rows, totalCount] = await Promise.all([
        notesRepo.listNotes(db, actor.userId, listOptions),
        notesRepo.countNotes(db, actor.userId, listOptions),
      ]);

      const { page, hasMore } = takePage(rows, query.limit);

      let likedNoteIds = new Set<string>();
      const attachmentsByNoteId = new Map<string, NoteAttachmentItem[]>();

      if (page.length > 0) {
        const noteIds = page.map((n) => n.id);
        const [likes, attachments] = await Promise.all([
          db
            .selectFrom("learning_likes")
            .select("target_id")
            .where("user_id", "=", actor.userId)
            .where("target_type", "=", "note")
            .where("target_id", "in", noteIds)
            .execute(),
          db
            .selectFrom("learning_attachments")
            .select([
              "id",
              "target_id",
              "kind",
              "file_name",
              "file_url",
              "mime_type",
              "file_size",
              "metadata",
            ])
            .where("target_type", "=", "note")
            .where("target_id", "in", noteIds)
            .where("status", "=", "ready")
            .orderBy("created_at", "asc")
            .execute(),
        ]);

        likedNoteIds = new Set(likes.map((l) => l.target_id));
        for (const att of attachments) {
          if (att.target_id) {
            const list = attachmentsByNoteId.get(att.target_id) || [];
            list.push(att);
            attachmentsByNoteId.set(att.target_id, list);
          }
        }
      }

      const notes = page.map((row) =>
        mapNoteRow(
          row,
          actor.userId,
          attachmentsByNoteId.get(row.id) || [],
          likedNoteIds.has(row.id),
        ),
      );
      const last = page.at(-1);

      return {
        notes,
        nextCursor:
          hasMore && last
            ? encodeDiscussionCursor({
                id: last.id,
                createdAt: toDate(last.createdAt),
              })
            : null,
        totalCount,
      };
    },

    async getCourseNotesOverview(db, courseId, actor) {
      const overview = await notesRepo.getCourseNotesOverview(
        db,
        courseId,
        actor.userId,
      );
      if (!overview.course) {
        throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
      }

      await courseAccess.assertCanAccessCourse(db, actor, courseId);

      const noteIds = overview.notes.map((n) => n.id);
      let likedNoteIds = new Set<string>();
      const attachmentsByNoteId = new Map<string, NoteAttachmentItem[]>();

      if (noteIds.length > 0) {
        const [likes, attachments] = await Promise.all([
          db
            .selectFrom("learning_likes")
            .select("target_id")
            .where("user_id", "=", actor.userId)
            .where("target_type", "=", "note")
            .where("target_id", "in", noteIds)
            .execute(),
          db
            .selectFrom("learning_attachments")
            .select([
              "id",
              "target_id",
              "kind",
              "file_name",
              "file_url",
              "mime_type",
              "file_size",
              "metadata",
            ])
            .where("target_type", "=", "note")
            .where("target_id", "in", noteIds)
            .where("status", "=", "ready")
            .orderBy("created_at", "asc")
            .execute(),
        ]);

        likedNoteIds = new Set(likes.map((l) => l.target_id));
        for (const att of attachments) {
          if (att.target_id) {
            const list = attachmentsByNoteId.get(att.target_id) || [];
            list.push(att);
            attachmentsByNoteId.set(att.target_id, list);
          }
        }
      }

      const allNotes = overview.notes.map((row) =>
        mapNoteRow(
          row,
          actor.userId,
          attachmentsByNoteId.get(row.id) || [],
          likedNoteIds.has(row.id),
        ),
      );
      const notesByLessonId = new Map<string, LearningNote[]>();

      for (const note of allNotes) {
        const list = notesByLessonId.get(note.lessonId) || [];
        list.push(note);
        notesByLessonId.set(note.lessonId, list);
      }

      const lessonsBySectionId = new Map<string, LessonNotesOverviewItem[]>();
      const unassignedLessons: LessonNotesOverviewItem[] = [];

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
        const sectionLessons = lessonsBySectionId.get(sec.id) || [];
        const sectionNotesCount = sectionLessons.reduce(
          (sum, l) => sum + l.notesCount,
          0,
        );

        return {
          sectionId: sec.id,
          sectionTitle: sec.title,
          sectionPosition: Number(sec.position || 0),
          notesCount: sectionNotesCount,
          lessons: sectionLessons,
        };
      });

      if (unassignedLessons.length > 0) {
        const unassignedNotesCount = unassignedLessons.reduce(
          (sum, l) => sum + l.notesCount,
          0,
        );
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

    async updateNote(db, noteId, actor, updates) {
      const note = await notesRepo.findNoteById(db, noteId);
      assertOwnNote(note, actor.userId);

      const plainText = updates.content
        ? extractPlainText(updates.content)
        : undefined;

      return withWriteTransaction(db, async (trx) => {
        await notesRepo.updateNote(trx, noteId, {
          ...updates,
          ...(plainText !== undefined ? { plainText } : {}),
        });

        if (updates.attachmentIds && updates.attachmentIds.length > 0) {
          await linkOwnedAttachments(
            trx,
            updates.attachmentIds,
            actor.userId,
            noteId,
          );
        }

        const updated = await notesRepo.findNoteById(trx, noteId);
        if (!updated) {
          throw httpError(404, "NOTE_NOT_FOUND", "Learning note not found");
        }

        const [attachments, likeRow] = await Promise.all([
          trx
            .selectFrom("learning_attachments")
            .select([
              "id",
              "kind",
              "file_name",
              "file_url",
              "mime_type",
              "file_size",
              "metadata",
            ])
            .where("target_type", "=", "note")
            .where("target_id", "=", noteId)
            .where("status", "=", "ready")
            .orderBy("created_at", "asc")
            .execute(),
          trx
            .selectFrom("learning_likes")
            .select("id")
            .where("user_id", "=", actor.userId)
            .where("target_type", "=", "note")
            .where("target_id", "=", noteId)
            .executeTakeFirst(),
        ]);

        return mapNoteRow(updated, actor.userId, attachments, Boolean(likeRow));
      });
    },

    async deleteNote(db, noteId, actor) {
      const note = await notesRepo.findNoteById(db, noteId);
      assertOwnNote(note, actor.userId);
      await notesRepo.deleteNote(db, noteId);
    },
  };
}
