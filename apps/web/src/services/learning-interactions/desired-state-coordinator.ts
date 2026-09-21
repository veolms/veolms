import type { QueryClient } from "@tanstack/react-query";
import type {
  LearningNote,
  LearningReply,
  LearningThread,
} from "@veolms/contracts";
import { queryClient as defaultQueryClient } from "../../lib/query-client";
import { learningInteractionsService } from "./learning-interactions.service";
import {
  updateAcceptedAnswerInCache,
  updateNoteLikeInCache,
  updateReplyLikeInCache,
  updateThreadBookmarkInCache,
  updateThreadFollowInCache,
  updateThreadLikeInCache,
  updateThreadLockInCache,
} from "./cache-updaters";
import { isClientEntityId } from "./interaction-entities";

export type OptimisticSyncStatus = "pending" | "confirmed" | "failed";

export interface OptimisticEntityMeta {
  clientId: string;
  serverId?: string;
  status: OptimisticSyncStatus;
  intentVersion: number;
  lastSyncedAt?: number;
  errorMessage?: string;
}

export type TargetLikeType = "thread" | "reply" | "note";

export interface SetLikedOptions {
  targetType: TargetLikeType;
  targetId: string;
  /** Transport identity when targetId is the stable client identity. */
  serverId?: string;
  desiredLiked: boolean;
  currentBaseline?: boolean;
  lessonContext?: { courseId: string; lessonId: string };
  threadId?: string; // Required when targetType === "reply"
  debounceMs?: number; // Optional micro-delay before network dispatch (default: 30ms)
  onFailure?: (error: unknown) => void;
  queryClient?: QueryClient;
  /** Keeps a client-keyed entity intent local until creation resolves. */
  pendingTarget?: boolean;
}

interface EntityLikeState {
  targetType: TargetLikeType;
  targetId: string;
  serverId?: string;
  serverBaseline: boolean;
  desiredState: boolean;
  intentRevision: number;
  inFlightState: boolean | null;
  abortController: AbortController | null;
  lessonContext?: { courseId: string; lessonId: string };
  threadId?: string;
  dispatchTimer: ReturnType<typeof setTimeout> | null;
  onFailure?: (error: unknown) => void;
  queryClient: QueryClient;
}

export type BooleanTargetType = "bookmark" | "follow" | "lock";

export interface SetBookmarkedOptions {
  threadId: string;
  desiredBookmarked: boolean;
  currentBaseline?: boolean;
  lessonContext?: { courseId: string; lessonId: string };
  debounceMs?: number;
  onFailure?: (error: unknown) => void;
  onSuccess?: (bookmarked: boolean) => void;
  queryClient?: QueryClient;
  pendingTarget?: boolean;
}

export interface SetFollowedOptions {
  threadId: string;
  desiredFollowed: boolean;
  currentBaseline?: boolean;
  lessonContext?: { courseId: string; lessonId: string };
  debounceMs?: number;
  onFailure?: (error: unknown) => void;
  onSuccess?: (followed: boolean) => void;
  queryClient?: QueryClient;
  pendingTarget?: boolean;
}

export interface SetLockedOptions {
  threadId: string;
  desiredLocked: boolean;
  currentBaseline?: boolean;
  lessonContext?: { courseId: string; lessonId: string };
  debounceMs?: number;
  onFailure?: (error: unknown) => void;
  queryClient?: QueryClient;
}

interface ThreadBooleanState {
  targetType: BooleanTargetType;
  threadId: string;
  serverId?: string;
  serverBaseline: boolean;
  desiredState: boolean;
  intentRevision: number;
  inFlightState: boolean | null;
  abortController: AbortController | null;
  lessonContext?: { courseId: string; lessonId: string };
  dispatchTimer: ReturnType<typeof setTimeout> | null;
  onFailure?: (error: unknown) => void;
  onSuccess?: (value: boolean) => void;
  queryClient: QueryClient;
}

export interface SetAcceptedAnswerOptions {
  threadId: string;
  desiredAcceptedReplyId: string | null;
  currentBaselineReplyId?: string | null;
  lessonContext?: { courseId: string; lessonId: string };
  debounceMs?: number;
  onFailure?: (error: unknown) => void;
  queryClient?: QueryClient;
}

interface ThreadAcceptedAnswerState {
  threadId: string;
  serverBaselineAcceptedReplyId: string | null;
  desiredAcceptedReplyId: string | null;
  intentRevision: number;
  inFlightTargetReplyId: string | null;
  inFlightAccepted: boolean | null;
  abortController: AbortController | null;
  lessonContext?: { courseId: string; lessonId: string };
  dispatchTimer: ReturnType<typeof setTimeout> | null;
  onFailure?: (error: unknown) => void;
  queryClient: QueryClient;
}

export interface ReplyResolution {
  readonly clientId: string;
  readonly status: "confirmed" | "failed";
  readonly serverId?: string;
  readonly threadId?: string;
  readonly isLiked?: boolean;
  readonly generation: number;
}

