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

const mockCommentThreadUnfollowed: LearningThread = {
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
  isFollowing: false,
  acceptedAnswerId: null,
  likesCount: 1,
  repliesCount: 1,
  isLiked: false,
  isOwn: true,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
};

const mockCommentThreadFollowed: LearningThread = {
  ...mockCommentThreadUnfollowed,
  id: "thread-comment-2",
  isFollowing: true,
};

const mockQuestionThreadUnfollowed: LearningThread = {
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
  isFollowing: false,
  acceptedAnswerId: null,
  likesCount: 2,
  repliesCount: 0,
  isLiked: false,
  isOwn: true,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
};

const mockQuestionThreadFollowed: LearningThread = {
  ...mockQuestionThreadUnfollowed,
  id: "thread-question-2",
  isFollowing: true,
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
}));

describe("Learning Space Thread Follow Functionality", () => {
  const toggleFollowMutateAsync = vi.fn();
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
      mutateAsync: toggleFollowMutateAsync,
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

  it("1. Comment can be followed and shows 'Follow discussion' when unfollowed", () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadUnfollowed] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-follow-1"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    expect(screen.queryByTestId("thread-following-badge")).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    expect(
      screen.getByRole("menuitem", { name: "Follow discussion" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Unfollow discussion" }),
    ).not.toBeInTheDocument();
  });

  it("2. Q&A can be followed and shows 'Follow discussion' when unfollowed", () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockQuestionThreadUnfollowed] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-follow-2"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    expect(screen.queryByTestId("thread-following-badge")).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    expect(
      screen.getByRole("menuitem", { name: "Follow discussion" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Unfollow discussion" }),
    ).not.toBeInTheDocument();
  });

  it("3. followed Comment shows 'Unfollow discussion'", () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadFollowed] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-follow-3"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    expect(
      screen.getByRole("menuitem", { name: "Unfollow discussion" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Follow discussion" }),
    ).not.toBeInTheDocument();
  });

  it("4. followed Q&A shows 'Unfollow discussion'", () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockQuestionThreadFollowed] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-follow-4"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    expect(
      screen.getByRole("menuitem", { name: "Unfollow discussion" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Follow discussion" }),
    ).not.toBeInTheDocument();
  });

  it("5. followed thread displays persistent 'Following' indicator", () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadFollowed] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-follow-5"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    const badge = screen.getByTestId("thread-following-badge");
    expect(badge).toBeInTheDocument();
    expect(within(badge).getByText("Following")).toBeInTheDocument();
  });

  it("6. Note does NOT expose Follow action or Following indicator", () => {
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
        persistenceKey="test-follow-notes"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    expect(screen.queryByTestId("thread-following-badge")).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    expect(
      screen.queryByRole("menuitem", { name: "Follow discussion" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Unfollow discussion" }),
    ).not.toBeInTheDocument();
  });

  it("7. Reply does NOT expose Follow action or Following indicator", async () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadUnfollowed] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-follow-replies"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    // Expand replies
    const commentArticle = screen.getByRole("article");
    fireEvent.click(commentArticle);

    const replyMenuButton = await screen.findByRole("button", {
      name: "More actions for Peer One",
    });
    const replyItem = replyMenuButton.closest("article");
    expect(replyItem).toBeTruthy();
    expect(within(replyItem!).queryByTestId("thread-following-badge")).not.toBeInTheDocument();

    fireEvent.click(replyMenuButton);

    expect(
      screen.queryByRole("menuitem", { name: "Follow discussion" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Unfollow discussion" }),
    ).not.toBeInTheDocument();
  });

  it("8. correct thread ID reaches useToggleFollow when clicked", async () => {
    toggleFollowMutateAsync.mockResolvedValue({
      threadId: "thread-comment-1",
      following: true,
    });

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadUnfollowed] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-follow-thread-id"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    const followItem = screen.getByRole("menuitem", { name: "Follow discussion" });
    await act(async () => {
      fireEvent.click(followItem);
    });

    await waitFor(() => {
      expect(toggleFollowMutateAsync).toHaveBeenCalledWith("thread-comment-1");
    });
  });

  it("9. server response.following controls resulting state and indicator", async () => {
    toggleFollowMutateAsync.mockResolvedValueOnce({
      threadId: "thread-comment-1",
      following: true,
    });

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadUnfollowed] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-follow-authoritative-state"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    expect(screen.queryByTestId("thread-following-badge")).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Follow discussion" }));
    });

    // Following indicator appears based on authoritative response
    await waitFor(() => {
      const badge = screen.getByTestId("thread-following-badge");
      expect(badge).toBeInTheDocument();
      expect(within(badge).getByText("Following")).toBeInTheDocument();
    });

    // Next unfollow
    toggleFollowMutateAsync.mockResolvedValueOnce({
      threadId: "thread-comment-1",
      following: false,
    });

    fireEvent.click(menuButton);
    const unfollowItem = await screen.findByRole("menuitem", {
      name: "Unfollow discussion",
    });
    await act(async () => {
      fireEvent.click(unfollowItem);
    });

    // Following indicator disappears based on authoritative response
    await waitFor(() => {
      expect(screen.queryByTestId("thread-following-badge")).not.toBeInTheDocument();
    });
  });

  it("10. feed and thread-panel states remain consistent", async () => {
    toggleFollowMutateAsync.mockResolvedValue({
      threadId: "thread-comment-1",
      following: true,
    });

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadUnfollowed] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-follow-panel-consistency"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    // Open thread panel via Reply button
    const commentCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const replyButton = commentCard.querySelector<HTMLButtonElement>('[data-reply-action]')!;
    expect(replyButton).toBeTruthy();
    fireEvent.click(replyButton);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).queryByTestId("thread-following-badge")).not.toBeInTheDocument();

    // Menu in root entry inside dialog
    const panelMenuButtons = screen.getAllByRole("button", {
      name: "More actions for Ashi Author",
    });
    const panelMenuButton = panelMenuButtons[panelMenuButtons.length - 1]!;
    fireEvent.click(panelMenuButton);

    const followItem = screen.getByRole("menuitem", { name: "Follow discussion" });
    await act(async () => {
      fireEvent.click(followItem);
    });

    await waitFor(() => {
      expect(toggleFollowMutateAsync).toHaveBeenCalledWith("thread-comment-1");
    });

    // Root entry inside panel displays Following indicator
    await waitFor(() => {
      const panelBadge = within(dialog).getByTestId("thread-following-badge");
      expect(panelBadge).toBeInTheDocument();
      expect(within(panelBadge).getByText("Following")).toBeInTheDocument();
    });

    // Feed card also displays Following indicator
    const feedBadge = within(commentCard).getByTestId("thread-following-badge");
    expect(feedBadge).toBeInTheDocument();
    expect(within(feedBadge).getByText("Following")).toBeInTheDocument();
  });

  it("11. existing Bookmark behavior remains unaffected alongside Follow", async () => {
    mockInteractions.useLessonThreads.mockReturnValue({
      data: {
        threads: [
          {
            ...mockCommentThreadUnfollowed,
            isBookmarked: true,
            isFollowing: false,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-follow-bookmark-coexist"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    // Bookmarked badge is present, Following badge is absent
    expect(screen.getByTestId("thread-bookmarked-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("thread-following-badge")).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    // Both actions coexist in the menu
    expect(
      screen.getByRole("menuitem", { name: "Remove bookmark" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Follow discussion" }),
    ).toBeInTheDocument();
  });

  it("12. preserves previous state and displays notice if mutation fails", async () => {
    toggleFollowMutateAsync.mockRejectedValue(new Error("Network connection lost"));

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThreadUnfollowed] },
      isLoading: false,
      isError: false,
      refetch: refetchThreads,
    });

    render(
      <Discussion
        persistenceKey="test-follow-error"
        courseId="course-1"
        lessonId="lesson-1"
      />,
    );

    const menuButton = screen.getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(menuButton);

    await act(async () => {
      try {
        fireEvent.click(screen.getByRole("menuitem", { name: "Follow discussion" }));
      } catch {
        // Expected error
      }
    });

    // Following indicator does NOT appear
    await waitFor(() => {
      expect(screen.queryByTestId("thread-following-badge")).not.toBeInTheDocument();
    });

    // Error notice is displayed to user
    await waitFor(() => {
      expect(screen.getByText("Network connection lost")).toBeInTheDocument();
    });
  });
});
