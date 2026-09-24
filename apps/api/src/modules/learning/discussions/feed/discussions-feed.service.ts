import type { DatabaseExecutor } from "@veolms/database";
import type {
  LessonDiscussionKind,
  LessonDiscussionSort,
  LessonDiscussionItem,
  LessonDiscussionsListResponse,
  ListLessonDiscussionsQuery,
} from "@veolms/contracts";
import { findSettingsByCourseId } from "../../../courses/configuration/configuration.repository.ts";
import { httpError } from "../../../../lib/errors.ts";
import { sql } from "kysely";
import {
  decodeCursor,
  encodeCursor,
  resolveAcademyId,
  takePage,
  toDate,
} from "../shared/discussion.utils.ts";
import {
  createDiscussionAccess,
  type DiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import {
  createThreadsService,
  type ThreadsListQuery,
  type ThreadsService,
} from "../threads/threads.service.ts";
import { createThreadsRepository } from "../threads/threads.repository.ts";
import { createAttachmentsRepository } from "../attachments/attachments.repository.ts";
import {
  createNotesService,
  type NotesListQuery,
  type NotesService,
} from "../notes/notes.service.ts";
import { createNotesRepository } from "../notes/notes.repository.ts";
import { discussionVisibilityPredicate } from "../shared/discussion.visibility.ts";

const SOURCE_RANK = {
  note: 1,
  thread: 2,
} as const;

type SourceType = keyof typeof SOURCE_RANK;

interface FeedCapabilities {
  allowComments: boolean;
  allowQa: boolean;
  allowNotes: boolean;
}

interface FeedContext {
  courseId: string;
  lessonId: string;
  actorUserId: string;
  kind: LessonDiscussionKind;
  sort: LessonDiscussionSort;
  mine: boolean;
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

interface FeedCandidate {
  entityId: string;
  sourceType: SourceType;
  sourceRank: number;
  createdAt: Date;
  score: number;
}

function invalidCursor(): never {
  throw httpError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
}

function sameContext(left: FeedContext, right: FeedContext): boolean {
  return (
    left.courseId === right.courseId &&
    left.lessonId === right.lessonId &&
    left.actorUserId === right.actorUserId &&
    left.kind === right.kind &&
    left.sort === right.sort &&
    left.mine === right.mine &&
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
    isUuid(candidate.actorUserId) &&
    (candidate.kind === "all" ||
      candidate.kind === "comment" ||
      candidate.kind === "question" ||
      candidate.kind === "note") &&
    (candidate.sort === "newest" || candidate.sort === "top") &&
    typeof candidate.mine === "boolean" &&
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
  actor: DiscussionActor,
  academyId: string,
  context: FeedContext,
  cursor: ReturnType<typeof decodeFeedCursor>,
  limit: number,
): Promise<FeedCandidate[]> {
  const sources = [];
  const kinds = threadKinds(context);

  if (kinds.length > 0) {
    const kindPredicate = sql` t.kind in (${sql.join(
      kinds.map((kind) => sql`${kind}`),
      sql`, `,
    )})`;
    sources.push(sql`
      select
        t.id as "entityId",
        'thread'::text as "sourceType",
        ${SOURCE_RANK.thread}::int as "sourceRank",
        t.created_at as "createdAt",
        (coalesce(t.likes_count, 0) + coalesce(t.replies_count, 0))::int as score
      from learning_threads as t
      where t.academy_id = ${academyId}
        and t.course_id = ${context.courseId}
        and t.lesson_id = ${context.lessonId}
        and t.status = 'active'
        and ${kindPredicate}
        and ${discussionVisibilityPredicate("t", actor.userId, context.mine)}
    `);
  }

  if (
    context.kind !== "comment" &&
    context.kind !== "question" &&
    context.capabilities.allowNotes
  ) {
    sources.push(sql`
      select
        n.id as "entityId",
        'note'::text as "sourceType",
        ${SOURCE_RANK.note}::int as "sourceRank",
        n.created_at as "createdAt",
        coalesce(n.likes_count, 0)::int as score
      from learning_notes as n
      where n.academy_id = ${academyId}
        and n.course_id = ${context.courseId}
        and n.lesson_id = ${context.lessonId}
        and ${discussionVisibilityPredicate("n", actor.userId, context.mine)}
    `);
  }

  if (sources.length === 0) return [];

  const cursorWhere = cursor
    ? context.sort === "top"
      ? sql`where (
          score < ${cursor.score}
          or (
            score = ${cursor.score}
            and "createdAt" < ${cursor.createdAt}
          )
          or (
            score = ${cursor.score}
            and "createdAt" = ${cursor.createdAt}
            and "sourceRank" < ${cursor.sourceRank}
          )
          or (
            score = ${cursor.score}
            and "createdAt" = ${cursor.createdAt}
            and "sourceRank" = ${cursor.sourceRank}
            and "entityId" < ${cursor.entityId}::uuid
          )
        )`
      : sql`where (
          "createdAt" < ${cursor.createdAt}
          or (
            "createdAt" = ${cursor.createdAt}
            and "sourceRank" < ${cursor.sourceRank}
          )
          or (
            "createdAt" = ${cursor.createdAt}
            and "sourceRank" = ${cursor.sourceRank}
            and "entityId" < ${cursor.entityId}::uuid
          )
        )`
    : sql``;

  const orderBy =
    context.sort === "top"
      ? sql`order by score desc, "createdAt" desc, "sourceRank" desc, "entityId" desc`
      : sql`order by "createdAt" desc, "sourceRank" desc, "entityId" desc`;

  const result = await sql<FeedCandidate>`
    select *
    from (${sql.join(sources, sql` union all `)}) as feed
    ${cursorWhere}
    ${orderBy}
    limit ${limit + 1}
  `.execute(db);

  return result.rows.map((row) => ({
    ...row,
    createdAt: toDate(row.createdAt),
    sourceRank: Number(row.sourceRank),
    score: Number(row.score),
  }));
}

export interface LearningDiscussionsFeedService {
  list(
    db: DatabaseExecutor,
    input: {
      courseId: string;
      lessonId: string;
      actor: DiscussionActor;
      query: ListLessonDiscussionsQuery;
    },
  ): Promise<LessonDiscussionsListResponse>;
}

export function createLearningDiscussionsFeedService(options?: {
  access?: DiscussionAccess;
  threads?: ThreadsService;
  notes?: NotesService;
}): LearningDiscussionsFeedService {
  const access = options?.access ?? createDiscussionAccess();
  const threads =
    options?.threads ??
    createThreadsService(
      createThreadsRepository(),
      createAttachmentsRepository(),
    );
  const notes = options?.notes ?? createNotesService(createNotesRepository());

  return {
    async list(db, { courseId, lessonId, actor, query }) {
      await access.assertCanAccessCourse(db, actor, courseId);

      const settings = await findSettingsByCourseId(db, courseId);
      const capabilities: FeedCapabilities = {
        allowComments: settings?.allow_comments !== false,
        allowQa: settings?.allow_qa !== false,
        allowNotes: settings?.allow_notes !== false,
      };
      const context: FeedContext = {
        courseId,
        lessonId,
        actorUserId: actor.userId,
        kind: query.kind,
        sort: query.sort,
        mine: Boolean(query.mine),
        capabilities,
      };

      const cursor = decodeFeedCursor(query.cursor, context);
      const academyId = await resolveAcademyId(db);
      const rows = await listCandidates(
        db,
        actor,
        academyId,
        context,
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
        currentUserId: actor.userId,
        roles: actor.roles,
        limit: Math.max(1, threadIds.length),
        ids: threadIds,
      };
      const noteQuery: NotesListQuery = {
        courseId,
        lessonId,
        ...(context.mine ? { mine: true } : {}),
        limit: Math.max(1, noteIds.length),
        ids: noteIds,
      };

      const [threadResponse, noteResponse] = await Promise.all([
        threadIds.length > 0
          ? threads.listThreads(db, threadQuery)
          : Promise.resolve({ threads: [], nextCursor: null }),
        noteIds.length > 0
          ? notes.listNotes(db, actor, noteQuery)
          : Promise.resolve({ notes: [], nextCursor: null }),
      ]);

      const threadsById = new Map(
        threadResponse.threads.map((thread) => [thread.id, thread]),
      );
      const notesById = new Map(
        noteResponse.notes.map((note) => [note.id, note]),
      );
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
            kind,
            thread,
          });
        } else {
          const note = notesById.get(row.entityId);
          if (!note) continue;
          items.push({
            sourceType: "note",
            identity: `note:${note.id}`,
            entityId: note.id,
            kind: "note",
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
