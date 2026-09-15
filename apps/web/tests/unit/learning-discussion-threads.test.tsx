import { EditorView } from "@codemirror/view";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Discussion } from "../../src/learning/Discussion";
import type { LearningThread } from "@veolms/contracts";
import type { LearningThreadEntity } from "../../src/services/learning-interactions/interaction-entities";

const testCurrentUser = {
  id: "user-123",
  displayName: "Ashi Singh",
  avatarDataUrl: "/assets/sofia-avatar-160.webp",
};

const uploadAttachmentDirect = vi.hoisted(() =>
  vi.fn(async (file: File) => ({
    id: "test-upload-id",
    url: `/api/v1/dev/discussion-uploads/${encodeURIComponent(file.name)}`,
    fileName: file.name,
    mediaType: "image" as const,
    mimeType: file.type,
    size: file.size,
    kind: "image" as const,
  })),
);

const mockThreads: LearningThread[] = [
  {
    id: "thread-comment-1",
    academyId: "academy-1",
    courseId: "course-1",
    lessonId: "lesson-1",
    userId: "user-456",
    author: {
      id: "user-456",
      displayName: "Rohit Sharma",
      username: "rohit",
      avatarUrl: "/assets/ethan-avatar-160.webp",
      role: "Student",
    },
    kind: "comment",
    content: "Great breakdown of the design process!",
    plainText: "Great breakdown of the design process!",
    visibility: "public",
    status: "active",
    isLocked: false,
    likesCount: 5,
    repliesCount: 2,
    isLiked: false,
    isOwn: false,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  },
  {
    id: "thread-qa-1",
    academyId: "academy-1",
    courseId: "course-1",
    lessonId: "lesson-1",
    userId: "user-123",
    author: {
      id: "user-123",
      displayName: "Ashi Singh",
      username: "ashi",
      avatarUrl: "/assets/sofia-avatar-160.webp",
      role: "Instructor",
    },
    kind: "question",
    content: "How does error boundary isolation work?",
    plainText: "How does error boundary isolation work?",
    visibility: "public",
    status: "active",
    isLocked: false,
    likesCount: 12,
    repliesCount: 0,
    isLiked: true,
    isOwn: true,
    createdAt: "2026-03-01T11:00:00.000Z",
    updatedAt: "2026-03-01T11:00:00.000Z",
  },
  {
    id: "thread-note-ignored",
    academyId: "academy-1",
    courseId: "course-1",
    lessonId: "lesson-1",
    userId: "user-123",
    author: {
      id: "user-123",
      displayName: "Ashi Singh",
      username: "ashi",
      avatarUrl: "/assets/sofia-avatar-160.webp",
      role: "Instructor",
    },
    kind: "note",
    content: "This note thread should be explicitly filtered out of the feed",
    plainText: "This note thread should be explicitly filtered out of the feed",
    visibility: "private",
    status: "active",
    isLocked: false,
    likesCount: 0,
    repliesCount: 0,
    createdAt: "2026-03-01T09:00:00.000Z",
    updatedAt: "2026-03-01T09:00:00.000Z",
  },
];

