import type { QueryClient } from "@tanstack/react-query";
import { queryClient as defaultQueryClient } from "../../lib/query-client";
import { learningInteractionsService } from "./learning-interactions.service";
import {
  updateNoteLikeInCache,
  updateReplyLikeInCache,
  updateThreadLikeInCache,
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
}

interface EntityLikeState {
  targetType: TargetLikeType;
  targetId: string;
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

export class DesiredStateCoordinator {
  private generation = 1;
  private entries = new Map<string, EntityLikeState>();
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
  }

  /**
   * Returns current internal state for a target (useful for tests and inspection).
   */
  getState(
    targetType: TargetLikeType,
    targetId: string,
  ): Readonly<EntityLikeState> | undefined {
    return this.entries.get(this.key(targetType, targetId));
  }

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
  }: SetLikedOptions): void {
    const key = this.key(targetType, targetId);
    let state = this.entries.get(key);
    const activeClient = queryClient ?? this.queryClient;

    if (!state) {
      const baseline = currentBaseline ?? !desiredLiked;
      state = {
        targetType,
        targetId,
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
    this.applyCacheUpdate(
      targetType,
      targetId,
      desiredLiked,
      state.queryClient,
      state.lessonContext,
      state.threadId,
    );

    // 2. Schedule convergence dispatch
    this.scheduleConvergence(state, debounceMs);
  }

  private key(targetType: TargetLikeType, targetId: string): string {
    return `${targetType}:${targetId}`;
  }

  private applyCacheUpdate(
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

  private scheduleConvergence(state: EntityLikeState, delayMs: number): void {
    if (state.dispatchTimer !== null) {
      clearTimeout(state.dispatchTimer);
      state.dispatchTimer = null;
    }

    const capturedGen = this.generation;

    if (delayMs <= 0) {
      this.processConvergence(state, capturedGen);
    } else {
      state.dispatchTimer = setTimeout(() => {
        state.dispatchTimer = null;
        this.processConvergence(state, capturedGen);
      }, delayMs);
    }
  }

  private processConvergence(
    state: EntityLikeState,
    capturedGen: number,
  ): void {
    // Auth guard: If generation changed (e.g. user logged out or switched account), discard immediately
    if (this.generation !== capturedGen) {
      return;
    }

    // If an API request is already in-flight for this entity, do NOT dispatch in parallel.
    // When the in-flight request settles, it will check again and converge.
    if (state.inFlightState !== null) {
      return;
    }

    // If desiredState already matches serverBaseline, we have converged!
    // If rapid opposing actions occurred before dispatch, this completely neutralizes network requests.
    if (state.desiredState === state.serverBaseline) {
      return;
    }

    // Begin network dispatch
    const targetState = state.desiredState;
    state.inFlightState = targetState;

    const controller = new AbortController();
    state.abortController = controller;

    learningInteractionsService
      .toggleLike({
        targetType: state.targetType,
        targetId: state.targetId,
      })
      .then((response) => {
        // Auth guard on late completion: If generation changed, discard completely
        if (this.generation !== capturedGen) {
          return;
        }

        state.abortController = null;
        state.inFlightState = null;

        // Server confirmed the new baseline
        const confirmedLiked =
          typeof response?.liked === "boolean" ? response.liked : targetState;
        state.serverBaseline = confirmedLiked;

        // Check if user changed their desired state while this request was in-flight
        if (state.desiredState !== state.serverBaseline) {
          // Immediately dispatch compensating request
          this.processConvergence(state, capturedGen);
        }
      })
      .catch((error) => {
        // Auth guard on late completion: If generation changed, discard completely
        if (this.generation !== capturedGen) {
          return;
        }

        // If aborted deliberately (e.g. during reset), do not roll back or notify
        if (controller.signal.aborted) {
          return;
        }

        state.abortController = null;
        state.inFlightState = null;

        // Roll back desired state to the last known server baseline
        const rollbackLiked = state.serverBaseline;
        state.desiredState = rollbackLiked;

        // Revert cache
        this.applyCacheUpdate(
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
}

export const desiredStateCoordinator = new DesiredStateCoordinator();
