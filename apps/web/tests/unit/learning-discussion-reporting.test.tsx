import type { LearningNote, LearningReply, LearningThread } from "@veolms/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Discussion } from "../../src/learning/Discussion";
import { GENERIC_API_ERROR_MESSAGE } from "../../src/lib/api-error";
import { useCreateReport as useRealCreateReport } from "../../src/services/learning-interactions/learning-interactions.mutations";

let testCurrentUser = {
  id: "user-current",
  displayName: "Current User",
  avatarDataUrl: "/assets/current-avatar.webp",
  role: "Student",
  roles: ["student"],
};

const mockCommentThreadNotOwn: LearningThread = {
  id: "thread-comment-1",
  academyId: "academy-1",
  courseId: "course-1",
  lessonId: "lesson-1",
  userId: "user-peer-1",
  author: {
    id: "user-peer-1",
    displayName: "Peer Commenter",
    username: "peer1",
    avatarUrl: "/assets/avatar-1.webp",
    role: "Student",
  },
  kind: "comment",
  title: null,
  content: "This is a great CSS lesson!",
  plainText: "This is a great CSS lesson!",
  visibility: "public",
  status: "active",
  isLocked: false,
  acceptedAnswerId: null,
  likesCount: 3,
  repliesCount: 2,
  isLiked: false,
  isOwn: false,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
};

const mockQuestionThreadNotOwn: LearningThread = {
  id: "thread-question-1",
  academyId: "academy-1",
  courseId: "course-1",
  lessonId: "lesson-1",
  userId: "user-peer-2",
  author: {
    id: "user-peer-2",
    displayName: "Peer Questioner",
    username: "peer2",
    avatarUrl: "/assets/avatar-2.webp",
    role: "Student",
  },
  kind: "question",
  title: "How to center a div?",
  content: "Can someone explain the difference between grid and flexbox for centering?",
  plainText: "Can someone explain the difference between grid and flexbox for centering?",
  visibility: "public",
  status: "active",
  isLocked: false,
  acceptedAnswerId: "reply-qa-accepted-1",
  likesCount: 5,
  repliesCount: 2,
  isLiked: false,
  isOwn: false,
  createdAt: "2026-03-01T09:00:00.000Z",
  updatedAt: "2026-03-01T09:00:00.000Z",
};

const mockThreadOwn: LearningThread = {
  id: "thread-comment-own",
  academyId: "academy-1",
  courseId: "course-1",
  lessonId: "lesson-1",
  userId: "user-current",
  author: {
    id: "user-current",
    displayName: "Current User Author",
    username: "current",
    avatarUrl: "/assets/current-avatar.webp",
    role: "Student",
  },
  kind: "comment",
  title: null,
  content: "My own comment on the lesson",
  plainText: "My own comment on the lesson",
  visibility: "public",
  status: "active",
  isLocked: false,
  acceptedAnswerId: null,
  likesCount: 1,
  repliesCount: 0,
  isLiked: false,
  isOwn: true,
  createdAt: "2026-03-01T11:00:00.000Z",
  updatedAt: "2026-03-01T11:00:00.000Z",
};

const mockNote: LearningNote = {
  id: "note-1",
  userId: "user-current",
  courseId: "course-1",
  lessonId: "lesson-1",
  content: "Important note about grid auto-flow",
  plainText: "Important note about grid auto-flow",
  visibility: "private",
  tags: [],
  attachments: [],
  createdAt: "2026-03-01T08:00:00.000Z",
  updatedAt: "2026-03-01T08:00:00.000Z",
};

const mockReplyNotOwn: LearningReply = {
  id: "reply-peer-1",
  threadId: "thread-comment-1",
  userId: "user-peer-3",
  author: {
    id: "user-peer-3",
    displayName: "Peer Replier",
    username: "peer3",
    avatarUrl: "/assets/avatar-3.webp",
    role: "Student",
  },
  content: "I completely agree with this point.",
  plainText: "I completely agree with this point.",
  status: "active",
  isAccepted: false,
  likesCount: 2,
  isLiked: false,
  isOwn: false,
  createdAt: "2026-03-01T10:15:00.000Z",
  updatedAt: "2026-03-01T10:15:00.000Z",
};

