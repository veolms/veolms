import {
  formatStorageBytes,
  STORAGE_BLOCKED_ERROR,
  STORAGE_FULL_ERROR,
  STORAGE_NEAR_FULL_RATIO,
  type MyStorageResponse,
  type StorageLearner,
  type StorageLearnerDetailResponse,
  type StorageLearnerFilter,
  type StorageLearnerSort,
  type StorageLearnersResponse,
  type StorageRequest,
  type StorageState,
} from "@veolms/contracts";
import {
  isAssistantUserId,
  type Database,
  type DatabaseExecutor,
} from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../lib/errors.ts";
import { STUDENT_ROLE } from "../auth/index.ts";
import {
  createStorageRepository,
  type LearnerRow,
  type StorageRequestRow,
} from "./storage.repository.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A decided request stays on the learner's screen this long. */
const RECENT_DECISION_DAYS = 30;
const RECOUNT_PAGE = 500;

export const StorageErrors = {
  full: (usedBytes: number, limitBytes: number) =>
    new AppError(
      403,
      STORAGE_FULL_ERROR,
      usedBytes >= limitBytes
        ? `Your storage space is full (${formatStorageBytes(usedBytes)} of ${formatStorageBytes(limitBytes)} used). Request more space, or delete some files you've sent.`
        : `There isn't enough space left for this file (${formatStorageBytes(usedBytes)} of ${formatStorageBytes(limitBytes)} used). Request more space, or delete some files you've sent.`,
    ),
  blocked: () =>
    new AppError(
      403,
      STORAGE_BLOCKED_ERROR,
      "Sending files is turned off for your account. Contact support if you think this is a mistake.",
    ),
  notLimited: () =>
    new AppError(
      400,
      "STORAGE_NOT_LIMITED",
      "Your account has no storage limit.",
    ),
  learnerNotFound: () =>
    new AppError(404, "STORAGE_LEARNER_NOT_FOUND", "Student not found."),
  requestNotFound: () =>
    new AppError(404, "STORAGE_REQUEST_NOT_FOUND", "Request not found."),
  requestDecided: () =>
    new AppError(
      409,
      "STORAGE_REQUEST_DECIDED",
      "This request was already answered.",
    ),
  noOpenRequest: () =>
    new AppError(404, "STORAGE_NO_OPEN_REQUEST", "You have no open request."),
};

/**
 * Who the limit applies to: learners, i.e. accounts with no role beyond
 * student. Staff (admins, instructors, every team role) post teaching
 * material and are not limited; nor are chat assistants.
 */
export function isStorageLimited(
  userId: string,
  roles: readonly string[],
): boolean {
  if (isAssistantUserId(userId)) return false;
  return !roles.some((role) => role.toLowerCase() !== STUDENT_ROLE);
}

function presentRequest(row: StorageRequestRow): StorageRequest {
  return {
    id: row.id,
    status: row.status,
    note: row.note,
    usedBytes: Number(row.used_bytes),
    limitBytes: Number(row.limit_bytes),
    grantedLimitBytes:
      row.granted_limit_bytes === null ? null : Number(row.granted_limit_bytes),
    decisionNote: row.decision_note,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null,
  };
}

function presentLearner(row: LearnerRow): StorageLearner {
  const used = Number(row.used_bytes);
  const limit = Number(row.limit_bytes);
  return {
    userId: row.user_id,
    name: row.display_name,
    username: row.username,
    email: row.email,
    avatarUrl: row.avatar_data_url,
    usedBytes: used,
    limitBytes: limit,
    customLimit: row.custom_limit,
    percentUsed:
      limit > 0 ? Math.round((used / limit) * 1000) / 10 : used > 0 ? 100 : 0,
    lastUploadAt: row.last_upload_at?.toISOString() ?? null,
    blocked: row.blocked_at
      ? { at: row.blocked_at.toISOString(), reason: row.block_reason }
      : null,
    pendingRequest:
      row.request_id && row.request_created_at
        ? {
            id: row.request_id,
            status: "pending",
            note: row.request_note,
            usedBytes: Number(row.request_used_bytes ?? 0),
            limitBytes: Number(row.request_limit_bytes ?? 0),
            grantedLimitBytes: null,
            decisionNote: null,
            createdAt: row.request_created_at.toISOString(),
            decidedAt: null,
          }
        : null,
  };
}

function stateOf(input: {
  limited: boolean;
  blocked: boolean;
  usedBytes: number;
  limitBytes: number;
}): StorageState {
  if (!input.limited) return "unlimited";
  if (input.blocked) return "blocked";
  if (input.usedBytes >= input.limitBytes) return "full";
  if (input.usedBytes >= input.limitBytes * STORAGE_NEAR_FULL_RATIO) {
    return "near_full";
  }
  return "ok";
}