export interface NoteResolution {
  readonly clientId: string;
  readonly status: "confirmed" | "failed";
  readonly serverId?: string;
  readonly isLiked?: boolean;
  readonly generation: number;
}

export class DesiredStateCoordinator {
  private generation = 1;
  private entries = new Map<string, EntityLikeState>();
  private booleanEntries = new Map<string, ThreadBooleanState>();
  private acceptAnswerEntries = new Map<string, ThreadAcceptedAnswerState>();
  private replyResolutions = new Map<string, ReplyResolution>();
  private noteResolutions = new Map<string, NoteResolution>();
  private queryClient: QueryClient;

  constructor(queryClient: QueryClient = defaultQueryClient) {
    this.queryClient = queryClient;
  }

  setQueryClient(queryClient: QueryClient): void {
    this.queryClient = queryClient;
  }

  /**
   * Current authentication / lifecycle generation.
   * Incremented whenever reset() is called.
   */
  getGeneration(): number {
    return this.generation;
  }

  /** Drops local interaction intent for an entity that was deleted. */
  clearEntity(
    targetType: "thread" | "reply" | "note",
    clientId: string,
    serverId?: string,
    threadId?: string,
  ): void {
    for (const [key, state] of this.entries) {
      if (
        state.targetType !== targetType ||
        (state.targetId !== clientId &&
          state.targetId !== serverId &&
          state.serverId !== serverId)
      ) {
        continue;
      }
      this.cancelLikeState(state);
      this.entries.delete(key);
    }

    if (targetType === "thread") {
      for (const [key, state] of this.booleanEntries) {
        if (
          state.threadId !== clientId &&
          state.threadId !== serverId &&
          state.serverId !== serverId
        ) {
          continue;
        }
        this.cancelBooleanState(state);
        this.booleanEntries.delete(key);
      }
      for (const [key, state] of this.acceptAnswerEntries) {
        if (state.threadId === clientId || state.threadId === serverId) {
          this.cancelAcceptedAnswerState(state);
          this.acceptAnswerEntries.delete(key);
        }
      }
    }

    if (targetType === "reply" && threadId) {
      const accepted = this.acceptAnswerEntries.get(
        this.acceptAnswerKey(threadId),
      );
      if (accepted) {
        this.cancelAcceptedAnswerState(accepted);
        this.acceptAnswerEntries.delete(this.acceptAnswerKey(threadId));
      }
    }
  }

  /**
   * Resets coordinator state on logout or account switch.
   * Increments generation so any late-settling responses from the previous
   * account are immediately ignored and become completely inert.
   */
  reset(): void {
    this.generation += 1;

    for (const entry of this.entries.values()) {
      if (entry.dispatchTimer !== null) {
        clearTimeout(entry.dispatchTimer);
        entry.dispatchTimer = null;
      }
      if (entry.abortController) {
        try {
          entry.abortController.abort();
        } catch {
          // ignore abort errors
        }
        entry.abortController = null;
      }
    }
    this.entries.clear();

    for (const entry of this.booleanEntries.values()) {
      if (entry.dispatchTimer !== null) {
        clearTimeout(entry.dispatchTimer);
        entry.dispatchTimer = null;
      }
      if (entry.abortController) {
        try {
          entry.abortController.abort();
        } catch {
          // ignore abort errors
        }
        entry.abortController = null;
      }
    }
    this.booleanEntries.clear();

    for (const entry of this.acceptAnswerEntries.values()) {
      if (entry.dispatchTimer !== null) {
        clearTimeout(entry.dispatchTimer);
        entry.dispatchTimer = null;
      }
      if (entry.abortController) {
        try {
          entry.abortController.abort();
        } catch {
          // ignore abort errors
        }
        entry.abortController = null;
      }
    }
    this.acceptAnswerEntries.clear();
    this.replyResolutions.clear();
    this.noteResolutions.clear();
  }

  private cancelLikeState(entry: EntityLikeState): void {
    if (entry.dispatchTimer !== null) clearTimeout(entry.dispatchTimer);
    if (entry.abortController) {
      try {
        entry.abortController.abort();
      } catch {
        // ignore abort errors
      }
    }
    entry.dispatchTimer = null;
    entry.abortController = null;
  }

  private cancelBooleanState(entry: ThreadBooleanState): void {
    if (entry.dispatchTimer !== null) clearTimeout(entry.dispatchTimer);
    if (entry.abortController) {
      try {
        entry.abortController.abort();
      } catch {
        // ignore abort errors
      }
    }
    entry.dispatchTimer = null;
    entry.abortController = null;
  }

  private cancelAcceptedAnswerState(entry: ThreadAcceptedAnswerState): void {
    if (entry.dispatchTimer !== null) clearTimeout(entry.dispatchTimer);
    if (entry.abortController) {
      try {
        entry.abortController.abort();
      } catch {
        // ignore abort errors
      }
    }
    entry.dispatchTimer = null;
    entry.abortController = null;
  }