const mockReplyOwn: LearningReply = {
  id: "reply-own-1",
  threadId: "thread-comment-1",
  userId: "user-current",
  author: {
    id: "user-current",
    displayName: "Current User Replier",
    username: "current",
    avatarUrl: "/assets/current-avatar.webp",
    role: "Student",
  },
  content: "Replying to myself here.",
  plainText: "Replying to myself here.",
  status: "active",
  isAccepted: false,
  likesCount: 0,
  isLiked: false,
  isOwn: true,
  createdAt: "2026-03-01T10:20:00.000Z",
  updatedAt: "2026-03-01T10:20:00.000Z",
};

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
  useThreadReplies: vi.fn(),
  useCreateReply: vi.fn(),
  useUpdateReply: vi.fn(),
  useDeleteReply: vi.fn(),
  useAcceptReply: vi.fn(),
  useLockThread: vi.fn(),
  useCreateReport: vi.fn(),
}));

vi.mock("../../src/navigation/useBackDismiss", () => ({
  useBackDismiss: ({ onDismiss }: { onDismiss?: () => void } = {}) => {
    return (afterDismiss?: () => void) => {
      onDismiss?.();
      afterDismiss?.();
    };
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

vi.mock("../../src/services/learning-interactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/learning-interactions")>();
  return {
    ...actual,
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
    useThreadReplies: (...args: any[]) => mockInteractions.useThreadReplies(...args),
    useCreateReply: (...args: any[]) => mockInteractions.useCreateReply(...args),
    useUpdateReply: (...args: any[]) => mockInteractions.useUpdateReply(...args),
    useDeleteReply: (...args: any[]) => mockInteractions.useDeleteReply(...args),
    useAcceptReply: (...args: any[]) => mockInteractions.useAcceptReply(...args),
    useLockThread: (...args: any[]) => mockInteractions.useLockThread(...args),
    useCreateReport: (...args: any[]) => mockInteractions.useCreateReport(...args),
  };
});

vi.mock("../../src/services/learning-interactions/learning-interactions.service", () => ({
  learningInteractionsService: {
    createReport: vi.fn().mockResolvedValue({ success: true, statusCode: 201 }),
  },
}));

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});

