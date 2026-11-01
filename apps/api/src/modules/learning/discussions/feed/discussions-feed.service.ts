import { createHash } from "node:crypto";
import type { DatabaseExecutor } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";
import type {
  LessonDiscussionKind,
  LessonDiscussionSort,
  LessonDiscussionItem,
  LessonDiscussionsListResponse,
  ListLessonDiscussionsQuery,
} from "@veolms/contracts";
import { findCourseSettings } from "../../../courses/index.ts";
import { httpError } from "../../../../lib/errors.ts";
import {
  decodeCursor,
  encodeCursor,
  resolveAcademyId,
  takePage,
  toDate,
} from "../shared/discussion.utils.ts";
import type { DiscussionActor } from "../shared/discussion.access.ts";
import {
  createLessonDiscussionAccess,
  type LessonDiscussionAccess,
} from "../shared/lesson-discussion-access.ts";
import {
  createThreadsService,
  type ThreadsListQuery,
  type ThreadsService,
} from "../threads/threads.service.ts";
import { createThreadsRepository } from "../threads/threads.repository.ts";
import { createAttachmentsRepository } from "../attachments/attachments.repository.ts";
import {
  createNotesService,
  type NotesService,
} from "../notes/notes.service.ts";
import { createNotesRepository } from "../notes/notes.repository.ts";
import {
  createDiscussionsFeedRepository,
  FEED_SOURCE_RANK as SOURCE_RANK,
  type FeedCandidate,
  type FeedSourceType as SourceType,
} from "./discussions-feed.repository.ts";

const feedRepo = createDiscussionsFeedRepository();

interface FeedCapabilities {
  allowComments: boolean;
  allowQa: boolean;
  allowNotes: boolean;
}

interface FeedContext {
  courseId: string;
  lessonId: string;
  actorUserId: string | null;
  kind: LessonDiscussionKind;
  sort: LessonDiscussionSort;
  mine: boolean;
  /**
   * A hash of the search, which keeps the cursor short whatever was typed.
   * Absent from cursors written before the feed could be searched.
   */
  searchKey?: string | null;
  publicOnly: boolean;
  capabilities: FeedCapabilities;
}

interface FeedCursor {
  version: 1;
  entityId: string;
  sourceType: SourceType;
  sourceRank: number;
  createdAt: string;
  score: number;
  context: FeedContext;
}

function invalidCursor(): never {
  throw httpError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
}

function searchKey(search: string): string {
  return createHash("sha256")
    .update(search.toLowerCase())
    .digest("base64url")
    .slice(0, 22);
}