  /**
   * Returns current internal like state for a target (useful for tests and inspection).
   */
  getState(
    targetType: TargetLikeType,
    targetId: string,
  ): Readonly<EntityLikeState> | undefined {
    return this.entries.get(this.likeKey(targetType, targetId));
  }

  /**
   * Returns current internal bookmark state for a thread.
   */
  getBookmarkState(threadId: string): Readonly<ThreadBooleanState> | undefined {
    return this.booleanEntries.get(this.booleanKey("bookmark", threadId));
  }

  /**
   * Returns current internal follow state for a thread.
   */
  getFollowState(threadId: string): Readonly<ThreadBooleanState> | undefined {
    return this.booleanEntries.get(this.booleanKey("follow", threadId));
  }

  /**
   * Returns current internal lock state for a thread.
   */
  getLockState(threadId: string): Readonly<ThreadBooleanState> | undefined {
    return this.booleanEntries.get(this.booleanKey("lock", threadId));
  }

  /**
   * Returns current internal accept answer state for a thread.
   */
  getAcceptedAnswerState(
    threadId: string,
  ): Readonly<ThreadAcceptedAnswerState> | undefined {
    return this.acceptAnswerEntries.get(this.acceptAnswerKey(threadId));
  }

  /** Returns the latest locally desired like value for either entity identity. */
  getLikeProjection(
    targetType: TargetLikeType,
    clientId: string,
    serverId?: string,
  ): boolean | undefined {
    const directState = this.entries.get(this.likeKey(targetType, clientId));
    if (directState) return directState.desiredState;

    if (serverId) {
      const serverState = this.entries.get(this.likeKey(targetType, serverId));
      if (serverState) return serverState.desiredState;
    }

    for (const state of this.entries.values()) {
      if (
        state.targetType === targetType &&
        (state.targetId === clientId || state.serverId === serverId)
      ) {
        return state.desiredState;
      }
    }

    return undefined;
  }

  getReplyResolution(clientId: string): ReplyResolution | undefined {
    const resolution = this.replyResolutions.get(clientId);
    return resolution?.generation === this.generation ? resolution : undefined;
  }

  private setReplyResolution(
    resolution: Omit<ReplyResolution, "generation">,
  ): void {
    this.replyResolutions.set(resolution.clientId, {
      ...resolution,
      generation: this.generation,
    });
  }

  getNoteResolution(clientId: string): NoteResolution | undefined {
    const resolution = this.noteResolutions.get(clientId);
    return resolution?.generation === this.generation ? resolution : undefined;
  }

  private setNoteResolution(
    resolution: Omit<NoteResolution, "generation">,
  ): void {
    this.noteResolutions.set(resolution.clientId, {
      ...resolution,
      generation: this.generation,
    });
  }

  /** Resolves client-keyed pending thread intents after creation reconciliation. */
  resolvePendingThread(clientId: string, serverThread: LearningThread): void {
    const like = this.entries.get(this.likeKey("thread", clientId));
    if (like) {
      like.serverId = serverThread.id;
      like.serverBaseline = Boolean(serverThread.isLiked);
      this.applyLikeCacheUpdate(
        "thread",
        clientId,
        like.desiredState,
        like.queryClient,
        like.lessonContext,
      );
      this.scheduleLikeConvergence(like, 0);
    }
    this.resolvePendingBoolean(
      "bookmark",
      clientId,
      serverThread.id,
      Boolean(serverThread.isBookmarked),
    );
    this.resolvePendingBoolean(
      "follow",
      clientId,
      serverThread.id,
      Boolean(serverThread.isFollowing),
    );
  }

  /** Resolves a client-keyed pending reply Like after reply creation. */
  resolvePendingReply(clientId: string, serverReply: LearningReply): void {
    this.setReplyResolution({
      clientId,
      status: "confirmed",
      serverId: serverReply.id,
      threadId: serverReply.threadId,
      isLiked: Boolean(serverReply.isLiked),
    });
    const state = this.entries.get(this.likeKey("reply", clientId));
    if (!state) return;
    state.serverId = serverReply.id;
    state.threadId = serverReply.threadId;
    state.serverBaseline = Boolean(serverReply.isLiked);
    this.applyLikeCacheUpdate(
      "reply",
      clientId,
      state.desiredState,
      state.queryClient,
      state.lessonContext,
      state.threadId,
    );
    this.scheduleLikeConvergence(state, 0);
  }

  /** Resolves a client-keyed pending Note Like after Note creation. */
  resolvePendingNote(clientId: string, serverNote: LearningNote): void {
    this.setNoteResolution({
      clientId,
      status: "confirmed",
      serverId: serverNote.id,
      isLiked: Boolean(serverNote.isLiked),
    });
    const state = this.entries.get(this.likeKey("note", clientId));
    if (!state) return;
    state.serverId = serverNote.id;
    state.serverBaseline = Boolean(serverNote.isLiked);
    this.applyLikeCacheUpdate(
      "note",
      clientId,
      state.desiredState,
      state.queryClient,
      state.lessonContext,
      undefined,
      state.serverId,
    );
    this.scheduleLikeConvergence(state, 0);
  }

