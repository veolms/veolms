import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { queryClient as defaultQueryClient } from "../../lib/query-client";
import { authStore } from "../../store/auth.store";
import { desiredStateCoordinator } from "./desired-state-coordinator";
import {
  getClientEntityId,
  getServerEntityId,
  type LearningNotesCacheResponse,
  type LearningRepliesCacheResponse,
  type LearningThreadCacheResponse,
} from "./interaction-entities";
import { learningInteractionKeys } from "./learning-interactions.keys";
import { optimisticEditCoordinator } from "./optimistic-edit-coordinator";
import { mapPaginatedCache } from "./paginated-cache";

export const UNDO_DELETE_TIMEOUT_MS = 10_000;

export type OptimisticDeletionKind = "thread" | "reply" | "note";
export type OptimisticDeletionPhase = "undoable" | "deleting" | "deleted";

export interface OptimisticDeletionRecord {
  readonly kind: OptimisticDeletionKind;
  readonly clientId: string;
  readonly serverId: string;
  readonly authGeneration: number;
  readonly parentClientId?: string;
  readonly parentServerId?: string;
  /** The visible parent count before this reply was tombstoned. */
  readonly parentRepliesCount?: number;
  readonly deadline: number;
  phase: OptimisticDeletionPhase;
}

interface InternalDeletionRecord extends OptimisticDeletionRecord {
  timer: ReturnType<typeof setTimeout> | null;
  ticker: ReturnType<typeof setInterval> | null;
  commit: () => Promise<unknown>;
  onFailure?: () => void;
  queryClient: QueryClient;
}

export interface BeginOptimisticDeletionArgs {
  kind: OptimisticDeletionKind;
  clientId: string;
  serverId: string;
  parentClientId?: string;
  parentServerId?: string;
  parentRepliesCount?: number;
  commit: () => Promise<unknown>;
  onFailure?: () => void;
  queryClient?: QueryClient | null;
}

function deletionKey(kind: OptimisticDeletionKind, clientId: string): string {
  return `${kind}:${clientId}`;
}

function matchesEntity(
  entity: { id: string | number; clientId?: string; serverId?: string },
  record: OptimisticDeletionRecord,
): boolean {
  return (
    getClientEntityId(entity) === record.clientId ||
    getServerEntityId(entity) === record.serverId
  );
}

function withRemovedItem<T>(
  items: readonly T[],
  matches: (item: T) => boolean,
): T[] | undefined {
  const next = items.filter((item) => !matches(item));
  return next.length === items.length ? undefined : next;
}

/**
 * Feature-scoped authority for optimistic deletion. Cache entities remain as
 * rollback baselines; tombstones decide what may be rendered until a delete is
 * undone, fails, or has been finalized.
 */
export class OptimisticDeletionCoordinator {
  private records = new Map<string, InternalDeletionRecord>();
  private listeners = new Set<() => void>();
  private revision = 0;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRevision(): number {
    return this.revision;
  }

  begin(
    args: BeginOptimisticDeletionArgs,
  ): OptimisticDeletionRecord | undefined {
    this.pruneStaleGenerations();
    if (!args.serverId) return undefined;

    const key = deletionKey(args.kind, args.clientId);
    const existing = this.records.get(key);
    if (existing) return existing;

    const deadline = Date.now() + UNDO_DELETE_TIMEOUT_MS;
    const record: InternalDeletionRecord = {
      ...args,
      authGeneration: authStore.getWriteGeneration(),
      deadline,
      phase: "undoable",
      timer: null,
      ticker: null,
      queryClient: args.queryClient ?? defaultQueryClient,
    };
    this.records.set(key, record);
    record.timer = setTimeout(
      () => this.commit(key, record.authGeneration),
      UNDO_DELETE_TIMEOUT_MS,
    );
    // Countdown display is presentation only, but the coordinator owns its
    // lifecycle so navigation cannot cancel or desynchronize the transaction.
    record.ticker = setInterval(() => this.notify(), 250);
    this.notify();
    return record;
  }

  undo(kind: OptimisticDeletionKind, clientId: string): boolean {
    const key = deletionKey(kind, clientId);
    const record = this.records.get(key);
    if (!record || record.phase !== "undoable") return false;
    this.clearTimers(record);
    this.records.delete(key);
    this.notify();
    return true;
  }

