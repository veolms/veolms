import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Discussion } from "../../src/learning/Discussion";
import type { LearningReply, LearningThread } from "@veolms/contracts";

let testCurrentUser = {
  id: "user-author",
  displayName: "Ashi Author",
  avatarDataUrl: "/assets/sofia-avatar-160.webp",
  role: "Student" as const,
  roles: ["student"],
};

const mockQuestionThread: LearningThread = {
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
  acceptedAnswerId: null,
  likesCount: 2,
  repliesCount: 2,
  isLiked: false,
  isOwn: true,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
};

const mockCommentThread: LearningThread = {
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
  acceptedAnswerId: null,
  likesCount: 1,
  repliesCount: 1,
  isLiked: false,
  isOwn: true,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
};

const mockQaReplies: LearningReply[] = [
  {
    id: "reply-qa-1",
    threadId: "thread-question-1",
    userId: "user-peer-1",
    author: {
      id: "user-peer-1",
      displayName: "Peer One",
      username: "peer1",
      avatarUrl: "/assets/ethan-avatar-160.webp",
      role: "Student",
    },
    content: "Grid is two-dimensional, flexbox is one-dimensional.",
    plainText: "Grid is two-dimensional, flexbox is one-dimensional.",
    status: "active",
    isAccepted: false,
    likesCount: 4,
    isLiked: false,
    isOwn: false,
    createdAt: "2026-03-01T10:30:00.000Z",
    updatedAt: "2026-03-01T10:30:00.000Z",
  },
  {
    id: "reply-qa-2",
    threadId: "thread-question-1",
    userId: "user-peer-2",
    author: {
      id: "user-peer-2",
      displayName: "Peer Two",
      username: "peer2",
      avatarUrl: "/assets/ethan-avatar-160.webp",
      role: "Student",
    },
    content: "Use grid for page layout and flexbox for components.",
    plainText: "Use grid for page layout and flexbox for components.",
    status: "active",
    isAccepted: false,
    likesCount: 2,
    isLiked: false,
    isOwn: false,
    createdAt: "2026-03-01T11:00:00.000Z",
    updatedAt: "2026-03-01T11:00:00.000Z",
  },
];

const mockCommentReplies: LearningReply[] = [
  {
    id: "reply-comment-1",
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
  useToggleBookmark: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useToggleFollow: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
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
  useThreadDetails: (...args: any[]) => mockInteractions.useThreadDetails(...args),
  desiredStateCoordinator: mockInteractions.desiredStateCoordinator,
}));