  /** Drops a pending reply Like when reply creation fails or its parent fails. */
  failPendingReply(clientId: string): void {
    this.setReplyResolution({ clientId, status: "failed" });
    this.dropLikeState(this.likeKey("reply", clientId));
  }

  /** Drops a pending Note Like when Note creation fails. */
  failPendingNote(clientId: string): void {
    this.setNoteResolution({ clientId, status: "failed" });
    this.dropLikeState(this.likeKey("note", clientId));
  }

  failPendingThread(clientId: string): void {
    this.dropLikeState(this.likeKey("thread", clientId));
    this.dropBooleanState(this.booleanKey("bookmark", clientId));
    this.dropBooleanState(this.booleanKey("follow", clientId));
  }

  private resolvePendingBoolean(
    targetType: "bookmark" | "follow",
    clientId: string,
    serverId: string,
    baseline: boolean,
  ): void {
    const state = this.booleanEntries.get(
      this.booleanKey(targetType, clientId),
    );
    if (!state) return;
    state.serverId = serverId;
    state.serverBaseline = baseline;
    this.applyBooleanCacheUpdate(
      targetType,
      clientId,
      state.desiredState,
      state.queryClient,
      state.lessonContext,
    );
    this.scheduleBooleanConvergence(state, 0);
  }

  private dropLikeState(key: string): void {
    const state = this.entries.get(key);
    if (state?.dispatchTimer !== null && state?.dispatchTimer !== undefined) {
      clearTimeout(state.dispatchTimer);
    }
    this.entries.delete(key);
  }

  private dropBooleanState(key: string): void {
    const state = this.booleanEntries.get(key);
    if (state?.dispatchTimer !== null && state?.dispatchTimer !== undefined) {
      clearTimeout(state.dispatchTimer);
    }
    this.booleanEntries.delete(key);
  }

  private isLikeStateCurrent(state: EntityLikeState): boolean {
    return (
      this.entries.get(this.likeKey(state.targetType, state.targetId)) === state
    );
  }

  private isBooleanStateCurrent(state: ThreadBooleanState): boolean {
    return (
      this.booleanEntries.get(
        this.booleanKey(state.targetType, state.threadId),
      ) === state
    );
  }

  private isAcceptedAnswerStateCurrent(
    state: ThreadAcceptedAnswerState,
  ): boolean {
    return (
      this.acceptAnswerEntries.get(this.acceptAnswerKey(state.threadId)) ===
      state
    );
  }

  // ==========================================
  // LIKES (Thread, Reply, Note)
  // ==========================================

  /**
   * Sets the user's desired like state for a thread, reply, or note.
   * 1. Updates TanStack Query cache immediately (0ms UI latency).
   * 2. Converges to desired state via minimal compensating API requests.
   */
  setLiked({
    targetType,
    targetId,
    serverId,
    desiredLiked,
    currentBaseline,
    lessonContext,
    threadId,
    debounceMs = 30,
    onFailure,
    queryClient,
    pendingTarget,
  }: SetLikedOptions): void {
    const replyResolution =
      targetType === "reply" ? this.getReplyResolution(targetId) : undefined;
    const noteResolution =
      targetType === "note" ? this.getNoteResolution(targetId) : undefined;
    const creationResolution = replyResolution ?? noteResolution;
    if (creationResolution?.status === "failed") return;
    const resolvedServerId =
      creationResolution?.status === "confirmed"
        ? creationResolution.serverId
        : undefined;
    const key = this.likeKey(targetType, targetId);
    let state = this.entries.get(key);
    const activeClient = queryClient ?? this.queryClient;

    if (!state) {
      const baseline =
        creationResolution?.status === "confirmed"
          ? Boolean(creationResolution.isLiked)
          : (currentBaseline ?? !desiredLiked);
      state = {
        targetType,
        targetId,
        serverId: pendingTarget
          ? resolvedServerId
          : (serverId ?? resolvedServerId ?? targetId),
        serverBaseline: baseline,
        desiredState: desiredLiked,
        intentRevision: 1,
        inFlightState: null,
        abortController: null,
        lessonContext,
        threadId,
        dispatchTimer: null,
        onFailure,
        queryClient: activeClient,
      };
      this.entries.set(key, state);
    } else {
      state.desiredState = desiredLiked;
      state.intentRevision += 1;
      if (serverId) state.serverId = serverId;
      if (resolvedServerId && !state.serverId) {
        state.serverId = resolvedServerId;
        state.serverBaseline = Boolean(creationResolution?.isLiked);
      }
      state.queryClient = activeClient;
      if (lessonContext) state.lessonContext = lessonContext;
      if (threadId) state.threadId = threadId;
      if (onFailure) state.onFailure = onFailure;
    }

    // 1. Immediately apply transition to TanStack Query cache
    this.applyLikeCacheUpdate(
      targetType,
      targetId,
      desiredLiked,
      state.queryClient,
      state.lessonContext,
      state.threadId,
      state.serverId,
    );

    // 2. Schedule convergence dispatch
    this.scheduleLikeConvergence(state, debounceMs);
  }

