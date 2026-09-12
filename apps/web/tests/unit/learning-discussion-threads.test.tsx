import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Discussion } from "../../src/learning/Discussion";
import type { LearningThread } from "@veolms/contracts";

const testCurrentUser = {
  id: "user-123",
  displayName: "Ashi Singh",
  avatarDataUrl: "/assets/sofia-avatar-160.webp",
};

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

vi.mock("../../src/services/learning-interactions", () => ({
  useUserNotes: (...args: any[]) => mockInteractions.useUserNotes(...args),
  useCreateNote: (...args: any[]) => mockInteractions.useCreateNote(...args),
  useUpdateNote: (...args: any[]) => mockInteractions.useUpdateNote(...args),
  useDeleteNote: (...args: any[]) => mockInteractions.useDeleteNote(...args),
  useLessonThreads: (...args: any[]) => mockInteractions.useLessonThreads(...args),
  useCreateLessonThread: (...args: any[]) =>
    mockInteractions.useCreateLessonThread(...args),
  useUpdateThread: (...args: any[]) => mockInteractions.useUpdateThread(...args),
  useDeleteThread: (...args: any[]) => mockInteractions.useDeleteThread(...args),
  useToggleLike: (...args: any[]) => mockInteractions.useToggleLike(...args),
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

    const nextBtn = screen.getByRole("button", {
      name: "Next: choose publishing options",
    });
    fireEvent.click(nextBtn);

    const postBtn = screen.getByRole("button", { name: "Post comment" });
    await act(async () => {
      fireEvent.click(postBtn);
    });

    expect(createThreadMutateAsync).toHaveBeenCalledWith({
      courseId: "course-1",
      lessonId: "lesson-1",
      kind: "comment",
      content: "This is my new test comment",
      visibility: "public",
    });
  });

  it("3. creates a new Question with correct kind and payload", async () => {
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

    expect(createThreadMutateAsync).toHaveBeenCalledWith({
      courseId: "course-1",
      lessonId: "lesson-1",
      kind: "question",
      content: "Can hooks be called inside loops?",
      visibility: "public",
    });
  });

  it("4. edits own thread with useUpdateThread", async () => {
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
    });
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

    expect(toggleLikeMutate).toHaveBeenCalledWith({
      targetType: "thread",
      targetId: "thread-comment-1",
    });
  });

  it("6. deletion: 10s undo cancels before DELETE; commit calls deleteThreadMutation", async () => {
    vi.useFakeTimers();

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

  it("8. root-thread opening: onOpenThread is temporarily disabled for backend Comments/Q&A in Phase 1", () => {
    render(
      <Discussion
        persistenceKey="test-phase1-panel-disabled"
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

    // DiscussionThreadPanel drawer or sheet must NOT be opened
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