  get(
    kind: OptimisticDeletionKind,
    clientId: string,
    serverId?: string,
  ): Readonly<OptimisticDeletionRecord> | undefined {
    this.pruneStaleGenerations();
    const direct = this.records.get(deletionKey(kind, clientId));
    if (direct) return direct;
    if (!serverId) return undefined;
    return Array.from(this.records.values()).find(
      (record) => record.kind === kind && record.serverId === serverId,
    );
  }

  isTombstoned(
    kind: OptimisticDeletionKind,
    entity: { id: string | number; clientId?: string; serverId?: string },
  ): boolean {
    this.pruneStaleGenerations();
    return Array.from(this.records.values()).some(
      (record) => record.kind === kind && matchesEntity(entity, record),
    );
  }

  /**
   * Applies visible reply deletion to a parent thread without mutating its
   * server baseline. Once a fresh response reflects the lower count, the
   * matching transaction no longer subtracts it a second time.
   */
  projectThreadReplyState(thread: {
    id: string | number;
    clientId?: string;
    serverId?: string;
    repliesCount?: number;
    acceptedAnswerId?: string | null;
  }):
    | Pick<
        { repliesCount?: number; acceptedAnswerId?: string | null },
        "repliesCount" | "acceptedAnswerId"
      >
    | undefined {
    this.pruneStaleGenerations();
    const clientId = getClientEntityId(thread);
    const serverId = getServerEntityId(thread);
    const replyRecords = Array.from(this.records.values()).filter(
      (record) =>
        record.kind === "reply" &&
        (record.parentClientId === clientId ||
          record.parentServerId === serverId),
    );
    if (replyRecords.length === 0) return undefined;

    const rawCount = thread.repliesCount ?? 0;
    const countDelta = replyRecords.filter(
      (record) =>
        record.parentRepliesCount === undefined ||
        rawCount >= record.parentRepliesCount,
    ).length;
    const hidesAcceptedReply = replyRecords.some(
      (record) => record.serverId === thread.acceptedAnswerId,
    );
    return {
      repliesCount: Math.max(0, rawCount - countDelta),
      acceptedAnswerId: hidesAcceptedReply ? null : thread.acceptedAnswerId,
    };
  }

  reset(): void {
    for (const record of this.records.values()) this.clearTimers(record);
    this.records.clear();
    this.notify();
  }

  private commit(key: string, generation: number): void {
    const record = this.records.get(key);
    if (
      !record ||
      record.phase !== "undoable" ||
      record.authGeneration !== generation ||
      generation !== authStore.getWriteGeneration()
    ) {
      return;
    }

    if (record.timer !== null) {
      clearTimeout(record.timer);
      record.timer = null;
    }
    if (record.ticker !== null) {
      clearInterval(record.ticker);
      record.ticker = null;
    }
    record.phase = "deleting";
    this.notify();

    void record
      .commit()
      .then(() => {
        if (!this.isCurrentRecord(key, record, generation)) return;
        record.phase = "deleted";
        this.finalizeInCaches(record);
        this.clearRelatedOptimisticState(record);
        this.notify();
      })
      .catch(() => {
        if (!this.isCurrentRecord(key, record, generation)) return;
        this.records.delete(key);
        record.onFailure?.();
        this.notify();
      });
  }

  private isCurrentRecord(
    key: string,
    record: InternalDeletionRecord,
    generation: number,
  ): boolean {
    return (
      this.records.get(key) === record &&
      record.authGeneration === generation &&
      generation === authStore.getWriteGeneration()
    );
  }

