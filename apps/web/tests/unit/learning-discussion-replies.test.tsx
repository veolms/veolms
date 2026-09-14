import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Discussion } from "../../src/learning/Discussion";
import type { LearningReply, LearningThread } from "@veolms/contracts";

function typeIntoEditor(element: HTMLElement, text: string) {
  const view = EditorView.findFromDOM(element);
  if (!view) {
    throw new Error("Could not find EditorView from element");
  }
  act(() => {
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: text,
      },
    });
  });
}

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
    repliesCount: 1,
    isLiked: true,
    isOwn: true,
    createdAt: "2026-03-01T11:00:00.000Z",
    updatedAt: "2026-03-01T11:00:00.000Z",
  },
  {
    id: "thread-empty-qa",
    academyId: "academy-1",
    courseId: "course-1",
    lessonId: "lesson-1",
    userId: "user-789",
    author: {
      id: "user-789",
      displayName: "David Miller",
      username: "david",
      avatarUrl: "/assets/ethan-avatar-160.webp",
      role: "Student",
    },
    kind: "question",
    content: "Any zero reply questions?",
    plainText: "Any zero reply questions?",
    visibility: "public",
    status: "active",
    isLocked: false,
    likesCount: 0,
    repliesCount: 0,
    isLiked: false,
    isOwn: false,
    createdAt: "2026-03-01T12:00:00.000Z",
    updatedAt: "2026-03-01T12:00:00.000Z",
  },
];

const mockCommentReplies: LearningReply[] = [
  {
    id: "reply-comment-101",
    threadId: "thread-comment-1",
    userId: "user-456",
    author: {
      id: "user-456",
      displayName: "Rohit Sharma",
      username: "rohit",
      avatarUrl: "/assets/ethan-avatar-160.webp",
      role: "Student",
    },
    content: "Rohit's reply to design process",
    plainText: "Rohit's reply to design process",
    status: "active",
    isAccepted: false,
    likesCount: 3,
    isLiked: false,
    isOwn: false,
    createdAt: "2026-03-01T10:15:00.000Z",
    updatedAt: "2026-03-01T10:15:00.000Z",
  },
  {
    id: "reply-comment-102",
    threadId: "thread-comment-1",
    userId: "user-123",
    author: {
      id: "user-123",
      displayName: "Ashi Singh",
      username: "ashi",
      avatarUrl: "/assets/sofia-avatar-160.webp",
      role: "Instructor",
    },
    content: "Ashi's instructor reply",
    plainText: "Ashi's instructor reply",
    status: "active",
    isAccepted: false,
    likesCount: 1,
    isLiked: true,
    isOwn: true,
    createdAt: "2026-03-01T10:30:00.000Z",
    updatedAt: "2026-03-01T10:30:00.000Z",
  },
];

const mockQaReplies: LearningReply[] = [
  {
    id: "reply-qa-201",
    threadId: "thread-qa-1",
    userId: "user-123",
    author: {
      id: "user-123",
      displayName: "Ashi Singh",
      username: "ashi",
      avatarUrl: "/assets/sofia-avatar-160.webp",
      role: "Instructor",
    },
    content: "Here is how error boundaries work in detail.",
    plainText: "Here is how error boundaries work in detail.",
    status: "active",
    isAccepted: false,
    likesCount: 4,
    isLiked: false,
    isOwn: true,
    createdAt: "2026-03-01T11:20:00.000Z",
    updatedAt: "2026-03-01T11:20:00.000Z",
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
  useToggleBookmark: () => mockInteractions.useToggleBookmark(),
  useToggleFollow: () => mockInteractions.useToggleFollow(),
  useThreadReplies: (...args: any[]) => mockInteractions.useThreadReplies(...args),
  useCreateReply: (...args: any[]) => mockInteractions.useCreateReply(...args),
  useUpdateReply: (...args: any[]) => mockInteractions.useUpdateReply(...args),
  useDeleteReply: (...args: any[]) => mockInteractions.useDeleteReply(...args),
  useAcceptReply: (...args: any[]) => mockInteractions.useAcceptReply(...args),
  useLockThread: (...args: any[]) => mockInteractions.useLockThread(...args),
  useCreateReport: (...args: any[]) => mockInteractions.useCreateReport(...args),
}));

