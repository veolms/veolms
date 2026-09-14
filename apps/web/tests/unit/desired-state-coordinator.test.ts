import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DesiredStateCoordinator,
  calculateNextLikesCount,
  learningInteractionKeys,
  learningInteractionsService,
} from "../../src/services/learning-interactions";
import type {
  LearningNotesListResponse,
  LearningRepliesListResponse,
  LearningThreadsListResponse,
} from "@veolms/contracts";

describe("DesiredStateCoordinator & Cache Updaters", () => {
  let queryClient: QueryClient;
  let coordinator: DesiredStateCoordinator;
  let toggleLikeSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
      },
    });

    coordinator = new DesiredStateCoordinator(queryClient);

    toggleLikeSpy = vi
      .spyOn(learningInteractionsService, "toggleLike")
      .mockResolvedValue({
        targetType: "thread",
        targetId: "thread-1",
        liked: true,
        likesCount: 1,
      });
  });

  describe("1. Transition-Aware Like Counter", () => {
    it("increments on false -> true", () => {
      expect(calculateNextLikesCount(0, false, true)).toBe(1);
      expect(calculateNextLikesCount(5, false, true)).toBe(6);
      expect(calculateNextLikesCount(0, undefined, true)).toBe(1);
    });

    it("decrements on true -> false", () => {
      expect(calculateNextLikesCount(5, true, false)).toBe(4);
      expect(calculateNextLikesCount(1, true, false)).toBe(0);
    });

    it("clamps at >= 0 on decrement below zero", () => {
      expect(calculateNextLikesCount(0, true, false)).toBe(0);
    });

    it("does not change counter if previous.isLiked === desiredLiked (duplicate sync)", () => {
      expect(calculateNextLikesCount(5, true, true)).toBe(5);
      expect(calculateNextLikesCount(5, false, false)).toBe(5);
      expect(calculateNextLikesCount(0, false, false)).toBe(0);
    });
  });

  describe("2. Instant UI Cache Updates (0ms latency)", () => {
    it("immediately updates thread like and transition-aware count in cache", () => {
      const threadKey = [
        ...learningInteractionKeys.all,
        "lesson-threads",
        "c1",
        "l1",
      ];
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [
          {
            id: "thread-1",
            isLiked: false,
            likesCount: 3,
          } as any,
        ],
        nextCursor: null,
      });

      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      // Synchronously reflected in cache before any timers advance
      const updated = queryClient.getQueryData<LearningThreadsListResponse>(threadKey);
      expect(updated?.threads[0]?.isLiked).toBe(true);
      expect(updated?.threads[0]?.likesCount).toBe(4);
    });

    it("immediately updates reply like and transition-aware count in cache", () => {
      const replyKey = learningInteractionKeys.threadRepliesRoot("thread-1");
      queryClient.setQueryData<LearningRepliesListResponse>(replyKey, {
        replies: [
          {
            id: "reply-1",
            threadId: "thread-1",
            isLiked: true,
            likesCount: 2,
          } as any,
        ],
        nextCursor: null,
        totalCount: 1,
      });

      coordinator.setLiked({
        targetType: "reply",
        targetId: "reply-1",
        threadId: "thread-1",
        desiredLiked: false,
        currentBaseline: true,
        debounceMs: 50,
      });

      const updated = queryClient.getQueryData<LearningRepliesListResponse>(replyKey);
      expect(updated?.replies[0]?.isLiked).toBe(false);
      expect(updated?.replies[0]?.likesCount).toBe(1);
    });

    it("immediately updates note like and transition-aware count in cache", () => {
      const notesKey = learningInteractionKeys.notesRoot();
      queryClient.setQueryData<LearningNotesListResponse>(notesKey, {
        notes: [
          {
            id: "note-1",
            isLiked: false,
            likesCount: 0,
          } as any,
        ],
        nextCursor: null,
      });

      coordinator.setLiked({
        targetType: "note",
        targetId: "note-1",
        desiredLiked: true,
        currentBaseline: false,
        debounceMs: 50,
      });

      const updated = queryClient.getQueryData<LearningNotesListResponse>(notesKey);
      expect(updated?.notes[0]?.isLiked).toBe(true);
      expect(updated?.notes[0]?.likesCount).toBe(1);
    });
  });

  describe("3. Coalescing & Convergence", () => {
    it("neutralizes rapid opposing clicks within debounce window with 0 network calls", async () => {
      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: true,
        currentBaseline: false,
        debounceMs: 30,
      });

      // User immediately clicks again to unlike before debounce expires
      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: false,
        currentBaseline: false,
        debounceMs: 30,
      });

      // Advance timers past debounce
      vi.advanceTimersByTime(50);
      await Promise.resolve();

      // Desired state converged back to baseline (false === false); 0 network calls dispatched
      expect(toggleLikeSpy).not.toHaveBeenCalled();
    });

    it("sends compensating request if user toggles while in flight", async () => {
      let resolveFirstCall: (val: any) => void = () => {};
      toggleLikeSpy
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveFirstCall = resolve;
          }),
        )
        .mockResolvedValueOnce({ liked: false, likesCount: 0 });

      // 1. Initial click: false -> true
      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: true,
        currentBaseline: false,
        debounceMs: 0,
      });

      // Advance microtasks: first request is in-flight
      await Promise.resolve();
      expect(toggleLikeSpy).toHaveBeenCalledTimes(1);

      // 2. User toggles back to false while first request is in-flight
      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: false,
        currentBaseline: false,
        debounceMs: 0,
      });

      // Coordinator must NOT fire parallel request while one is in-flight
      expect(toggleLikeSpy).toHaveBeenCalledTimes(1);

      // 3. First request settles (confirmed liked: true)
      resolveFirstCall({ liked: true, likesCount: 1 });
      await Promise.resolve();
      await Promise.resolve();

      // Coordinator automatically dispatches a compensating request to converge to false
      expect(toggleLikeSpy).toHaveBeenCalledTimes(2);
    });

    it("rolls back cache and state to server baseline on network failure", async () => {
      const threadKey = [
        ...learningInteractionKeys.all,
        "lesson-threads",
        "c1",
        "l1",
      ];
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [
          {
            id: "thread-1",
            isLiked: false,
            likesCount: 0,
          } as any,
        ],
        nextCursor: null,
      });

      toggleLikeSpy.mockRejectedValueOnce(new Error("Network disconnect"));

      const onFailure = vi.fn();
      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
        onFailure,
      });

      // Immediately optimistic
      let cached = queryClient.getQueryData<LearningThreadsListResponse>(threadKey);
      expect(cached?.threads[0]?.isLiked).toBe(true);
      expect(cached?.threads[0]?.likesCount).toBe(1);

      // Settle network rejection
      await Promise.resolve();
      await Promise.resolve();

      // Cache rolled back to baseline
      cached = queryClient.getQueryData<LearningThreadsListResponse>(threadKey);
      expect(cached?.threads[0]?.isLiked).toBe(false);
      expect(cached?.threads[0]?.likesCount).toBe(0);
      expect(onFailure).toHaveBeenCalled();
    });
  });

  describe("4. Auth Reset & Late Response Protection", () => {
    it("increments generation and makes late-settling responses completely inert", async () => {
      const threadKey = [
        ...learningInteractionKeys.all,
        "lesson-threads",
        "c1",
        "l1",
      ];
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [
          {
            id: "thread-1",
            isLiked: false,
            likesCount: 0,
          } as any,
        ],
        nextCursor: null,
      });

      let resolveAccountARequest: (val: any) => void = () => {};
      toggleLikeSpy.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAccountARequest = resolve;
        }),
      );

      // Account A likes thread-1
      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });

      await Promise.resolve();
      expect(toggleLikeSpy).toHaveBeenCalledTimes(1);

      const genBefore = coordinator.getGeneration();

      // User logs out -> coordinator.reset() is called
      coordinator.reset();

      expect(coordinator.getGeneration()).toBe(genBefore + 1);

      // Account B logs in and sets their own cache
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [
          {
            id: "thread-1",
            isLiked: false,
            likesCount: 0,
          } as any,
        ],
        nextCursor: null,
      });

      // Now Account A's late network response arrives and resolves
      resolveAccountARequest({
        targetType: "thread",
        targetId: "thread-1",
        liked: true,
        likesCount: 99,
      });
      await Promise.resolve();
      await Promise.resolve();

      // Account B's cache and UI MUST NOT be touched by Account A's late response
      const accountBCache = queryClient.getQueryData<LearningThreadsListResponse>(threadKey);
      expect(accountBCache?.threads[0]?.isLiked).toBe(false);
      expect(accountBCache?.threads[0]?.likesCount).toBe(0);

      // Internal coordinator state for thread-1 was cleared and remains inert
      expect(coordinator.getState("thread", "thread-1")).toBeUndefined();
    });
  });
});
