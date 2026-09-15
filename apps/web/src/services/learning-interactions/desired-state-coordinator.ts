import type { QueryClient } from "@tanstack/react-query";
import type { LearningThread } from "@veolms/contracts";
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
  desiredLiked: boolean;
  currentBaseline?: boolean;
  lessonContext?: { courseId: string; lessonId: string };
  threadId?: string; // Required when targetType === "reply"
  debounceMs?: number; // Optional micro-delay before network dispatch (default: 30ms)
  onFailure?: (error: unknown) => void;
  queryClient?: QueryClient;
  /** Keeps a client-keyed thread intent local until creation resolves. */
  pendingTarget?: boolean;
}

interface EntityLikeState {
  targetType: TargetLikeType;
  targetId: string;
  serverId?: string;
  serverBaseline: boolean;
  desiredState: boolean;
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
  inFlightState: boolean | null;
  abortController: AbortController | null;
  lessonContext?: { courseId: string; lessonId: string };
  dispatchTimer: ReturnType<typeof setTimeout> | null;
  onFailure?: (error: unknown) => void;
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
  inFlightTargetReplyId: string | null;
  inFlightAccepted: boolean | null;
  abortController: AbortController | null;
  lessonContext?: { courseId: string; lessonId: string };
  dispatchTimer: ReturnType<typeof setTimeout> | null;
  onFailure?: (error: unknown) => void;
  queryClient: QueryClient;
}

export class DesiredStateCoordinator {
  private generation = 1;
  private entries = new Map<string, EntityLikeState>();
  private booleanEntries = new Map<string, ThreadBooleanState>();
  private acceptAnswerEntries = new Map<string, ThreadAcceptedAnswerState>();
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
    const state = this.booleanEntries.get(this.booleanKey(targetType, clientId));
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
    desiredLiked,
    currentBaseline,
    lessonContext,
    threadId,
    debounceMs = 30,
    onFailure,
    queryClient,
    pendingTarget,
  }: SetLikedOptions): void {
    const key = this.likeKey(targetType, targetId);
    let state = this.entries.get(key);
    const activeClient = queryClient ?? this.queryClient;

    if (!state) {
      const baseline = currentBaseline ?? !desiredLiked;
      state = {
        targetType,
        targetId,
        serverId: pendingTarget ? undefined : targetId,
        serverBaseline: baseline,
        desiredState: desiredLiked,
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
  ): void {
    if (targetType === "thread") {
      updateThreadLikeInCache(
        client,
        targetId,
        desiredLiked,
        lessonContext,
      );
    } else if (targetType === "reply") {
      if (threadId) {
        updateReplyLikeInCache(
          client,
          threadId,
          targetId,
          desiredLiked,
        );
      }
    } else if (targetType === "note") {
      updateNoteLikeInCache(client, targetId, desiredLiked);
    }
  }

  private scheduleLikeConvergence(state: EntityLikeState, delayMs: number): void {
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
    if (this.generation !== capturedGen) return;
    if (!state.serverId) return;
    if (state.inFlightState !== null) return;
    if (state.desiredState === state.serverBaseline) return;

    const targetState = state.desiredState;
    state.inFlightState = targetState;

    const controller = new AbortController();
    state.abortController = controller;

    learningInteractionsService
      .toggleLike({
        targetType: state.targetType,
        targetId: state.serverId,
      })
      .then((response) => {
        if (this.generation !== capturedGen) return;

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
        if (this.generation !== capturedGen) return;
        if (controller.signal.aborted) return;

        state.abortController = null;
        state.inFlightState = null;

        const rollbackLiked = state.serverBaseline;
        state.desiredState = rollbackLiked;

        this.applyLikeCacheUpdate(
          state.targetType,
          state.targetId,
          rollbackLiked,
          state.queryClient,
          state.lessonContext,
          state.threadId,
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
        inFlightState: null,
        abortController: null,
        lessonContext,
        dispatchTimer: null,
        onFailure,
        queryClient: activeClient,
      };
      this.booleanEntries.set(key, state);
    } else {
      state.desiredState = desiredState;
      state.queryClient = activeClient;
      if (lessonContext) state.lessonContext = lessonContext;
      if (onFailure) state.onFailure = onFailure;
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
      updateThreadBookmarkInCache(client, threadId, desiredValue, lessonContext);
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
    if (this.generation !== capturedGen) return;
    if (!state.serverId) return;

    // Never allow parallel requests for the same thread
    if (state.inFlightState !== null) return;

    // If desiredState matches serverBaseline, we have converged!
    // Rapid toggles before dispatch coalesce to zero network calls.
    if (state.desiredState === state.serverBaseline) return;

    const targetState = state.desiredState;
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
        if (this.generation !== capturedGen) return;

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
      })
      .catch((error) => {
        if (this.generation !== capturedGen) return;
        if (controller.signal.aborted) return;

        state.abortController = null;
        state.inFlightState = null;

        // Roll back desired state to the last known server baseline
        const rollbackValue = state.serverBaseline;
        state.desiredState = rollbackValue;

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
    if (this.generation !== capturedGen) return;

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

    const controller = new AbortController();
    state.abortController = controller;

    learningInteractionsService
      .acceptReply(targetReplyId, { accepted: targetAccepted })
      .then((response) => {
        if (this.generation !== capturedGen) return;

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

        if (state.desiredAcceptedReplyId !== state.serverBaselineAcceptedReplyId) {
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
        if (this.generation !== capturedGen) return;
        if (controller.signal.aborted) return;

        state.abortController = null;
        state.inFlightTargetReplyId = null;
        state.inFlightAccepted = null;

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
