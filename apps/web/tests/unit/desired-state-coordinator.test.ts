import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DesiredStateCoordinator,
  calculateNextLikesCount,
  learningInteractionKeys,
  learningInteractionsService,
  desiredStateCoordinator as sharedDesiredStateCoordinator,
} from "../../src/services/learning-interactions";
import { mergeRepliesWithCreationRecords } from "../../src/services/learning-interactions/learning-interactions.queries";
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

    vi.spyOn(learningInteractionsService, "toggleBookmark").mockResolvedValue({
      threadId: "thread-1",
      bookmarked: true,
    });

    vi.spyOn(learningInteractionsService, "toggleFollow").mockResolvedValue({
      threadId: "thread-1",
      following: true,
    });

    vi.spyOn(learningInteractionsService, "lockThread").mockResolvedValue({
      threadId: "thread-1",
      isLocked: true,
    });

    vi.spyOn(learningInteractionsService, "acceptReply").mockImplementation(
      async (replyId, payload) => ({
        replyId,
        threadId: "thread-1",
        isAccepted: payload?.accepted ?? true,
        acceptedAnswerId: (payload?.accepted ?? true) ? replyId : null,
      }),
    );
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

  describe("pending optimistic threads", () => {
    it("keeps client-keyed like, bookmark, and follow intents local until creation resolves", async () => {
      const clientId = "client-thread-pending";
      const serverId = "server-thread-confirmed";
      const threadKey = [
        ...learningInteractionKeys.all,
        "lesson-threads",
        "c1",
        "l1",
      ];
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [
          {
            id: clientId,
            clientId,
            creationStatus: "pending",
            isLiked: false,
            likesCount: 0,
            isBookmarked: false,
            isFollowing: false,
          } as any,
        ],
        nextCursor: null,
      });

      coordinator.setLiked({
        targetType: "thread",
        targetId: clientId,
        pendingTarget: true,
        desiredLiked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });
      coordinator.setBookmarked({
        threadId: clientId,
        pendingTarget: true,
        desiredBookmarked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });
      coordinator.setFollowed({
        threadId: clientId,
        pendingTarget: true,
        desiredFollowed: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });

      expect(toggleLikeSpy).not.toHaveBeenCalled();
      expect(learningInteractionsService.toggleBookmark).not.toHaveBeenCalled();
      expect(learningInteractionsService.toggleFollow).not.toHaveBeenCalled();
      expect(queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0]).toMatchObject({
        isLiked: true,
        likesCount: 1,
        isBookmarked: true,
        isFollowing: true,
      });

      coordinator.resolvePendingThread(clientId, {
        id: serverId,
        isLiked: false,
        isBookmarked: false,
        isFollowing: false,
      } as any);
      await Promise.resolve();

      expect(toggleLikeSpy).toHaveBeenCalledWith({
        targetType: "thread",
        targetId: serverId,
      });
      expect(learningInteractionsService.toggleBookmark).toHaveBeenCalledWith(
        serverId,
      );
      expect(learningInteractionsService.toggleFollow).toHaveBeenCalledWith(
        serverId,
      );
    });

    it("coalesces a pending like back to its authoritative create baseline", () => {
      const clientId = "client-thread-coalesced";
      coordinator.setLiked({
        targetType: "thread",
        targetId: clientId,
        pendingTarget: true,
        desiredLiked: true,
        currentBaseline: false,
        debounceMs: 0,
      });
      coordinator.setLiked({
        targetType: "thread",
        targetId: clientId,
        pendingTarget: true,
        desiredLiked: false,
        currentBaseline: false,
        debounceMs: 0,
      });
      coordinator.resolvePendingThread(clientId, {
        id: "server-thread-coalesced",
        isLiked: false,
      } as any);

      expect(toggleLikeSpy).not.toHaveBeenCalled();
    });

    it("drops pending intents on create failure without dispatching engagement", () => {
      const clientId = "client-thread-failed";
      coordinator.setBookmarked({
        threadId: clientId,
        pendingTarget: true,
        desiredBookmarked: true,
        currentBaseline: false,
        debounceMs: 0,
      });
      coordinator.setFollowed({
        threadId: clientId,
        pendingTarget: true,
        desiredFollowed: true,
        currentBaseline: false,
        debounceMs: 0,
      });

      coordinator.failPendingThread(clientId);

      expect(coordinator.getBookmarkState(clientId)).toBeUndefined();
      expect(coordinator.getFollowState(clientId)).toBeUndefined();
      expect(learningInteractionsService.toggleBookmark).not.toHaveBeenCalled();
      expect(learningInteractionsService.toggleFollow).not.toHaveBeenCalled();
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

    it("preserves the latest like intent when an older request fails", async () => {
      let rejectFirstRequest: (error: Error) => void = () => undefined;
      toggleLikeSpy.mockReset();
      toggleLikeSpy
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              rejectFirstRequest = reject;
            }),
        )
        .mockResolvedValueOnce({ liked: true, likesCount: 1 });

      const threadKey = [
        ...learningInteractionKeys.all,
        "lesson-threads",
        "c1",
        "l1",
      ];
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [{ id: "thread-1", isLiked: false, likesCount: 0 } as any],
        nextCursor: null,
      });

      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });
      await Promise.resolve();

      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: false,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });
      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });

      rejectFirstRequest(new Error("first request failed"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(toggleLikeSpy).toHaveBeenCalledTimes(2);
      expect(coordinator.getState("thread", "thread-1")?.desiredState).toBe(
        true,
      );
      expect(
        queryClient.getQueryData<LearningThreadsListResponse>(threadKey)
          ?.threads[0]?.isLiked,
      ).toBe(true);
    });

    it("does not dispatch a compensating like when a newer intent returns to baseline", async () => {
      let rejectFirstRequest: (error: Error) => void = () => undefined;
      toggleLikeSpy.mockReset();
      toggleLikeSpy.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirstRequest = reject;
          }),
      );

      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: true,
        currentBaseline: false,
        debounceMs: 0,
      });
      await Promise.resolve();
      coordinator.setLiked({
        targetType: "thread",
        targetId: "thread-1",
        desiredLiked: false,
        currentBaseline: false,
        debounceMs: 0,
      });

      rejectFirstRequest(new Error("first request failed"));
      await Promise.resolve();
      await Promise.resolve();

      expect(toggleLikeSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.getState("thread", "thread-1")?.desiredState).toBe(
        false,
      );
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

  describe("6. Optimistic Bookmark Convergence", () => {
    const threadKey = [
      ...learningInteractionKeys.all,
      "lesson-threads",
      "c1",
      "l1",
    ];
    const detailsKey = learningInteractionKeys.threadDetails("thread-1");

    beforeEach(() => {
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [{ id: "thread-1", isBookmarked: false } as any],
        nextCursor: null,
      });
      queryClient.setQueryData(detailsKey, {
        id: "thread-1",
        isBookmarked: false,
      } as any);
    });

    it("immediately updates thread bookmark status in cache (0ms UI latency)", () => {
      coordinator.setBookmarked({
        threadId: "thread-1",
        desiredBookmarked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      const listCache = queryClient.getQueryData<LearningThreadsListResponse>(threadKey);
      const detailCache = queryClient.getQueryData<any>(detailsKey);
      expect(listCache?.threads[0]?.isBookmarked).toBe(true);
      expect(detailCache?.isBookmarked).toBe(true);
    });

    it("coalesces bookmark -> remove before dispatch into zero network calls", async () => {
      const toggleBookmarkSpy = vi.spyOn(
        learningInteractionsService,
        "toggleBookmark",
      );

      // Bookmark
      coordinator.setBookmarked({
        threadId: "thread-1",
        desiredBookmarked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      // Remove bookmark before 50ms timer expires
      coordinator.setBookmarked({
        threadId: "thread-1",
        desiredBookmarked: false,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      // UI returns to false immediately
      expect(
        queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0]?.isBookmarked,
      ).toBe(false);

      // Advance timer past debounce
      vi.advanceTimersByTime(60);
      await Promise.resolve();

      expect(toggleBookmarkSpy).not.toHaveBeenCalled();
    });

    it("issues minimal compensating toggle if desired changes while in-flight", async () => {
      let resolveFirstToggle: any;
      const firstTogglePromise = new Promise<{ threadId: string; bookmarked: boolean }>(
        (resolve) => {
          resolveFirstToggle = resolve;
        },
      );

      const toggleBookmarkSpy = vi
        .spyOn(learningInteractionsService, "toggleBookmark")
        .mockReturnValueOnce(firstTogglePromise)
        .mockResolvedValueOnce({ threadId: "thread-1", bookmarked: false });

      // Dispatch bookmark
      coordinator.setBookmarked({
        threadId: "thread-1",
        desiredBookmarked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });

      await Promise.resolve();
      expect(toggleBookmarkSpy).toHaveBeenCalledTimes(1);

      // While in-flight, user removes bookmark
      coordinator.setBookmarked({
        threadId: "thread-1",
        desiredBookmarked: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      // First request resolves with server confirming bookmarked: true
      resolveFirstToggle({ threadId: "thread-1", bookmarked: true });
      await Promise.resolve();
      await Promise.resolve();

      // Coordinator automatically issues exactly 1 compensating toggle to reach desired: false
      expect(toggleBookmarkSpy).toHaveBeenCalledTimes(2);

      await Promise.resolve();
      const listCache = queryClient.getQueryData<LearningThreadsListResponse>(threadKey);
      expect(listCache?.threads[0]?.isBookmarked).toBe(false);
    });

    it("rolls back to server baseline on network failure", async () => {
      vi.spyOn(learningInteractionsService, "toggleBookmark").mockRejectedValueOnce(
        new Error("Network disconnect"),
      );

      let failureReported = false;
      coordinator.setBookmarked({
        threadId: "thread-1",
        desiredBookmarked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
        onFailure: () => {
          failureReported = true;
        },
      });

      // Initially true
      expect(
        queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0]?.isBookmarked,
      ).toBe(true);

      await Promise.resolve();
      await Promise.resolve();

      // Reverts to baseline false
      expect(
        queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0]?.isBookmarked,
      ).toBe(false);
      expect(failureReported).toBe(true);
    });

    it("preserves the latest bookmark intent when an older request fails", async () => {
      let rejectFirstRequest: (error: Error) => void = () => undefined;
      const toggleBookmarkSpy = vi
        .spyOn(learningInteractionsService, "toggleBookmark")
        .mockReset()
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              rejectFirstRequest = reject;
            }),
        )
        .mockResolvedValueOnce({ threadId: "thread-1", bookmarked: true });

      coordinator.setBookmarked({
        threadId: "thread-1",
        desiredBookmarked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });
      await Promise.resolve();
      coordinator.setBookmarked({
        threadId: "thread-1",
        desiredBookmarked: false,
        currentBaseline: false,
        debounceMs: 0,
      });
      coordinator.setBookmarked({
        threadId: "thread-1",
        desiredBookmarked: true,
        currentBaseline: false,
        debounceMs: 0,
      });

      rejectFirstRequest(new Error("first request failed"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(toggleBookmarkSpy).toHaveBeenCalledTimes(2);
      expect(coordinator.getBookmarkState("thread-1")?.desiredState).toBe(
        true,
      );
    });
  });

  describe("7. Optimistic Follow Convergence", () => {
    const threadKey = [
      ...learningInteractionKeys.all,
      "lesson-threads",
      "c1",
      "l1",
    ];

    beforeEach(() => {
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [{ id: "thread-1", isFollowing: false } as any],
        nextCursor: null,
      });
    });

    it("immediately updates thread follow status in cache", () => {
      coordinator.setFollowed({
        threadId: "thread-1",
        desiredFollowed: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      expect(
        queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0]?.isFollowing,
      ).toBe(true);
    });

    it("coalesces follow -> unfollow into zero requests", async () => {
      const toggleFollowSpy = vi.spyOn(learningInteractionsService, "toggleFollow");

      coordinator.setFollowed({
        threadId: "thread-1",
        desiredFollowed: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 40,
      });

      coordinator.setFollowed({
        threadId: "thread-1",
        desiredFollowed: false,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 40,
      });

      vi.advanceTimersByTime(50);
      await Promise.resolve();

      expect(toggleFollowSpy).not.toHaveBeenCalled();
    });

    it("rolls back follow status on failure", async () => {
      vi.spyOn(learningInteractionsService, "toggleFollow").mockRejectedValueOnce(
        new Error("Server error"),
      );

      coordinator.setFollowed({
        threadId: "thread-1",
        desiredFollowed: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(
        queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0]?.isFollowing,
      ).toBe(false);
    });

    it("preserves the latest follow intent when an older request fails", async () => {
      let rejectFirstRequest: (error: Error) => void = () => undefined;
      const toggleFollowSpy = vi
        .spyOn(learningInteractionsService, "toggleFollow")
        .mockReset()
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              rejectFirstRequest = reject;
            }),
        )
        .mockResolvedValueOnce({ threadId: "thread-1", following: true });

      coordinator.setFollowed({
        threadId: "thread-1",
        desiredFollowed: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });
      await Promise.resolve();
      coordinator.setFollowed({
        threadId: "thread-1",
        desiredFollowed: false,
        currentBaseline: false,
        debounceMs: 0,
      });
      coordinator.setFollowed({
        threadId: "thread-1",
        desiredFollowed: true,
        currentBaseline: false,
        debounceMs: 0,
      });

      rejectFirstRequest(new Error("first request failed"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(toggleFollowSpy).toHaveBeenCalledTimes(2);
      expect(coordinator.getFollowState("thread-1")?.desiredState).toBe(true);
    });
  });

  describe("8. Optimistic Lock/Unlock Convergence", () => {
    const threadKey = [
      ...learningInteractionKeys.all,
      "lesson-threads",
      "c1",
      "l1",
    ];
    const detailsKey = learningInteractionKeys.threadDetails("thread-1");

    beforeEach(() => {
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [{ id: "thread-1", isLocked: false } as any],
        nextCursor: null,
      });
      queryClient.setQueryData(detailsKey, {
        id: "thread-1",
        isLocked: false,
      } as any);
    });

    it("immediately locks thread in list and details cache (0ms UI latency)", () => {
      coordinator.setLocked({
        threadId: "thread-1",
        desiredLocked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      expect(
        queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0]?.isLocked,
      ).toBe(true);
      expect(queryClient.getQueryData<any>(detailsKey)?.isLocked).toBe(true);
    });

    it("never allows parallel lock requests for the same thread", async () => {
      let resolveFirstLock: any;
      const firstLockPromise = new Promise<{ threadId: string; isLocked: boolean }>(
        (resolve) => {
          resolveFirstLock = resolve;
        },
      );

      const lockSpy = vi
        .spyOn(learningInteractionsService, "lockThread")
        .mockReturnValueOnce(firstLockPromise)
        .mockResolvedValueOnce({ threadId: "thread-1", isLocked: false });

      // Dispatch lock
      coordinator.setLocked({
        threadId: "thread-1",
        desiredLocked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });

      await Promise.resolve();
      expect(lockSpy).toHaveBeenCalledTimes(1);

      // User unlocks while 1st request is in flight
      coordinator.setLocked({
        threadId: "thread-1",
        desiredLocked: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });

      await Promise.resolve();
      // Second request MUST NOT have fired in parallel
      expect(lockSpy).toHaveBeenCalledTimes(1);

      // Settle first request
      resolveFirstLock({ threadId: "thread-1", isLocked: true });
      await Promise.resolve();
      await Promise.resolve();

      // Now the compensating unlock request fires sequentially
      expect(lockSpy).toHaveBeenCalledTimes(2);
      expect(lockSpy).toHaveBeenLastCalledWith("thread-1", { isLocked: false });
    });

    it("rolls back lock state on failure", async () => {
      vi.spyOn(learningInteractionsService, "lockThread").mockRejectedValueOnce(
        new Error("Forbidden"),
      );

      coordinator.setLocked({
        threadId: "thread-1",
        desiredLocked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(
        queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0]?.isLocked,
      ).toBe(false);
      expect(queryClient.getQueryData<any>(detailsKey)?.isLocked).toBe(false);
    });
  });

  describe("9. Optimistic Accept / Unaccept Answer (Intent-Based)", () => {
    const threadKey = [
      ...learningInteractionKeys.all,
      "lesson-threads",
      "c1",
      "l1",
    ];
    const detailsKey = learningInteractionKeys.threadDetails("thread-1");
    const repliesKey = learningInteractionKeys.threadRepliesRoot("thread-1");

    beforeEach(() => {
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [
          {
            id: "thread-1",
            acceptedAnswerId: null,
            isSolved: false,
          } as any,
        ],
        nextCursor: null,
      });
      queryClient.setQueryData(detailsKey, {
        id: "thread-1",
        acceptedAnswerId: null,
        isSolved: false,
      } as any);
      queryClient.setQueryData<LearningRepliesListResponse>(repliesKey, {
        replies: [
          { id: "reply-A", threadId: "thread-1", isAccepted: false } as any,
          { id: "reply-B", threadId: "thread-1", isAccepted: false } as any,
        ],
        nextCursor: null,
        totalCount: 2,
      });
    });

    it("accepts reply and marks thread solved immediately", () => {
      coordinator.setAcceptedAnswer({
        threadId: "thread-1",
        desiredAcceptedReplyId: "reply-A",
        currentBaselineReplyId: null,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      const replies = queryClient.getQueryData<LearningRepliesListResponse>(repliesKey)?.replies;
      expect(replies?.[0]?.isAccepted).toBe(true);
      expect(replies?.[1]?.isAccepted).toBe(false);

      const thread = queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0];
      expect(thread?.acceptedAnswerId).toBe("reply-A");
    });

    it("unaccepts reply and marks thread unsolved immediately", () => {
      // Set baseline to reply-A accepted
      queryClient.setQueryData<LearningRepliesListResponse>(repliesKey, {
        replies: [
          { id: "reply-A", threadId: "thread-1", isAccepted: true } as any,
          { id: "reply-B", threadId: "thread-1", isAccepted: false } as any,
        ],
        nextCursor: null,
        totalCount: 2,
      });

      coordinator.setAcceptedAnswer({
        threadId: "thread-1",
        desiredAcceptedReplyId: null,
        currentBaselineReplyId: "reply-A",
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      const replies = queryClient.getQueryData<LearningRepliesListResponse>(repliesKey)?.replies;
      expect(replies?.[0]?.isAccepted).toBe(false);

      const thread = queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0];
      expect(thread?.acceptedAnswerId).toBeNull();
    });

    it("switching from reply A -> B never displays both accepted simultaneously", () => {
      queryClient.setQueryData<LearningRepliesListResponse>(repliesKey, {
        replies: [
          { id: "reply-A", threadId: "thread-1", isAccepted: true } as any,
          { id: "reply-B", threadId: "thread-1", isAccepted: false } as any,
        ],
        nextCursor: null,
        totalCount: 2,
      });

      coordinator.setAcceptedAnswer({
        threadId: "thread-1",
        desiredAcceptedReplyId: "reply-B",
        currentBaselineReplyId: "reply-A",
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      const replies = queryClient.getQueryData<LearningRepliesListResponse>(repliesKey)?.replies;
      expect(replies?.[0]?.isAccepted).toBe(false); // A is false
      expect(replies?.[1]?.isAccepted).toBe(true);  // B is true
      expect(
        replies?.filter((r) => r.isAccepted).length,
      ).toBe(1);

      const thread = queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0];
      expect(thread?.acceptedAnswerId).toBe("reply-B");
    });

    it("coalesces rapid switch (null -> A -> B) before micro-tick into single request for B", async () => {
      const acceptSpy = vi.spyOn(learningInteractionsService, "acceptReply");

      coordinator.setAcceptedAnswer({
        threadId: "thread-1",
        desiredAcceptedReplyId: "reply-A",
        currentBaselineReplyId: null,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      coordinator.setAcceptedAnswer({
        threadId: "thread-1",
        desiredAcceptedReplyId: "reply-B",
        currentBaselineReplyId: null,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 50,
      });

      vi.advanceTimersByTime(60);
      await Promise.resolve();

      // Only ONE network call fired directly for reply-B
      expect(acceptSpy).toHaveBeenCalledTimes(1);
      expect(acceptSpy).toHaveBeenCalledWith("reply-B", { accepted: true });
    });

    it("rolls back to previous accepted answer on failure", async () => {
      // Baseline was reply-A accepted
      queryClient.setQueryData<LearningRepliesListResponse>(repliesKey, {
        replies: [
          { id: "reply-A", threadId: "thread-1", isAccepted: true } as any,
          { id: "reply-B", threadId: "thread-1", isAccepted: false } as any,
        ],
        nextCursor: null,
        totalCount: 2,
      });

      vi.spyOn(learningInteractionsService, "acceptReply").mockRejectedValueOnce(
        new Error("Failed to accept"),
      );

      coordinator.setAcceptedAnswer({
        threadId: "thread-1",
        desiredAcceptedReplyId: "reply-B",
        currentBaselineReplyId: "reply-A",
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });

      await Promise.resolve();
      await Promise.resolve();

      // Rolled back to reply-A
      const replies = queryClient.getQueryData<LearningRepliesListResponse>(repliesKey)?.replies;
      expect(replies?.[0]?.isAccepted).toBe(true);
      expect(replies?.[1]?.isAccepted).toBe(false);

      const thread = queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0];
      expect(thread?.acceptedAnswerId).toBe("reply-A");
    });

    it("matches reconciled replies by client identity while transporting server identity", async () => {
      queryClient.setQueryData<LearningRepliesListResponse>(repliesKey, {
        replies: [
          {
            id: "server-reply-R",
            clientId: "client-reply-R",
            serverId: "server-reply-R",
            creationStatus: "confirmed",
            threadId: "thread-1",
            isAccepted: false,
          } as any,
        ],
        nextCursor: null,
        totalCount: 1,
      });

      const acceptSpy = vi.spyOn(learningInteractionsService, "acceptReply");
      coordinator.setAcceptedAnswer({
        threadId: "thread-1",
        desiredAcceptedReplyId: "server-reply-R",
        currentBaselineReplyId: null,
        debounceMs: 0,
      });

      expect(
        queryClient.getQueryData<LearningRepliesListResponse>(repliesKey)
          ?.replies[0]?.isAccepted,
      ).toBe(true);
      await Promise.resolve();
      expect(acceptSpy).toHaveBeenCalledWith("server-reply-R", {
        accepted: true,
      });
      expect(
        coordinator.getAcceptedAnswerState("thread-1")?.desiredAcceptedReplyId,
      ).toBe("server-reply-R");
    });

    it("preserves the latest accept intent when an older request fails", async () => {
      let rejectFirst!: (error: Error) => void;
      const firstRequest = new Promise<never>((_resolve, reject) => {
        rejectFirst = reject;
      });
      const acceptSpy = vi
        .spyOn(learningInteractionsService, "acceptReply")
        .mockReturnValueOnce(firstRequest)
        .mockResolvedValueOnce({
          replyId: "reply-B",
          threadId: "thread-1",
          isAccepted: true,
          acceptedAnswerId: "reply-B",
        } as any);

      coordinator.setAcceptedAnswer({
        threadId: "thread-1",
        desiredAcceptedReplyId: "reply-A",
        currentBaselineReplyId: null,
        debounceMs: 0,
      });
      await Promise.resolve();

      coordinator.setAcceptedAnswer({
        threadId: "thread-1",
        desiredAcceptedReplyId: "reply-B",
        debounceMs: 0,
      });
      rejectFirst(new Error("failed A"));
      await Promise.resolve();
      await Promise.resolve();

      expect(acceptSpy).toHaveBeenNthCalledWith(2, "reply-B", {
        accepted: true,
      });
      expect(
        queryClient.getQueryData<LearningRepliesListResponse>(repliesKey)
          ?.replies.find((reply) => reply.id === "reply-B")?.isAccepted,
      ).toBe(true);
    });

    it("reapplies accepted and pending-like projections when a stale reply fetch resolves", () => {
      sharedDesiredStateCoordinator.reset();
      sharedDesiredStateCoordinator.setQueryClient(queryClient);
      sharedDesiredStateCoordinator.setAcceptedAnswer({
        threadId: "thread-1",
        desiredAcceptedReplyId: "server-reply-R",
        currentBaselineReplyId: null,
        debounceMs: 50,
      });
      sharedDesiredStateCoordinator.setLiked({
        targetType: "reply",
        targetId: "client-reply-R",
        serverId: "server-reply-R",
        threadId: "thread-1",
        desiredLiked: true,
        currentBaseline: false,
        debounceMs: 50,
      });

      const merged = mergeRepliesWithCreationRecords(
        {
          replies: [
            {
              id: "server-reply-R",
              threadId: "thread-1",
              isAccepted: false,
              isLiked: false,
              likesCount: 0,
            } as any,
          ],
          nextCursor: null,
          totalCount: 1,
        },
        "thread-1",
        [],
      );

      expect(merged.replies[0]).toMatchObject({
        isAccepted: true,
        isLiked: true,
        likesCount: 1,
      });
    });
  });

  describe("10. Auth Boundary Isolation for All Phase 2 Operations", () => {
    it("reset() cancels pending coordinator timers and makes late network responses inert", async () => {
      let resolveBookmark: any;
      const bookmarkPromise = new Promise<{ threadId: string; bookmarked: boolean }>(
        (resolve) => {
          resolveBookmark = resolve;
        },
      );
      vi.spyOn(learningInteractionsService, "toggleBookmark").mockReturnValueOnce(
        bookmarkPromise,
      );

      const threadKey = [
        ...learningInteractionKeys.all,
        "lesson-threads",
        "c1",
        "l1",
      ];
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [{ id: "thread-1", isBookmarked: false } as any],
        nextCursor: null,
      });

      // User A bookmarks
      coordinator.setBookmarked({
        threadId: "thread-1",
        desiredBookmarked: true,
        currentBaseline: false,
        lessonContext: { courseId: "c1", lessonId: "l1" },
        debounceMs: 0,
      });

      await Promise.resolve();

      // User A logs out
      coordinator.reset();

      // User B logs in with false bookmark
      queryClient.setQueryData<LearningThreadsListResponse>(threadKey, {
        threads: [{ id: "thread-1", isBookmarked: false } as any],
        nextCursor: null,
      });

      // User A's late bookmark arrives
      resolveBookmark({ threadId: "thread-1", bookmarked: true });
      await Promise.resolve();
      await Promise.resolve();

      // User B's cache remains untouched
      expect(
        queryClient.getQueryData<LearningThreadsListResponse>(threadKey)?.threads[0]?.isBookmarked,
      ).toBe(false);
      expect(coordinator.getBookmarkState("thread-1")).toBeUndefined();
    });
  });
});