/** The person's current limit, from their row or the default. */
function limitOf(row: {
  limit_bytes: string | null;
  default_limit_bytes: string;
}) {
  return Number(row.limit_bytes ?? row.default_limit_bytes);
}

/**
 * The check the upload modules (chat, discussions, support) run before
 * recording a new file. Takes the executor per call, so it fits services
 * that are handed their database per call.
 */
export function createStorageGuard() {
  const repository = createStorageRepository();

  return {
    /**
     * Call inside the transaction that records a new file, before recording
     * it. Refuses when the person is blocked or the file does not fit, and
     * holds their row locked until the transaction ends: two uploads at once
     * take turns, and the second sees the first's bytes (the upload tables'
     * triggers add them). Staff pass straight through.
     *
     * The kept count can only run high (a file passing its "within a day"
     * mark changes no row), so before refusing it is recomputed from the
     * files.
     */
    async assertCanStore(
      trx: DatabaseExecutor,
      input: { userId: string; roles: readonly string[]; bytes: number },
    ) {
      if (!isStorageLimited(input.userId, input.roles)) return;
      const row = await repository.lockForUpload(trx, input.userId);
      if (row.blocked_at) throw StorageErrors.blocked();
      const limit = limitOf(row);
      let used = Number(row.used_bytes);
      if (used + input.bytes > limit) {
        const [recounted] = await repository.recount(trx, [input.userId]);
        used = recounted?.after ?? used;
        if (used + input.bytes > limit) throw StorageErrors.full(used, limit);
      }
      await repository.touchLastUpload(trx, input.userId);
    },

    /**
     * An early answer, without locking, for a file that is streamed to the
     * API before its size is known (`bytes` 0): blocked, or already full.
     * Saves receiving a file that would be refused; `assertCanStore` still
     * decides.
     */
    async precheck(
      db: DatabaseExecutor,
      input: { userId: string; roles: readonly string[]; bytes: number },
    ) {
      if (!isStorageLimited(input.userId, input.roles)) return;
      const row = await repository.find(db, input.userId);
      if (row.blocked_at) throw StorageErrors.blocked();
      const limit = limitOf(row);
      if (Number(row.used_bytes) + input.bytes < limit) return;
      const files = await repository.breakdown(db, input.userId);
      const used = files.chatBytes + files.discussionBytes + files.supportBytes;
      if (used + input.bytes > limit || used >= limit) {
        throw StorageErrors.full(used, limit);
      }
    },
  };
}

export type StorageGuard = ReturnType<typeof createStorageGuard>;

