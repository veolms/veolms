import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import type {
  LearningNote,
  LearningThread,
  LearningThreadsListResponse,
  LearningNotesListResponse,
} from "@veolms/contracts";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useLessonThreads,
  useUserNotes,
} from "../../src/services/learning-interactions/learning-interactions.queries";
import { learningInteractionsService } from "../../src/services/learning-interactions/learning-interactions.service";
import { learningInteractionKeys } from "../../src/services/learning-interactions/learning-interactions.keys";
import {
  insertOptimisticNoteInCaches,
  insertOptimisticThreadInLessonCaches,
} from "../../src/services/learning-interactions/creation-cache-updaters";

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

const thread = (id: string) =>
  ({
    id,
    academyId: "academy-1",
    courseId: "course-1",
    lessonId: "lesson-1",
    userId: "user-1",
    author: {
      id: "user-1",
      displayName: "User",
      username: "user",
      role: "Student",
    },
    kind: "comment",
    content: id,
    plainText: id,
    visibility: "public",
    status: "active",
    isLocked: false,
    likesCount: 0,
    repliesCount: 0,
    isLiked: false,
    isOwn: false,
    createdAt: "2026-09-15T10:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
  }) as unknown as LearningThread;

const note = (id: string) =>
  ({
    id,
    userId: "user-1",
    courseId: "course-1",
    lessonId: "lesson-1",
    authorName: "User",
    authorUsername: "user",
    content: id,
    plainText: id,
    visibility: "public",
    tags: [],
    likesCount: 0,
    repliesCount: 0,
    isLiked: false,
    isOwn: false,
    attachments: [],
    createdAt: "2026-09-15T10:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
  }) as unknown as LearningNote;

