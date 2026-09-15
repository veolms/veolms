import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LearningNote } from "@veolms/contracts";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authStore } from "../../src/store/auth.store";
import {
  desiredStateCoordinator,
} from "../../src/services/learning-interactions/desired-state-coordinator";
import {
  interactionCreationCoordinator,
} from "../../src/services/learning-interactions/interaction-creation-coordinator";
import {
  getClientEntityId,
  getServerEntityId,
  type LearningNotesCacheResponse,
} from "../../src/services/learning-interactions/interaction-entities";
import {
  mergeNotesWithCreationRecords,
} from "../../src/services/learning-interactions/learning-interactions.queries";
import { learningInteractionKeys } from "../../src/services/learning-interactions/learning-interactions.keys";
import { useCreateNote } from "../../src/services/learning-interactions/learning-interactions.mutations";
import { learningInteractionsService } from "../../src/services/learning-interactions/learning-interactions.service";
import type { LocalComposerAttachment } from "../../src/services/learning-interactions/attachment-model";

const notePayload = {
  courseId: "course-1",
  lessonId: "lesson-1",
  content: "A note",
  visibility: "public" as const,
};

function createServerNote(
  id: string,
  content = notePayload.content,
  isLiked = false,
): LearningNote {
  return {
    id,
    userId: "user-1",
    courseId: notePayload.courseId,
    lessonId: notePayload.lessonId,
    authorName: "Current User",
    authorUsername: "current-user",
    content,
    plainText: content,
    visibility: "public",
    tags: [],
    likesCount: isLiked ? 1 : 0,
    repliesCount: 0,
    isLiked,
    isOwn: true,
    attachments: [],
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

describe("Phase 4A optimistic Note creation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    interactionCreationCoordinator.reset();
    desiredStateCoordinator.reset();
    authStore.clearAuth();
  });

  it("inserts before POST settlement, reconciles in place, and never invalidates Notes", async () => {
    const queryClient = createQueryClient();
    const key = learningInteractionKeys.notes({
      courseId: notePayload.courseId,
      lessonId: notePayload.lessonId,
      limit: 50,
    });
    queryClient.setQueryData<LearningNotesCacheResponse>(key, {
      notes: [],
      nextCursor: null,
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    let resolveRequest: (note: LearningNote) => void = () => undefined;
    vi.spyOn(learningInteractionsService, "createNote").mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(() => useCreateNote(), {
      wrapper: createWrapper(queryClient),
    });

    let request!: Promise<LearningNote>;
    act(() => {
      request = result.current.mutateAsync({
        ...notePayload,
        attachmentIds: ["attachment-1"],
        __attachments: [
          {
            id: "attachment-1",
            fileName: "note.png",
            fileUrl: "/note.png",
            mimeType: "image/png",
            fileSize: 10,
            kind: "image",
          },
        ],
      });
    });

    const pending = queryClient.getQueryData<LearningNotesCacheResponse>(key)
      ?.notes[0];
    expect(pending).toMatchObject({
      id: getClientEntityId(pending!),
      clientId: getClientEntityId(pending!),
      serverId: undefined,
      creationStatus: "pending",
      visibility: "public",
      attachments: [{ id: "attachment-1" }],
    });
    await waitFor(() =>
      expect(learningInteractionsService.createNote).toHaveBeenCalledTimes(1),
    );
    expect(learningInteractionsService.createNote).toHaveBeenCalledWith(
      expect.not.objectContaining({ __attachments: expect.anything() }),
    );
    expect(invalidateSpy).not.toHaveBeenCalled();

    resolveRequest(createServerNote("server-note-1"));
    await act(async () => {
      await request;
    });

    const confirmed = queryClient.getQueryData<LearningNotesCacheResponse>(key)
      ?.notes;
    expect(confirmed).toHaveLength(1);
    expect(confirmed?.[0]).toMatchObject({
      id: getClientEntityId(pending!),
      clientId: getClientEntityId(pending!),
      serverId: "server-note-1",
      creationStatus: "confirmed",
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("uploads local Note files after optimistic insertion and sends only resolved attachment IDs", async () => {
    const queryClient = createQueryClient();
    const key = learningInteractionKeys.notes({
      courseId: notePayload.courseId,
      lessonId: notePayload.lessonId,
      limit: 50,
    });
    queryClient.setQueryData<LearningNotesCacheResponse>(key, {
      notes: [],
      nextCursor: null,
    });
    const localAttachment: LocalComposerAttachment = {
      id: "client-note-attachment",
      file: new File(["note"], "note.pdf", { type: "application/pdf" }),
      fileName: "note.pdf",
      mimeType: "application/pdf",
      fileSize: 4,
      kind: "document",
      mediaType: "document",
    };
    let resolveUpload: (value: any) => void = () => undefined;
    vi.spyOn(learningInteractionsService, "uploadAttachmentDirect").mockImplementation(
      () => new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    let resolveCreate: (value: LearningNote) => void = () => undefined;
    vi.spyOn(learningInteractionsService, "createNote").mockImplementation(
      () => new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const { result } = renderHook(() => useCreateNote(), {
      wrapper: createWrapper(queryClient),
    });

    let request!: Promise<LearningNote>;
    act(() => {
      request = result.current.mutateAsync({
        ...notePayload,
        __clientId: "client-note-with-attachment",
        __localAttachments: [localAttachment],
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<LearningNotesCacheResponse>(key)?.notes[0])
        .toMatchObject({
          clientId: "client-note-with-attachment",
          creationStatus: "pending",
          attachments: [
            {
              id: "client-note-attachment",
              uploadState: "uploading",
            },
          ],
        });
    });
    expect(learningInteractionsService.createNote).not.toHaveBeenCalled();

    resolveUpload({
      id: "server-note-attachment",
      url: "/uploads/note.pdf",
      fileName: "note.pdf",
      mediaType: "document",
      mimeType: "application/pdf",
      size: 4,
      kind: "document",
    });
    await waitFor(() =>
      expect(learningInteractionsService.createNote).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: ["server-note-attachment"] }),
      ),
    );

    resolveCreate({
      ...createServerNote("server-note-with-attachment"),
      attachments: [
        {
          id: "server-note-attachment",
          kind: "document",
          fileName: "note.pdf",
          fileUrl: "/uploads/note.pdf",
          mimeType: "application/pdf",
          fileSize: 4,
        },
      ],
    });
    await act(async () => {
      await request;
    });

    expect(queryClient.getQueryData<LearningNotesCacheResponse>(key)?.notes[0])
      .toMatchObject({
        clientId: "client-note-with-attachment",
        serverId: "server-note-with-attachment",
        attachments: [
          {
            id: "client-note-attachment",
            serverId: "server-note-attachment",
            uploadState: "confirmed",
          },
        ],
      });
  });

  it("isolates concurrent out-of-order success and failure", async () => {
    const queryClient = createQueryClient();
    const key = learningInteractionKeys.notes({
      courseId: notePayload.courseId,
      lessonId: notePayload.lessonId,
      limit: 50,
    });
    queryClient.setQueryData<LearningNotesCacheResponse>(key, {
      notes: [],
      nextCursor: null,
    });
    const requests: Array<{
      resolve: (note: LearningNote) => void;
      reject: (error: Error) => void;
    }> = [];
    vi.spyOn(learningInteractionsService, "createNote").mockImplementation(
      (_payload) =>
        new Promise((resolve, reject) => {
          requests.push({ resolve, reject });
        }),
    );

    const { result } = renderHook(() => useCreateNote(), {
      wrapper: createWrapper(queryClient),
    });
    let first!: Promise<LearningNote>;
    let second!: Promise<LearningNote>;
    let third!: Promise<LearningNote>;
    act(() => {
      first = result.current.mutateAsync({ ...notePayload, content: "A" });
      second = result.current.mutateAsync({ ...notePayload, content: "B" });
      third = result.current.mutateAsync({ ...notePayload, content: "C" });
    });

    await waitFor(() => expect(requests).toHaveLength(3));

    expect(
      queryClient.getQueryData<LearningNotesCacheResponse>(key)?.notes,
    ).toHaveLength(3);
    const pendingIds = queryClient
      .getQueryData<LearningNotesCacheResponse>(key)
      ?.notes.map((note) => getClientEntityId(note));

    requests[2]?.resolve(createServerNote("server-c", "C"));
    requests[0]?.resolve(createServerNote("server-a", "A"));
    requests[1]?.reject(new Error("B failed"));
    await act(async () => {
      await Promise.allSettled([first, second, third]);
    });

    const remaining = queryClient.getQueryData<LearningNotesCacheResponse>(key)
      ?.notes;
    expect(remaining).toHaveLength(2);
    expect(new Set(remaining?.map((note) => getServerEntityId(note)))).toEqual(
      new Set(["server-a", "server-c"]),
    );
    expect(new Set(remaining?.map((note) => getClientEntityId(note)))).toEqual(
      new Set([pendingIds?.[0], pendingIds?.[2]]),
    );
  });

  it("keeps stale GETs from erasing a pending or reconciled Note and preserves desired Like state", () => {
    const queryClient = createQueryClient();
    const record = interactionCreationCoordinator.beginNoteCreation({
      queryClient,
      context: { courseId: notePayload.courseId, lessonId: notePayload.lessonId },
      payload: notePayload,
      dispatch: vi.fn().mockResolvedValue(createServerNote("server-note-1")),
    });

    const pendingMerged = mergeNotesWithCreationRecords(
      { notes: [], nextCursor: null },
      { ...notePayload, limit: 50 },
      interactionCreationCoordinator.getActiveNoteRecords(notePayload),
    );
    expect(getClientEntityId(pendingMerged.notes[0]!)).toBe(record.clientId);

    desiredStateCoordinator.setLiked({
      targetType: "note",
      targetId: record.clientId,
      desiredLiked: true,
      currentBaseline: false,
      pendingTarget: true,
      queryClient,
      debounceMs: 50,
    });
    expect(
      interactionCreationCoordinator.confirmNote(
        queryClient,
        record.clientId,
        createServerNote("server-note-1"),
      ),
    ).toBe(true);

    const reconciledMerged = mergeNotesWithCreationRecords(
      {
        notes: [createServerNote("server-note-1")],
        nextCursor: null,
      },
      { ...notePayload, limit: 50 },
      interactionCreationCoordinator.getActiveNoteRecords(notePayload),
    );
    expect(reconciledMerged.notes[0]).toMatchObject({
      clientId: record.clientId,
      serverId: "server-note-1",
      isLiked: true,
      likesCount: 1,
    });
  });

  it("supports both Note resolution-before-Like and Like-before-resolution", () => {
    const queryClient = createQueryClient();
    const likeSpy = vi
      .spyOn(learningInteractionsService, "toggleLike")
      .mockResolvedValue({ liked: true } as any);
    const first = interactionCreationCoordinator.beginNoteCreation({
      queryClient,
      context: { courseId: notePayload.courseId, lessonId: notePayload.lessonId },
      payload: notePayload,
      dispatch: vi.fn().mockResolvedValue(createServerNote("server-first")),
    });
    const second = interactionCreationCoordinator.beginNoteCreation({
      queryClient,
      context: { courseId: notePayload.courseId, lessonId: notePayload.lessonId },
      payload: { ...notePayload, content: "Second" },
      dispatch: vi.fn().mockResolvedValue(createServerNote("server-second")),
    });

    desiredStateCoordinator.setLiked({
      targetType: "note",
      targetId: second.clientId,
      desiredLiked: true,
      currentBaseline: false,
      pendingTarget: true,
      queryClient,
      debounceMs: 0,
    });
    interactionCreationCoordinator.confirmNote(
      queryClient,
      second.clientId,
      createServerNote("server-second"),
    );

    interactionCreationCoordinator.confirmNote(
      queryClient,
      first.clientId,
      createServerNote("server-first"),
    );
    desiredStateCoordinator.setLiked({
      targetType: "note",
      targetId: first.clientId,
      desiredLiked: true,
      currentBaseline: false,
      pendingTarget: true,
      queryClient,
      debounceMs: 0,
    });

    expect(likeSpy).toHaveBeenCalledWith({
      targetType: "note",
      targetId: "server-second",
    });
    expect(likeSpy).toHaveBeenCalledWith({
      targetType: "note",
      targetId: "server-first",
    });
  });

  it("coalesces pending Like changes and discards them on Note failure", () => {
    const queryClient = createQueryClient();
    const likeSpy = vi.spyOn(learningInteractionsService, "toggleLike");
    const record = interactionCreationCoordinator.beginNoteCreation({
      queryClient,
      context: { courseId: notePayload.courseId, lessonId: notePayload.lessonId },
      payload: notePayload,
      dispatch: vi.fn().mockResolvedValue(createServerNote("server-note-1")),
    });

    desiredStateCoordinator.setLiked({
      targetType: "note",
      targetId: record.clientId,
      desiredLiked: true,
      currentBaseline: false,
      pendingTarget: true,
      queryClient,
      debounceMs: 0,
    });
    desiredStateCoordinator.setLiked({
      targetType: "note",
      targetId: record.clientId,
      desiredLiked: false,
      currentBaseline: true,
      pendingTarget: true,
      queryClient,
      debounceMs: 0,
    });
    interactionCreationCoordinator.confirmNote(
      queryClient,
      record.clientId,
      createServerNote("server-note-1"),
    );
    expect(likeSpy).not.toHaveBeenCalled();

    const failed = interactionCreationCoordinator.beginNoteCreation({
      queryClient,
      context: { courseId: notePayload.courseId, lessonId: notePayload.lessonId },
      payload: { ...notePayload, content: "Failed" },
      dispatch: vi.fn().mockResolvedValue(createServerNote("server-failed")),
    });
    desiredStateCoordinator.setLiked({
      targetType: "note",
      targetId: failed.clientId,
      desiredLiked: true,
      currentBaseline: false,
      pendingTarget: true,
      queryClient,
      debounceMs: 0,
    });
    interactionCreationCoordinator.failNote(queryClient, failed.clientId);
    expect(desiredStateCoordinator.getState("note", failed.clientId)).toBeUndefined();
  });
});
