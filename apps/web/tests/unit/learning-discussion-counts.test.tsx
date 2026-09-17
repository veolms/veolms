import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningThread } from "@veolms/contracts";
import {
  getDiscussionCountForFilter,
  type InteractionCapabilities,
} from "../../src/learning/discussionFeed";
import {
  useLessonInteractionCounts,
  type LessonInteractionCounts,
} from "../../src/services/learning-interactions/learning-interactions.queries";
import {
  useCreateLessonThread,
  useCreateNote,
  useDeleteNote,
  useDeleteThread,
} from "../../src/services/learning-interactions/learning-interactions.mutations";
import { learningInteractionKeys } from "../../src/services/learning-interactions/learning-interactions.keys";

const serviceMocks = vi.hoisted(() => ({
  listLessonThreads: vi.fn(),
  listNotes: vi.fn(),
  createThread: vi.fn(),
  createNote: vi.fn(),
  deleteThread: vi.fn(),
  deleteNote: vi.fn(),
}));

const creationCoordinatorMocks = vi.hoisted(() => ({
  beginThreadCreation: vi.fn(() => ({ clientId: "client-thread" })),
  confirmThread: vi.fn(),
  failThread: vi.fn(),
  beginNoteCreation: vi.fn(() => ({ clientId: "client-note" })),
  confirmNote: vi.fn(),
  failNote: vi.fn(),
}));

vi.mock(
  "../../src/services/learning-interactions/learning-interactions.service",
  () => ({
    learningInteractionsService: serviceMocks,
  }),
);

vi.mock(
  "../../src/services/learning-interactions/interaction-creation-coordinator",
  () => ({
    interactionCreationCoordinator: creationCoordinatorMocks,
  }),
);

const allCapabilities: InteractionCapabilities = {
  allowComments: true,
  allowNotes: true,
  allowQa: true,
};

function threadResponse(totalCount: number) {
  return { threads: [], nextCursor: null, totalCount };
}

