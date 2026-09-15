import type { QueryClient } from "@tanstack/react-query";
import type {
  CreateLearningNoteRequest,
  CreateLearningReplyRequest,
  CreateLearningThreadRequest,
  LearningNote,
  LearningReply,
  LearningThread,
  LearningThreadAttachmentSummary,
} from "@veolms/contracts";
import { authStore } from "../../store/auth.store";
import {
  createOptimisticLearningThread,
  createOptimisticLearningReply,
  createOptimisticLearningNote,
  type LearningNoteEntity,
  type LearningReplyEntity,
  type LearningThreadEntity,
  type OptimisticThreadContext,
} from "./interaction-entities";
import { isClientEntityId } from "./interaction-entities";
import {
  insertOptimisticThreadInLessonCaches,
  reconcileOptimisticThreadInLessonCaches,
  removeOptimisticThreadFromLessonCaches,
  insertOptimisticReplyInCaches,
  migrateOptimisticRepliesToServerParent,
  reconcileOptimisticReplyInCaches,
  removeOptimisticReplyFromCaches,
  updateReplyCountInThreadCaches,
  insertOptimisticNoteInCaches,
  reconcileOptimisticNoteInCaches,
  removeOptimisticNoteFromCaches,
  type NoteCacheContext,
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

export interface ReplyCreationRecord {
  readonly clientId: string;
  readonly parentClientId: string;
  readonly parentServerId?: string;
  readonly payload: CreateLearningReplyRequest;
  readonly optimisticReply: LearningReplyEntity;
  readonly authGeneration: number;
  readonly userId?: string;
  readonly localSequence: number;
  readonly status: "pending" | "dispatching" | "confirmed" | "failed";
  readonly serverId?: string;
  readonly serverReply?: LearningReply;
  readonly dispatch: (
    parentServerId: string,
    payload: CreateLearningReplyRequest,
  ) => Promise<LearningReply>;
  readonly onFailure?: () => void;
}

export interface ThreadResolution {
  readonly clientId: string;
  readonly status: "confirmed" | "failed";
  readonly serverId?: string;
  readonly authGeneration: number;
}

export interface BeginReplyCreationArgs {
  queryClient?: QueryClient;
  parentClientId: string;
  parentServerId?: string;
  payload: CreateLearningReplyRequest;
  attachments?: readonly LearningThreadAttachmentSummary[];
  dispatch: ReplyCreationRecord["dispatch"];
  onFailure?: () => void;
}

export interface NoteCreationRecord {
  readonly clientId: string;
  readonly payload: CreateLearningNoteRequest;
  readonly context: NoteCacheContext;
  readonly optimisticNote: LearningNoteEntity;
  readonly authGeneration: number;
  readonly userId?: string;
  readonly localSequence: number;
  readonly status: "pending" | "confirmed" | "failed";
  readonly serverId?: string;
  readonly serverNote?: LearningNote;
  readonly serverNoteEntity?: LearningNoteEntity;
  readonly dispatch: (
    payload: CreateLearningNoteRequest,
  ) => Promise<LearningNote>;
  readonly onFailure?: () => void;
}

export interface BeginNoteCreationArgs {
  queryClient: QueryClient;
  context: NoteCacheContext;
  payload: CreateLearningNoteRequest;
  attachments?: LearningNoteEntity["attachments"];
  dispatch: NoteCreationRecord["dispatch"];
  onFailure?: () => void;
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

function freezeReplyPayload(
  payload: CreateLearningReplyRequest,
): CreateLearningReplyRequest {
  return Object.freeze({
    ...payload,
    ...(payload.attachmentIds
      ? { attachmentIds: Object.freeze([...payload.attachmentIds]) }
      : {}),
  }) as unknown as CreateLearningReplyRequest;
}

function freezeNotePayload(
  payload: CreateLearningNoteRequest,
): CreateLearningNoteRequest {
  return Object.freeze({
    ...payload,
    ...(payload.attachmentIds
      ? { attachmentIds: Object.freeze([...payload.attachmentIds]) }
      : {}),
    ...(payload.tags ? { tags: Object.freeze([...payload.tags]) } : {}),
  }) as unknown as CreateLearningNoteRequest;
}

export class InteractionCreationCoordinator {
  private readonly threadRecords = new Map<string, ThreadCreationRecord>();
  private readonly replyRecords = new Map<string, ReplyCreationRecord>();
  private readonly noteRecords = new Map<string, NoteCreationRecord>();
  private readonly threadResolutions = new Map<string, ThreadResolution>();
  private replySequence = 0;
  private noteSequence = 0;

  beginNoteCreation({
    queryClient,
    context,
    payload,
    attachments,
    dispatch,
    onFailure,
  }: BeginNoteCreationArgs): NoteCreationRecord {
    const currentUser = authStore.getState().user;
    const immutablePayload = freezeNotePayload(payload);
    const localSequence = ++this.noteSequence;
    const optimisticNote = createOptimisticLearningNote(immutablePayload, {
      localSequence,
      attachments,
      userId: currentUser?.id,
      displayName: currentUser?.displayName,
      username: currentUser?.username,
      avatarUrl: currentUser?.avatarDataUrl,
    });
    const record: NoteCreationRecord = {
      clientId: optimisticNote.clientId,
      payload: immutablePayload,
      context: { ...context },
      optimisticNote,
      authGeneration: authStore.getWriteGeneration(),
      userId: currentUser?.id,
      localSequence,
      status: "pending",
      dispatch,
      onFailure,
    };

    this.noteRecords.set(record.clientId, record);
    insertOptimisticNoteInCaches(
      queryClient,
      record.context,
      record.optimisticNote,
    );
    return record;
  }

  getActiveNoteRecords(
    query?: { courseId?: string; lessonId?: string },
  ): NoteCreationRecord[] {
    return [...this.noteRecords.values()]
      .filter(
        (record) =>
          record.status !== "failed" &&
          this.isCurrentAuth(record) &&
          (!query?.courseId || record.context.courseId === query.courseId) &&
          (!query?.lessonId || record.context.lessonId === query.lessonId),
      )
      .sort((left, right) => left.localSequence - right.localSequence);
  }

  confirmNote(
    queryClient: QueryClient,
    clientId: string,
    serverNote: LearningNote,
  ): boolean {
    const record = this.noteRecords.get(clientId);
    if (!record || record.status !== "pending") return false;
    if (!this.isCurrentAuth(record)) {
      this.noteRecords.delete(clientId);
      return false;
    }

    const serverNoteEntity: LearningNoteEntity = {
      ...serverNote,
      id: clientId,
      clientId,
      serverId: serverNote.id,
      creationStatus: "confirmed",
      localSequence: record.localSequence,
    };
    this.noteRecords.set(clientId, {
      ...record,
      status: "confirmed",
      serverId: serverNote.id,
      serverNote,
      serverNoteEntity,
    });
    reconcileOptimisticNoteInCaches(
      queryClient,
      record.context,
      clientId,
      serverNote,
      record.localSequence,
    );
    desiredStateCoordinator.resolvePendingNote(clientId, serverNote);
    return true;
  }

  failNote(queryClient: QueryClient, clientId: string): boolean {
    const record = this.noteRecords.get(clientId);
    if (!record || record.status !== "pending") return false;
    this.noteRecords.delete(clientId);
    if (!this.isCurrentAuth(record)) return false;
    desiredStateCoordinator.failPendingNote(clientId);
    removeOptimisticNoteFromCaches(queryClient, record.context, clientId);
    record.onFailure?.();
    return true;
  }

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

  getThreadResolution(clientId: string): ThreadResolution | undefined {
    const resolution = this.threadResolutions.get(clientId);
    return resolution?.authGeneration === authStore.getWriteGeneration()
      ? resolution
      : undefined;
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
    this.threadResolutions.set(clientId, {
      clientId,
      status: "confirmed",
      serverId: serverThread.id,
      authGeneration: authStore.getWriteGeneration(),
    });
    reconcileOptimisticThreadInLessonCaches(
      queryClient,
      record.context,
      clientId,
      serverThread,
    );
    migrateOptimisticRepliesToServerParent(
      queryClient,
      clientId,
      serverThread.id,
    );
    const dependentReplies = [...this.replyRecords.values()].filter(
      (reply) =>
        reply.parentClientId === clientId && reply.status === "pending",
    );
    for (const reply of dependentReplies) {
      this.replyRecords.set(reply.clientId, {
        ...reply,
        optimisticReply: {
          ...reply.optimisticReply,
          threadId: serverThread.id,
          parentServerId: serverThread.id,
        },
        parentServerId: serverThread.id,
        status: "pending",
      });
      this.startReplyDispatch(queryClient, reply.clientId, serverThread.id);
    }
    if (dependentReplies.length > 0) {
      updateReplyCountInThreadCaches(
        queryClient,
        serverThread.id,
        dependentReplies.length,
      );
    }
    desiredStateCoordinator.resolvePendingThread(clientId, serverThread);
    return true;
  }

  failThread(queryClient: QueryClient, clientId: string): boolean {
    const record = this.threadRecords.get(clientId);
    if (!record) return false;
    this.threadRecords.delete(clientId);

    if (!this.isCurrentAuth(record)) return false;
    this.threadResolutions.set(clientId, {
      clientId,
      status: "failed",
      authGeneration: authStore.getWriteGeneration(),
    });
    const dependentReplies = [...this.replyRecords.values()].filter(
      (reply) =>
        reply.parentClientId === clientId && reply.status !== "confirmed",
    );
    for (const reply of dependentReplies) {
      this.replyRecords.delete(reply.clientId);
      desiredStateCoordinator.failPendingReply(reply.clientId);
      removeOptimisticReplyFromCaches(
        queryClient,
        reply.parentServerId ?? reply.parentClientId,
        reply.clientId,
      );
    }
    removeOptimisticThreadFromLessonCaches(
      queryClient,
      record.context,
      clientId,
    );
    desiredStateCoordinator.failPendingThread(clientId);
    return true;
  }

  beginReplyCreation({
    queryClient,
    parentClientId,
    parentServerId,
    payload,
    attachments,
    dispatch,
    onFailure,
  }: BeginReplyCreationArgs): ReplyCreationRecord {
    const currentUser = authStore.getState().user;
    const parentResolution = this.getThreadResolution(parentClientId);
    if (parentResolution?.status === "failed") {
      return this.createDiscardedReplyRecord(
        currentUser,
        parentClientId,
        parentServerId,
        payload,
        attachments,
        dispatch,
        onFailure,
      );
    }

    const resolvedParentServerId =
      parentResolution?.status === "confirmed"
        ? parentResolution.serverId
        : parentServerId && !isClientEntityId(parentServerId)
          ? parentServerId
          : undefined;
    if (
      !parentResolution &&
      resolvedParentServerId &&
      !this.threadResolutions.has(parentClientId)
    ) {
      this.threadResolutions.set(parentClientId, {
        clientId: parentClientId,
        status: "confirmed",
        serverId: resolvedParentServerId,
        authGeneration: authStore.getWriteGeneration(),
      });
    }
    const immutablePayload = freezeReplyPayload(payload);
    const localSequence = ++this.replySequence;
    const optimisticReply = createOptimisticLearningReply(immutablePayload, {
      parentClientId,
      parentServerId: resolvedParentServerId,
      localSequence,
      attachments,
      userId: currentUser?.id,
      displayName: currentUser?.displayName,
      username: currentUser?.username,
      avatarUrl: currentUser?.avatarDataUrl,
      role: getAuthorRole(currentUser?.roles),
    });
    const record: ReplyCreationRecord = {
      clientId: optimisticReply.clientId,
      parentClientId,
      parentServerId,
      payload: immutablePayload,
      optimisticReply,
      authGeneration: authStore.getWriteGeneration(),
      userId: currentUser?.id,
      localSequence,
      status: "pending",
      dispatch,
      onFailure,
    };
    this.replyRecords.set(record.clientId, record);
    if (queryClient) {
      insertOptimisticReplyInCaches(
        queryClient,
        resolvedParentServerId ?? parentClientId,
        optimisticReply,
      );
    }
    if (resolvedParentServerId) {
      this.startReplyDispatch(
        queryClient,
        record.clientId,
        resolvedParentServerId,
      );
    }
    return record;
  }

  private createDiscardedReplyRecord(
    currentUser: ReturnType<typeof authStore.getState>['user'],
    parentClientId: string,
    parentServerId: string | undefined,
    payload: CreateLearningReplyRequest,
    attachments: readonly LearningThreadAttachmentSummary[] | undefined,
    dispatch: ReplyCreationRecord["dispatch"],
    onFailure: (() => void) | undefined,
  ): ReplyCreationRecord {
    const immutablePayload = freezeReplyPayload(payload);
    const optimisticReply = createOptimisticLearningReply(immutablePayload, {
      parentClientId,
      parentServerId,
      localSequence: ++this.replySequence,
      attachments,
      userId: currentUser?.id,
      displayName: currentUser?.displayName,
      username: currentUser?.username,
      avatarUrl: currentUser?.avatarDataUrl,
      role: getAuthorRole(currentUser?.roles),
    });
    desiredStateCoordinator.failPendingReply(optimisticReply.clientId);
    return {
      clientId: optimisticReply.clientId,
      parentClientId,
      parentServerId,
      payload: immutablePayload,
      optimisticReply,
      authGeneration: authStore.getWriteGeneration(),
      userId: currentUser?.id,
      localSequence: optimisticReply.localSequence,
      status: "failed",
      dispatch,
      onFailure,
    };
  }

  getReplyRecord(clientId: string): ReplyCreationRecord | undefined {
    return this.replyRecords.get(clientId);
  }

  getPendingReplies(parentClientId: string): ReplyCreationRecord[] {
    return [...this.replyRecords.values()]
      .filter(
        (reply) =>
          reply.parentClientId === parentClientId &&
          reply.status !== "confirmed" &&
          reply.status !== "failed",
      )
      .sort((left, right) => left.localSequence - right.localSequence);
  }

  getActiveReplyRecords(parentServerId: string): ReplyCreationRecord[] {
    return [...this.replyRecords.values()]
      .filter(
        (reply) =>
          reply.parentServerId === parentServerId && this.isCurrentAuth(reply),
      )
      .sort((left, right) => left.localSequence - right.localSequence);
  }

  confirmReply(
    queryClient: QueryClient | undefined,
    clientId: string,
    serverReply: LearningReply,
  ): boolean {
    const record = this.replyRecords.get(clientId);
    if (!record) return false;
    if (record.status !== "dispatching") return false;
    if (!this.isCurrentAuth(record) || !record.parentServerId) {
      this.replyRecords.delete(clientId);
      return false;
    }
    this.replyRecords.set(clientId, {
      ...record,
      status: "confirmed",
      serverId: serverReply.id,
      serverReply,
    });
    desiredStateCoordinator.resolvePendingReply(clientId, serverReply);
    if (queryClient) {
      reconcileOptimisticReplyInCaches(
        queryClient,
        record.parentServerId,
        clientId,
        serverReply,
      );
    }
    return true;
  }

  failReply(queryClient: QueryClient | undefined, clientId: string): boolean {
    const record = this.replyRecords.get(clientId);
    if (!record) return false;
    if (record.status === "confirmed" || record.status === "failed") {
      return false;
    }
    this.replyRecords.delete(clientId);
    if (!this.isCurrentAuth(record)) return false;
    desiredStateCoordinator.failPendingReply(clientId);
    if (queryClient) {
      removeOptimisticReplyFromCaches(
        queryClient,
        record.parentServerId ?? record.parentClientId,
        clientId,
      );
    }
    record.onFailure?.();
    return true;
  }

  private startReplyDispatch(
    queryClient: QueryClient | undefined,
    clientId: string,
    parentServerId: string,
  ): void {
    const record = this.replyRecords.get(clientId);
    if (!record || record.status !== "pending" || !this.isCurrentAuth(record)) {
      return;
    }
    this.replyRecords.set(clientId, {
      ...record,
      parentServerId,
      status: "dispatching",
    });
    void this.dispatchReply(queryClient, clientId, parentServerId);
  }

  private async dispatchReply(
    queryClient: QueryClient | undefined,
    clientId: string,
    parentServerId: string,
  ): Promise<void> {
    const record = this.replyRecords.get(clientId);
    if (
      !record ||
      record.status !== "dispatching" ||
      !this.isCurrentAuth(record)
    )
      return;
    try {
      const serverReply = await record.dispatch(parentServerId, record.payload);
      this.confirmReply(queryClient, clientId, serverReply);
    } catch {
      this.failReply(queryClient, clientId);
    }
  }

  reset(): void {
    this.threadRecords.clear();
    this.replyRecords.clear();
    this.noteRecords.clear();
    this.threadResolutions.clear();
  }

  private isCurrentAuth(
    record: Pick<
      ThreadCreationRecord | ReplyCreationRecord | NoteCreationRecord,
      "authGeneration" | "userId"
    >,
  ): boolean {
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