const mockInteractions = vi.hoisted(() => ({
  useUserNotes: vi.fn(),
  useCreateNote: vi.fn(),
  useUpdateNote: vi.fn(),
  useDeleteNote: vi.fn(),
  useLessonThreads: vi.fn(),
  useCreateLessonThread: vi.fn(),
  useUpdateThread: vi.fn(),
  useDeleteThread: vi.fn(),
  useToggleLike: vi.fn(),
  useToggleBookmark: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useToggleFollow: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useThreadReplies: vi.fn(),
  useCreateReply: vi.fn(),
  useUpdateReply: vi.fn(),
  useDeleteReply: vi.fn(),
  useAcceptReply: vi.fn(),
  useLockThread: vi.fn(),
  useCreateReport: vi.fn(),
  useThreadDetails: vi.fn((..._args: any[]) => ({
    data: undefined,
    isLoading: false,
    isError: false,
  })),
  desiredStateCoordinator: {
    setLiked: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock("../../src/services/auth", () => ({
  useCurrentUser: () => ({
    data: testCurrentUser,
  }),
}));

vi.mock("../../src/services/discussion", () => ({
  discussionService: {
    uploadAttachment: vi.fn(),
  },
}));

vi.mock(
  "../../src/services/learning-interactions/learning-interactions.service",
  () => ({
    learningInteractionsService: {
      uploadAttachmentDirect,
    },
  }),
);

vi.mock("../../src/services/learning-interactions", () => ({
  useUserNotes: (...args: any[]) => mockInteractions.useUserNotes(...args),
  useCreateNote: (...args: any[]) => mockInteractions.useCreateNote(...args),
  useUpdateNote: (...args: any[]) => mockInteractions.useUpdateNote(...args),
  useDeleteNote: (...args: any[]) => mockInteractions.useDeleteNote(...args),
  useLessonThreads: (...args: any[]) =>
    mockInteractions.useLessonThreads(...args),
  useCreateLessonThread: (...args: any[]) =>
    mockInteractions.useCreateLessonThread(...args),
  useUpdateThread: (...args: any[]) =>
    mockInteractions.useUpdateThread(...args),
  useDeleteThread: (...args: any[]) =>
    mockInteractions.useDeleteThread(...args),
  useToggleLike: (...args: any[]) => mockInteractions.useToggleLike(...args),
  useToggleBookmark: () => mockInteractions.useToggleBookmark(),
  useToggleFollow: () => mockInteractions.useToggleFollow(),
  useThreadReplies: (...args: any[]) =>
    mockInteractions.useThreadReplies(...args),
  useCreateReply: (...args: any[]) => mockInteractions.useCreateReply(...args),
  useUpdateReply: (...args: any[]) => mockInteractions.useUpdateReply(...args),
  useDeleteReply: (...args: any[]) => mockInteractions.useDeleteReply(...args),
  useAcceptReply: (...args: any[]) => mockInteractions.useAcceptReply(...args),
  useLockThread: (...args: any[]) => mockInteractions.useLockThread(...args),
  useCreateReport: (...args: any[]) =>
    mockInteractions.useCreateReport(...args),
  useThreadDetails: (...args: any[]) =>
    mockInteractions.useThreadDetails(...args),
  desiredStateCoordinator: mockInteractions.desiredStateCoordinator,
}));

describe("Learning Discussion Threads (Phase 1 Integration)", () => {
  const createThreadMutateAsync = vi.fn();
  const updateThreadMutateAsync = vi.fn();
  const deleteThreadMutateAsync = vi.fn();
  const toggleLikeMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockInteractions.useUserNotes.mockReturnValue({
      data: { notes: [], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockInteractions.useCreateNote.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockInteractions.useUpdateNote.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockInteractions.useDeleteNote.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: mockThreads, nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockInteractions.useCreateLessonThread.mockReturnValue({
      mutateAsync: createThreadMutateAsync.mockResolvedValue({}),
      isPending: false,
    });
    mockInteractions.useUpdateThread.mockReturnValue({
      mutateAsync: updateThreadMutateAsync.mockResolvedValue({}),
      isPending: false,
    });
    mockInteractions.useDeleteThread.mockReturnValue({
      mutateAsync: deleteThreadMutateAsync.mockResolvedValue({}),
      isPending: false,
    });
    mockInteractions.useToggleLike.mockReturnValue({
      mutate: toggleLikeMutate,
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockInteractions.useThreadReplies.mockReturnValue({
      data: { replies: [], nextCursor: null, totalCount: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockInteractions.useCreateReply.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockInteractions.useUpdateReply.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockInteractions.useDeleteReply.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockInteractions.useAcceptReply.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockInteractions.useLockThread.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockInteractions.useCreateReport.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("1. fetches and renders backend comment and Q&A threads, explicitly filtering out kind === 'note'", () => {
    render(
      <Discussion
        persistenceKey="test-phase1-feed"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    // Comment thread is visible
    expect(
      screen.getByText("Great breakdown of the design process!"),
    ).toBeInTheDocument();
    expect(screen.getByText("Rohit Sharma")).toBeInTheDocument();

    // Q&A thread is visible
    expect(
      screen.getByText("How does error boundary isolation work?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ashi Singh")).toBeInTheDocument();

    // Author role is mapped (Instructor badge rendered for Ashi Singh)
    expect(screen.getByText("Instructor")).toBeInTheDocument();

    // Thread kind 'note' is explicitly filtered out (not in feed)
    expect(
      screen.queryByText(/This note thread should be explicitly filtered out/i),
    ).not.toBeInTheDocument();
  });

  it("2. creates a new Comment with correct CreateLearningThreadRequest payload", async () => {
    let resolveRequest: (value: unknown) => void = () => undefined;
    createThreadMutateAsync.mockImplementation(
      () => new Promise((resolve) => (resolveRequest = resolve)),
    );
    sessionStorage.setItem(
      "veolms-learning-test-phase1-create-comment-discussion-markdown-draft-v1",
      JSON.stringify({
        format: "markdown",
        markdown: "This is my new test comment",
        plainText: "This is my new test comment",
      }),
    );

    render(
      <Discussion
        persistenceKey="test-phase1-create-comment"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: false,
        }}
      />,
    );

    const openComposer = screen.getAllByRole("button", {
      name: "Open discussion composer",
    })[0]!;
    fireEvent.click(openComposer);
    const composingEditor = screen.getByRole("textbox", {
      name: "Write a comment",
    });
    composingEditor.focus();
    expect(document.activeElement).toBe(composingEditor);

    const nextBtn = screen.getByRole("button", {
      name: "Next: choose publishing options",
    });
    fireEvent.click(nextBtn);

    const postBtn = screen.getByRole("button", { name: "Post comment" });
    await act(async () => {
      fireEvent.click(postBtn);
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Open discussion composer" }),
      ).toBeInTheDocument(),
    );

    const likeButton = screen.getByRole("button", { name: "Like" });
    fireEvent.pointerDown(likeButton);
    fireEvent.mouseDown(likeButton);
    fireEvent.pointerUp(likeButton);
    fireEvent.click(likeButton);
    expect(
      mockInteractions.desiredStateCoordinator.setLiked,
    ).toHaveBeenCalled();

    expect(createThreadMutateAsync).toHaveBeenCalledWith({
      courseId: "course-1",
      lessonId: "lesson-1",
      kind: "comment",
      content: "This is my new test comment",
      visibility: "public",
    });
    await act(async () => resolveRequest({}));
  });

  it("3. creates a new Question with correct kind and payload", async () => {
    let resolveRequest: (value: unknown) => void = () => undefined;
    createThreadMutateAsync.mockImplementation(
      () => new Promise((resolve) => (resolveRequest = resolve)),
    );
    sessionStorage.setItem(
      "veolms-learning-test-phase1-create-qa-discussion-markdown-draft-v1",
      JSON.stringify({
        format: "markdown",
        markdown: "Can hooks be called inside loops?",
        plainText: "Can hooks be called inside loops?",
      }),
    );

    render(
      <Discussion
        persistenceKey="test-phase1-create-qa"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: false,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    const openComposer = screen.getAllByRole("button", {
      name: "Open discussion composer",
    })[0]!;
    fireEvent.click(openComposer);

    const nextBtn = screen.getByRole("button", {
      name: "Next: choose publishing options",
    });
    fireEvent.click(nextBtn);

    const postBtn = screen.getByRole("button", { name: "Post Q&A" });
    await act(async () => {
      fireEvent.click(postBtn);
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Open discussion composer" }),
      ).toBeInTheDocument(),
    );

    expect(createThreadMutateAsync).toHaveBeenCalledWith({
      courseId: "course-1",
      lessonId: "lesson-1",
      kind: "question",
      content: "Can hooks be called inside loops?",
      visibility: "public",
    });
    await act(async () => resolveRequest({}));
  });

  it("shows a question-specific toast when Q&A creation fails", async () => {
    createThreadMutateAsync.mockRejectedValueOnce(new Error("create failed"));
    sessionStorage.setItem(
      "veolms-learning-test-phase3b-create-qa-failure-discussion-markdown-draft-v1",
      JSON.stringify({
        format: "markdown",
        markdown: "Question that fails",
        plainText: "Question that fails",
      }),
    );

    render(
      <Discussion
        persistenceKey="test-phase3b-create-qa-failure"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: false,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Open discussion composer" })[0]!,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Next: choose publishing options" }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post Q&A" }));
    });

    expect(
      await screen.findByText("Couldn't post your question. Please try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open discussion composer" }),
    ).toBeInTheDocument();
  });

  it("clears immediately and preserves newer composer input when creation fails", async () => {
    let rejectRequest: (error: Error) => void = () => undefined;
    createThreadMutateAsync.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    sessionStorage.setItem(
      "veolms-learning-test-phase3a-immediate-clear-discussion-markdown-draft-v1",
      JSON.stringify({
        format: "markdown",
        markdown: "Original submitted comment",
        plainText: "Original submitted comment",
      }),
    );

    render(
      <Discussion
        persistenceKey="test-phase3a-immediate-clear"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: false,
        }}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Open discussion composer" })[0]!,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Next: choose publishing options" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    expect(
      await screen.findByRole("button", { name: "Open discussion composer" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open discussion composer" }),
    );
    const editor = await screen.findByRole("textbox", {
      name: "Write a comment",
    });
    const view = EditorView.findFromDOM(editor);
    expect(view?.state.doc.toString()).toBe("");
    act(() => {
      view?.dispatch({
        changes: { from: 0, to: 0, insert: "Newer composer input" },
      });
    });
    editor.focus();
    expect(document.activeElement).toBe(editor);

    rejectRequest(new Error("create failed"));
    await waitFor(() =>
      expect(
        screen.getByText("Couldn't post your comment. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(EditorView.findFromDOM(editor)?.state.doc.toString()).toBe(
      "Newer composer input",
    );
    expect(document.activeElement).toBe(editor);
  });

  it("clears submitted attachments without resetting feed filter or sort", async () => {
    let resolveRequest: (value: unknown) => void = () => undefined;
    createThreadMutateAsync.mockImplementation(
      () => new Promise((resolve) => (resolveRequest = resolve)),
    );
    sessionStorage.setItem(
      "veolms-learning-test-phase3a-composer-reset-attachments-discussion-markdown-draft-v1",
      JSON.stringify({
        format: "markdown",
        markdown: "Comment with an attachment",
        plainText: "Comment with an attachment",
      }),
    );

    render(
      <Discussion
        persistenceKey="test-phase3a-composer-reset-attachments"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Q&As" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Sort discussions: Newest" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Top" }));

    fireEvent.click(
      screen.getAllByRole("button", { name: "Open discussion composer" })[0]!,
    );
    const attachmentInput = screen.getByLabelText(
      "Choose image, video, document, or code file",
    );
    fireEvent.change(attachmentInput, {
      target: {
        files: [new File(["attachment"], "diagram.png", { type: "image/png" })],
      },
    });
    await screen.findByTestId("attachment-composer-preview");

    fireEvent.click(
      screen.getByRole("button", { name: "Next: choose publishing options" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Open discussion composer" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("attachment-composer-preview")).toBeNull();
    expect(screen.getByRole("button", { name: "Q&As" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Sort discussions: Top" }),
    ).toBeInTheDocument();

    act(() => resolveRequest({}));
  });

  it("keeps newer composer input through optimistic success", async () => {
    let resolveRequest: (value: unknown) => void = () => undefined;
    createThreadMutateAsync.mockImplementation(
      () => new Promise((resolve) => (resolveRequest = resolve)),
    );
    sessionStorage.setItem(
      "veolms-learning-test-phase3a-composer-reset-success-discussion-markdown-draft-v1",
      JSON.stringify({
        format: "markdown",
        markdown: "Comment A",
        plainText: "Comment A",
      }),
    );

    render(
      <Discussion
        persistenceKey="test-phase3a-composer-reset-success"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: false,
        }}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Open discussion composer" })[0]!,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Next: choose publishing options" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    expect(
      await screen.findByRole("button", { name: "Open discussion composer" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open discussion composer" }),
    );
    const editor = await screen.findByRole("textbox", {
      name: "Write a comment",
    });
    const view = EditorView.findFromDOM(editor);
    act(() => {
      view?.dispatch({
        changes: { from: 0, to: 0, insert: "Comment B" },
      });
    });
    editor.focus();
    expect(view?.state.doc.toString()).toBe("Comment B");

    await act(async () => resolveRequest({}));
    expect(EditorView.findFromDOM(editor)?.state.doc.toString()).toBe(
      "Comment B",
    );
    expect(document.activeElement).toBe(editor);
  });

  it("allows three concurrent creates without blocking the fresh composer", async () => {
    let mutationPending = false;
    const requests: Array<{
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }> = [];
    createThreadMutateAsync.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          mutationPending = true;
          requests.push({ resolve, reject });
        }),
    );
    mockInteractions.useCreateLessonThread.mockImplementation(() => ({
      mutateAsync: createThreadMutateAsync,
      isPending: mutationPending,
    }));
    sessionStorage.setItem(
      "veolms-learning-test-phase3a-concurrent-composer-discussion-markdown-draft-v1",
      JSON.stringify({
        format: "markdown",
        markdown: "Comment A",
        plainText: "Comment A",
      }),
    );

    render(
      <Discussion
        persistenceKey="test-phase3a-concurrent-composer"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: false,
        }}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Open discussion composer" })[0]!,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Next: choose publishing options" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    expect(
      await screen.findByRole("button", { name: "Open discussion composer" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open discussion composer" }),
    );
    const editor = await screen.findByRole("textbox", {
      name: "Write a comment",
    });
    const view = EditorView.findFromDOM(editor);
    act(() => {
      view?.dispatch({
        changes: { from: 0, to: 0, insert: "Comment B" },
      });
    });
    const nextButton = screen.getByRole("button", {
      name: "Next: choose publishing options",
    });
    expect(nextButton).toBeEnabled();

    fireEvent.click(nextButton);
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Open discussion composer" }),
    );
    const editorAfterB = await screen.findByRole("textbox", {
      name: "Write a comment",
    });
    const viewAfterB = EditorView.findFromDOM(editorAfterB);
    act(() => {
      viewAfterB?.dispatch({
        changes: { from: 0, to: 0, insert: "Comment C" },
      });
    });
    expect(
      screen.getByRole("button", {
        name: "Next: choose publishing options",
      }),
    ).toBeEnabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Next: choose publishing options" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(createThreadMutateAsync).toHaveBeenCalledTimes(3);
    expect(requests).toHaveLength(3);

    await act(async () => requests[2]?.resolve({}));
    await act(async () => requests[0]?.resolve({}));
    await act(async () => requests[1]?.reject(new Error("B failed")));
    await waitFor(() =>
      expect(
        screen.getByText("Couldn't post your comment. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Open discussion composer" }),
    ).toBeInTheDocument();
  });

  it("4. accepts a thread edit locally before PATCH settles", async () => {
    let resolveUpdate: ((value: unknown) => void) | undefined;
    updateThreadMutateAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    render(
      <Discussion
        persistenceKey="test-phase1-edit"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    // Find the action menu for own Q&A thread (Ashi Singh)
    const menuButton = screen.getAllByRole("button", {
      name: /more actions for ashi singh/i,
    })[0]!;
    fireEvent.click(menuButton);

    const editBtn = screen.getByRole("menuitem", { name: /edit/i });
    fireEvent.click(editBtn);

    const nextBtn = await screen.findByRole("button", {
      name: "Next: choose publishing options",
    });
    fireEvent.click(nextBtn);

    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(updateThreadMutateAsync).toHaveBeenCalledWith({
      threadId: "thread-qa-1",
      payload: {
        content: "How does error boundary isolation work?",
        visibility: "public",
      },
      __optimistic: expect.objectContaining({
        clientId: "thread-qa-1",
        serverId: "thread-qa-1",
      }),
    });
    expect(
      screen.getByRole("button", { name: "Open discussion composer" }),
    ).toBeInTheDocument();

    await act(async () => resolveUpdate?.({}));
  });

  it("5. toggles like on root thread using targetType: 'thread'", () => {
    render(
      <Discussion
        persistenceKey="test-phase1-like"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    // Click like on Rohit Sharma's comment
    const likeBtn = screen.getByRole("button", { name: "Like" });
    fireEvent.click(likeBtn);

    expect(
      mockInteractions.desiredStateCoordinator.setLiked,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "thread",
        targetId: "thread-comment-1",
      }),
    );
  });

  it("6. deletion: 10s undo cancels before DELETE; commit calls deleteThreadMutation", async () => {
    vi.useFakeTimers();
    let resolveDelete: (() => void) | undefined;
    deleteThreadMutateAsync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    render(
      <Discussion
        persistenceKey="test-phase1-delete"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    // Open action menu for Ashi Singh's thread and click Delete
    const menuButton = screen.getAllByRole("button", {
      name: /more actions for ashi singh/i,
    })[0]!;
    fireEvent.click(menuButton);

    const deleteBtn = screen.getByRole("menuitem", { name: /delete/i });
    fireEvent.click(deleteBtn);

    // Flush the dismissMenuThen setTimeout(..., 0)
    act(() => {
      vi.advanceTimersByTime(20);
    });

    // Undo button should appear with countdown
    expect(
      screen.getByRole("button", {
        name: /undo deletion of ashi singh's entry/i,
      }),
    ).toBeInTheDocument();
    // Mutation has NOT been called yet
    expect(deleteThreadMutateAsync).not.toHaveBeenCalled();

    // Fast-forward 10 seconds
    await act(async () => {
      vi.advanceTimersByTime(10_100);
    });

    // Now DELETE mutation is called
    expect(deleteThreadMutateAsync).toHaveBeenCalledWith("thread-qa-1");
    // The pending transport must not make the Q&A visible again.
    expect(
      screen.queryByText("How does error boundary isolation work?"),
    ).not.toBeInTheDocument();

    await act(async () => resolveDelete?.());
    expect(
      screen.queryByText("How does error boundary isolation work?"),
    ).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("7. deletion undo: clicking Undo cancels timer and does NOT send DELETE", async () => {
    vi.useFakeTimers();

    render(
      <Discussion
        persistenceKey="test-phase1-delete-undo"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    const menuButton = screen.getAllByRole("button", {
      name: /more actions for ashi singh/i,
    })[0]!;
    fireEvent.click(menuButton);

    const deleteBtn = screen.getByRole("menuitem", { name: /delete/i });
    fireEvent.click(deleteBtn);

    // Flush the dismissMenuThen setTimeout(..., 0)
    act(() => {
      vi.advanceTimersByTime(20);
    });

    // Click Undo
    const undoBtn = screen.getByRole("button", {
      name: /undo deletion of ashi singh's entry/i,
    });
    fireEvent.click(undoBtn);

    // Advance 10s
    await act(async () => {
      vi.advanceTimersByTime(10_100);
    });

    // Delete was cancelled!
    expect(deleteThreadMutateAsync).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("8. root-thread opening: onOpenThread opens DiscussionThreadPanel in Phase 2", () => {
    render(
      <Discussion
        persistenceKey="test-phase2-panel-enabled"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    // Find the Reply trigger button on Rohit Sharma's card
    const replyButton = screen.getAllByRole("button", { name: "Reply" })[0]!;
    fireEvent.click(replyButton);

    // DiscussionThreadPanel is now opened in Phase 2
    expect(
      screen.getByRole("heading", { name: "Discussion thread" }),
    ).toBeInTheDocument();
  });

  it("keeps a reconciled Q&A mounted, resolves callbacks by client ID, and transports its server ID", () => {
    const clientId = "client-thread-reconciled-qa";
    const serverId = "server-thread-reconciled-qa";
    const pendingThread: LearningThreadEntity = {
      ...mockThreads[1]!,
      id: clientId,
      clientId,
      creationStatus: "pending",
      serverId: undefined,
      content: "Optimistic Q&A that stays mounted",
      plainText: "Optimistic Q&A that stays mounted",
    };
    const reconciledThread: LearningThreadEntity = {
      ...pendingThread,
      id: serverId,
      serverId,
      creationStatus: "confirmed",
    };
    let renderedThreads: LearningThreadEntity[] = [pendingThread];
    mockInteractions.useLessonThreads.mockImplementation(() => ({
      data: { threads: renderedThreads, nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));

    const props = {
      persistenceKey: "test-phase3a-reconciled-identity",
      courseId: "course-1",
      lessonId: "lesson-1",
      interactionCapabilities: {
        allowComments: true,
        allowNotes: false,
        allowQa: true,
      },
    };
    const { rerender } = render(<Discussion {...props} />);
    const pendingCard = screen
      .getByText("Optimistic Q&A that stays mounted")
      .closest("article");
    expect(pendingCard).not.toBeNull();

    // A pending thread may be opened locally, but it must not enter the URL.
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(
      screen.getByRole("heading", { name: "Discussion thread" }),
    ).toBeInTheDocument();
    expect(window.location.search).not.toContain(clientId);

    renderedThreads = [reconciledThread];
    rerender(<Discussion {...props} />);

    expect(document.getElementById(`discussion-entry-${clientId}`)).toBe(
      pendingCard,
    );
    expect(
      screen.getByRole("heading", { name: "Discussion thread" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("button", { name: /^(Like|Unlike)$/ })[0]!,
    );
    expect(
      mockInteractions.desiredStateCoordinator.setLiked,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "thread",
        targetId: serverId,
      }),
    );
    expect(
      mockInteractions.desiredStateCoordinator.setLiked,
    ).not.toHaveBeenCalledWith(expect.objectContaining({ targetId: clientId }));
    expect(window.location.search).not.toContain(clientId);
  });
});