function sameContext(left: FeedContext, right: FeedContext): boolean {
  return (
    left.courseId === right.courseId &&
    left.lessonId === right.lessonId &&
    left.actorUserId === right.actorUserId &&
    left.kind === right.kind &&
    left.sort === right.sort &&
    left.mine === right.mine &&
    (left.searchKey ?? null) === (right.searchKey ?? null) &&
    left.publicOnly === right.publicOnly &&
    left.capabilities.allowComments === right.capabilities.allowComments &&
    left.capabilities.allowQa === right.capabilities.allowQa &&
    left.capabilities.allowNotes === right.capabilities.allowNotes
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

function isFeedContext(value: unknown): value is FeedContext {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FeedContext>;
  const capabilities = candidate.capabilities;
  return (
    isUuid(candidate.courseId) &&
    isUuid(candidate.lessonId) &&
    (candidate.actorUserId === null || isUuid(candidate.actorUserId)) &&
    (candidate.kind === "all" ||
      candidate.kind === "comment" ||
      candidate.kind === "question" ||
      candidate.kind === "note") &&
    (candidate.sort === "newest" ||
      candidate.sort === "oldest" ||
      candidate.sort === "top") &&
    typeof candidate.mine === "boolean" &&
    (candidate.searchKey === undefined ||
      candidate.searchKey === null ||
      typeof candidate.searchKey === "string") &&
    typeof candidate.publicOnly === "boolean" &&
    Boolean(capabilities) &&
    typeof capabilities?.allowComments === "boolean" &&
    typeof capabilities.allowQa === "boolean" &&
    typeof capabilities.allowNotes === "boolean"
  );
}

function decodeFeedCursor(value: string | undefined, context: FeedContext) {
  if (!value) return undefined;
  const parsed = decodeCursor<Partial<FeedCursor>>(value);
  if (
    !parsed ||
    parsed.version !== 1 ||
    !isUuid(parsed.entityId) ||
    (parsed.sourceType !== "thread" && parsed.sourceType !== "note") ||
    parsed.sourceRank !== SOURCE_RANK[parsed.sourceType] ||
    typeof parsed.createdAt !== "string" ||
    Number.isNaN(new Date(parsed.createdAt).getTime()) ||
    typeof parsed.score !== "number" ||
    !Number.isFinite(parsed.score) ||
    !isFeedContext(parsed.context) ||
    !sameContext(parsed.context, context)
  ) {
    return invalidCursor();
  }

  return {
    entityId: parsed.entityId,
    sourceType: parsed.sourceType,
    sourceRank: parsed.sourceRank,
    createdAt: new Date(parsed.createdAt),
    score: parsed.score,
  } satisfies Omit<FeedCursor, "version" | "context" | "createdAt"> & {
    createdAt: Date;
  };
}

function encodeFeedCursor(candidate: FeedCandidate, context: FeedContext) {
  return encodeCursor({
    version: 1,
    entityId: candidate.entityId,
    sourceType: candidate.sourceType,
    sourceRank: candidate.sourceRank,
    createdAt: toDate(candidate.createdAt).toISOString(),
    score: candidate.score,
    context,
  });
}

function threadKinds(
  context: FeedContext,
): readonly ("comment" | "question")[] {
  if (context.kind === "comment") {
    return context.capabilities.allowComments ? ["comment"] : [];
  }
  if (context.kind === "question") {
    return context.capabilities.allowQa ? ["question"] : [];
  }
  if (context.kind === "note") return [];
  return [
    ...(context.capabilities.allowComments ? ["comment" as const] : []),
    ...(context.capabilities.allowQa ? ["question" as const] : []),
  ];
}

async function listCandidates(
  db: DatabaseExecutor,
  actor: DiscussionActor | null,
  academyId: string,
  context: FeedContext,
  search: string | undefined,
  cursor: ReturnType<typeof decodeFeedCursor>,
  limit: number,
): Promise<FeedCandidate[]> {
  return feedRepo.listCandidates(db, {
    academyId,
    courseId: context.courseId,
    lessonId: context.lessonId,
    threadKinds: threadKinds(context),
    includeNotes:
      context.kind !== "comment" &&
      context.kind !== "question" &&
      context.capabilities.allowNotes,
    viewerUserId: context.publicOnly ? null : actor?.userId,
    mine: context.mine,
    search,
    sort: context.sort,
    cursor,
    limit,
  });
}

export interface LearningDiscussionsFeedService {
  list(
    db: DatabaseExecutor,
    input: {
      courseId: string;
      lessonId: string;
      actor: DiscussionActor | null;
      query: ListLessonDiscussionsQuery;
    },
  ): Promise<LessonDiscussionsListResponse>;
}

export function createLearningDiscussionsFeedService(options?: {
  lessonAccess?: LessonDiscussionAccess;
  threads?: ThreadsService;
  notes?: NotesService;
  storage?: S3StorageService;
}): LearningDiscussionsFeedService {
  const lessonAccess = options?.lessonAccess ?? createLessonDiscussionAccess();
  const threads =
    options?.threads ??
    createThreadsService(
      createThreadsRepository(),
      createAttachmentsRepository(),
      undefined,
      undefined,
      undefined,
      options?.storage,
    );
  const notes =
    options?.notes ??
    createNotesService(createNotesRepository(), options?.storage);

  return {
    async list(db, { courseId, lessonId, actor, query }) {
      const readAccess = await lessonAccess.assertCanReadLesson(db, {
        courseId,
        lessonId,
        actor,
      });

      const settings = await findCourseSettings(db, courseId);
      const capabilities: FeedCapabilities = {
        allowComments: settings?.allow_comments !== false,
        allowQa: settings?.allow_qa !== false,
        allowNotes:
          readAccess.canReadPrivateState && settings?.allow_notes !== false,
      };
      const context: FeedContext = {
        courseId,
        lessonId,
        actorUserId: actor?.userId ?? null,
        kind: query.kind,
        sort: query.sort,
        mine: Boolean(query.mine && actor && readAccess.canReadPrivateState),
        searchKey: query.search ? searchKey(query.search) : null,
        publicOnly: !readAccess.canReadPrivateState,
        capabilities,
      };

      const cursor = decodeFeedCursor(query.cursor, context);
      const academyId = await resolveAcademyId(db);
      const rows = await listCandidates(
        db,
        actor,
        academyId,
        context,
        query.search || undefined,
        cursor,
        query.limit,
      );
      const { page, hasMore } = takePage(rows, query.limit);

      const threadIds = page
        .filter((row) => row.sourceType === "thread")
        .map((row) => row.entityId);
      const noteIds = page
        .filter((row) => row.sourceType === "note")
        .map((row) => row.entityId);

      const threadQuery: ThreadsListQuery = {
        kind: "all",
        status: "all",
        sort: "latest",
        courseId,
        lessonId,
        currentUserId: readAccess.canReadPrivateState
          ? actor?.userId
          : undefined,
        roles: readAccess.canReadPrivateState ? actor?.roles : undefined,
        skipCourseAccessCheck: true,
        limit: Math.max(1, threadIds.length),
        ids: threadIds,
      };

      const [threadResponse, feedNotes] = await Promise.all([
        threadIds.length > 0
          ? threads.listThreads(db, threadQuery)
          : Promise.resolve({ threads: [], nextCursor: null }),
        noteIds.length > 0
          ? notes.listNotesByIds(db, actor!, {
              courseId,
              lessonId,
              ids: noteIds,
              mine: context.mine,
            })
          : Promise.resolve([]),
      ]);

      const threadsById = new Map(
        threadResponse.threads.map((thread) => [thread.id, thread]),
      );
      const notesById = new Map(feedNotes.map((note) => [note.id, note]));
      const items: LessonDiscussionItem[] = [];

      for (const row of page) {
        if (row.sourceType === "thread") {
          const thread = threadsById.get(row.entityId);
          if (!thread) continue;
          const kind = thread.kind === "qna" ? "question" : thread.kind;
          if (kind !== "comment" && kind !== "question") {
            throw httpError(
              500,
              "DISCUSSION_FEED_HYDRATION_FAILED",
              "The discussion feed could not be hydrated.",
            );
          }
          items.push({
            sourceType: "thread",
            identity: `thread:${thread.id}`,
            entityId: thread.id,
            thread,
          });
        } else {
          const note = notesById.get(row.entityId);
          if (!note) continue;
          items.push({
            sourceType: "note",
            identity: `note:${note.id}`,
            entityId: note.id,
            note,
          });
        }
      }

      const last = page.at(-1);
      return {
        items,
        nextCursor: hasMore && last ? encodeFeedCursor(last, context) : null,
      };
    },
  };
}
