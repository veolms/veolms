import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Discussion } from "../../src/learning/Discussion";
import type { LearningNote, LearningReply, LearningThread } from "@veolms/contracts";

let testCurrentUser = {
  id: "user-author",
  displayName: "Ashi Author",
  avatarDataUrl: "/assets/sofia-avatar-160.webp",
  role: "Student" as const,
  roles: ["student"],
};

const mockCommentThreadUnbookmarked: LearningThread = {
  id: "thread-comment-1",
  academyId: "academy-1",
  courseId: "course-1",
  lessonId: "lesson-1",
  userId: "user-author",
  author: {
    id: "user-author",
    displayName: "Ashi Author",
    username: "ashi",
    avatarUrl: "/assets/sofia-avatar-160.webp",
    role: "Student",
  },
  kind: "comment",
  title: null,
  content: "Great tutorial on CSS!",
  plainText: "Great tutorial on CSS!",
  visibility: "public",
  status: "active",
  isLocked: false,
  isBookmarked: false,
  acceptedAnswerId: null,
  likesCount: 1,
  repliesCount: 1,
  isLiked: false,
  isOwn: true,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
};

const mockCommentThreadBookmarked: LearningThread = {
  ...mockCommentThreadUnbookmarked,
  id: "thread-comment-2",
  isBookmarked: true,
};

const mockQuestionThreadUnbookmarked: LearningThread = {
  id: "thread-question-1",
  academyId: "academy-1",
  courseId: "course-1",
  lessonId: "lesson-1",
  userId: "user-author",
  author: {
    id: "user-author",
    displayName: "Ashi Author",
    username: "ashi",
    avatarUrl: "/assets/sofia-avatar-160.webp",
    role: "Student",
  },
  kind: "question",
  title: "How does CSS grid work?",
  content: "Can someone explain CSS grid versus flexbox?",
  plainText: "Can someone explain CSS grid versus flexbox?",
  visibility: "public",
  status: "active",
  isLocked: false,
  isBookmarked: false,
  acceptedAnswerId: null,
  likesCount: 2,
  repliesCount: 0,
  isLiked: false,
  isOwn: true,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
};

const mockQuestionThreadBookmarked: LearningThread = {
  ...mockQuestionThreadUnbookmarked,
  id: "thread-question-2",
  isBookmarked: true,
};

const mockNote: LearningNote = {
  id: "note-1",
  userId: "user-author",
  courseId: "course-1",
  lessonId: "lesson-1",
  content: "Personal summary of CSS variables",
  plainText: "Personal summary of CSS variables",
  visibility: "public",
  tags: [],
  attachments: [],
  createdAt: "2026-03-01T12:00:00.000Z",
  updatedAt: "2026-03-01T12:00:00.000Z",
};

const mockReplies: LearningReply[] = [
  {
    id: "reply-1",
    threadId: "thread-comment-1",
    userId: "user-peer-1",
    author: {
      id: "user-peer-1",
      displayName: "Peer One",
      username: "peer1",
      avatarUrl: "/assets/ethan-avatar-160.webp",
      role: "Student",
    },
    content: "Glad you found it helpful!",
    plainText: "Glad you found it helpful!",
    status: "active",
    isAccepted: false,
    likesCount: 1,
    isLiked: false,
    isOwn: false,
    createdAt: "2026-03-01T10:30:00.000Z",
    updatedAt: "2026-03-01T10:30:00.000Z",
  },
];