  private likeKey(targetType: TargetLikeType, targetId: string): string {
    return `${targetType}:${targetId}`;
  }

  private applyLikeCacheUpdate(
    targetType: TargetLikeType,
    targetId: string,
    desiredLiked: boolean,
    client: QueryClient,
    lessonContext?: { courseId: string; lessonId: string },
    threadId?: string,
    serverId?: string,
  ): void {
    if (targetType === "thread") {
      updateThreadLikeInCache(client, targetId, desiredLiked, lessonContext);
    } else if (targetType === "reply") {
      if (threadId) {
        updateReplyLikeInCache(client, threadId, targetId, desiredLiked);
      }
    } else if (targetType === "note") {
      updateNoteLikeInCache(client, targetId, desiredLiked, serverId);
    }
  }

  private scheduleLikeConvergence(
    state: EntityLikeState,
    delayMs: number,
  ): void {
    if (state.dispatchTimer !== null) {
      clearTimeout(state.dispatchTimer);
      state.dispatchTimer = null;
    }

    const capturedGen = this.generation;

    if (delayMs <= 0) {
      this.processLikeConvergence(state, capturedGen);
    } else {
      state.dispatchTimer = setTimeout(() => {
        state.dispatchTimer = null;
        this.processLikeConvergence(state, capturedGen);
      }, delayMs);
    }
  }

  private processLikeConvergence(
    state: EntityLikeState,
    capturedGen: number,
  ): void {
    if (this.generation !== capturedGen || !this.isLikeStateCurrent(state))
      return;
    if (!state.serverId) return;
    if (state.inFlightState !== null) return;
    if (state.desiredState === state.serverBaseline) return;

    const targetState = state.desiredState;
    const requestRevision = state.intentRevision;
    state.inFlightState = targetState;

    const controller = new AbortController();
    state.abortController = controller;

    learningInteractionsService
      .toggleLike({
        targetType: state.targetType,
        targetId: state.serverId,
      })
      .then((response) => {
        if (this.generation !== capturedGen || !this.isLikeStateCurrent(state))
          return;

        state.abortController = null;
        state.inFlightState = null;

        const confirmedLiked =
          typeof response?.liked === "boolean" ? response.liked : targetState;
        state.serverBaseline = confirmedLiked;

        if (state.desiredState !== state.serverBaseline) {
          this.processLikeConvergence(state, capturedGen);
        }
      })
      .catch((error) => {
        if (this.generation !== capturedGen || !this.isLikeStateCurrent(state))
          return;
        if (controller.signal.aborted) return;

        state.abortController = null;
        state.inFlightState = null;

        const hasNewerIntent = state.intentRevision !== requestRevision;
        if (hasNewerIntent) {
          // The failed request did not change the server baseline. Keep the
          // latest optimistic intent and continue from that baseline.
          this.applyLikeCacheUpdate(
            state.targetType,
            state.targetId,
            state.desiredState,
            state.queryClient,
            state.lessonContext,
            state.threadId,
            state.serverId,
          );
          if (state.desiredState !== state.serverBaseline) {
            this.processLikeConvergence(state, capturedGen);
          }
          return;
        }

        const rollbackLiked = state.serverBaseline;
        state.desiredState = rollbackLiked;
        this.applyLikeCacheUpdate(
          state.targetType,
          state.targetId,
          rollbackLiked,
          state.queryClient,
          state.lessonContext,
          state.threadId,
          state.serverId,
        );

        if (state.onFailure) {
          state.onFailure(error);
        }
      });
  }

  // ==========================================
  // BOOLEAN ACTIONS (Bookmark, Follow, Lock)
  // ==========================================

  /**
   * Sets the user's desired bookmark state for a thread.
   */
  setBookmarked({
    threadId,
    desiredBookmarked,
    currentBaseline,
    lessonContext,
    debounceMs = 30,
    onFailure,
    onSuccess,
    queryClient,
    pendingTarget,
  }: SetBookmarkedOptions): void {
    this.setBooleanDesiredState({
      targetType: "bookmark",
      threadId,
      pendingTarget,
      desiredState: desiredBookmarked,
      currentBaseline,
      lessonContext,
      debounceMs,
      onFailure,
      onSuccess,
      queryClient,
    });
  }