describe("learning interaction cursor pagination", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches lesson thread pages with the server cursor", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const listThreads = vi
      .spyOn(learningInteractionsService, "listLessonThreads")
      .mockImplementation(async (_courseId, _lessonId, query) =>
        (query?.cursor
          ? {
              threads: [thread("thread-2")],
              nextCursor: null,
            }
          : {
              threads: [thread("thread-1")],
              nextCursor: "cursor-2",
            }) as LearningThreadsListResponse,
      );

    const { result } = renderHook(
      () =>
        useLessonThreads("course-1", "lesson-1", {
          kind: "comment",
          status: "all",
          sort: "latest",
          limit: 20,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(listThreads).toHaveBeenNthCalledWith(
      1,
      "course-1",
      "lesson-1",
      expect.objectContaining({ limit: 20 }),
    );
    expect(listThreads.mock.calls[0]?.[2]).not.toHaveProperty("cursor");
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(listThreads).toHaveBeenLastCalledWith(
      "course-1",
      "lesson-1",
      expect.objectContaining({ cursor: "cursor-2", limit: 20 }),
    );
    await waitFor(() =>
      expect(
        result.current.data?.pages.flatMap((page) => page.threads),
      ).toHaveLength(2),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it("fetches Notes pages with the server cursor", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const listNotes = vi
      .spyOn(learningInteractionsService, "listNotes")
      .mockImplementation(async (query) =>
        (query?.cursor
          ? { notes: [note("note-2")], nextCursor: null }
          : { notes: [note("note-1")], nextCursor: "cursor-2" }) as
          LearningNotesListResponse,
      );

    const { result } = renderHook(
      () =>
        useUserNotes({
          courseId: "course-1",
          lessonId: "lesson-1",
          limit: 20,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(listNotes).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ limit: 20 }),
    );
    expect(listNotes.mock.calls[0]?.[0]).not.toHaveProperty("cursor");
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(listNotes).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "cursor-2", limit: 20 }),
    );
    await waitFor(() =>
      expect(result.current.data?.pages.flatMap((page) => page.notes)).toHaveLength(
        2,
      ),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it("inserts optimistic entities only into the first loaded page", () => {
    const queryClient = new QueryClient();
    const noteKey = learningInteractionKeys.notes({
      courseId: "course-1",
      lessonId: "lesson-1",
      limit: 20,
    });
    const threadKey = learningInteractionKeys.lessonThreads(
      "course-1",
      "lesson-1",
      { kind: "all", status: "all", sort: "latest", limit: 20 },
    );
    const optimisticNote = {
      ...note("client-note"),
      id: "client-note",
      clientId: "client-note",
      serverId: undefined,
      creationStatus: "pending" as const,
      localSequence: 1,
    };
    const optimisticThread = {
      ...thread("client-thread"),
      id: "client-thread",
      clientId: "client-thread",
      serverId: undefined,
      creationStatus: "pending" as const,
      localSequence: 1,
    };

    queryClient.setQueryData(noteKey, {
      pages: [
        { notes: [], nextCursor: "note-cursor-2" },
        { notes: [note("note-page-2")], nextCursor: null },
      ],
      pageParams: [null, "note-cursor-2"],
    });
    queryClient.setQueryData(threadKey, {
      pages: [
        { threads: [], nextCursor: "thread-cursor-2" },
        { threads: [thread("thread-page-2")], nextCursor: null },
      ],
      pageParams: [null, "thread-cursor-2"],
    });

    insertOptimisticNoteInCaches(
      queryClient,
      { courseId: "course-1", lessonId: "lesson-1" },
      optimisticNote,
    );
    insertOptimisticThreadInLessonCaches(
      queryClient,
      { courseId: "course-1", lessonId: "lesson-1" },
      optimisticThread,
    );

    const notes = queryClient.getQueryData(noteKey) as any;
    const threads = queryClient.getQueryData(threadKey) as any;
    expect(notes.pages[0].notes).toHaveLength(1);
    expect(notes.pages[1].notes).toHaveLength(1);
    expect(notes.pages[1].notes[0].id).toBe("note-page-2");
    expect(threads.pages[0].threads).toHaveLength(1);
    expect(threads.pages[1].threads).toHaveLength(1);
    expect(threads.pages[1].threads[0].id).toBe("thread-page-2");
  });

  it("uses the canonical limit-20 fallback keys for optimistic inserts", () => {
    const queryClient = new QueryClient();
    const optimisticNote = {
      ...note("client-note"),
      id: "client-note",
      clientId: "client-note",
      serverId: undefined,
      creationStatus: "pending" as const,
      localSequence: 1,
    };
    const optimisticThread = {
      ...thread("client-thread"),
      id: "client-thread",
      clientId: "client-thread",
      serverId: undefined,
      creationStatus: "pending" as const,
      localSequence: 1,
    };

    insertOptimisticNoteInCaches(
      queryClient,
      { courseId: "course-1", lessonId: "lesson-1" },
      optimisticNote,
    );
    insertOptimisticThreadInLessonCaches(
      queryClient,
      { courseId: "course-1", lessonId: "lesson-1" },
      optimisticThread,
    );

    const notes = queryClient.getQueryData(
      learningInteractionKeys.notes({
        courseId: "course-1",
        lessonId: "lesson-1",
        limit: 20,
      }),
    ) as any;
    const threads = queryClient.getQueryData(
      learningInteractionKeys.lessonThreads(
        "course-1",
        "lesson-1",
        { kind: "all", status: "all", sort: "latest", limit: 20 },
      ),
    ) as any;

    expect(notes.pages[0].notes[0].id).toBe("client-note");
    expect(threads.pages[0].threads[0].id).toBe("client-thread");
    expect(
      queryClient.getQueryData(
        learningInteractionKeys.notes({
          courseId: "course-1",
          lessonId: "lesson-1",
          limit: 50,
        }),
      ),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(
        learningInteractionKeys.lessonThreads(
          "course-1",
          "lesson-1",
          { kind: "all", status: "all", sort: "latest", limit: 100 },
        ),
      ),
    ).toBeUndefined();
  });
});
