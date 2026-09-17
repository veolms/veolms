import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LearningReply, LearningThread } from "@veolms/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authStore } from "../../src/store/auth.store";
import { interactionCreationCoordinator } from "../../src/services/learning-interactions/interaction-creation-coordinator";
import { desiredStateCoordinator } from "../../src/services/learning-interactions/desired-state-coordinator";
import {
  flattenReplyPages,
  useThreadDetails,
  useThreadReplies,
} from "../../src/services/learning-interactions/learning-interactions.queries";
import { learningInteractionKeys } from "../../src/services/learning-interactions/learning-interactions.keys";
import type {
  LearningRepliesCacheResponse,
  LearningThreadCacheResponse,
} from "../../src/services/learning-interactions/interaction-entities";
import { getClientEntityId } from "../../src/services/learning-interactions/interaction-entities";
import {
  useCreateLessonThread,
  useCreateReply,
} from "../../src/services/learning-interactions/learning-interactions.mutations";
import { learningInteractionsService } from "../../src/services/learning-interactions/learning-interactions.service";
import {
  getCoursePlayerPath,
  getCoursePlayerThread,
} from "../../src/learning/coursePlayerNavigation";
import { adaptLearningThreadToComment } from "../../src/learning/learning-threads.adapter";
import type { LocalComposerAttachment } from "../../src/services/learning-interactions/attachment-model";

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