  /**
   * Sets the user's desired follow state for a thread.
   */
  setFollowed({
    threadId,
    desiredFollowed,
    currentBaseline,
    lessonContext,
    debounceMs = 30,
    onFailure,
    onSuccess,
    queryClient,
    pendingTarget,
  }: SetFollowedOptions): void {
    this.setBooleanDesiredState({
      targetType: "follow",
      threadId,
      pendingTarget,
      desiredState: desiredFollowed,
      currentBaseline,
      lessonContext,
      debounceMs,
      onFailure,
      onSuccess,
      queryClient,
    });
  }

  /**
   * Sets the user's desired lock state for a thread.
   */
  setLocked({
    threadId,
    desiredLocked,
    currentBaseline,
    lessonContext,
    debounceMs = 30,
    onFailure,
    queryClient,
  }: SetLockedOptions): void {
    this.setBooleanDesiredState({
      targetType: "lock",
      threadId,
      desiredState: desiredLocked,
      currentBaseline,
      lessonContext,
      debounceMs,
      onFailure,
      queryClient,
    });
  }

  private booleanKey(targetType: BooleanTargetType, threadId: string): string {
    return `${targetType}:${threadId}`;
  }

  private setBooleanDesiredState({
    targetType,
    threadId,
    desiredState,
    currentBaseline,
    lessonContext,
    debounceMs = 30,
    onFailure,
    onSuccess,
    queryClient,
    pendingTarget,
  }: {
    targetType: BooleanTargetType;
    threadId: string;
    desiredState: boolean;
    currentBaseline?: boolean;
    lessonContext?: { courseId: string; lessonId: string };
    debounceMs?: number;
    onFailure?: (error: unknown) => void;
    onSuccess?: (value: boolean) => void;
    queryClient?: QueryClient;
    pendingTarget?: boolean;
  }): void {
    const key = this.booleanKey(targetType, threadId);
    let state = this.booleanEntries.get(key);
    const activeClient = queryClient ?? this.queryClient;

    if (!state) {
      const baseline = currentBaseline ?? !desiredState;
      state = {
        targetType,
        threadId,
        serverId: pendingTarget ? undefined : threadId,
        serverBaseline: baseline,
        desiredState,
        intentRevision: 1,
        inFlightState: null,
        abortController: null,
        lessonContext,
        dispatchTimer: null,
        onFailure,
        onSuccess,
        queryClient: activeClient,
      };
      this.booleanEntries.set(key, state);
    } else {
      state.desiredState = desiredState;
      state.intentRevision += 1;
      state.queryClient = activeClient;
      if (lessonContext) state.lessonContext = lessonContext;
      if (onFailure) state.onFailure = onFailure;
      state.onSuccess = onSuccess;
    }

    // 1. Instantly apply transition to TanStack Query cache
    this.applyBooleanCacheUpdate(
      targetType,
      threadId,
      desiredState,
      state.queryClient,
      state.lessonContext,
    );

    // 2. Schedule convergence
    this.scheduleBooleanConvergence(state, debounceMs);
  }

  private applyBooleanCacheUpdate(
    targetType: BooleanTargetType,
    threadId: string,
    desiredValue: boolean,
    client: QueryClient,
    lessonContext?: { courseId: string; lessonId: string },
  ): void {
    if (targetType === "bookmark") {
      updateThreadBookmarkInCache(
        client,
        threadId,
        desiredValue,
        lessonContext,
      );
    } else if (targetType === "follow") {
      updateThreadFollowInCache(client, threadId, desiredValue, lessonContext);
    } else if (targetType === "lock") {
      updateThreadLockInCache(client, threadId, desiredValue, lessonContext);
    }
  }

  private scheduleBooleanConvergence(
    state: ThreadBooleanState,
    delayMs: number,
  ): void {
    if (state.dispatchTimer !== null) {
      clearTimeout(state.dispatchTimer);
      state.dispatchTimer = null;
    }

    const capturedGen = this.generation;

    if (delayMs <= 0) {
      this.processBooleanConvergence(state, capturedGen);
    } else {
      state.dispatchTimer = setTimeout(() => {
        state.dispatchTimer = null;
        this.processBooleanConvergence(state, capturedGen);
      }, delayMs);
    }
  }