export function createStorageService({
  database,
}: {
  database: Kysely<Database>;
}) {
  const repository = createStorageRepository();
  const guard = createStorageGuard();

  async function learnerOrThrow(db: DatabaseExecutor, userId: string) {
    const [row] = await repository.listLearners(db, {
      filter: "all",
      sort: "used",
      order: "desc",
      limit: 1,
      offset: 0,
      userId,
    });
    if (!row) throw StorageErrors.learnerNotFound();
    return row;
  }

  return {
    assertCanStore: guard.assertCanStore,

    /** The learner's own view: space used, the limit, their request. */
    async mine(
      userId: string,
      roles: readonly string[],
    ): Promise<MyStorageResponse> {
      const limited = isStorageLimited(userId, roles);
      const [row, breakdown, request] = await Promise.all([
        repository.find(database, userId),
        repository.breakdown(database, userId),
        limited
          ? repository.findCurrentRequest(
              database,
              userId,
              new Date(Date.now() - RECENT_DECISION_DAYS * DAY_MS),
            )
          : Promise.resolve(undefined),
      ]);
      // Counted from the files (the kept count may be a little high until
      // its next recount; this read may run on a replica, which cannot fix it).
      const usedBytes =
        breakdown.chatBytes +
        breakdown.discussionBytes +
        breakdown.supportBytes;
      const limitBytes = limitOf(row);
      return {
        state: stateOf({
          limited,
          blocked: Boolean(row.blocked_at),
          usedBytes,
          limitBytes,
        }),
        usedBytes,
        limitBytes: limited ? limitBytes : null,
        breakdown,
        blocked:
          limited && row.blocked_at
            ? { at: row.blocked_at.toISOString(), reason: row.block_reason }
            : null,
        request: request ? presentRequest(request) : null,
      };
    },

    /** "Request more space": one open request at a time (a repeat returns it). */
    async requestMore(
      userId: string,
      roles: readonly string[],
      note: string | undefined,
    ): Promise<{ request: StorageRequest }> {
      if (!isStorageLimited(userId, roles)) throw StorageErrors.notLimited();
      return database.transaction().execute(async (trx) => {
        const row = await repository.lockForUpload(trx, userId);
        const open = await repository.findPendingRequest(trx, userId);
        if (open) return { request: presentRequest(open) };
        const [recounted] = await repository.recount(trx, [userId]);
        const created = await repository.insertRequest(trx, {
          userId,
          note: note?.trim() || null,
          usedBytes: recounted?.after ?? Number(row.used_bytes),
          limitBytes: limitOf(row),
        });
        if (!created) {
          const again = await repository.findPendingRequest(trx, userId);
          if (again) return { request: presentRequest(again) };
          throw StorageErrors.noOpenRequest();
        }
        await repository.insertEvent(trx, {
          userId,
          actorId: userId,
          action: "request",
          requestId: created.id,
          note: created.note,
        });
        return { request: presentRequest(created) };
      });
    },

    async cancelRequest(userId: string): Promise<{ request: StorageRequest }> {
      return database.transaction().execute(async (trx) => {
        const open = await repository.findPendingRequest(trx, userId);
        if (!open) throw StorageErrors.noOpenRequest();
        const cancelled = await repository.decideRequest(trx, open.id, {
          status: "cancelled",
          by: userId,
          note: null,
          grantedLimitBytes: null,
        });
        if (!cancelled) throw StorageErrors.requestDecided();
        await repository.insertEvent(trx, {
          userId,
          actorId: userId,
          action: "cancel_request",
          requestId: open.id,
        });
        return { request: presentRequest(cancelled) };
      });
    },

    // ------------------------------------------------------------ admin
    async listLearners(query: {
      search?: string | undefined;
      filter: StorageLearnerFilter;
      sort: StorageLearnerSort;
      order: "asc" | "desc";
      page: number;
      pageSize: number;
    }): Promise<StorageLearnersResponse> {
      const [rows, summary] = await Promise.all([
        repository.listLearners(database, {
          search: query.search,
          filter: query.filter,
          sort: query.sort,
          order: query.order,
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        }),
        repository.summary(database),
      ]);
      return {
        learners: rows.map(presentLearner),
        total: Number(rows[0]?.total ?? 0),
        page: query.page,
        pageSize: query.pageSize,
        summary,
      };
    },

    async learnerDetail(userId: string): Promise<StorageLearnerDetailResponse> {
      const row = await learnerOrThrow(database, userId);
      const [breakdown, requests, events] = await Promise.all([
        repository.breakdown(database, userId),
        repository.listRequests(database, userId, 20),
        repository.listEvents(database, userId, 50),
      ]);
      return {
        learner: presentLearner(row),
        breakdown,
        requests: requests.map(presentRequest),
        events: events.map((event) => ({
          id: event.id,
          action: event.action,
          actor: event.actor_id
            ? { id: event.actor_id, name: event.actor_name ?? null }
            : null,
          fromLimitBytes:
            event.from_limit_bytes === null
              ? null
              : Number(event.from_limit_bytes),
          toLimitBytes:
            event.to_limit_bytes === null ? null : Number(event.to_limit_bytes),
          note: event.note,
          createdAt: event.created_at.toISOString(),
        })),
      };
    },

    /**
     * Sets one person's limit (null: back to the default). An open request
     * the new limit answers (more than they had) is marked approved.
     */
    async setLimit(
      actorId: string,
      userId: string,
      limitBytes: number | null,
      note: string | undefined,
    ) {
      await database.transaction().execute(async (trx) => {
        await learnerOrThrow(trx, userId);
        const row = await repository.lockForUpload(trx, userId);
        const before = limitOf(row);
        await repository.setLimit(trx, userId, limitBytes);
        const after = limitBytes ?? Number(row.default_limit_bytes);
        await repository.insertEvent(trx, {
          userId,
          actorId,
          action: limitBytes === null ? "reset_limit" : "set_limit",
          fromLimitBytes: before,
          toLimitBytes: after,
          note: note?.trim() || null,
        });
        const open = await repository.findPendingRequest(trx, userId);
        if (open && after > Number(open.limit_bytes)) {
          await repository.decideRequest(trx, open.id, {
            status: "approved",
            by: actorId,
            note: note?.trim() || null,
            grantedLimitBytes: after,
          });
          await repository.insertEvent(trx, {
            userId,
            actorId,
            action: "approve_request",
            fromLimitBytes: before,
            toLimitBytes: after,
            requestId: open.id,
          });
        }
      });
      return {
        learner: presentLearner(await learnerOrThrow(database, userId)),
      };
    },

    async approveRequest(
      actorId: string,
      requestId: string,
      limitBytes: number,
      note: string | undefined,
    ) {
      const userId = await database.transaction().execute(async (trx) => {
        const request = await repository.lockRequest(trx, requestId);
        if (!request) throw StorageErrors.requestNotFound();
        if (request.status !== "pending") throw StorageErrors.requestDecided();
        const row = await repository.lockForUpload(trx, request.user_id);
        const before = limitOf(row);
        await repository.setLimit(trx, request.user_id, limitBytes);
        await repository.decideRequest(trx, requestId, {
          status: "approved",
          by: actorId,
          note: note?.trim() || null,
          grantedLimitBytes: limitBytes,
        });
        await repository.insertEvent(trx, {
          userId: request.user_id,
          actorId,
          action: "approve_request",
          fromLimitBytes: before,
          toLimitBytes: limitBytes,
          requestId,
          note: note?.trim() || null,
        });
        return request.user_id;
      });
      return {
        learner: presentLearner(await learnerOrThrow(database, userId)),
      };
    },

    async declineRequest(
      actorId: string,
      requestId: string,
      note: string | undefined,
    ) {
      const userId = await database.transaction().execute(async (trx) => {
        const request = await repository.lockRequest(trx, requestId);
        if (!request) throw StorageErrors.requestNotFound();
        if (request.status !== "pending") throw StorageErrors.requestDecided();
        await repository.decideRequest(trx, requestId, {
          status: "declined",
          by: actorId,
          note: note?.trim() || null,
          grantedLimitBytes: null,
        });
        await repository.insertEvent(trx, {
          userId: request.user_id,
          actorId,
          action: "decline_request",
          requestId,
          note: note?.trim() || null,
        });
        return request.user_id;
      });
      return {
        learner: presentLearner(await learnerOrThrow(database, userId)),
      };
    },

    /** Blocked: no uploads at all; the files already stored stay. */
    async setBlocked(
      actorId: string,
      userId: string,
      blocked: boolean,
      reason: string | undefined,
    ) {
      await database.transaction().execute(async (trx) => {
        await learnerOrThrow(trx, userId);
        await repository.lockForUpload(trx, userId);
        await repository.setBlocked(
          trx,
          userId,
          blocked ? { by: actorId, reason: reason?.trim() || null } : null,
        );
        await repository.insertEvent(trx, {
          userId,
          actorId,
          action: blocked ? "block" : "unblock",
          note: blocked ? reason?.trim() || null : null,
        });
      });
      return {
        learner: presentLearner(await learnerOrThrow(database, userId)),
      };
    },

    /** Recomputes one person's space from their files ("Recount"). */
    async recountOne(actorId: string, userId: string) {
      await database.transaction().execute(async (trx) => {
        await learnerOrThrow(trx, userId);
        await repository.lockForUpload(trx, userId);
        const [result] = await repository.recount(trx, [userId]);
        if (result && result.before !== result.after) {
          await repository.insertEvent(trx, {
            userId,
            actorId,
            action: "recount",
            note: `${formatStorageBytes(result.before)} → ${formatStorageBytes(result.after)}`,
          });
        }
      });
      return {
        learner: presentLearner(await learnerOrThrow(database, userId)),
      };
    },

    async settings() {
      return { defaultLimitBytes: await repository.defaultLimit(database) };
    },

    async updateSettings(actorId: string, defaultLimitBytes: number) {
      await database.transaction().execute(async (trx) => {
        const before = await repository.defaultLimit(trx);
        await repository.setDefaultLimit(trx, defaultLimitBytes, actorId);
        if (before !== defaultLimitBytes) {
          await repository.insertEvent(trx, {
            userId: actorId,
            actorId,
            action: "set_default_limit",
            fromLimitBytes: before,
            toLimitBytes: defaultLimitBytes,
          });
        }
      });
      return { defaultLimitBytes };
    },

    /**
     * The scheduled recount: people with uploads in the last two days (a
     * file of theirs may have passed its "within a day" mark), or everyone
     * (`all`). A page at a time, each page its own short transaction.
     */
    async recountMany(all: boolean) {
      let after: string | null = null;
      let people = 0;
      let corrected = 0;
      for (;;) {
        const ids = await repository.listForRecount(database, {
          all,
          afterUserId: after,
          limit: RECOUNT_PAGE,
        });
        if (ids.length === 0) break;
        const results = await database
          .transaction()
          .execute((trx) => repository.recount(trx, ids));
        people += ids.length;
        corrected += results.filter((r) => r.before !== r.after).length;
        after = ids[ids.length - 1]!;
        if (ids.length < RECOUNT_PAGE) break;
      }
      return { people, corrected };
    },
  };
}

export type StorageService = ReturnType<typeof createStorageService>;