  private finalizeInCaches(record: InternalDeletionRecord): void {
    if (record.kind === "thread") {
      const removeThreadPage = (old: LearningThreadCacheResponse | undefined) => {
        if (!old) return old;
        const threads = withRemovedItem(old.threads, (thread) =>
          matchesEntity(thread, record),
        );
        if (!threads) return old;
        return {
          ...old,
          threads,
          totalCount:
            old.totalCount === undefined
              ? old.totalCount
              : Math.max(0, old.totalCount - 1),
        };
      };
      record.queryClient.setQueriesData<
        LearningThreadCacheResponse | import("@tanstack/react-query").InfiniteData<LearningThreadCacheResponse>
      >(
        { queryKey: [...learningInteractionKeys.all, "lesson-threads"] },
        (old) =>
          old === undefined
            ? old
            : mapPaginatedCache<LearningThreadCacheResponse>(old, (page) =>
                removeThreadPage(page) ?? page,
              ),
      );
      record.queryClient.setQueriesData<
        LearningThreadCacheResponse | import("@tanstack/react-query").InfiniteData<LearningThreadCacheResponse>
      >(
        { queryKey: [...learningInteractionKeys.all, "hub-threads"] },
        (old) =>
          old === undefined
            ? old
            : mapPaginatedCache<LearningThreadCacheResponse>(old, (page) =>
                removeThreadPage(page) ?? page,
              ),
      );
      record.queryClient.removeQueries({
        queryKey: learningInteractionKeys.threadDetails(record.serverId),
      });
      return;
    }

    if (record.kind === "reply") {
      record.queryClient.setQueriesData<LearningRepliesCacheResponse>(
        { queryKey: [...learningInteractionKeys.all, "replies"] },
        (old) => {
          if (!old) return old;
          const replies = withRemovedItem(old.replies, (reply) =>
            matchesEntity(reply, record),
          );
          if (!replies) return old;
          return {
            ...old,
            replies,
            totalCount:
              old.totalCount === undefined
                ? old.totalCount
                : Math.max(0, old.totalCount - 1),
          };
        },
      );
      return;
    }

    record.queryClient.setQueriesData<
      LearningNotesCacheResponse | import("@tanstack/react-query").InfiniteData<LearningNotesCacheResponse>
    >(
      { queryKey: learningInteractionKeys.notesRoot() },
      (old) => {
        if (old === undefined) return old;
        return mapPaginatedCache<LearningNotesCacheResponse>(old, (page) => {
          const notes = withRemovedItem(page.notes, (note) =>
            matchesEntity(note, record),
          );
          if (!notes) return page;
          return {
            ...page,
            notes,
            totalCount:
              page.totalCount === undefined
                ? page.totalCount
                : Math.max(0, page.totalCount - 1),
          };
        });
      },
    );
    record.queryClient.removeQueries({
      queryKey: learningInteractionKeys.noteDetails(record.serverId),
    });
  }

  private clearRelatedOptimisticState(record: InternalDeletionRecord): void {
    desiredStateCoordinator.clearEntity(
      record.kind,
      record.clientId,
      record.serverId,
      record.parentServerId,
    );
    optimisticEditCoordinator.discard(record.kind, record.clientId);
  }

  private clearTimers(record: InternalDeletionRecord): void {
    if (record.timer !== null) clearTimeout(record.timer);
    if (record.ticker !== null) clearInterval(record.ticker);
    record.timer = null;
    record.ticker = null;
  }

  private pruneStaleGenerations(): void {
    let changed = false;
    for (const [key, record] of this.records) {
      if (record.authGeneration === authStore.getWriteGeneration()) continue;
      this.clearTimers(record);
      this.records.delete(key);
      changed = true;
    }
    if (changed) this.notify();
  }

  private notify(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}

export const optimisticDeletionCoordinator =
  new OptimisticDeletionCoordinator();

/** React bridge for projections and tombstone presentation. */
export function useOptimisticDeletionRevision(): number {
  return useSyncExternalStore(
    (listener) => optimisticDeletionCoordinator.subscribe(listener),
    () => optimisticDeletionCoordinator.getRevision(),
    () => 0,
  );
}

export function useOptimisticDeletion(
  kind: OptimisticDeletionKind,
  clientId: string,
  serverId?: string,
) {
  useOptimisticDeletionRevision();
  const record = optimisticDeletionCoordinator.get(kind, clientId, serverId);
  const phase = record?.phase;
  return {
    phase,
    hidden: phase !== undefined,
    pending: phase === "undoable",
    seconds: record
      ? Math.max(0, Math.ceil((record.deadline - Date.now()) / 1000))
      : 0,
    undo: () => optimisticDeletionCoordinator.undo(kind, clientId),
  };
}
