import type { QueryClient } from "@tanstack/react-query";
import type {
  CreateLearningThreadRequest,
  LearningThread,
} from "@veolms/contracts";
import { authStore } from "../../store/auth.store";
import {
  createOptimisticLearningThread,
  type LearningThreadEntity,
  type OptimisticThreadContext,
} from "./interaction-entities";
import {
  insertOptimisticThreadInLessonCaches,
  reconcileOptimisticThreadInLessonCaches,
  removeOptimisticThreadFromLessonCaches,
  type LessonThreadCacheContext,
} from "./creation-cache-updaters";
import { desiredStateCoordinator } from "./desired-state-coordinator";

export interface ThreadCreationRecord {
  readonly clientId: string;
  readonly payload: CreateLearningThreadRequest;
  readonly context: LessonThreadCacheContext;
  readonly authGeneration: number;
  readonly userId?: string;
  readonly optimisticThread: LearningThreadEntity;
}

export interface BeginThreadCreationArgs {
  queryClient: QueryClient;
  context: LessonThreadCacheContext;
  payload: CreateLearningThreadRequest;
  author?: OptimisticThreadContext;
}

function freezeThreadPayload(
  payload: CreateLearningThreadRequest,
): CreateLearningThreadRequest {
  const frozen = {
    ...payload,
    ...(payload.attachmentIds
      ? { attachmentIds: Object.freeze([...payload.attachmentIds]) }
      : {}),
    ...(payload.tags ? { tags: Object.freeze([...payload.tags]) } : {}),
  };
  return Object.freeze(frozen) as unknown as CreateLearningThreadRequest;
}

export class InteractionCreationCoordinator {
  private readonly threadRecords = new Map<string, ThreadCreationRecord>();

  beginThreadCreation({
    queryClient,
    context,
    payload,
    author,
  }: BeginThreadCreationArgs): ThreadCreationRecord {
    const currentUser = authStore.getState().user;
    const immutablePayload = freezeThreadPayload(payload);
    const optimisticThread = createOptimisticLearningThread(immutablePayload, {
      userId: currentUser?.id,
      displayName: currentUser?.displayName,
      username: currentUser?.username,
      avatarUrl: currentUser?.avatarDataUrl,
      role: getAuthorRole(currentUser?.roles),
      ...author,
    });
    const record: ThreadCreationRecord = {
      clientId: optimisticThread.clientId,
      payload: immutablePayload,
      context: { ...context },
      authGeneration: authStore.getWriteGeneration(),
      userId: currentUser?.id,
      optimisticThread,
    };

    this.threadRecords.set(record.clientId, record);
    insertOptimisticThreadInLessonCaches(
      queryClient,
      record.context,
      record.optimisticThread,
    );
    return record;
  }

  hasPendingClientId(clientId: string | undefined): boolean {
    return Boolean(clientId && this.threadRecords.has(clientId));
  }

  getThreadRecord(clientId: string): ThreadCreationRecord | undefined {
    return this.threadRecords.get(clientId);
  }

  confirmThread(
    queryClient: QueryClient,
    clientId: string,
    serverThread: LearningThread,
  ): boolean {
    const record = this.threadRecords.get(clientId);
    if (!record) return false;
    this.threadRecords.delete(clientId);

    if (!this.isCurrentAuth(record)) return false;
    reconcileOptimisticThreadInLessonCaches(
      queryClient,
      record.context,
      clientId,
      serverThread,
    );
    desiredStateCoordinator.resolvePendingThread(clientId, serverThread);
    return true;
  }

  failThread(queryClient: QueryClient, clientId: string): boolean {
    const record = this.threadRecords.get(clientId);
    if (!record) return false;
    this.threadRecords.delete(clientId);

    if (!this.isCurrentAuth(record)) return false;
    removeOptimisticThreadFromLessonCaches(
      queryClient,
      record.context,
      clientId,
    );
    desiredStateCoordinator.failPendingThread(clientId);
    return true;
  }

  reset(): void {
    this.threadRecords.clear();
  }

  private isCurrentAuth(record: ThreadCreationRecord): boolean {
    const currentUserId = authStore.getState().user?.id;
    return (
      record.authGeneration === authStore.getWriteGeneration() &&
      record.userId === currentUserId
    );
  }
}

function getAuthorRole(
  roles: readonly string[] | undefined,
): "Student" | "Instructor" | "Admin" {
  const normalized = roles?.map((role) => role.toLowerCase()) ?? [];
  if (normalized.includes("admin")) return "Admin";
  if (
    normalized.includes("instructor") ||
    normalized.includes("creator") ||
    normalized.includes("teacher")
  ) {
    return "Instructor";
  }
  return "Student";
}

export const interactionCreationCoordinator =
  new InteractionCreationCoordinator();
