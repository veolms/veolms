import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LearningThread } from "@veolms/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authStore } from "../../src/store/auth.store";
import { interactionCreationCoordinator } from "../../src/services/learning-interactions/interaction-creation-coordinator";
import { desiredStateCoordinator } from "../../src/services/learning-interactions/desired-state-coordinator";
import {
  useThreadDetails,
  useThreadReplies,
} from "../../src/services/learning-interactions/learning-interactions.queries";
import { learningInteractionKeys } from "../../src/services/learning-interactions/learning-interactions.keys";
import type { LearningThreadCacheResponse } from "../../src/services/learning-interactions/interaction-entities";
import { useCreateLessonThread } from "../../src/services/learning-interactions/learning-interactions.mutations";
import { learningInteractionsService } from "../../src/services/learning-interactions/learning-interactions.service";
import {
  getCoursePlayerPath,
  getCoursePlayerThread,
} from "../../src/learning/coursePlayerNavigation";
import { adaptLearningThreadToComment } from "../../src/learning/learning-threads.adapter";

const payload = {
  courseId: "course-1",
  lessonId: "lesson-1",
  kind: "comment" as const,
  content: "A new optimistic comment",
  visibility: "public" as const,
};

function createServerThread(
  id: string,
  content = payload.content,
  kind: LearningThread["kind"] = "comment",
): LearningThread {
  return {
    id,
    academyId: "academy-1",
    courseId: payload.courseId,
    lessonId: payload.lessonId,
    userId: "user-1",
    author: {
      id: "user-1",
      displayName: "Current User",
      username: "current-user",
      role: "Student",
    },
    kind,
    title: null,
    content,
    plainText: content,
    timestampSeconds: null,
    visibility: "public",
    status: "active",
    isLocked: false,
    acceptedAnswerId: null,
    likesCount: 0,
    repliesCount: 0,
    attachments: [],
    isLiked: false,
    isBookmarked: false,
    isFollowing: false,
    isOwn: true,
    createdAt: "2026-09-15T10:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

describe("Phase 3A optimistic thread creation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    interactionCreationCoordinator.reset();
    desiredStateCoordinator.reset();
    authStore.clearAuth();
  });

  it("inserts immediately, preserves client identity, and reconciles without invalidation", async () => {
    const queryClient = createQueryClient();
    const key = learningInteractionKeys.lessonThreads(
      payload.courseId,
      payload.lessonId,
      { kind: "all", status: "all", sort: "latest", limit: 100 },
    );
    queryClient.setQueryData<LearningThreadCacheResponse>(key, {
      threads: [],
      nextCursor: null,
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const serverThread = createServerThread("server-thread-1");
    let resolveRequest: (thread: LearningThread) => void = () => undefined;
    vi.spyOn(learningInteractionsService, "createThread").mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(
      () => useCreateLessonThread(payload.courseId, payload.lessonId),
      { wrapper: createWrapper(queryClient) },
    );

    let request: Promise<LearningThread>;
    act(() => {
      request = result.current.mutateAsync(payload);
    });

    const pending =
      queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads[0];
    expect(pending?.creationStatus).toBe("pending");
    expect(pending?.serverId).toBeUndefined();
    expect(pending?.clientId).toBeTruthy();

    resolveRequest(serverThread);
    await act(async () => {
      await request;
    });

    const confirmed =
      queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads;
    expect(confirmed).toHaveLength(1);
    expect(confirmed?.[0]?.clientId).toBe(pending?.clientId);
    expect(confirmed?.[0]?.serverId).toBe(serverThread.id);
    expect(confirmed?.[0]?.creationStatus).toBe("confirmed");
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it.each(["comment", "question"] as const)(
    "keeps a confirmed %s interactive when the first interaction happens after creation cleanup",
    async (kind) => {
      const queryClient = createQueryClient();
      const key = learningInteractionKeys.lessonThreads(
        payload.courseId,
        payload.lessonId,
        { kind: "all", status: "all", sort: "latest", limit: 100 },
      );
      queryClient.setQueryData<LearningThreadCacheResponse>(key, {
        threads: [],
        nextCursor: null,
      });
      const record = interactionCreationCoordinator.beginThreadCreation({
        queryClient,
        context: { courseId: payload.courseId, lessonId: payload.lessonId },
        payload: { ...payload, kind },
      });
      const pending =
        queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads[0];
      const serverThread = createServerThread(
        `server-${kind}-after-cleanup`,
        `Confirmed ${kind}`,
        kind,
      );

      expect(pending).toMatchObject({
        id: record.clientId,
        clientId: record.clientId,
        creationStatus: "pending",
      });
      expect(pending?.serverId).toBeUndefined();
      expect(
        interactionCreationCoordinator.confirmThread(
          queryClient,
          record.clientId,
          serverThread,
        ),
      ).toBe(true);
      expect(
        interactionCreationCoordinator.getThreadRecord(record.clientId),
      ).toBeUndefined();

      const confirmed =
        queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads[0];
      expect(confirmed).toMatchObject({
        id: serverThread.id,
        clientId: record.clientId,
        serverId: serverThread.id,
        creationStatus: "confirmed",
      });
      expect(adaptLearningThreadToComment(confirmed!)).toMatchObject({
        id: record.clientId,
        clientId: record.clientId,
        serverId: serverThread.id,
      });

      const likeSpy = vi
        .spyOn(learningInteractionsService, "toggleLike")
        .mockResolvedValue({ liked: true } as any);
      const bookmarkSpy = vi
        .spyOn(learningInteractionsService, "toggleBookmark")
        .mockResolvedValue({ bookmarked: true } as any);
      const followSpy = vi
        .spyOn(learningInteractionsService, "toggleFollow")
        .mockResolvedValue({ following: true } as any);

      const lessonContext = {
        courseId: payload.courseId,
        lessonId: payload.lessonId,
      };
      desiredStateCoordinator.setLiked({
        targetType: "thread",
        targetId: serverThread.id,
        desiredLiked: true,
        currentBaseline: false,
        lessonContext,
        queryClient,
        debounceMs: 0,
      });
      desiredStateCoordinator.setBookmarked({
        threadId: serverThread.id,
        desiredBookmarked: true,
        currentBaseline: false,
        lessonContext,
        queryClient,
        debounceMs: 0,
      });
      desiredStateCoordinator.setFollowed({
        threadId: serverThread.id,
        desiredFollowed: true,
        currentBaseline: false,
        lessonContext,
        queryClient,
        debounceMs: 0,
      });

      await waitFor(() => {
        expect(likeSpy).toHaveBeenCalledWith({
          targetType: "thread",
          targetId: serverThread.id,
        });
        expect(bookmarkSpy).toHaveBeenCalledWith(serverThread.id);
        expect(followSpy).toHaveBeenCalledWith(serverThread.id);
      });
      expect(likeSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ targetId: record.clientId }),
      );
      expect(bookmarkSpy).not.toHaveBeenCalledWith(record.clientId);
      expect(followSpy).not.toHaveBeenCalledWith(record.clientId);
    },
  );

  it("keeps mixed Comment/Q&A identities isolated through out-of-order cleanup", async () => {
    const queryClient = createQueryClient();
    const key = learningInteractionKeys.lessonThreads(
      payload.courseId,
      payload.lessonId,
      { kind: "all", status: "all", sort: "latest", limit: 100 },
    );
    queryClient.setQueryData<LearningThreadCacheResponse>(key, {
      threads: [],
      nextCursor: null,
    });

    const inputs = [
      { label: "A", kind: "comment" as const },
      { label: "B", kind: "question" as const },
      { label: "C", kind: "comment" as const },
      { label: "D", kind: "question" as const },
    ];
    const records = inputs.map(({ label, kind }) =>
      interactionCreationCoordinator.beginThreadCreation({
        queryClient,
        context: { courseId: payload.courseId, lessonId: payload.lessonId },
        payload: { ...payload, kind, content: `Thread ${label}` },
      }),
    );
    const serverThreads = inputs.map(({ label, kind }) =>
      createServerThread(`server-${label}`, `Thread ${label}`, kind),
    );

    for (const index of [3, 1, 0, 2]) {
      expect(
        interactionCreationCoordinator.confirmThread(
          queryClient,
          records[index]!.clientId,
          serverThreads[index]!,
        ),
      ).toBe(true);
    }

    const confirmed =
      queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads ?? [];
    expect(confirmed).toHaveLength(4);
    expect(new Set(confirmed.map((thread) => thread.clientId))).toEqual(
      new Set(records.map((record) => record.clientId)),
    );
    expect(new Set(confirmed.map((thread) => thread.serverId))).toEqual(
      new Set(serverThreads.map((thread) => thread.id)),
    );
    expect(confirmed.map((thread) => adaptLearningThreadToComment(thread).entryKind)).toEqual(
      expect.arrayContaining(["comment", "question", "comment", "question"]),
    );
    expect(records.every((record) =>
      interactionCreationCoordinator.getThreadRecord(record.clientId) === undefined,
    )).toBe(true);

    const likeSpy = vi
      .spyOn(learningInteractionsService, "toggleLike")
      .mockResolvedValue({ liked: true } as any);
    const bookmarkSpy = vi
      .spyOn(learningInteractionsService, "toggleBookmark")
      .mockResolvedValue({ bookmarked: true } as any);
    const followSpy = vi
      .spyOn(learningInteractionsService, "toggleFollow")
      .mockResolvedValue({ following: true } as any);
    const lessonContext = {
      courseId: payload.courseId,
      lessonId: payload.lessonId,
    };

    for (const thread of serverThreads) {
      desiredStateCoordinator.setLiked({
        targetType: "thread",
        targetId: thread.id,
        desiredLiked: true,
        currentBaseline: false,
        lessonContext,
        queryClient,
        debounceMs: 0,
      });
      desiredStateCoordinator.setBookmarked({
        threadId: thread.id,
        desiredBookmarked: true,
        currentBaseline: false,
        lessonContext,
        queryClient,
        debounceMs: 0,
      });
      desiredStateCoordinator.setFollowed({
        threadId: thread.id,
        desiredFollowed: true,
        currentBaseline: false,
        lessonContext,
        queryClient,
        debounceMs: 0,
      });
    }

    await waitFor(() => {
      expect(likeSpy).toHaveBeenCalledTimes(4);
      expect(bookmarkSpy).toHaveBeenCalledTimes(4);
      expect(followSpy).toHaveBeenCalledTimes(4);
    });
    for (const record of records) {
      expect(likeSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ targetId: record.clientId }),
      );
      expect(bookmarkSpy).not.toHaveBeenCalledWith(record.clientId);
      expect(followSpy).not.toHaveBeenCalledWith(record.clientId);
    }
  });

  it("builds a visible pending Q&A with no server identity", () => {
    const queryClient = createQueryClient();
    const questionPayload = {
      ...payload,
      kind: "question" as const,
      content: "A pending Q&A",
    };
    const record = interactionCreationCoordinator.beginThreadCreation({
      queryClient,
      context: { courseId: payload.courseId, lessonId: payload.lessonId },
      payload: questionPayload,
    });

    expect(record.optimisticThread.kind).toBe("question");
    expect(record.optimisticThread.clientId).toBeTruthy();
    expect(record.optimisticThread.serverId).toBeUndefined();
    expect(record.optimisticThread.creationStatus).toBe("pending");
  });

  it("handles simultaneous creates and out-of-order responses without duplicates", async () => {
    const queryClient = createQueryClient();
    const key = learningInteractionKeys.lessonThreads(
      payload.courseId,
      payload.lessonId,
      { kind: "all", status: "all", sort: "latest", limit: 100 },
    );
    queryClient.setQueryData<LearningThreadCacheResponse>(key, {
      threads: [],
      nextCursor: null,
    });
    const requests: Array<(thread: LearningThread) => void> = [];
    vi.spyOn(learningInteractionsService, "createThread").mockImplementation(
      () =>
        new Promise((resolve) => {
          requests.push(resolve);
        }),
    );

    const { result } = renderHook(
      () => useCreateLessonThread(payload.courseId, payload.lessonId),
      { wrapper: createWrapper(queryClient) },
    );
    let first: Promise<LearningThread>;
    let second: Promise<LearningThread>;
    act(() => {
      first = result.current.mutateAsync(payload);
      second = result.current.mutateAsync({
        ...payload,
        content: "Second comment",
      });
    });

    await waitFor(() => expect(requests).toHaveLength(2));

    const pending =
      queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads;
    expect(pending).toHaveLength(2);
    const firstClientId = pending?.[0]?.clientId;
    const secondClientId = pending?.[1]?.clientId;

    requests[1]?.(createServerThread("server-thread-2", "Second comment"));
    requests[0]?.(createServerThread("server-thread-1"));
    await act(async () => {
      await Promise.all([first, second]);
    });

    const confirmed =
      queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads;
    expect(confirmed).toHaveLength(2);
    expect(new Set(confirmed?.map((thread) => thread.clientId))).toEqual(
      new Set([firstClientId, secondClientId]),
    );
    expect(new Set(confirmed?.map((thread) => thread.serverId))).toEqual(
      new Set(["server-thread-1", "server-thread-2"]),
    );
  });

  it("isolates a failed middle create from other concurrent creates", async () => {
    const queryClient = createQueryClient();
    const key = learningInteractionKeys.lessonThreads(
      payload.courseId,
      payload.lessonId,
      { kind: "all", status: "all", sort: "latest", limit: 100 },
    );
    queryClient.setQueryData<LearningThreadCacheResponse>(key, {
      threads: [],
      nextCursor: null,
    });
    const requests: Array<{
      resolve: (thread: LearningThread) => void;
      reject: (error: Error) => void;
    }> = [];
    vi.spyOn(learningInteractionsService, "createThread").mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          requests.push({ resolve, reject });
        }),
    );

    const { result } = renderHook(
      () => useCreateLessonThread(payload.courseId, payload.lessonId),
      { wrapper: createWrapper(queryClient) },
    );
    let first!: Promise<LearningThread>;
    let second!: Promise<LearningThread>;
    let third!: Promise<LearningThread>;
    act(() => {
      first = result.current.mutateAsync({ ...payload, content: "A" });
      second = result.current.mutateAsync({ ...payload, content: "B" });
      third = result.current.mutateAsync({ ...payload, content: "C" });
    });

    await waitFor(() => expect(requests).toHaveLength(3));
    expect(
      queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads,
    ).toHaveLength(3);

    requests[2]?.resolve(createServerThread("server-thread-c", "C"));
    requests[0]?.resolve(createServerThread("server-thread-a", "A"));
    requests[1]?.reject(new Error("B failed"));
    await act(async () => {
      await Promise.allSettled([first, second, third]);
    });

    const remaining =
      queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads ?? [];
    expect(remaining).toHaveLength(2);
    expect(new Set(remaining.map((thread) => thread.plainText))).toEqual(
      new Set(["A", "C"]),
    );
    expect(new Set(remaining.map((thread) => thread.serverId))).toEqual(
      new Set(["server-thread-a", "server-thread-c"]),
    );
  });

  it("removes a failed optimistic create and never restores later composer state", async () => {
    const queryClient = createQueryClient();
    const key = learningInteractionKeys.lessonThreads(
      payload.courseId,
      payload.lessonId,
      { kind: "all", status: "all", sort: "latest", limit: 100 },
    );
    queryClient.setQueryData<LearningThreadCacheResponse>(key, {
      threads: [],
      nextCursor: null,
    });
    vi.spyOn(learningInteractionsService, "createThread").mockRejectedValue(
      new Error("create failed"),
    );

    const { result } = renderHook(
      () => useCreateLessonThread(payload.courseId, payload.lessonId),
      { wrapper: createWrapper(queryClient) },
    );
    await act(async () => {
      await expect(result.current.mutateAsync(payload)).rejects.toThrow(
        "create failed",
      );
    });

    expect(
      queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads,
    ).toEqual([]);
    expect(
      interactionCreationCoordinator.getThreadRecord("client-missing"),
    ).toBeUndefined();
  });

  it("does not reconcile a response after the auth generation changes", () => {
    const queryClient = createQueryClient();
    const record = interactionCreationCoordinator.beginThreadCreation({
      queryClient,
      context: { courseId: payload.courseId, lessonId: payload.lessonId },
      payload,
    });
    authStore.clearAuth();

    expect(
      interactionCreationCoordinator.confirmThread(
        queryClient,
        record.clientId,
        createServerThread("server-thread-old-account"),
      ),
    ).toBe(false);
    expect(
      interactionCreationCoordinator.getThreadRecord(record.clientId),
    ).toBeUndefined();
  });

  it("blocks client IDs from transport and from pending thread queries", async () => {
    const queryClient = createQueryClient();
    const record = interactionCreationCoordinator.beginThreadCreation({
      queryClient,
      context: { courseId: payload.courseId, lessonId: payload.lessonId },
      payload,
    });
    const getThreadSpy = vi.spyOn(learningInteractionsService, "getThread");
    const listRepliesSpy = vi.spyOn(learningInteractionsService, "listReplies");

    expect(() =>
      learningInteractionsService.getThread(record.clientId),
    ).toThrow();
    expect(() =>
      learningInteractionsService.listReplies(record.clientId),
    ).toThrow();
    getThreadSpy.mockClear();
    listRepliesSpy.mockClear();

    renderHook(
      () => ({
        details: useThreadDetails(record.clientId, { enabled: true }),
        replies: useThreadReplies(record.clientId, undefined, {
          enabled: true,
        }),
      }),
      { wrapper: createWrapper(queryClient) },
    );
    await waitFor(() => expect(getThreadSpy).not.toHaveBeenCalled());
    expect(listRepliesSpy).not.toHaveBeenCalled();
  });

  it("never writes a client ID into the canonical course-player URL", () => {
    expect(getCoursePlayerThread("?thread=client-thread-temp")).toBeNull();
    expect(
      getCoursePlayerPath(
        "course-1",
        "courses",
        1,
        undefined,
        "client-thread-temp",
      ),
    ).not.toContain("thread=");
  });
});