describe("Learning Discussion Q&A Specific Actions (Phase 3 Integration)", () => {
  const acceptReplyMutateAsync = vi.fn();
  const lockThreadMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    testCurrentUser = {
      id: "user-author",
      displayName: "Ashi Author",
      avatarDataUrl: "/assets/sofia-avatar-160.webp",
      role: "Student",
      roles: ["student"],
    };

    mockInteractions.useUserNotes.mockReturnValue({
      data: { notes: [], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockInteractions.useLessonThreads.mockReturnValue({
      data: {
        threads: [{ ...mockQuestionThread }, { ...mockCommentThread }],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockInteractions.useThreadReplies.mockImplementation((threadId: string) => {
      if (threadId === "thread-question-1") {
        return {
          data: { replies: mockQaReplies, nextCursor: null, totalCount: 2 },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      }
      return {
        data: { replies: mockCommentReplies, nextCursor: null, totalCount: 1 },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    });

    mockInteractions.useCreateNote.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useUpdateNote.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useDeleteNote.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useCreateLessonThread.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useUpdateThread.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useDeleteThread.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useToggleLike.mockReturnValue({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false });
    mockInteractions.useCreateReply.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useUpdateReply.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useDeleteReply.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    mockInteractions.useAcceptReply.mockReturnValue({
      mutateAsync: acceptReplyMutateAsync.mockResolvedValue({
        replyId: "reply-qa-1",
        threadId: "thread-question-1",
        isAccepted: true,
        acceptedAnswerId: "reply-qa-1",
      }),
      isPending: false,
    });

    mockInteractions.useLockThread.mockReturnValue({
      mutateAsync: lockThreadMutateAsync.mockResolvedValue({
        threadId: "thread-question-1",
        isLocked: true,
      }),
      isPending: false,
    });

    mockInteractions.useCreateReport.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("1. question author can accept an answer, calling useAcceptReply with correct payload", async () => {
    render(
      <Discussion
        persistenceKey="test-phase3-accept"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Expand replies for the question thread inline
    const viewRepliesBtn = screen.getByRole("button", { name: /View 2 replies/i });
    fireEvent.click(viewRepliesBtn);

    // The accept button for reply-qa-1 should exist
    const acceptBtn = await screen.findByTestId("accept-reply-btn-reply-qa-1");
    expect(acceptBtn).toBeInTheDocument();

    // Click accept answer
    await act(async () => {
      fireEvent.click(acceptBtn);
    });

    expect(
      mockInteractions.desiredStateCoordinator.setAcceptedAnswer,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-question-1",
        desiredAcceptedReplyId: "reply-qa-1",
      }),
    );
  });

  it("2. accepted answer displays accepted-answer-badge on reply, and qa-solved-badge on thread when acceptedAnswerId is set", async () => {
    const threadWithAccepted: LearningThread = {
      ...mockQuestionThread,
      acceptedAnswerId: "reply-qa-1",
    };
    const repliesWithAccepted: LearningReply[] = [
      { ...mockQaReplies[0]!, isAccepted: true },
      { ...mockQaReplies[1]!, isAccepted: false },
    ];

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [threadWithAccepted], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockInteractions.useThreadReplies.mockReturnValue({
      data: { replies: repliesWithAccepted, nextCursor: null, totalCount: 2 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <Discussion
        persistenceKey="test-phase3-badges"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Verify Solved badge on parent thread
    expect(screen.getByTestId("qa-solved-badge")).toHaveTextContent("Solved");

    // Expand replies
    const viewRepliesBtn = screen.getByRole("button", { name: /View 2 replies/i });
    fireEvent.click(viewRepliesBtn);

    // Verify Accepted Answer badge on reply-qa-1
    const acceptedBadge = await screen.findByTestId("accepted-answer-badge");
    expect(acceptedBadge).toBeInTheDocument();
    expect(acceptedBadge).toHaveTextContent("Accepted Answer");
  });

  it("3. unaccepting an answer calls useAcceptReply with accepted: false", async () => {
    const threadWithAccepted: LearningThread = {
      ...mockQuestionThread,
      acceptedAnswerId: "reply-qa-1",
    };
    const repliesWithAccepted: LearningReply[] = [
      { ...mockQaReplies[0]!, isAccepted: true },
      { ...mockQaReplies[1]!, isAccepted: false },
    ];

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [threadWithAccepted], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockInteractions.useThreadReplies.mockReturnValue({
      data: { replies: repliesWithAccepted, nextCursor: null, totalCount: 2 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <Discussion
        persistenceKey="test-phase3-unaccept"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Expand inline replies
    const viewRepliesBtn = screen.getByRole("button", { name: /View 2 replies/i });
    fireEvent.click(viewRepliesBtn);

    const acceptBtn = await screen.findByTestId("accept-reply-btn-reply-qa-1");
    expect(acceptBtn).toHaveAttribute("aria-label", "Unaccept answer");

    await act(async () => {
      fireEvent.click(acceptBtn);
    });

    expect(
      mockInteractions.desiredStateCoordinator.setAcceptedAnswer,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-question-1",
        desiredAcceptedReplyId: null,
      }),
    );
  });

  it("4. thread author or moderator can lock thread calling useLockThread with isLocked: true", async () => {
    render(
      <Discussion
        persistenceKey="test-phase3-lock"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Open action menu for question thread
    const questionCard = document.getElementById("discussion-entry-thread-question-1")!;
    const moreActionsBtn = within(questionCard).getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(moreActionsBtn);

    // Find Lock Q&A menu item
    const lockItem = screen.getByRole("menuitem", { name: /Lock Q&A/i });
    expect(lockItem).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(lockItem);
    });

    await waitFor(() => {
      expect(
        mockInteractions.desiredStateCoordinator.setLocked,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "thread-question-1",
          desiredLocked: true,
        }),
      );
    });
  });

  it("5. locked thread displays thread-locked-badge and disables reply composition in panel", async () => {
    const lockedThread: LearningThread = {
      ...mockQuestionThread,
      isLocked: true,
    };

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [lockedThread], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <Discussion
        persistenceKey="test-phase3-locked-state"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Badge visible on thread card
    expect(screen.getByTestId("thread-locked-badge")).toHaveTextContent("Locked");

    // Clicking View thread to open thread panel
    const questionCard = document.getElementById("discussion-entry-thread-question-1")!;
    const openThreadBtn = within(questionCard).getByRole("button", { name: /View thread/i });
    fireEvent.click(openThreadBtn);

    // Inside thread panel, locked notice should be rendered instead of reply composer
    const lockedNotice = await screen.findByTestId("thread-locked-notice");
    expect(lockedNotice).toBeInTheDocument();
    expect(lockedNotice).toHaveTextContent(/This conversation is locked. Replies are disabled./i);
  });

  it("6. unlocking a thread calls useLockThread with isLocked: false and restores functionality", async () => {
    const lockedThread: LearningThread = {
      ...mockQuestionThread,
      isLocked: true,
    };

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [lockedThread], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <Discussion
        persistenceKey="test-phase3-unlock"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const questionCard = document.getElementById("discussion-entry-thread-question-1")!;
    const moreActionsBtn = within(questionCard).getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(moreActionsBtn);

    const unlockItem = screen.getByRole("menuitem", { name: /Unlock Q&A/i });
    expect(unlockItem).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(unlockItem);
    });

    await waitFor(() => {
      expect(
        mockInteractions.desiredStateCoordinator.setLocked,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "thread-question-1",
          desiredLocked: false,
        }),
      );
    });
  });

  it("7. Comments threads support lock/unlock, but NEVER show accepted answer buttons or solved badges", async () => {
    render(
      <Discussion
        persistenceKey="test-phase3-comments-isolation"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Filter to comments using category pill button
    const commentsFilterBtn = screen.getByRole("button", { name: /^Comments$/i });
    fireEvent.click(commentsFilterBtn);

    // Comment thread card: verify no solved badge
    expect(screen.queryByTestId("qa-solved-badge")).not.toBeInTheDocument();

    // Comment card has Lock Comment in menu
    const commentCard = document.getElementById("discussion-entry-thread-comment-1")!;
    const commentActionBtn = within(commentCard).getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(commentActionBtn);
    expect(screen.getByRole("menuitem", { name: /Lock Comment/i })).toBeInTheDocument();

    // Expand replies for comment thread
    const viewRepliesBtn = within(commentCard).getByRole("button", { name: /View 1 reply/i });
    fireEvent.click(viewRepliesBtn);

    // Wait for reply to appear: verify NO accept button and NO accepted answer badge
    await screen.findByText("Glad you found it helpful!");
    expect(screen.queryByTestId("accept-reply-btn-reply-comment-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("accepted-answer-badge")).not.toBeInTheDocument();
  });

  it("8. student who is NOT author of question does not see accept or lock action buttons", async () => {
    // Current user is a different student
    testCurrentUser = {
      id: "user-peer-3",
      displayName: "Other Student",
      avatarDataUrl: "/assets/ethan-avatar-160.webp",
      role: "Student",
      roles: ["student"],
    };

    const notOwnQuestion: LearningThread = {
      ...mockQuestionThread,
      isOwn: false,
    };

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [notOwnQuestion], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <Discussion
        persistenceKey="test-phase3-permissions"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Expand replies
    const viewRepliesBtn = screen.getByRole("button", { name: /View 2 replies/i });
    fireEvent.click(viewRepliesBtn);

    // Accept button should not exist for non-author student
    await screen.findByText("Grid is two-dimensional, flexbox is one-dimensional.");
    expect(screen.queryByTestId("accept-reply-btn-reply-qa-1")).not.toBeInTheDocument();

    // Action menu should not offer Lock
    const questionCard = document.getElementById("discussion-entry-thread-question-1")!;
    const moreActionsBtn = within(questionCard).getByRole("button", {
      name: "More actions for Ashi Author",
    });
    fireEvent.click(moreActionsBtn);
    expect(screen.queryByRole("menuitem", { name: /Lock Q&A/i })).not.toBeInTheDocument();
  });
});