  private processBooleanConvergence(
    state: ThreadBooleanState,
    capturedGen: number,
  ): void {
    if (this.generation !== capturedGen || !this.isBooleanStateCurrent(state))
      return;
    if (!state.serverId) return;

    // Never allow parallel requests for the same thread
    if (state.inFlightState !== null) return;

    // If desiredState matches serverBaseline, we have converged!
    // Rapid toggles before dispatch coalesce to zero network calls.
    if (state.desiredState === state.serverBaseline) return;

    const targetState = state.desiredState;
    const requestRevision = state.intentRevision;
    state.inFlightState = targetState;

    const controller = new AbortController();
    state.abortController = controller;

    let apiCall: Promise<any>;
    if (state.targetType === "bookmark") {
      apiCall = learningInteractionsService.toggleBookmark(state.serverId);
    } else if (state.targetType === "follow") {
      apiCall = learningInteractionsService.toggleFollow(state.serverId);
    } else {
      apiCall = learningInteractionsService.lockThread(state.serverId, {
        isLocked: targetState,
      });
    }

    apiCall
      .then((response) => {
        if (
          this.generation !== capturedGen ||
          !this.isBooleanStateCurrent(state)
        )
          return;

        state.abortController = null;
        state.inFlightState = null;

        // Authoritative reconciliation:
        // Bookmark & Follow are toggle endpoints that return the resulting state.
        // Lock returns the resulting isLocked state.
        let authoritativeBaseline: boolean;
        if (state.targetType === "bookmark") {
          authoritativeBaseline =
            typeof response?.bookmarked === "boolean"
              ? response.bookmarked
              : targetState;
        } else if (state.targetType === "follow") {
          authoritativeBaseline =
            typeof response?.following === "boolean"
              ? response.following
              : targetState;
        } else {
          authoritativeBaseline =
            typeof response?.isLocked === "boolean"
              ? response.isLocked
              : targetState;
        }

        state.serverBaseline = authoritativeBaseline;

        // Compare authoritative response baseline against latest desiredState
        if (state.desiredState !== state.serverBaseline) {
          // Immediately continue convergence from the authoritative response
          this.processBooleanConvergence(state, capturedGen);
        } else if (authoritativeBaseline !== targetState) {
          // If server response unexpectedly differed from what was predicted,
          // ensure the cache matches the authoritative server state.
          this.applyBooleanCacheUpdate(
            state.targetType,
            state.threadId,
            authoritativeBaseline,
            state.queryClient,
            state.lessonContext,
          );
        }

        if (state.desiredState === state.serverBaseline) {
          const onSuccess = state.onSuccess;
          state.onSuccess = undefined;
          onSuccess?.(state.serverBaseline);
        }
      })
      .catch((error) => {
        if (
          this.generation !== capturedGen ||
          !this.isBooleanStateCurrent(state)
        )
          return;
        if (controller.signal.aborted) return;

        state.abortController = null;
        state.inFlightState = null;

        const hasNewerIntent = state.intentRevision !== requestRevision;
        const isRevisionAwareTarget =
          state.targetType === "bookmark" || state.targetType === "follow";

        if (isRevisionAwareTarget && hasNewerIntent) {
          // The failed request did not change the server baseline. Keep the
          // latest optimistic intent and continue from that baseline.
          this.applyBooleanCacheUpdate(
            state.targetType,
            state.threadId,
            state.desiredState,
            state.queryClient,
            state.lessonContext,
          );
          if (state.desiredState !== state.serverBaseline) {
            this.processBooleanConvergence(state, capturedGen);
          }
          return;
        }

        // Roll back desired state to the last known server baseline. Lock
        // retains its existing failure semantics in this phase.
        const rollbackValue = state.serverBaseline;
        state.desiredState = rollbackValue;
        state.onSuccess = undefined;
        this.applyBooleanCacheUpdate(
          state.targetType,
          state.threadId,
          rollbackValue,
          state.queryClient,
          state.lessonContext,
        );

        if (state.onFailure) {
          state.onFailure(error);
        }
      });
  }

  // ==========================================
  // ACCEPT / UNACCEPT ANSWER (Intent-Based)
  // ==========================================

  private acceptAnswerKey(threadId: string): string {
    return `accept-answer:${threadId}`;
  }

  /**
   * Sets the user's desired accepted reply ID for a question thread.
   * Passing `null` indicates that no reply should be accepted (unaccept).
   * 1. Updates replies and thread caches immediately.
   * 2. Converges to desired state via minimal compensating API requests.
   */
  setAcceptedAnswer({
    threadId,
    desiredAcceptedReplyId,
    currentBaselineReplyId,
    lessonContext,
    debounceMs = 30,
    onFailure,
    queryClient,
  }: SetAcceptedAnswerOptions): void {
    if (
      isClientEntityId(threadId) ||
      (desiredAcceptedReplyId !== null &&
        isClientEntityId(desiredAcceptedReplyId))
    ) {
      return;
    }

    const key = this.acceptAnswerKey(threadId);
    let state = this.acceptAnswerEntries.get(key);
    const activeClient = queryClient ?? this.queryClient;

    if (!state) {
      const baseline =
        currentBaselineReplyId !== undefined ? currentBaselineReplyId : null;
      state = {
        threadId,
        serverBaselineAcceptedReplyId: baseline,
        desiredAcceptedReplyId,
        intentRevision: 1,
        inFlightTargetReplyId: null,
        inFlightAccepted: null,
        abortController: null,
        lessonContext,
        dispatchTimer: null,
        onFailure,
        queryClient: activeClient,
      };
      this.acceptAnswerEntries.set(key, state);
    } else {
      state.desiredAcceptedReplyId = desiredAcceptedReplyId;
      state.intentRevision += 1;
      state.queryClient = activeClient;
      if (lessonContext) state.lessonContext = lessonContext;
      if (onFailure) state.onFailure = onFailure;
    }

    // 1. Instantly apply mutual exclusivity transition to TanStack Query cache
    updateAcceptedAnswerInCache(
      state.queryClient,
      threadId,
      desiredAcceptedReplyId,
      state.lessonContext,
    );

    // 2. Schedule convergence
    this.scheduleAcceptedConvergence(state, debounceMs);
  }