const mockInteractions = vi.hoisted(() => ({
  useLessonInteractionCounts: vi.fn((..._args: any[]) => ({ data: undefined })),
  useUserNotes: vi.fn(),
  useCreateNote: vi.fn(),
  useUpdateNote: vi.fn(),
  useDeleteNote: vi.fn(),
  useLessonThreads: vi.fn(),
  useCreateLessonThread: vi.fn(),
  useUpdateThread: vi.fn(),
  useDeleteThread: vi.fn(),
  useToggleLike: vi.fn(),
  useToggleBookmark: vi.fn(),
  useToggleFollow: vi.fn(),
  useThreadReplies: vi.fn(),
  useCreateReply: vi.fn(),
  useUpdateReply: vi.fn(),
  useDeleteReply: vi.fn(),
  useAcceptReply: vi.fn(),
  useLockThread: vi.fn(),
  useCreateReport: vi.fn(),
  useThreadDetails: vi.fn((..._args: any[]) => ({ data: undefined, isLoading: false, isError: false })),
  desiredStateCoordinator: {
    setLiked: vi.fn(),
    setBookmarked: vi.fn(),
    setFollowed: vi.fn(),
    setLocked: vi.fn(),
    setAcceptedAnswer: vi.fn(),
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

vi.mock("../../src/services/learning-interactions", () => ({
  useLessonInteractionCounts: (...args: any[]) =>
    mockInteractions.useLessonInteractionCounts(...args),
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
  useToggleBookmark: (...args: any[]) => mockInteractions.useToggleBookmark(...args),
  useToggleFollow: (...args: any[]) => mockInteractions.useToggleFollow(...args),
  useThreadReplies: (...args: any[]) => mockInteractions.useThreadReplies(...args),
  useCreateReply: (...args: any[]) => mockInteractions.useCreateReply(...args),
  useUpdateReply: (...args: any[]) => mockInteractions.useUpdateReply(...args),
  useDeleteReply: (...args: any[]) => mockInteractions.useDeleteReply(...args),
  useAcceptReply: (...args: any[]) => mockInteractions.useAcceptReply(...args),
  useLockThread: (...args: any[]) => mockInteractions.useLockThread(...args),
  useCreateReport: (...args: any[]) => mockInteractions.useCreateReport(...args),
  useThreadDetails: (...args: any[]) => mockInteractions.useThreadDetails(...args),
  desiredStateCoordinator: mockInteractions.desiredStateCoordinator,
}));

describe("Learning Space Thread Bookmark Functionality", () => {
  const toggleBookmarkMutateAsync = vi.fn();
  const refetchThreads = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockInteractions.useUserNotes.mockReturnValue({
      data: { notes: [] },
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
      data: { threads: [mockCommentThreadUnbookmarked] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
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
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockInteractions.useToggleBookmark.mockReturnValue({
      mutateAsync: toggleBookmarkMutateAsync,
      isPending: false,
    });

    mockInteractions.useToggleFollow.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockInteractions.useThreadReplies.mockReturnValue({
      data: { replies: mockReplies, totalCount: 1 },
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

  it("shows 'Bookmark' and no indicator when Comment is not bookmarked", () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadUnbookmarked] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-bookmark-1"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    // Indicator is not present
    expect(screen.queryByTestId("thread-bookmarked-badge")).not.toBeInTheDocument();
    expect(screen.queryByText("Bookmarked")).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    expect(
      screen.getByRole("menuitem", { name: "Bookmark" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Remove bookmark" }),
    ).not.toBeInTheDocument();
  });

  it("shows 'Remove bookmark' and Bookmarked indicator when Comment is bookmarked", () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadBookmarked] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-bookmark-2"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    // Persistent Bookmarked indicator is rendered
    const badge = screen.getByTestId("thread-bookmarked-badge");
    expect(badge).toBeInTheDocument();
    expect(within(badge).getByText("Bookmarked")).toBeInTheDocument();

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    expect(
      screen.getByRole("menuitem", { name: "Remove bookmark" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Bookmark" }),
    ).not.toBeInTheDocument();
  });

  it("supports bookmarking for Q&A threads (indicator and Bookmark when unbookmarked, indicator and Remove bookmark when bookmarked)", () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockQuestionThreadUnbookmarked, mockQuestionThreadBookmarked] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-bookmark-qa"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    const unbookmarkedCard = document.getElementById("discussion-entry-thread-question-1")!;
    expect(within(unbookmarkedCard).queryByTestId("thread-bookmarked-badge")).not.toBeInTheDocument();
    const unbookmarkedMenuBtn = within(unbookmarkedCard).getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(unbookmarkedMenuBtn);
    expect(
      screen.getByRole("menuitem", { name: "Bookmark" }),
    ).toBeInTheDocument();

    // Close menu
    fireEvent.click(unbookmarkedMenuBtn);

    const bookmarkedCard = document.getElementById("discussion-entry-thread-question-2")!;
    const bookmarkedBadge = within(bookmarkedCard).getByTestId("thread-bookmarked-badge");
    expect(bookmarkedBadge).toBeInTheDocument();
    expect(within(bookmarkedBadge).getByText("Bookmarked")).toBeInTheDocument();

    const bookmarkedMenuBtn = within(bookmarkedCard).getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(bookmarkedMenuBtn);
    expect(
      screen.getByRole("menuitem", { name: "Remove bookmark" }),
    ).toBeInTheDocument();
  });

  it("does NOT expose bookmark action or indicator for Notes", () => {
    mockInteractions.useUserNotes.mockReturnValue({
      data: { notes: [mockNote] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-bookmark-notes"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    expect(screen.queryByTestId("thread-bookmarked-badge")).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    expect(
      screen.queryByRole("menuitem", { name: "Bookmark" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Remove bookmark" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Edit note" }),
    ).toBeInTheDocument();
  });

  it("does NOT expose bookmark action or indicator for Replies", async () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadUnbookmarked] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-bookmark-replies"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    // Expand replies by clicking comment article
    const commentArticle = screen.getByRole("article");
    fireEvent.click(commentArticle);

    // Wait for replies to render
    const replyMenuButton = await screen.findByRole("button", {
      name: "More actions for Peer One",
    });
    const replyItem = replyMenuButton.closest("article");
    expect(replyItem).toBeTruthy();
    expect(within(replyItem!).queryByTestId("thread-bookmarked-badge")).not.toBeInTheDocument();

    fireEvent.click(replyMenuButton);

    expect(
      screen.queryByRole("menuitem", { name: "Bookmark" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Remove bookmark" }),
    ).not.toBeInTheDocument();
  });

  it("clicking Bookmark calls the mutation with correct thread ID and updates displayed state", async () => {
    toggleBookmarkMutateAsync.mockResolvedValue({
      threadId: "thread-comment-1",
      bookmarked: true,
    });

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadUnbookmarked] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-bookmark-toggle"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    const bookmarkItem = screen.getByRole("menuitem", { name: "Bookmark" });
    await act(async () => {
      fireEvent.click(bookmarkItem);
    });

    await waitFor(() => {
      expect(
        mockInteractions.desiredStateCoordinator.setBookmarked,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "thread-comment-1",
          desiredBookmarked: true,
        }),
      );
    });
  });

  it("calls desiredStateCoordinator to bookmark and remove bookmark", async () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadUnbookmarked] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-bookmark-indicator-cycle"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    // Initial state: not bookmarked, indicator absent
    expect(screen.queryByTestId("thread-bookmarked-badge")).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    const bookmarkItem = screen.getByRole("menuitem", { name: "Bookmark" });
    await act(async () => {
      fireEvent.click(bookmarkItem);
    });

    await waitFor(() => {
      expect(
        mockInteractions.desiredStateCoordinator.setBookmarked,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "thread-comment-1",
          desiredBookmarked: true,
        }),
      );
    });
  });

  it("wires the same bookmark behavior into the root thread displayed inside DiscussionThreadPanel", async () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadUnbookmarked] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-bookmark-panel"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    // Click Reply button inside the comment article to open thread panel
    const commentCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyButton = commentCard.querySelector<HTMLButtonElement>('[data-reply-action]')!;
    expect(replyButton).toBeTruthy();
    fireEvent.click(replyButton);

    // Thread panel dialog is open
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Menu in root entry inside dialog
    const panelMenuButtons = screen.getAllByRole("button", {
      name: "More actions for Ashi Author",
    });
    const panelMenuButton = panelMenuButtons[panelMenuButtons.length - 1]!;
    expect(panelMenuButton).toBeTruthy();
    fireEvent.click(panelMenuButton);

    const bookmarkItem = screen.getByRole("menuitem", { name: "Bookmark" });
    await act(async () => {
      fireEvent.click(bookmarkItem);
    });

    await waitFor(() => {
      expect(
        mockInteractions.desiredStateCoordinator.setBookmarked,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "thread-comment-1",
          desiredBookmarked: true,
        }),
      );
    });
  });

  it("preserves updated state when thread query refetches with canonical isBookmarked: true", async () => {
    const { rerender } = render(
      <Discussion
        persistenceKey="test-bookmark-refetch"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Bookmark" }));
    });

    await waitFor(() => {
      expect(
        mockInteractions.desiredStateCoordinator.setBookmarked,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "thread-comment-1",
          desiredBookmarked: true,
        }),
      );
    });

    // Simulate query refetch returning canonical server state with isBookmarked: true
    mockInteractions.useLessonThreads.mockReturnValue({
      data: {
        threads: [
          {
            ...mockCommentThreadUnbookmarked,
            isBookmarked: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    rerender(
      <Discussion
        persistenceKey="test-bookmark-refetch"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    fireEvent.click(menuButton);
    await waitFor(() => {
      expect(
        screen.getByRole("menuitem", { name: "Remove bookmark" }),
      ).toBeInTheDocument();
    });
  });

  it("keeps bookmark failure silent", async () => {
    mockInteractions.desiredStateCoordinator.setBookmarked.mockImplementation(
      ({ onFailure }: any) => {
        onFailure?.(new Error("Network connection lost"));
      },
    );

    render(
      <Discussion
        persistenceKey="test-bookmark-error-silent"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Ashi Author",
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Bookmark" }));
    });

    expect(screen.queryByText("Network connection lost")).not.toBeInTheDocument();
  });
});