function noteResponse(totalCount: number) {
  return { notes: [], nextCursor: null, totalCount };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function TestQueryWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("Learning Space discussion counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("waits for every enabled count request before exposing one total", async () => {
    const comments = deferred<ReturnType<typeof threadResponse>>();
    const qna = deferred<ReturnType<typeof threadResponse>>();
    const notes = deferred<ReturnType<typeof noteResponse>>();
    serviceMocks.listLessonThreads.mockImplementation(
      (_courseId: string, _lessonId: string, query: { kind?: string }) =>
        query.kind === "comment" ? comments.promise : qna.promise,
    );
    serviceMocks.listNotes.mockReturnValue(notes.promise);

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () =>
        useLessonInteractionCounts("course-1", "lesson-1", {
          capabilities: allCapabilities,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(serviceMocks.listNotes).toHaveBeenCalledOnce());
    expect(result.current.data).toBeUndefined();

    await act(async () => comments.resolve(threadResponse(12)));
    expect(result.current.data).toBeUndefined();

    await act(async () => qna.resolve(threadResponse(4)));
    expect(result.current.data).toBeUndefined();

    await act(async () => notes.resolve(noteResponse(8)));
    await waitFor(() => expect(result.current.data?.total).toBe(24));
    expect(result.current.data).toEqual({
      comments: 12,
      qna: 4,
      notes: 8,
      total: 24,
    });
  });

  it("does not request disabled types and treats them as zero", async () => {
    serviceMocks.listLessonThreads.mockResolvedValue(threadResponse(12));
    serviceMocks.listNotes.mockResolvedValue(noteResponse(8));
    const queryClient = createQueryClient();
    const { result } = renderHook(
      () =>
        useLessonInteractionCounts("course-1", "lesson-1", {
          capabilities: {
            allowComments: true,
            allowNotes: false,
            allowQa: false,
          },
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.data?.total).toBe(12));
    expect(serviceMocks.listLessonThreads).toHaveBeenCalledOnce();
    expect(serviceMocks.listLessonThreads).toHaveBeenCalledWith(
      "course-1",
      "lesson-1",
      expect.objectContaining({ kind: "comment", limit: 1 }),
    );
    expect(serviceMocks.listNotes).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({
      comments: 12,
      qna: 0,
      notes: 0,
      total: 12,
    });
  });

  it("maps All, Comments, Q&A, and Notes to the matching root count", () => {
    const counts: LessonInteractionCounts = {
      comments: 12,
      qna: 4,
      notes: 8,
      total: 24,
    };

    expect(getDiscussionCountForFilter(counts, "all")).toBe(24);
    expect(getDiscussionCountForFilter(counts, "comment")).toBe(12);
    expect(getDiscussionCountForFilter(counts, "question")).toBe(4);
    expect(getDiscussionCountForFilter(counts, "note")).toBe(8);
  });

  it("does not expose a partial total when one required request fails", async () => {
    serviceMocks.listLessonThreads.mockImplementation(
      (_courseId: string, _lessonId: string, query: { kind?: string }) =>
        query.kind === "comment"
          ? Promise.resolve(threadResponse(12))
          : Promise.reject(new Error("Q&A unavailable")),
    );
    serviceMocks.listNotes.mockResolvedValue(noteResponse(8));

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () =>
        useLessonInteractionCounts("course-1", "lesson-1", {
          capabilities: allCapabilities,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("keeps the previous complete count during a failed background refetch", async () => {
    let refetching = false;
    const nextComments = deferred<ReturnType<typeof threadResponse>>();
    const nextQna = deferred<ReturnType<typeof threadResponse>>();
    const nextNotes = deferred<ReturnType<typeof noteResponse>>();
    serviceMocks.listLessonThreads.mockImplementation(
      (_courseId: string, _lessonId: string, query: { kind?: string }) => {
        if (!refetching) {
          return Promise.resolve(
            query.kind === "comment" ? threadResponse(12) : threadResponse(4),
          );
        }
        return query.kind === "comment"
          ? nextComments.promise
          : nextQna.promise;
      },
    );
    serviceMocks.listNotes.mockImplementation(() =>
      refetching ? nextNotes.promise : Promise.resolve(noteResponse(8)),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () =>
        useLessonInteractionCounts("course-1", "lesson-1", {
          capabilities: allCapabilities,
        }),
      { wrapper: createWrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.data?.total).toBe(24));

    refetching = true;
    act(() => {
      void queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.lessonInteractionCountsRoot(
          "course-1",
          "lesson-1",
        ),
      });
    });
    await waitFor(() =>
      expect(serviceMocks.listLessonThreads).toHaveBeenCalledTimes(4),
    );
    expect(result.current.data?.total).toBe(24);

    await act(async () => {
      nextComments.resolve(threadResponse(20));
      nextQna.reject(new Error("Q&A unavailable"));
      nextNotes.resolve(noteResponse(9));
    });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.data?.total).toBe(24);
  });

  it("uses only lightweight count requests, independent of feed pages or replies", async () => {
    serviceMocks.listLessonThreads.mockResolvedValue(threadResponse(12));
    serviceMocks.listNotes.mockResolvedValue(noteResponse(8));
    const queryClient = createQueryClient();
    const { result } = renderHook(
      () =>
        useLessonInteractionCounts("course-1", "lesson-1", {
          capabilities: allCapabilities,
          mine: true,
        }),
      { wrapper: createWrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.data?.total).toBe(32));

    expect(serviceMocks.listLessonThreads).toHaveBeenCalledWith(
      "course-1",
      "lesson-1",
      expect.objectContaining({ kind: "comment", limit: 1, mine: true }),
    );
    expect(serviceMocks.listLessonThreads).toHaveBeenCalledWith(
      "course-1",
      "lesson-1",
      expect.objectContaining({ kind: "question", limit: 1, mine: true }),
    );
    expect(serviceMocks.listNotes).toHaveBeenCalledWith({
      courseId: "course-1",
      lessonId: "lesson-1",
      limit: 1,
      mine: true,
    });
    expect(
      serviceMocks.listLessonThreads.mock.calls[0]?.[2],
    ).not.toHaveProperty("cursor");
    expect(serviceMocks.listNotes.mock.calls[0]?.[0]).not.toHaveProperty(
      "cursor",
    );
  });

  it("invalidates counts only after confirmed root mutations", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);
    const serverThread = { id: "thread-1" } as LearningThread;
    serviceMocks.createThread.mockResolvedValue(serverThread);
    serviceMocks.createNote.mockResolvedValue({
      id: "note-1",
      courseId: "course-1",
      lessonId: "lesson-1",
    });
    serviceMocks.deleteThread.mockResolvedValue({ message: "deleted" });
    serviceMocks.deleteNote.mockResolvedValue({ message: "deleted" });

    const { result: createThreadResult } = renderHook(
      () => useCreateLessonThread("course-1", "lesson-1"),
      { wrapper },
    );
    await act(async () =>
      createThreadResult.current.mutateAsync({
        courseId: "course-1",
        lessonId: "lesson-1",
        kind: "comment",
        content: "A root comment",
        visibility: "public",
      }),
    );

    const { result: createNoteResult } = renderHook(() => useCreateNote(), {
      wrapper,
    });
    await act(async () =>
      createNoteResult.current.mutateAsync({
        courseId: "course-1",
        lessonId: "lesson-1",
        content: "A root note",
        visibility: "private",
      }),
    );

    const { result: deleteThreadResult } = renderHook(
      () => useDeleteThread("course-1", "lesson-1"),
      { wrapper },
    );
    await act(async () => deleteThreadResult.current.mutateAsync("thread-1"));

    const { result: deleteNoteResult } = renderHook(
      () => useDeleteNote("course-1", "lesson-1"),
      { wrapper },
    );
    await act(async () => deleteNoteResult.current.mutateAsync("note-1"));

    expect(invalidateQueries).toHaveBeenCalledTimes(4);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: learningInteractionKeys.lessonInteractionCountsRoot(
        "course-1",
        "lesson-1",
      ),
    });
  });

  it("does not invalidate during a pending deletion", async () => {
    const deletion = deferred<{ message: string }>();
    serviceMocks.deleteThread.mockReturnValue(deletion.promise);
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => useDeleteThread("course-1", "lesson-1"),
      { wrapper: createWrapper(queryClient) },
    );

    let mutationPromise!: Promise<unknown>;
    act(() => {
      mutationPromise = result.current.mutateAsync("thread-1");
    });
    expect(invalidateQueries).not.toHaveBeenCalled();

    await act(async () => deletion.resolve({ message: "deleted" }));
    await mutationPromise;
    expect(invalidateQueries).toHaveBeenCalledOnce();
  });
});