  private scheduleAcceptedConvergence(
    state: ThreadAcceptedAnswerState,
    delayMs: number,
  ): void {
    if (state.dispatchTimer !== null) {
      clearTimeout(state.dispatchTimer);
      state.dispatchTimer = null;
    }

    const capturedGen = this.generation;

    if (delayMs <= 0) {
      this.processAcceptedConvergence(state, capturedGen);
    } else {
      state.dispatchTimer = setTimeout(() => {
        state.dispatchTimer = null;
        this.processAcceptedConvergence(state, capturedGen);
      }, delayMs);
    }
  }

  private processAcceptedConvergence(
    state: ThreadAcceptedAnswerState,
    capturedGen: number,
  ): void {
    if (
      this.generation !== capturedGen ||
      !this.isAcceptedAnswerStateCurrent(state)
    ) {
      return;
    }

    // Never allow parallel accept/unaccept requests for the same thread
    if (state.inFlightTargetReplyId !== null) return;

    // If desired matches serverBaseline, we have converged!
    if (state.desiredAcceptedReplyId === state.serverBaselineAcceptedReplyId) {
      return;
    }

    let targetReplyId: string;
    let targetAccepted: boolean;

    if (state.desiredAcceptedReplyId !== null) {
      // User wants desiredAcceptedReplyId to be accepted
      targetReplyId = state.desiredAcceptedReplyId;
      targetAccepted = true;
    } else {
      // User wants no accepted answer.
      // Unaccept whatever reply is currently accepted on the server
      if (state.serverBaselineAcceptedReplyId === null) {
        // Both are null, already converged
        return;
      }
      targetReplyId = state.serverBaselineAcceptedReplyId;
      targetAccepted = false;
    }

    state.inFlightTargetReplyId = targetReplyId;
    state.inFlightAccepted = targetAccepted;
    const requestRevision = state.intentRevision;

    const controller = new AbortController();
    state.abortController = controller;

    learningInteractionsService
      .acceptReply(targetReplyId, { accepted: targetAccepted })
      .then((response) => {
        if (
          this.generation !== capturedGen ||
          !this.isAcceptedAnswerStateCurrent(state)
        ) {
          return;
        }

        state.abortController = null;
        state.inFlightTargetReplyId = null;
        state.inFlightAccepted = null;

        // Authoritative reconciliation:
        // Response contains acceptedAnswerId: string | null
        const authoritativeReplyId =
          response?.acceptedAnswerId !== undefined
            ? response.acceptedAnswerId
            : targetAccepted
              ? targetReplyId
              : null;

        state.serverBaselineAcceptedReplyId = authoritativeReplyId;

        if (
          state.desiredAcceptedReplyId !== state.serverBaselineAcceptedReplyId
        ) {
          // Intent changed while request was in-flight, continue convergence
          this.processAcceptedConvergence(state, capturedGen);
        } else if (authoritativeReplyId !== state.desiredAcceptedReplyId) {
          // If server result differed from expected, reconcile cache
          updateAcceptedAnswerInCache(
            state.queryClient,
            state.threadId,
            authoritativeReplyId,
            state.lessonContext,
          );
        }
      })
      .catch((error) => {
        if (
          this.generation !== capturedGen ||
          !this.isAcceptedAnswerStateCurrent(state)
        ) {
          return;
        }
        if (controller.signal.aborted) return;

        state.abortController = null;
        state.inFlightTargetReplyId = null;
        state.inFlightAccepted = null;

        if (state.intentRevision !== requestRevision) {
          // The failed request represented an older intent. The server
          // baseline did not change, so preserve and converge the latest
          // desired answer instead of rolling it back.
          updateAcceptedAnswerInCache(
            state.queryClient,
            state.threadId,
            state.desiredAcceptedReplyId,
            state.lessonContext,
          );
          if (
            state.desiredAcceptedReplyId !== state.serverBaselineAcceptedReplyId
          ) {
            this.processAcceptedConvergence(state, capturedGen);
          }
          return;
        }

        // Roll back desired state to authoritative server baseline
        const rollbackReplyId = state.serverBaselineAcceptedReplyId;
        state.desiredAcceptedReplyId = rollbackReplyId;

        updateAcceptedAnswerInCache(
          state.queryClient,
          state.threadId,
          rollbackReplyId,
          state.lessonContext,
        );

        if (state.onFailure) {
          state.onFailure(error);
        }
      });
  }
}

export const desiredStateCoordinator = new DesiredStateCoordinator();