function createServerReply(
  id: string,
  threadId: string,
  content: string,
): LearningReply {
  return {
    id,
    threadId,
    userId: "user-1",
    author: {
      id: "user-1",
      displayName: "Current User",
      username: "current-user",
      avatarUrl: null,
      role: "Student",
    },
    content,
    plainText: content,
    status: "active",
    isAccepted: false,
    likesCount: 0,
    isLiked: false,
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
    "keeps a %s attachment local until optimistic creation has started, then creates with uploaded IDs",
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
      const localAttachment: LocalComposerAttachment = {
        id: `client-attachment-${kind}`,
        file: new File(["image"], `${kind}.png`, { type: "image/png" }),
        fileName: `${kind}.png`,
        mimeType: "image/png",
        fileSize: 5,
        kind: "image",
        mediaType: "image",
        localPreviewUrl: `blob:${kind}`,
      };
      let resolveUpload: (value: any) => void = () => undefined;
      let reportUploadProgress:
        | ((event: { loaded: number; total?: number }) => void)
        | undefined;
      vi.spyOn(learningInteractionsService, "uploadAttachmentDirect").mockImplementation(
        (_file, onProgress) =>
          new Promise((resolve) => {
            resolveUpload = resolve;
            reportUploadProgress = onProgress;
          }),
      );
      let resolveCreate: (value: LearningThread) => void = () => undefined;
      vi.spyOn(learningInteractionsService, "createThread").mockImplementation(
        () => new Promise((resolve) => {
          resolveCreate = resolve;
        }),
      );

      const { result } = renderHook(
        () => useCreateLessonThread(payload.courseId, payload.lessonId),
        { wrapper: createWrapper(queryClient) },
      );
      const clientId = `client-thread-${kind}-attachment`;
      let request!: Promise<LearningThread>;
      act(() => {
        request = result.current.mutateAsync({
          ...payload,
          kind,
          __clientId: clientId,
          __localAttachments: [localAttachment],
        });
      });

      await waitFor(() => {
        const pending = queryClient.getQueryData<LearningThreadCacheResponse>(key)
          ?.threads[0];
        expect(pending).toMatchObject({
          clientId,
          creationStatus: "pending",
          attachments: [
            {
              id: localAttachment.id,
              clientId: localAttachment.id,
              fileUrl: "blob:" + kind,
              uploadState: "uploading",
            },
          ],
        });
      });
      expect(learningInteractionsService.createThread).not.toHaveBeenCalled();

      act(() => reportUploadProgress?.({ loaded: 2, total: 5 }));
      await waitFor(() => {
        expect(
          queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads[0]
            ?.attachments?.[0]?.uploadProgress,
        ).toBe(0.4);
      });

      resolveUpload({
        id: `server-attachment-${kind}`,
        url: `/uploads/${kind}.png`,
        fileName: `${kind}.png`,
        mediaType: "image",
        mimeType: "image/png",
        size: 5,
        kind: "image",
      });
      await waitFor(() =>
        expect(learningInteractionsService.createThread).toHaveBeenCalledWith(
          payload.courseId,
          payload.lessonId,
          expect.objectContaining({
            kind,
            attachmentIds: [`server-attachment-${kind}`],
          }),
        ),
      );

      resolveCreate({
        ...createServerThread(`server-thread-${kind}`, payload.content, kind),
        attachments: [
          {
            id: `server-attachment-${kind}`,
            kind: "image",
            fileName: `${kind}.png`,
            fileUrl: `/uploads/${kind}.png`,
            mimeType: "image/png",
            fileSize: 5,
          },
        ],
      });
      await act(async () => {
        await request;
      });

      expect(
        queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads[0]
          ?.attachments?.[0],
      ).toMatchObject({
        id: localAttachment.id,
        clientId: localAttachment.id,
        serverId: `server-attachment-${kind}`,
        fileUrl: `/uploads/${kind}.png`,
        uploadState: "confirmed",
      });
    },
  );

  it("keeps an optimistic Reply visible while upload resolves, then creates it with the server attachment ID", async () => {
    const queryClient = createQueryClient();
    const parentServerId = "server-parent-with-reply";
    const key = learningInteractionKeys.threadReplies(parentServerId, undefined);
    queryClient.setQueryData<LearningRepliesCacheResponse>(key, {
      replies: [],
      nextCursor: null,
    });
    const localAttachment: LocalComposerAttachment = {
      id: "client-reply-attachment",
      file: new File(["reply"], "reply.txt", { type: "text/plain" }),
      fileName: "reply.txt",
      mimeType: "text/plain",
      fileSize: 5,
      kind: "document",
      mediaType: "document",
    };
    let resolveUpload: (value: any) => void = () => undefined;
    vi.spyOn(learningInteractionsService, "uploadAttachmentDirect").mockImplementation(
      () => new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    let resolveCreate: (value: LearningReply) => void = () => undefined;
    vi.spyOn(learningInteractionsService, "createReply").mockImplementation(
      () => new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const { result } = renderHook(() => useCreateReply(), {
      wrapper: createWrapper(queryClient),
    });
    const replyClientId = "client-reply-with-attachment";

    act(() => {
      interactionCreationCoordinator.beginReplyCreation({
        queryClient,
        parentClientId: "client-parent-with-reply",
        parentServerId,
        payload: { content: "Reply with an attachment" },
        clientId: replyClientId,
        attachments: [
          {
            id: localAttachment.id,
            clientId: localAttachment.id,
            kind: localAttachment.kind,
            fileName: localAttachment.fileName,
            fileUrl: "",
            mimeType: localAttachment.mimeType,
            fileSize: localAttachment.fileSize,
            uploadState: "uploading",
            uploadProgress: 0,
          },
        ],
        localAttachments: [localAttachment],
        dispatch: (threadId, replyPayload) =>
          result.current.mutateAsync({
            ...replyPayload,
            __serverThreadId: threadId,
            __clientId: replyClientId,
            __localAttachments: [localAttachment],
          }),
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<LearningRepliesCacheResponse>(key)?.replies[0])
        .toMatchObject({
          clientId: replyClientId,
          creationStatus: "pending",
          attachments: [{ id: localAttachment.id, uploadState: "uploading" }],
        });
    });
    expect(learningInteractionsService.createReply).not.toHaveBeenCalled();

    resolveUpload({
      id: "server-reply-attachment",
      url: "/uploads/reply.txt",
      fileName: "reply.txt",
      mediaType: "document",
      mimeType: "text/plain",
      size: 5,
      kind: "document",
    });
    await waitFor(() =>
      expect(learningInteractionsService.createReply).toHaveBeenCalledWith(
        parentServerId,
        expect.objectContaining({ attachmentIds: ["server-reply-attachment"] }),
      ),
    );

    resolveCreate({
      ...createServerReply(
        "server-reply-with-attachment",
        parentServerId,
        "Reply with an attachment",
      ),
      attachments: [
        {
          id: "server-reply-attachment",
          kind: "document",
          fileName: "reply.txt",
          fileUrl: "/uploads/reply.txt",
          mimeType: "text/plain",
          fileSize: 5,
        },
      ],
    });
    await waitFor(() => {
      expect(queryClient.getQueryData<LearningRepliesCacheResponse>(key)?.replies[0])
        .toMatchObject({
          clientId: replyClientId,
          serverId: "server-reply-with-attachment",
          attachments: [
            {
              id: localAttachment.id,
              serverId: "server-reply-attachment",
              uploadState: "confirmed",
            },
          ],
        });
    });
  });

  it("removes the optimistic Thread when upload fails before create transport", async () => {
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
    vi.spyOn(learningInteractionsService, "uploadAttachmentDirect").mockRejectedValue(
      new Error("upload failed"),
    );
    const createSpy = vi.spyOn(learningInteractionsService, "createThread");
    const { result } = renderHook(
      () => useCreateLessonThread(payload.courseId, payload.lessonId),
      { wrapper: createWrapper(queryClient) },
    );

    await expect(
      result.current.mutateAsync({
        ...payload,
        __clientId: "client-thread-upload-failure",
        __localAttachments: [
          {
            id: "client-failed-attachment",
            file: new File(["failed"], "failed.pdf", {
              type: "application/pdf",
            }),
            fileName: "failed.pdf",
            mimeType: "application/pdf",
            fileSize: 6,
            kind: "document",
            mediaType: "document",
          },
        ],
      }),
    ).rejects.toThrow("upload failed");

    expect(queryClient.getQueryData<LearningThreadCacheResponse>(key)?.threads)
      .toEqual([]);
    expect(createSpy).not.toHaveBeenCalled();
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
    expect(
      confirmed.map((thread) => adaptLearningThreadToComment(thread).entryKind),
    ).toEqual(
      expect.arrayContaining(["comment", "question", "comment", "question"]),
    );
    expect(
      records.every(
        (record) =>
          interactionCreationCoordinator.getThreadRecord(record.clientId) ===
          undefined,
      ),
    ).toBe(true);

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
        { threadId: "client-thread-temp" },
      ),
    ).not.toContain("thread=");
  });

  it("creates and reconciles a confirmed-parent reply without invalidation", async () => {
    const queryClient = createQueryClient();
    const parentId = "server-parent-1";
    const replyKey = learningInteractionKeys.threadReplies(parentId, undefined);
    queryClient.setQueryData<LearningRepliesCacheResponse>(replyKey, {
      replies: [],
      nextCursor: null,
      totalCount: 0,
    });
    queryClient.setQueryData<LearningThread>(
      learningInteractionKeys.threadDetails(parentId),
      createServerThread(parentId),
    );
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    let resolveReply!: (reply: LearningReply) => void;
    const record = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: "client-parent-1",
      parentServerId: parentId,
      payload: { content: "Reply A" },
      dispatch: vi.fn(
        () => new Promise<LearningReply>((resolve) => (resolveReply = resolve)),
      ),
    });

    const pending =
      queryClient.getQueryData<LearningRepliesCacheResponse>(replyKey);
    expect(pending?.replies[0]).toMatchObject({
      id: record.clientId,
      clientId: record.clientId,
      creationStatus: "pending",
      serverId: undefined,
    });
    expect(pending?.totalCount).toBe(1);

    resolveReply!(createServerReply("server-reply-1", parentId, "Reply A"));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<LearningRepliesCacheResponse>(replyKey)
          ?.replies[0],
      ).toMatchObject({
        id: "server-reply-1",
        clientId: record.clientId,
        serverId: "server-reply-1",
        creationStatus: "confirmed",
      }),
    );
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("holds pending-parent replies, releases them with the server parent ID, and discards them on parent failure", async () => {
    const queryClient = createQueryClient();
    const parent = interactionCreationCoordinator.beginThreadCreation({
      queryClient,
      context: { courseId: payload.courseId, lessonId: payload.lessonId },
      payload,
    });
    const dispatch = vi.fn(
      (parentId: string, replyPayload: { content: string }) =>
        Promise.resolve(
          createServerReply(
            `server-${replyPayload.content.replace(" ", "-")}`,
            parentId,
            replyPayload.content,
          ),
        ),
    );
    const first = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: parent.clientId,
      payload: { content: "Reply 1" },
      dispatch,
    });
    const second = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: parent.clientId,
      payload: { content: "Reply 2" },
      dispatch,
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(
      queryClient
        .getQueryData<LearningRepliesCacheResponse>(
          learningInteractionKeys.threadReplies(parent.clientId, undefined),
        )
        ?.replies.map((reply) => getClientEntityId(reply)),
    ).toEqual([first.clientId, second.clientId]);

    const serverParent = createServerThread("server-parent-2");
    interactionCreationCoordinator.confirmThread(
      queryClient,
      parent.clientId,
      serverParent,
    );
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls.map(([parentId]) => parentId)).toEqual([
      serverParent.id,
      serverParent.id,
    ]);
    expect(
      queryClient
        .getQueryData<LearningRepliesCacheResponse>(
          learningInteractionKeys.threadReplies(serverParent.id, undefined),
        )
        ?.replies.map((reply) => getClientEntityId(reply)),
    ).toEqual([first.clientId, second.clientId]);

    interactionCreationCoordinator.reset();
    const failedParent = interactionCreationCoordinator.beginThreadCreation({
      queryClient,
      context: { courseId: payload.courseId, lessonId: payload.lessonId },
      payload: { ...payload, content: "Failed parent" },
    });
    const failedReply = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: failedParent.clientId,
      payload: { content: "Discard me" },
      dispatch,
    });
    expect(
      interactionCreationCoordinator.failThread(
        queryClient,
        failedParent.clientId,
      ),
    ).toBe(true);
    expect(
      interactionCreationCoordinator.getReplyRecord(failedReply.clientId),
    ).toBeUndefined();
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(
      queryClient.getQueryData<LearningRepliesCacheResponse>(
        learningInteractionKeys.threadReplies(failedParent.clientId, undefined),
      )?.replies,
    ).toEqual([]);
  });

  it("releases a reply registered after parent confirmation from durable resolution state", () => {
    const queryClient = createQueryClient();
    const parent = interactionCreationCoordinator.beginThreadCreation({
      queryClient,
      context: { courseId: payload.courseId, lessonId: payload.lessonId },
      payload,
    });
    const serverParent = createServerThread("server-parent-late");
    interactionCreationCoordinator.confirmThread(
      queryClient,
      parent.clientId,
      serverParent,
    );

    const dispatch = vi.fn(() => Promise.resolve(
      createServerReply("server-reply-late", serverParent.id, "Reply late"),
    ));
    const reply = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: parent.clientId,
      payload: { content: "Reply late" },
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(serverParent.id, reply.payload);
    expect(
      interactionCreationCoordinator.getReplyRecord(reply.clientId)?.status,
    ).toBe("dispatching");
    expect(
      interactionCreationCoordinator.getThreadResolution(parent.clientId),
    ).toMatchObject({
      status: "confirmed",
      serverId: serverParent.id,
    });
  });

  it("discards a reply registered after parent failure without a POST or descendant toast", () => {
    const queryClient = createQueryClient();
    const parent = interactionCreationCoordinator.beginThreadCreation({
      queryClient,
      context: { courseId: payload.courseId, lessonId: payload.lessonId },
      payload,
    });
    expect(
      interactionCreationCoordinator.failThread(queryClient, parent.clientId),
    ).toBe(true);

    const dispatch = vi.fn();
    const reply = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: parent.clientId,
      payload: { content: "Discarded late" },
      dispatch,
      onFailure: vi.fn(),
    });

    expect(reply.status).toBe("failed");
    expect(dispatch).not.toHaveBeenCalled();
    expect(interactionCreationCoordinator.getReplyRecord(reply.clientId)).toBeUndefined();
    expect(
      interactionCreationCoordinator.getThreadResolution(parent.clientId),
    ).toMatchObject({ status: "failed" });
    expect(desiredStateCoordinator.getReplyResolution(reply.clientId)).toMatchObject({
      status: "failed",
    });
  });

  it("releases children registered before and after parent confirmation exactly once", () => {
    const queryClient = createQueryClient();
    const parent = interactionCreationCoordinator.beginThreadCreation({
      queryClient,
      context: { courseId: payload.courseId, lessonId: payload.lessonId },
      payload,
    });
    const dispatch = vi.fn(() => Promise.resolve(
      createServerReply("server-reply-child", "server-parent-many", "child"),
    ));
    const first = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: parent.clientId,
      payload: { content: "R1" },
      dispatch,
    });

    interactionCreationCoordinator.confirmThread(
      queryClient,
      parent.clientId,
      createServerThread("server-parent-many"),
    );
    const second = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: parent.clientId,
      payload: { content: "R2" },
      dispatch,
    });
    const third = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: parent.clientId,
      payload: { content: "R3" },
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(
      [first, second, third].map(
        (reply) =>
          interactionCreationCoordinator.getReplyRecord(reply.clientId)?.status,
      ),
    ).toEqual(["dispatching", "dispatching", "dispatching"]);
    expect(
      interactionCreationCoordinator.confirmThread(
        queryClient,
        parent.clientId,
        createServerThread("server-parent-many"),
      ),
    ).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  it.each(["GET-first", "POST-first"] as const)(
    "preserves a reply across a stale %s response and keeps stable identity",
    async (race) => {
      const queryClient = createQueryClient();
      const parentId = `server-parent-${race}`;
      let resolveFetch!: (response: {
        replies: LearningReply[];
        nextCursor: string | null;
        totalCount?: number;
      }) => void;
      vi.spyOn(learningInteractionsService, "listReplies").mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      );
      const { result } = renderHook(
        () => useThreadReplies(parentId, undefined, { enabled: false }),
        { wrapper: createWrapper(queryClient) },
      );
      let resolveCreate!: (reply: LearningReply) => void;
      const record = interactionCreationCoordinator.beginReplyCreation({
        queryClient,
        parentClientId: "client-parent-race",
        parentServerId: parentId,
        payload: { content: `Reply ${race}` },
        dispatch: vi.fn(
          () =>
            new Promise<LearningReply>((resolve) => (resolveCreate = resolve)),
        ),
      });

      const fetchPromise = result.current.refetch();
      await waitFor(() =>
        expect(learningInteractionsService.listReplies).toHaveBeenCalled(),
      );

      const serverReply = createServerReply(
        `server-reply-${race}`,
        parentId,
        `Reply ${race}`,
      );
      if (race === "POST-first") {
        resolveCreate(serverReply);
        await waitFor(() =>
          expect(
            flattenReplyPages(
              queryClient.getQueryData<LearningRepliesCacheResponse>(
                learningInteractionKeys.threadReplies(parentId, undefined),
              ),
              parentId,
            )[0],
          ).toMatchObject({
            clientId: record.clientId,
            serverId: serverReply.id,
            creationStatus: "confirmed",
          }),
        );
      }

      resolveFetch({
        replies: race === "POST-first" ? [serverReply] : [],
        nextCursor: null,
        totalCount: race === "POST-first" ? 1 : 0,
      });
      await act(async () => {
        await fetchPromise;
      });

      if (race === "GET-first") {
        expect(
          flattenReplyPages(
            queryClient.getQueryData<LearningRepliesCacheResponse>(
              learningInteractionKeys.threadReplies(parentId, undefined),
            ),
            parentId,
          )[0],
        ).toMatchObject({
          clientId: record.clientId,
          serverId: undefined,
          creationStatus: "pending",
        });
        resolveCreate(serverReply);
      }

      await waitFor(() => {
        const replies = flattenReplyPages(
          queryClient.getQueryData<LearningRepliesCacheResponse>(
            learningInteractionKeys.threadReplies(parentId, undefined),
          ),
          parentId,
        );
        expect(replies).toHaveLength(1);
        expect(replies[0]).toMatchObject({
          clientId: record.clientId,
          serverId: serverReply.id,
          creationStatus: "confirmed",
        });
      });
    },
  );

  it("merges pending reply Like with creation and releases only the necessary request", async () => {
    const queryClient = createQueryClient();
    const parentId = "server-parent-like";
    queryClient.setQueryData<LearningRepliesCacheResponse>(
      learningInteractionKeys.threadReplies(parentId, undefined),
      { replies: [], nextCursor: null, totalCount: 0 },
    );
    let resolveCreate!: (reply: LearningReply) => void;
    const record = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: "client-parent-like",
      parentServerId: parentId,
      payload: { content: "Like me" },
      dispatch: vi.fn(
        () =>
          new Promise<LearningReply>((resolve) => (resolveCreate = resolve)),
      ),
    });
    const likeSpy = vi
      .spyOn(learningInteractionsService, "toggleLike")
      .mockResolvedValue({ liked: true } as any);

    desiredStateCoordinator.setLiked({
      targetType: "reply",
      targetId: record.clientId,
      threadId: parentId,
      desiredLiked: true,
      currentBaseline: false,
      pendingTarget: true,
      queryClient,
      debounceMs: 0,
    });

    expect(likeSpy).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData<LearningRepliesCacheResponse>(
        learningInteractionKeys.threadReplies(parentId, undefined),
      )?.replies[0],
    ).toMatchObject({
      clientId: record.clientId,
      isLiked: true,
      likesCount: 1,
    });

    resolveCreate(createServerReply("server-reply-like", parentId, "Like me"));
    await waitFor(() => expect(likeSpy).toHaveBeenCalledTimes(1));
    expect(likeSpy).toHaveBeenCalledWith({
      targetType: "reply",
      targetId: "server-reply-like",
    });
    expect(likeSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ targetId: record.clientId }),
    );
  });

  it("resolves a late Like registration from durable confirmed reply state", async () => {
    const queryClient = createQueryClient();
    const parentId = "server-parent-late-like";
    let resolveCreate!: (reply: LearningReply) => void;
    const record = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: "client-parent-late-like",
      parentServerId: parentId,
      payload: { content: "Late Like" },
      dispatch: vi.fn(
        () => new Promise<LearningReply>((resolve) => (resolveCreate = resolve)),
      ),
    });
    const likeSpy = vi
      .spyOn(learningInteractionsService, "toggleLike")
      .mockResolvedValue({ liked: true } as any);
    const serverReply = createServerReply(
      "server-reply-late-like",
      parentId,
      "Late Like",
    );

    resolveCreate(serverReply);
    await waitFor(() =>
      expect(
        desiredStateCoordinator.getReplyResolution(record.clientId),
      ).toMatchObject({
        status: "confirmed",
        serverId: serverReply.id,
        isLiked: false,
      }),
    );

    desiredStateCoordinator.setLiked({
      targetType: "reply",
      targetId: record.clientId,
      threadId: parentId,
      desiredLiked: true,
      currentBaseline: false,
      pendingTarget: true,
      queryClient,
      debounceMs: 0,
    });

    await waitFor(() => expect(likeSpy).toHaveBeenCalledTimes(1));
    expect(likeSpy).toHaveBeenCalledWith({
      targetType: "reply",
      targetId: serverReply.id,
    });
  });

  it("does not retain a Like registered after reply failure", async () => {
    const queryClient = createQueryClient();
    const record = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: "client-parent-failed-like",
      parentServerId: "server-parent-failed-like",
      payload: { content: "Failed Like" },
      dispatch: vi.fn(() => Promise.reject(new Error("reply failed"))),
    });
    await waitFor(() =>
      expect(
        desiredStateCoordinator.getReplyResolution(record.clientId),
      ).toMatchObject({ status: "failed" }),
    );

    const likeSpy = vi
      .spyOn(learningInteractionsService, "toggleLike")
      .mockResolvedValue({ liked: true } as any);
    desiredStateCoordinator.setLiked({
      targetType: "reply",
      targetId: record.clientId,
      threadId: "server-parent-failed-like",
      desiredLiked: true,
      pendingTarget: true,
      queryClient,
      debounceMs: 0,
    });

    expect(likeSpy).not.toHaveBeenCalled();
    expect(desiredStateCoordinator.getState("reply", record.clientId)).toBeUndefined();
  });

  it("coalesces pending reply Like toggles before confirmation", async () => {
    const queryClient = createQueryClient();
    const parentId = "server-parent-coalesce";
    let resolveCreate!: (reply: LearningReply) => void;
    const record = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: "client-parent-coalesce",
      parentServerId: parentId,
      payload: { content: "Coalesce" },
      dispatch: vi.fn(
        () =>
          new Promise<LearningReply>((resolve) => (resolveCreate = resolve)),
      ),
    });
    const likeSpy = vi
      .spyOn(learningInteractionsService, "toggleLike")
      .mockResolvedValue({ liked: true } as any);

    for (const desiredLiked of [true, false, true]) {
      desiredStateCoordinator.setLiked({
        targetType: "reply",
        targetId: record.clientId,
        threadId: parentId,
        desiredLiked,
        currentBaseline: desiredLiked ? false : true,
        pendingTarget: true,
        queryClient,
        debounceMs: 0,
      });
    }

    resolveCreate(
      createServerReply("server-reply-coalesce", parentId, "Coalesce"),
    );
    await waitFor(() => expect(likeSpy).toHaveBeenCalledTimes(1));
    expect(likeSpy).toHaveBeenCalledWith({
      targetType: "reply",
      targetId: "server-reply-coalesce",
    });
  });

  it("does not release a Like request when pending reply intent returns to baseline", async () => {
    const queryClient = createQueryClient();
    const parentId = "server-parent-baseline";
    let resolveCreate!: (reply: LearningReply) => void;
    const record = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: "client-parent-baseline",
      parentServerId: parentId,
      payload: { content: "Baseline" },
      dispatch: vi.fn(
        () =>
          new Promise<LearningReply>((resolve) => (resolveCreate = resolve)),
      ),
    });
    const likeSpy = vi
      .spyOn(learningInteractionsService, "toggleLike")
      .mockResolvedValue({ liked: true } as any);

    desiredStateCoordinator.setLiked({
      targetType: "reply",
      targetId: record.clientId,
      threadId: parentId,
      desiredLiked: true,
      currentBaseline: false,
      pendingTarget: true,
      queryClient,
      debounceMs: 0,
    });
    desiredStateCoordinator.setLiked({
      targetType: "reply",
      targetId: record.clientId,
      threadId: parentId,
      desiredLiked: false,
      currentBaseline: true,
      pendingTarget: true,
      queryClient,
      debounceMs: 0,
    });

    resolveCreate(
      createServerReply("server-reply-baseline", parentId, "Baseline"),
    );
    await waitFor(() =>
      expect(
        queryClient.getQueryData<LearningRepliesCacheResponse>(
          learningInteractionKeys.threadReplies(parentId, undefined),
        )?.replies[0],
      ).toMatchObject({
        clientId: record.clientId,
        serverId: "server-reply-baseline",
      }),
    );
    expect(likeSpy).not.toHaveBeenCalled();
  });

  it("cleans pending reply Like state without Like transport on reply or parent failure", async () => {
    const queryClient = createQueryClient();
    const likeSpy = vi
      .spyOn(learningInteractionsService, "toggleLike")
      .mockResolvedValue({ liked: true } as any);
    const rejectReply = vi.fn(() => Promise.reject(new Error("reply failed")));
    const parent = interactionCreationCoordinator.beginThreadCreation({
      queryClient,
      context: { courseId: payload.courseId, lessonId: payload.lessonId },
      payload,
    });
    const reply = interactionCreationCoordinator.beginReplyCreation({
      queryClient,
      parentClientId: parent.clientId,
      payload: { content: "Discard like" },
      dispatch: rejectReply,
    });

    desiredStateCoordinator.setLiked({
      targetType: "reply",
      targetId: reply.clientId,
      threadId: parent.clientId,
      desiredLiked: true,
      currentBaseline: false,
      pendingTarget: true,
      queryClient,
      debounceMs: 0,
    });

    expect(
      interactionCreationCoordinator.failThread(queryClient, parent.clientId),
    ).toBe(true);
    expect(
      desiredStateCoordinator.getState("reply", reply.clientId),
    ).toBeUndefined();
    expect(likeSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(rejectReply).toHaveBeenCalledTimes(0));
  });
});