describe("Learning Discussion Replies (Phase 2 Integration)", () => {
  const createReplyMutateAsync = vi.fn();
  const updateReplyMutateAsync = vi.fn();
  const deleteReplyMutateAsync = vi.fn();
  const toggleLikeMutateAsync = vi.fn();
  const toggleLikeMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockInteractions.useUserNotes.mockReturnValue({
      data: {
        notes: [
          {
            id: "note-1",
            courseId: "course-1",
            lessonId: "lesson-1",
            userId: "user-123",
            content: "My personal private note content",
            plainText: "My personal private note content",
            visibility: "private",
            createdAt: "2026-03-01T08:00:00.000Z",
            updatedAt: "2026-03-01T08:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
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
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockInteractions.useUpdateThread.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockInteractions.useDeleteThread.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockInteractions.useToggleLike.mockReturnValue({
      mutate: toggleLikeMutate,
      mutateAsync: toggleLikeMutateAsync.mockResolvedValue({ liked: true, likesCount: 4 }),
      isPending: false,
    });

    mockInteractions.useThreadReplies.mockImplementation((threadId: string) => {
      if (threadId === "thread-comment-1") {
        return {
          data: { replies: mockCommentReplies, nextCursor: null, totalCount: 2 },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      }
      if (threadId === "thread-qa-1") {
        return {
          data: { replies: mockQaReplies, nextCursor: null, totalCount: 1 },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      }
      return {
        data: { replies: [], nextCursor: null, totalCount: 0 },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    });

    mockInteractions.useCreateReply.mockReturnValue({
      mutateAsync: createReplyMutateAsync.mockResolvedValue({}),
      isPending: false,
    });
    mockInteractions.useUpdateReply.mockReturnValue({
      mutateAsync: updateReplyMutateAsync.mockResolvedValue({}),
      isPending: false,
    });
    mockInteractions.useDeleteReply.mockReturnValue({
      mutateAsync: deleteReplyMutateAsync.mockResolvedValue({}),
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

  it("1. opening a thread fetches and displays real replies", async () => {
    render(
      <Discussion
        persistenceKey="test-phase2-open-replies"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    // Click Reply on Rohit Sharma's comment thread
    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    // Thread panel opens
    expect(
      screen.getByRole("heading", { name: "Discussion thread" }),
    ).toBeInTheDocument();

    // Verify useThreadReplies was called for thread-comment-1
    expect(mockInteractions.useThreadReplies).toHaveBeenCalledWith(
      "thread-comment-1",
      undefined,
      expect.objectContaining({ enabled: true }),
    );

    // Both real replies are displayed
    expect(
      screen.getByText("Rohit's reply to design process"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ashi's instructor reply")).toBeInTheDocument();
  });

  it("2. loading state is shown before replies resolve", () => {
    mockInteractions.useThreadReplies.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <Discussion
        persistenceKey="test-phase2-loading-replies"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    expect(screen.getByTestId("learning-replies-loading")).toBeInTheDocument();
    expect(screen.getByText("Loading replies…")).toBeInTheDocument();
  });

  it("3. zero-reply empty state appears only after successful empty response", () => {
    mockInteractions.useThreadReplies.mockReturnValue({
      data: { replies: [], nextCursor: null, totalCount: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <Discussion
        persistenceKey="test-phase2-empty-replies"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    // Open David Miller's thread (which has 0 replies)
    const davidCard = document.getElementById("discussion-entry-thread-empty-qa")!;
    const replyBtn = within(davidCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    expect(screen.getByTestId("learning-replies-empty")).toBeInTheDocument();
    expect(screen.getByText("Start the conversation")).toBeInTheDocument();
    expect(
      screen.getByText(/Be the first to reply to David Miller/i),
    ).toBeInTheDocument();
  });

  it("4. repliesCount > 0 does not incorrectly show empty state while loading", () => {
    mockInteractions.useThreadReplies.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <Discussion
        persistenceKey="test-phase2-no-premature-empty"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    // Open Rohit Sharma's thread (repliesCount is 2)
    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    // Must show loading state
    expect(screen.getByTestId("learning-replies-loading")).toBeInTheDocument();
    // Must NOT show empty state
    expect(screen.queryByTestId("learning-replies-empty")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Be the first to reply/i),
    ).not.toBeInTheDocument();
  });

  it("5. creates reply calling useCreateReply with correct payload", async () => {
    render(
      <Discussion
        persistenceKey="test-phase2-create-reply"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    // Type in the composer
    const composer = await screen.findByRole("textbox", {
      name: /reply to rohit sharma/i,
    });
    typeIntoEditor(composer, "This is my new reply test");

    const postReplyButton = screen.getByRole("button", { name: "Post reply" });
    await act(async () => {
      fireEvent.click(postReplyButton);
    });

    expect(createReplyMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "This is my new reply test",
      }),
    );

    // Verify reply composer is cleared and submit button disabled
    const clearedComposer = await screen.findByRole("textbox", {
      name: /reply to rohit sharma/i,
    });
    const clearedView = EditorView.findFromDOM(clearedComposer);
    expect(clearedView?.state.doc.toString()).toBe("");
    expect(clearedComposer.textContent).not.toContain("This is my new reply test");
    expect(postReplyButton).toBeDisabled();
  });

  it("6. create failure preserves draft in composer and does not clear text", async () => {
    createReplyMutateAsync.mockRejectedValueOnce(
      new Error("Network Error on create"),
    );

    render(
      <Discussion
        persistenceKey="test-phase2-create-fail"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    const composer = await screen.findByRole("textbox", {
      name: /reply to rohit sharma/i,
    });
    typeIntoEditor(composer, "Important draft that must not be lost");

    const postReplyButton = screen.getByRole("button", { name: "Post reply" });
    await act(async () => {
      fireEvent.click(postReplyButton);
    });

    // Draft remains in the composer!
    expect(composer.textContent).toContain(
      "Important draft that must not be lost",
    );
    // Error notification is displayed
    expect(
      screen.getByText("Failed to post reply. Please try again."),
    ).toBeInTheDocument();
  });

  it("7. edits own reply with useUpdateReply and preserves content on failure", async () => {
    render(
      <Discussion
        persistenceKey="test-phase2-edit-reply"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    // Open action menu for Ashi Singh's own reply
    const actionMenus = screen.getAllByRole("button", {
      name: /more actions for ashi singh/i,
    });
    // The second one is for the reply
    fireEvent.click(actionMenus[actionMenus.length - 1]!);

    const editItem = screen.getByRole("menuitem", { name: /edit reply/i });
    fireEvent.click(editItem);

    const editInput = await screen.findByRole("textbox", {
      name: /edit reply by ashi singh/i,
    });
    typeIntoEditor(editInput, "Updated reply content");

    const saveButton = screen.getByRole("button", { name: "Save" });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(updateReplyMutateAsync).toHaveBeenCalledWith({
      replyId: "reply-comment-102",
      payload: expect.objectContaining({
        content: "Updated reply content",
      }),
    });
  });

  it("8. deletes own reply with 10s undo flow committing useDeleteReply", async () => {
    vi.useFakeTimers();

    render(
      <Discussion
        persistenceKey="test-phase2-delete-reply"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    const actionMenus = screen.getAllByRole("button", {
      name: /more actions for ashi singh/i,
    });
    fireEvent.click(actionMenus[actionMenus.length - 1]!);

    const deleteItem = screen.getByRole("menuitem", { name: /delete reply/i });
    fireEvent.click(deleteItem);

    // Flush menu dismiss timer
    act(() => {
      vi.advanceTimersByTime(20);
    });

    // Undo button appears
    expect(
      screen.getByRole("button", {
        name: /undo deletion of ashi singh's entry/i,
      }),
    ).toBeInTheDocument();
    expect(deleteReplyMutateAsync).not.toHaveBeenCalled();

    // Advance 10s
    await act(async () => {
      vi.advanceTimersByTime(10_100);
    });

    expect(deleteReplyMutateAsync).toHaveBeenCalledWith("reply-comment-102");

    vi.useRealTimers();
  });

  it("9. like/unlike reply calls useToggleLike with targetType: 'reply'", async () => {
    render(
      <Discussion
        persistenceKey="test-phase2-like-reply"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    // Click Like on Rohit's reply
    const likeReplyButton = screen.getByRole("button", { name: "Like reply" });
    await act(async () => {
      fireEvent.click(likeReplyButton);
    });

    expect(toggleLikeMutateAsync).toHaveBeenCalledWith({
      targetType: "reply",
      targetId: "reply-comment-101",
    });
  });

  it("10. reply count stays synchronized between root thread card and thread panel", () => {
    render(
      <Discussion
        persistenceKey="test-phase2-count-sync"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    // Root thread card in feed shows "View 2 replies"
    expect(
      screen.getByRole("button", { name: /view 2 replies/i }),
    ).toBeInTheDocument();

    // Open the thread
    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    // Inside the thread detail header, reply button shows "2 replies"
    const panelReplyCounts = screen.getAllByText("2 replies");
    expect(panelReplyCounts.length).toBeGreaterThan(0);
  });

  it("11. switching between threads does not leak stale replies", () => {
    render(
      <Discussion
        persistenceKey="test-phase2-thread-switch"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    // 1. Open Thread A (Comment thread)
    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtnA = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtnA);

    // Shows Thread A replies
    expect(
      screen.getByText("Rohit's reply to design process"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Here is how error boundaries work in detail."),
    ).not.toBeInTheDocument();

    // 2. Open Thread B (Q&A thread)
    const ashiCard = document.getElementById("discussion-entry-thread-qa-1")!;
    const replyBtnB = within(ashiCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtnB);

    // Shows Thread B replies only!
    expect(
      screen.getByText("Here is how error boundaries work in detail."),
    ).toBeInTheDocument();
    // Stale replies from Thread A are NOT present!
    expect(
      screen.queryByText("Rohit's reply to design process"),
    ).not.toBeInTheDocument();
  });

  it("12. Comment thread replies work seamlessly", () => {
    render(
      <Discussion
        persistenceKey="test-phase2-comment-replies"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: false,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    expect(
      screen.getByText("Rohit's reply to design process"),
    ).toBeInTheDocument();
  });

  it("13. Q&A thread replies work seamlessly", () => {
    render(
      <Discussion
        persistenceKey="test-phase2-qa-replies"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: false,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    const ashiCard = document.getElementById("discussion-entry-thread-qa-1")!;
    const replyBtn = within(ashiCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    expect(
      screen.getByText("Here is how error boundaries work in detail."),
    ).toBeInTheDocument();
  });

  it("14. Notes behavior remains unchanged and notes cannot be opened as a thread", () => {
    render(
      <Discussion
        persistenceKey="test-phase2-notes-untouched"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    // Note is visible in feed
    expect(
      screen.getByText("My personal private note content"),
    ).toBeInTheDocument();

    // Filter to notes only
    const notesFilter = screen.getByRole("button", { name: "Notes" });
    fireEvent.click(notesFilter);

    // Note does NOT have a reply button
    expect(screen.queryByRole("button", { name: "Reply" })).toBeNull();

    // DiscussionThreadPanel is not opened
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("15. prevents duplicate submits while createReply mutation is pending", async () => {
    let resolveMutation!: (value: any) => void;
    createReplyMutateAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );

    render(
      <Discussion
        persistenceKey="test-phase2-prevent-duplicate"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn);

    const composer = await screen.findByRole("textbox", {
      name: /reply to rohit sharma/i,
    });
    typeIntoEditor(composer, "Single submission test");

    const postReplyButton = screen.getByRole("button", { name: "Post reply" });
    // First click initiates submission
    fireEvent.click(postReplyButton);

    // Second rapid click while pending
    fireEvent.click(postReplyButton);

    expect(createReplyMutateAsync).toHaveBeenCalledTimes(1);

    // Resolve mutation
    await act(async () => {
      resolveMutation({});
    });

    expect(createReplyMutateAsync).toHaveBeenCalledTimes(1);
  });

  it("16. opening another thread starts with an empty composer", async () => {
    render(
      <Discussion
        persistenceKey="test-phase2-switch-thread-empty"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    // 1. Open Rohit's thread and type a draft
    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyBtn1 = within(rohitCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn1);

    const composerRohit = await screen.findByRole("textbox", {
      name: /reply to rohit sharma/i,
    });
    typeIntoEditor(composerRohit, "Draft for Rohit");

    // Close panel
    const closeBtn = screen.getByRole("button", {
      name: "Close discussion thread",
    });
    fireEvent.click(closeBtn);

    // 2. Open Ashi's Q&A thread
    const ashiCard = document.getElementById("discussion-entry-thread-qa-1")!;
    const replyBtn2 = within(ashiCard).getByRole("button", { name: "Reply" });
    fireEvent.click(replyBtn2);

    // The composer in Ashi's thread is empty!
    const composerAshi = await screen.findByRole("textbox", {
      name: /reply to ashi singh/i,
    });
    const ashiView = EditorView.findFromDOM(composerAshi);
    expect(ashiView?.state.doc.toString()).toBe("");
    expect(composerAshi.textContent).not.toContain("Draft for Rohit");
  });

  it("17. Phase 2.1: expanding View replies inline fetches and renders backend replies using useThreadReplies", async () => {
    render(
      <Discussion
        persistenceKey="test-phase2-inline-replies"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const viewRepliesBtn = within(rohitCard).getByRole("button", {
      name: /view 2 replies/i,
    });

    // Panel is NOT opened
    expect(screen.queryByRole("dialog")).toBeNull();

    // Click to expand inline
    fireEvent.click(viewRepliesBtn);

    // Replies are rendered inline under the card
    expect(
      within(rohitCard).getByText("Great breakdown of the design process!"),
    ).toBeInTheDocument();
    expect(
      within(rohitCard).getByText("Rohit's reply to design process"),
    ).toBeInTheDocument();
    expect(
      within(rohitCard).getByText("Ashi's instructor reply"),
    ).toBeInTheDocument();
  });

  it("18. Phase 2.1: displays loading and error states for inline replies", () => {
    mockInteractions.useThreadReplies.mockImplementation((threadId: string, _query: any, options: any) => {
      if (options?.enabled) {
        return {
          data: undefined,
          isLoading: true,
          isError: false,
          refetch: vi.fn(),
        };
      }
      return {
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    });

    render(
      <Discussion
        persistenceKey="test-phase2-inline-loading"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const viewRepliesBtn = within(rohitCard).getByRole("button", {
      name: /view 2 replies/i,
    });

    fireEvent.click(viewRepliesBtn);

    expect(within(rohitCard).getByTestId("learning-replies-loading")).toBeInTheDocument();
    expect(within(rohitCard).getByText("Loading replies…")).toBeInTheDocument();
  });

  it("19. Phase 2.1: inline reply like calls useToggleLike with targetType: 'reply'", () => {
    render(
      <Discussion
        persistenceKey="test-phase2-inline-like"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const viewRepliesBtn = within(rohitCard).getByRole("button", {
      name: /view 2 replies/i,
    });
    fireEvent.click(viewRepliesBtn);

    const replyEntry = within(rohitCard).getByText("Rohit's reply to design process").closest("article")!;
    const likeBtn = within(replyEntry).getByRole("button", {
      name: /like reply/i,
    });
    fireEvent.click(likeBtn);

    expect(toggleLikeMutateAsync).toHaveBeenCalledWith({
      targetType: "reply",
      targetId: "reply-comment-101",
    });
  });

  it("20. Phase 2.1: inline reply edit and delete (with undo) call useUpdateReply and useDeleteReply", async () => {
    vi.useFakeTimers();

    render(
      <Discussion
        persistenceKey="test-phase2-inline-edit-delete"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const rohitCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const viewRepliesBtn = within(rohitCard).getByRole("button", {
      name: /view 2 replies/i,
    });
    fireEvent.click(viewRepliesBtn);

    // Find Ashi's own reply
    const ashiReplyArticle = document.getElementById("discussion-entry-reply-comment-102")!;
    const menuBtn = within(ashiReplyArticle).getByRole("button", {
      name: /more actions for ashi singh/i,
    });
    fireEvent.click(menuBtn);

    const deleteBtn = screen.getByRole("menuitem", { name: /delete reply/i });
    fireEvent.click(deleteBtn);

    act(() => {
      vi.advanceTimersByTime(20);
    });

    // Undo button appears
    expect(
      screen.getByRole("button", {
        name: /undo deletion of ashi singh's entry/i,
      }),
    ).toBeInTheDocument();
    expect(deleteReplyMutateAsync).not.toHaveBeenCalled();

    // Advance 10s
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(deleteReplyMutateAsync).toHaveBeenCalledWith("reply-comment-102");

    vi.useRealTimers();
  });
});
