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
import type { S3StorageService } from "@veolms/storage";
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
import {
  createDiscussionOutbox,
  syncMentionsAndNotify,
  withWriteTransaction,
} from "../shared/discussion.mentions.ts";
import { getAttachmentDimensionFields } from "../shared/discussion-attachment-metadata.ts";
import { getCdnDeliveryUrl } from "../../../../services/cdn-delivery.ts";
import type { NoteRow, NotesRepository } from "./notes.repository.ts";

interface NoteAttachmentItem {
  id: string;
  kind: "image" | "screenshot" | "code" | "document";
  file_name: string;
  storage_key: string;
  file_url: string;
  mime_type: string;
  file_size: number;
  metadata: unknown;
}

// Links caller-owned, ready attachments to a note in two batched queries
// (one lookup + one update) instead of one round trip per attachment id.
// An attachment that already belongs to a thread, reply or note stays there:
// linking it again would silently take it away from that post.
async function linkOwnedAttachments(
  trx: Transaction<Database>,
  attachmentIds: string[],
  ownerId: string,
  noteId: string,
): Promise<void> {
  if (attachmentIds.length === 0) return;

  const attachments = await trx
    .selectFrom("learning_attachments")
    .select(["id", "owner_id", "status", "target_id"])
    .where("id", "in", attachmentIds)
    .execute();

  const validIds = attachments
    .filter(
      (a) =>
        a.owner_id === ownerId && a.status === "ready" && a.target_id === null,
    )
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

  /**
   * Hydrates notes a caller has already selected and already authorised for
   * this lesson (the lesson feed). Unlike `listNotes` it does not repeat the
   * course access check, page, or count.
   */
  listNotesByIds(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    input: {
      courseId: string;
      lessonId: string;
      ids: readonly string[];
      mine?: boolean;
    },
  ): Promise<LearningNote[]>;

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

export function createNotesService(
  notesRepo: NotesRepository,
  storage?: S3StorageService,
): NotesService {
  const courseAccess = createDiscussionAccess();
  const outbox = createDiscussionOutbox();

  function mapNoteRow(
    row: NoteRow,
    currentUserId?: string,
    attachments: NoteAttachmentItem[] = [],
    isLiked = false,
    isBookmarked = false,
  ): LearningNote {
    const isOwn = currentUserId ? row.userId === currentUserId : false;
    return {
      id: row.id,
      userId: row.userId,
      authorName: row.authorName ?? null,
      authorUsername: row.authorUsername ?? null,
      authorAvatarUrl: row.authorAvatarUrl ?? null,
      courseId: row.courseId,
      lessonId: row.lessonId,
      timestampSeconds: row.timestampSeconds ?? null,
      title: row.title ?? null,
      content: row.content,
      plainText: row.plainText,
      visibility: row.visibility || "private",
      tags: row.tags || [],
      likesCount: Number(row.likesCount || 0),
      repliesCount: 0,
      isLiked,
      isBookmarked,
      isOwn,
      attachments: attachments.map((a) => ({
        id: a.id,
        kind: a.kind,
        fileName: a.file_name,
        fileUrl: storage
          ? getCdnDeliveryUrl(storage, a.storage_key).url
          : a.file_url,
        mimeType: a.mime_type,
        fileSize: Number(a.file_size || 0),
        ...getAttachmentDimensionFields(a.metadata),
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

  // The viewer's likes and bookmarks plus each note's attachments, in three
  // batched reads, for every response that returns more than one note.
  async function presentNotes(
    db: DatabaseExecutor,
    userId: string,
    rows: readonly NoteRow[],
  ): Promise<LearningNote[]> {
    if (rows.length === 0) return [];

    const noteIds = rows.map((n) => n.id);
    const [likes, bookmarks, attachments] = await Promise.all([
      db
        .selectFrom("learning_likes")
        .select("target_id")
        .where("user_id", "=", userId)
        .where("target_type", "=", "note")
        .where("target_id", "in", noteIds)
        .execute(),
      db
        .selectFrom("learning_bookmarks")
        .select("note_id")
        .where("user_id", "=", userId)
        .where("note_id", "in", noteIds)
        .execute(),
      db
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
        .where("target_type", "=", "note")
        .where("target_id", "in", noteIds)
        .where("status", "=", "ready")
        .orderBy("created_at", "asc")
        .execute(),
    ]);

    const likedNoteIds = new Set(likes.map((l) => l.target_id));
    const bookmarkedNoteIds = new Set(
      bookmarks.flatMap((b) => (b.note_id ? [b.note_id] : [])),
    );
    const attachmentsByNoteId = new Map<string, NoteAttachmentItem[]>();
    for (const att of attachments) {
      if (att.target_id) {
        const list = attachmentsByNoteId.get(att.target_id) || [];
        list.push(att);
        attachmentsByNoteId.set(att.target_id, list);
      }
    }

    return rows.map((row) =>
      mapNoteRow(
        row,
        userId,
        attachmentsByNoteId.get(row.id) || [],
        likedNoteIds.has(row.id),
        bookmarkedNoteIds.has(row.id),
      ),
    );
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
        .select("id")
        .where("id", "=", input.courseId)
        .executeTakeFirst();

      if (!course) {
        throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
      }

      await courseAccess.assertCanParticipateInCourse(
        db,
        { userId: input.userId, roles: input.roles },
        input.courseId,
      );
      await courseAccess.assertCanAccessCourse(
        db,
        { userId: input.userId, roles: input.roles },
        input.courseId,
      );
      await courseAccess.assertNotesEnabled(db, input.courseId);

      const lesson = await db
        .selectFrom("course_lessons")
        .select("course_id")
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
      const visibility = input.visibility ?? "private";
      // A shared note is posted to the course like a comment, so a learner
      // suspended from commenting cannot share one. Private notes are their
      // own study material and stay available.
      if (visibility !== "private") {
        await courseAccess.assertNotSuspended(
          db,
          input.userId,
          input.courseId,
          "comment",
        );
      }

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
          visibility,
        });

        if (visibility !== "private") {
          await syncMentionsAndNotify(trx, outbox, {
            sourceType: "note",
            sourceId: id,
            actorUserId: input.userId,
            content: input.content,
            courseId: input.courseId,
            lessonId: input.lessonId,
            plainText,
          });
        }

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
            "storage_key",
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

      await courseAccess.assertCanAccessNote(db, actor, note);

      const [attachments, likeRow, bookmarkRow] = await Promise.all([
        db
          .selectFrom("learning_attachments")
          .select([
            "id",
            "kind",
            "file_name",
            "storage_key",
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
        db
          .selectFrom("learning_bookmarks")
          .select("id")
          .where("user_id", "=", actor.userId)
          .where("note_id", "=", noteId)
          .executeTakeFirst(),
      ]);

      return mapNoteRow(
        note,
        actor.userId,
        attachments,
        Boolean(likeRow),
        Boolean(bookmarkRow),
      );
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
      const notes = await presentNotes(db, actor.userId, page);
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

    async listNotesByIds(db, actor, input) {
      const rows = await notesRepo.listNotesByIds(db, actor.userId, input);
      return presentNotes(db, actor.userId, rows);
    },

    async getCourseNotesOverview(db, courseId, actor) {
      // Authorise before reading anything: a caller without access gets the
      // same answer whether or not the course exists, and no course data is
      // loaded for them.
      await courseAccess.assertCanAccessCourse(db, actor, courseId);

      const overview = await notesRepo.getCourseNotesOverview(
        db,
        courseId,
        actor.userId,
      );
      if (!overview.course) {
        throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
      }

      const allNotes = await presentNotes(db, actor.userId, overview.notes);
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
      const note = await notesRepo.findNoteAccessTarget(db, noteId);
      assertOwnNote(note, actor.userId);
      await courseAccess.assertCanParticipateInCourse(db, actor, note.courseId);
      await courseAccess.assertNotesEnabled(db, note.courseId);

      const plainText =
        updates.content !== undefined
          ? extractPlainText(updates.content)
          : undefined;
      const finalVisibility = updates.visibility ?? note.visibility;
      if (finalVisibility !== "private") {
        await courseAccess.assertNotSuspended(
          db,
          actor.userId,
          note.courseId,
          "comment",
        );
        if (note.heldPrivate) {
          throw httpError(
            403,
            "NOTE_SHARING_DISABLED",
            "A moderator made this note private. It can no longer be shared.",
          );
        }
      }

      return withWriteTransaction(db, async (trx) => {
        await notesRepo.updateNote(trx, noteId, {
          ...updates,
          ...(plainText !== undefined ? { plainText } : {}),
        });

        // Read the saved note once: it supplies the content for the mention
        // sync below and is the row the response is built from. Neither the
        // mention sync nor attachment linking changes the note row itself.
        const updated = await notesRepo.findNoteById(trx, noteId);
        if (!updated) {
          throw httpError(404, "NOTE_NOT_FOUND", "Learning note not found");
        }

        if (finalVisibility === "private") {
          await trx
            .deleteFrom("learning_mentions")
            .where("source_type", "=", "note")
            .where("source_id", "=", noteId)
            .execute();
        } else if (
          updates.content !== undefined ||
          note.visibility === "private"
        ) {
          await syncMentionsAndNotify(trx, outbox, {
            sourceType: "note",
            sourceId: noteId,
            actorUserId: actor.userId,
            content: updated.content,
            courseId: note.courseId,
            lessonId: note.lessonId,
            plainText: updated.plainText,
          });
        }

        if (updates.attachmentIds && updates.attachmentIds.length > 0) {
          await linkOwnedAttachments(
            trx,
            updates.attachmentIds,
            actor.userId,
            noteId,
          );
        }

        const [attachments, likeRow, bookmarkRow] = await Promise.all([
          trx
            .selectFrom("learning_attachments")
            .select([
              "id",
              "kind",
              "file_name",
              "storage_key",
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
          trx
            .selectFrom("learning_bookmarks")
            .select("id")
            .where("user_id", "=", actor.userId)
            .where("note_id", "=", noteId)
            .executeTakeFirst(),
        ]);

        return mapNoteRow(
          updated,
          actor.userId,
          attachments,
          Boolean(likeRow),
          Boolean(bookmarkRow),
        );
      });
    },

    async deleteNote(db, noteId, actor) {
      const note = await notesRepo.findNoteAccessTarget(db, noteId);
      assertOwnNote(note, actor.userId);
      await courseAccess.assertCanParticipateInCourse(db, actor, note.courseId);
      await notesRepo.deleteNote(db, noteId);
    },
  };
}
