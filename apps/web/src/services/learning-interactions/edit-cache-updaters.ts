import type { QueryClient } from "@tanstack/react-query";
import { learningInteractionKeys } from "./learning-interactions.keys";
import {
  getClientEntityId,
  getServerEntityId,
  type LearningNotesCacheResponse,
  type LearningRepliesCacheResponse,
  type LearningThreadCacheResponse,
} from "./interaction-entities";
import type {
  OptimisticEditFields,
  OptimisticEditKind,
} from "./optimistic-edit-coordinator";
import { isInfiniteCacheData } from "./paginated-cache";

type CacheEntity = {
  id: string | number;
  clientId?: string;
  serverId?: string;
  creationStatus?: "pending" | "confirmed";
  content?: string;
  plainText?: string;
  visibility?: string;
};

function matchesEntity(
  entity: CacheEntity,
  clientId: string,
  serverId: string,
): boolean {
  return (
    getClientEntityId(entity) === clientId ||
    getServerEntityId(entity) === serverId
  );
}

export function applyOptimisticEditFields<T extends CacheEntity>(
  entity: T,
  fields: OptimisticEditFields,
): T {
  const next = { ...entity } as T;
  if (fields.content !== undefined) {
    (next as CacheEntity).content = fields.content;
  }
  if (fields.plainText !== undefined) {
    (next as CacheEntity).plainText = fields.plainText;
  }
  if ("visibility" in fields) {
    (next as CacheEntity).visibility = fields.visibility;
  }
  return next;
}

function updateEntity(
  entity: CacheEntity,
  clientId: string,
  serverId: string,
  fields: OptimisticEditFields,
): CacheEntity {
  if (!matchesEntity(entity, clientId, serverId)) return entity;
  return applyOptimisticEditFields(entity, fields);
}

function updateCacheData(
  data: unknown,
  queryKey: readonly unknown[],
  kind: OptimisticEditKind,
  clientId: string,
  serverId: string,
  fields: OptimisticEditFields,
): unknown {
  if (!data || typeof data !== "object") return data;

  if (isInfiniteCacheData<unknown>(data)) {
    let changed = false;
    const pages = data.pages.map((page) => {
      const updated = updateCacheData(
        page,
        queryKey,
        kind,
        clientId,
        serverId,
        fields,
      );
      changed ||= updated !== page;
      return updated;
    });
    return changed ? { ...data, pages } : data;
  }

  if (Array.isArray(data)) {
    if (kind !== "reply") return data;
    let changed = false;
    const next = data.map((item) => {
      if (!item || typeof item !== "object") return item;
      const updated = updateEntity(item as CacheEntity, clientId, serverId, fields);
      changed ||= updated !== item;
      return updated;
    });
    return changed ? next : data;
  }

  const record = data as Record<string, unknown>;
  if (Array.isArray(record.threads)) {
    if (kind !== "thread") return data;
    const typed = record as unknown as LearningThreadCacheResponse;
    let changed = false;
    const threads = typed.threads.map((thread) => {
      const updated = updateEntity(thread as unknown as CacheEntity, clientId, serverId, fields);
      changed ||= updated !== thread;
      return updated;
    });
    if (!changed) return data;
    return {
      ...typed,
      threads,
    };
  }
  if (Array.isArray(record.replies)) {
    if (kind !== "reply") return data;
    const typed = record as unknown as LearningRepliesCacheResponse;
    let changed = false;
    const replies = typed.replies.map((reply) => {
      const updated = updateEntity(reply as unknown as CacheEntity, clientId, serverId, fields);
      changed ||= updated !== reply;
      return updated;
    });
    if (!changed) return data;
    return {
      ...typed,
      replies,
    };
  }
  if (Array.isArray(record.notes)) {
    if (kind !== "note") return data;
    const typed = record as unknown as LearningNotesCacheResponse;
    let changed = false;
    const notes = typed.notes.map((note) => {
      const updated = updateEntity(note as unknown as CacheEntity, clientId, serverId, fields);
      changed ||= updated !== note;
      return updated;
    });
    if (!changed) return data;
    return {
      ...typed,
      notes,
    };
  }
  if ("id" in record && (typeof record.id === "string" || typeof record.id === "number")) {
    const collection = queryKey[1];
    if (
      (kind === "thread" && collection !== "thread") ||
      (kind === "reply" && collection !== "reply") ||
      (kind === "note" && collection !== "note")
    ) {
      return data;
    }
    return updateEntity(record as CacheEntity, clientId, serverId, fields);
  }
  return data;
}

export function updateOptimisticEditInCaches(
  queryClient: QueryClient,
  kind: OptimisticEditKind,
  clientId: string,
  serverId: string,
  fields: OptimisticEditFields,
): void {
  for (const [queryKey, data] of queryClient.getQueriesData({
    queryKey: learningInteractionKeys.all,
  })) {
    const next = updateCacheData(data, queryKey, kind, clientId, serverId, fields);
    if (next !== data) queryClient.setQueryData(queryKey, next);
  }
}