describe("Learning Discussion Reporting (Phase 4 Integration)", () => {
  const createReportMutateAsync = vi.fn();
  const acceptReplyMutateAsync = vi.fn();
  const lockThreadMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    testCurrentUser = {
      id: "user-current",
      displayName: "Current User",
      avatarDataUrl: "/assets/current-avatar.webp",
      role: "Student",
      roles: ["student"],
    };

    mockInteractions.useUserNotes.mockReturnValue({
      data: { notes: [mockNote], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockInteractions.useLessonThreads.mockReturnValue({
      data: {
        threads: [mockCommentThreadNotOwn, mockQuestionThreadNotOwn, mockThreadOwn],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockInteractions.useThreadReplies.mockImplementation((threadId: string) => {
      if (threadId === "thread-comment-1") {
        return {
          data: {
            replies: [mockReplyNotOwn, mockReplyOwn],
            nextCursor: null,
            totalCount: 2,
          },
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
      mutateAsync: acceptReplyMutateAsync,
      isPending: false,
    });
    mockInteractions.useLockThread.mockReturnValue({
      mutateAsync: lockThreadMutateAsync,
      isPending: false,
    });

    mockInteractions.useCreateReport.mockReturnValue({
      mutateAsync: createReportMutateAsync.mockResolvedValue({
        success: true,
        statusCode: 201,
        data: { message: "Report submitted successfully." },
      }),
      isPending: false,
    });
  });

  it("1. Report action appears on Comment thread when !isOwn", () => {
    render(
      <Discussion
        persistenceKey="test-phase4-reporting-1"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    const reportButton = screen.getByRole("menuitem", { name: "Report comment" });
    expect(reportButton).toBeInTheDocument();
  });

  it("2. Report action appears on Q&A thread when !isOwn", () => {
    render(
      <Discussion
        persistenceKey="test-phase4-reporting-2"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockQuestionThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    const reportButton = screen.getByRole("menuitem", { name: "Report Q&A" });
    expect(reportButton).toBeInTheDocument();
  });

  it("3. Report action appears on replies when !isOwn", () => {
    render(
      <Discussion
        persistenceKey="test-phase4-reporting-3"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Expand replies for thread-comment-1
    const viewRepliesBtn = screen.getByRole("button", { name: /View 2 replies/i });
    fireEvent.click(viewRepliesBtn);

    // Find the more actions button for the peer replier
    const replyMenuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockReplyNotOwn.author.displayName}`,
    });
    fireEvent.click(replyMenuTrigger);

    const reportButton = screen.getByRole("menuitem", { name: "Report reply" });
    expect(reportButton).toBeInTheDocument();
  });

  it("4. Report dialog opens with backend reasons (spam, harassment, inappropriate, misinformation, copyright, other)", () => {
    render(
      <Discussion
        persistenceKey="test-phase4-reporting-4"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    const reportButton = screen.getByRole("menuitem", { name: "Report comment" });
    fireEvent.click(reportButton);

    const dialog = screen.getByTestId("discussion-report-dialog");
    expect(dialog).toBeInTheDocument();

    const select = screen.getByTestId("report-reason-select") as HTMLSelectElement;
    expect(select).toBeInTheDocument();

    const options = Array.from(select.options).map((opt) => opt.value);
    expect(options).toContain("spam");
    expect(options).toContain("harassment");
    expect(options).toContain("inappropriate");
    expect(options).toContain("misinformation");
    expect(options).toContain("copyright");
    expect(options).toContain("other");
  });

  it("5. Submitting report for thread sends { targetType: 'thread', targetId: threadId, reason, details }", async () => {
    render(
      <Discussion
        persistenceKey="test-phase4-reporting-5"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    const reportButton = screen.getByRole("menuitem", { name: "Report comment" });
    fireEvent.click(reportButton);

    const select = screen.getByTestId("report-reason-select");
    fireEvent.change(select, { target: { value: "harassment" } });

    const details = screen.getByTestId("report-details-input");
    fireEvent.change(details, { target: { value: "This comment violates community rules." } });

    const submitButton = screen.getByTestId("report-submit-button");
    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(createReportMutateAsync).toHaveBeenCalledWith({
      targetType: "thread",
      targetId: "thread-comment-1",
      courseId: "course-1",
      reason: "harassment",
      details: "This comment violates community rules.",
    });
  });

  it("6. Submitting report for reply sends { targetType: 'reply', targetId: replyId, reason, details }", async () => {
    render(
      <Discussion
        persistenceKey="test-phase4-reporting-6"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Expand replies
    const viewRepliesBtn = screen.getByRole("button", { name: /View 2 replies/i });
    fireEvent.click(viewRepliesBtn);

    const replyMenuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockReplyNotOwn.author.displayName}`,
    });
    fireEvent.click(replyMenuTrigger);

    const reportButton = screen.getByRole("menuitem", { name: "Report reply" });
    fireEvent.click(reportButton);

    const select = screen.getByTestId("report-reason-select");
    fireEvent.change(select, { target: { value: "misinformation" } });

    const details = screen.getByTestId("report-details-input");
    fireEvent.change(details, { target: { value: "Incorrect technical advice." } });

    const submitButton = screen.getByTestId("report-submit-button");
    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(createReportMutateAsync).toHaveBeenCalledWith({
      targetType: "reply",
      targetId: "reply-peer-1",
      courseId: "course-1",
      reason: "misinformation",
      details: "Incorrect technical advice.",
    });
  });

  it("7. Successful report closes dialog and displays success status notice", async () => {
    render(
      <Discussion
        persistenceKey="test-phase4-reporting-7"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    fireEvent.click(screen.getByRole("menuitem", { name: "Report comment" }));

    fireEvent.change(screen.getByTestId("report-reason-select"), {
      target: { value: "spam" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-submit-button"));
    });

    // Dialog should be closed
    expect(screen.queryByTestId("discussion-report-dialog")).not.toBeInTheDocument();

    // Success feedback notice should be displayed
    expect(
      screen.getByText("Report received. Our moderation team will review it."),
    ).toBeInTheDocument();
  });

  it("8. Failed report preserves dialog open state, selected reason, and typed details", async () => {
    createReportMutateAsync.mockRejectedValueOnce(
      new Error("You already have a pending report for this item. Our moderation team is reviewing it."),
    );

    render(
      <Discussion
        persistenceKey="test-phase4-reporting-8"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    fireEvent.click(screen.getByRole("menuitem", { name: "Report comment" }));

    const select = screen.getByTestId("report-reason-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "spam" } });

    const details = screen.getByTestId("report-details-input") as HTMLTextAreaElement;
    fireEvent.change(details, { target: { value: "Spam link repeated 5 times." } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-submit-button"));
    });

    // Dialog stays open
    expect(screen.getByTestId("discussion-report-dialog")).toBeInTheDocument();

    // Error is displayed
    expect(
      screen.getByText("You already have a pending report for this item. Our moderation team is reviewing it."),
    ).toBeInTheDocument();

    // Inputs are preserved
    expect(select.value).toBe("spam");
    expect(details.value).toBe("Spam link repeated 5 times.");

    // Submit button is re-enabled
    expect(screen.getByTestId("report-submit-button")).toBeEnabled();
  });

  it("9. Duplicate submission prevented while mutation is pending", () => {
    mockInteractions.useCreateReport.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    });

    render(
      <Discussion
        persistenceKey="test-phase4-reporting-9"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    fireEvent.click(screen.getByRole("menuitem", { name: "Report comment" }));

    expect(screen.getByTestId("report-submit-button")).toBeDisabled();
    expect(screen.getByTestId("report-reason-select")).toBeDisabled();
    expect(screen.getByTestId("report-details-input")).toBeDisabled();
    expect(screen.getByTestId("report-cancel-button")).toBeDisabled();
  });

  it("10. Own content (isOwn = true) does NOT display Report in action menu", () => {
    render(
      <Discussion
        persistenceKey="test-phase4-reporting-10"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Thread owned by current user
    const threadMenuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockThreadOwn.author.displayName}`,
    });
    fireEvent.click(threadMenuTrigger);

    expect(screen.queryByRole("menuitem", { name: /Report/i })).not.toBeInTheDocument();

    // Close menu
    fireEvent.click(document.body);

    // Expand replies for comment thread
    const viewRepliesBtn = screen.getByRole("button", { name: /View 2 replies/i });
    fireEvent.click(viewRepliesBtn);

    // Reply owned by current user
    const replyMenuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockReplyOwn.author.displayName}`,
    });
    fireEvent.click(replyMenuTrigger);

    expect(screen.queryByRole("menuitem", { name: /Report/i })).not.toBeInTheDocument();
  });

  it("11. Notes do NOT display Report in action menu", () => {
    render(
      <Discussion
        persistenceKey="test-phase4-reporting-11"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Switch to Notes filter tab
    const notesTab = screen.getByRole("button", { name: /Notes/i });
    fireEvent.click(notesTab);

    // Open action menu on note
    const noteMenuTrigger = screen.getByRole("button", {
      name: `More actions for Current User`,
    });
    fireEvent.click(noteMenuTrigger);

    // Should contain Edit note and Delete note, but NO Report option
    expect(screen.getByRole("menuitem", { name: "Edit note" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete note" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Report/i })).not.toBeInTheDocument();
  });

  it("12. Reporting does not mutate acceptedAnswerId, isSolved, or isLocked state", async () => {
    render(
      <Discussion
        persistenceKey="test-phase4-reporting-12"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    // Thread is question thread with accepted answer
    expect(screen.getByTestId("qa-solved-badge")).toBeInTheDocument();

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockQuestionThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    fireEvent.click(screen.getByRole("menuitem", { name: "Report Q&A" }));

    fireEvent.change(screen.getByTestId("report-reason-select"), {
      target: { value: "other" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-submit-button"));
    });

    // Lock and accept mutations were never called
    expect(lockThreadMutateAsync).not.toHaveBeenCalled();
    expect(acceptReplyMutateAsync).not.toHaveBeenCalled();

    // Solved badge is still present
    expect(screen.getByTestId("qa-solved-badge")).toBeInTheDocument();
    // Locked badge is not present
    expect(screen.queryByTestId("thread-locked-badge")).not.toBeInTheDocument();
  });

  it("13. Reporting does not trigger query invalidations on learningInteractionKeys.all", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRealCreateReport(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        targetType: "thread",
        targetId: "thread-1",
        reason: "spam",
      });
    });

    // useRealCreateReport must not invalidate queries on success
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("14. Duplicate report error response displays backend DUPLICATE_REPORT message, keeps dialog open, and re-enables submit button", async () => {
    createReportMutateAsync.mockRejectedValueOnce({
      status: 400,
      code: "DUPLICATE_REPORT",
      message: "You already have a pending report for this item. Our moderation team is reviewing it.",
    });

    render(
      <Discussion
        persistenceKey="test-phase4-reporting-14"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    fireEvent.click(screen.getByRole("menuitem", { name: "Report comment" }));

    const select = screen.getByTestId("report-reason-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "misinformation" } });

    const details = screen.getByTestId("report-details-input") as HTMLTextAreaElement;
    fireEvent.change(details, { target: { value: "Repeated duplicate report attempt." } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-submit-button"));
    });

    expect(screen.getByTestId("discussion-report-dialog")).toBeInTheDocument();
    expect(
      screen.getByText("You already have a pending report for this item. Our moderation team is reviewing it."),
    ).toBeInTheDocument();
    expect(select.value).toBe("misinformation");
    expect(details.value).toBe("Repeated duplicate report attempt.");
    expect(screen.getByTestId("report-submit-button")).toBeEnabled();
  });

  it("15. Unknown/500 report failure displays generic error message and preserves form state", async () => {
    createReportMutateAsync.mockRejectedValueOnce({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: GENERIC_API_ERROR_MESSAGE,
    });

    render(
      <Discussion
        persistenceKey="test-phase4-reporting-15"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    fireEvent.click(screen.getByRole("menuitem", { name: "Report comment" }));

    const select = screen.getByTestId("report-reason-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "harassment" } });

    const details = screen.getByTestId("report-details-input") as HTMLTextAreaElement;
    fireEvent.change(details, { target: { value: "Offensive remark." } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-submit-button"));
    });

    expect(screen.getByTestId("discussion-report-dialog")).toBeInTheDocument();
    expect(screen.getByText(GENERIC_API_ERROR_MESSAGE)).toBeInTheDocument();
    expect(select.value).toBe("harassment");
    expect(details.value).toBe("Offensive remark.");
    expect(screen.getByTestId("report-submit-button")).toBeEnabled();
  });

  it("16. Empty or unrecognized error object in report dialog falls back to GENERIC_API_ERROR_MESSAGE", async () => {
    createReportMutateAsync.mockRejectedValueOnce({});

    render(
      <Discussion
        persistenceKey="test-phase4-reporting-16"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    fireEvent.click(screen.getByRole("menuitem", { name: "Report comment" }));

    const select = screen.getByTestId("report-reason-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "spam" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-submit-button"));
    });

    expect(screen.getByTestId("discussion-report-dialog")).toBeInTheDocument();
    expect(screen.getByText(GENERIC_API_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.getByTestId("report-submit-button")).toBeEnabled();
  });

  it("17. DUPLICATE_REPORT error detected from code only (without explicit message) displays duplicate pending message", async () => {
    createReportMutateAsync.mockRejectedValueOnce({
      code: "DUPLICATE_REPORT",
    });

    render(
      <Discussion
        persistenceKey="test-phase4-reporting-17"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    fireEvent.click(screen.getByRole("menuitem", { name: "Report comment" }));

    const select = screen.getByTestId("report-reason-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "copyright" } });

    const details = screen.getByTestId("report-details-input") as HTMLTextAreaElement;
    fireEvent.change(details, { target: { value: "Copyrighted content used without permission." } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-submit-button"));
    });

    expect(screen.getByTestId("discussion-report-dialog")).toBeInTheDocument();
    expect(
      screen.getByText("You already have a pending report for this item. Our moderation team is reviewing it."),
    ).toBeInTheDocument();
    expect(select.value).toBe("copyright");
    expect(details.value).toBe("Copyrighted content used without permission.");
    expect(screen.getByTestId("report-submit-button")).toBeEnabled();
  });

  it("18. DUPLICATE_REPORT error detected from nested response data displays duplicate pending message", async () => {
    createReportMutateAsync.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            code: "DUPLICATE_REPORT",
          },
        },
      },
    });

    render(
      <Discussion
        persistenceKey="test-phase4-reporting-18"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    fireEvent.click(screen.getByRole("menuitem", { name: "Report comment" }));

    const select = screen.getByTestId("report-reason-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "inappropriate" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-submit-button"));
    });

    expect(screen.getByTestId("discussion-report-dialog")).toBeInTheDocument();
    expect(
      screen.getByText("You already have a pending report for this item. Our moderation team is reviewing it."),
    ).toBeInTheDocument();
    expect(select.value).toBe("inappropriate");
    expect(screen.getByTestId("report-submit-button")).toBeEnabled();
  });

  it("19. Unexpected error with custom message hides internal details and displays generic error message", async () => {
    createReportMutateAsync.mockRejectedValueOnce(
      new Error("FATAL: database connection pool exhausted at PostgreSQL"),
    );

    render(
      <Discussion
        persistenceKey="test-phase4-reporting-19"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{ allowComments: true, allowQa: true, allowNotes: true }}
      />,
    );

    const menuTrigger = screen.getByRole("button", {
      name: `More actions for ${mockCommentThreadNotOwn.author.displayName}`,
    });
    fireEvent.click(menuTrigger);

    fireEvent.click(screen.getByRole("menuitem", { name: "Report comment" }));

    const select = screen.getByTestId("report-reason-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "spam" } });

    const details = screen.getByTestId("report-details-input") as HTMLTextAreaElement;
    fireEvent.change(details, { target: { value: "Spam link." } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-submit-button"));
    });

    expect(screen.getByTestId("discussion-report-dialog")).toBeInTheDocument();
    // Generic error message shown, NOT the raw fatal error
    expect(screen.getByText(GENERIC_API_ERROR_MESSAGE)).toBeInTheDocument();
    expect(
      screen.queryByText("FATAL: database connection pool exhausted at PostgreSQL"),
    ).not.toBeInTheDocument();
    expect(select.value).toBe("spam");
    expect(details.value).toBe("Spam link.");
    expect(screen.getByTestId("report-submit-button")).toBeEnabled();
  });
});
