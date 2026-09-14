import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Discussion } from "../../src/learning/Discussion";
import { DiscussionThreadPanel } from "../../src/learning/DiscussionThreadPanel";
import type { LearningNote, LearningReply, LearningThread } from "@veolms/contracts";

const testCurrentUser = {
  id: "user-123",
  displayName: "Ashi Singh",
  avatarDataUrl: "/assets/sofia-avatar-160.webp",
};

const mockCommentThread: LearningThread = {
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
};

const mockQaThread: LearningThread = {
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
};

const mockNote: LearningNote = {
  id: "note-1",
  userId: "user-123",
  courseId: "course-1",
  lessonId: "lesson-1",
  content: "Key takeaway on state machines",
  plainText: "Key takeaway on state machines",
  visibility: "public",
  tags: [],
  attachments: [],
  createdAt: "2026-03-01T12:00:00.000Z",
  updatedAt: "2026-03-01T12:00:00.000Z",
};

const mockReply: LearningReply = {
  id: "reply-1",
  threadId: "thread-comment-1",
  userId: "user-456",
  author: {
    id: "user-456",
    displayName: "Rohit Sharma",
    username: "rohit",
    avatarUrl: "/assets/ethan-avatar-160.webp",
    role: "Student",
  },
  content: "Thanks for clarifying!",
  plainText: "Thanks for clarifying!",
  status: "active",
  likesCount: 2,
  isLiked: false,
  isAccepted: false,
  createdAt: "2026-03-01T10:30:00.000Z",
  updatedAt: "2026-03-01T10:30:00.000Z",
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

// Mock CommentCard to inject test trigger buttons for testing onLike delegation from Discussion
vi.mock("../../src/learning/CommentCard", async () => {
  const actual = await vi.importActual<any>("../../src/learning/CommentCard");
  return {
    ...actual,
    CommentCard: (props: any) => (
      <div data-testid={`comment-card-${props.comment.id}`} data-kind={props.comment.entryKind}>
        <span>{props.comment.name}</span>
        <span>{props.comment.text}</span>
        <button
          type="button"
          data-testid={`like-btn-${props.comment.id}`}
          onClick={() => props.onLike(props.comment.id, true)}
        >
          Like {props.comment.entryKind}
        </button>
      </div>
    ),
  };
});

describe("Learning Space Like targetType Discrimination", () => {
  const toggleLikeMutate = vi.fn();
  const toggleLikeMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockInteractions.useUserNotes.mockReturnValue({
      data: { notes: [mockNote], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockInteractions.useCreateNote.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useUpdateNote.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useDeleteNote.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [mockCommentThread, mockQaThread], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockInteractions.useCreateLessonThread.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useUpdateThread.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useDeleteThread.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    mockInteractions.useToggleLike.mockReturnValue({
      mutate: toggleLikeMutate,
      mutateAsync: toggleLikeMutateAsync.mockResolvedValue({ liked: true, likesCount: 1 }),
      isPending: false,
    });

    mockInteractions.useThreadReplies.mockReturnValue({
      data: { replies: [mockReply], nextCursor: null, totalCount: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockInteractions.useCreateReply.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useUpdateReply.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useDeleteReply.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useAcceptReply.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useLockThread.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockInteractions.useCreateReport.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("1. sends targetType 'thread' when liking a Comment entry", () => {
    render(
      <Discussion
        persistenceKey="test-like-comment"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const commentLikeBtn = screen.getByTestId("like-btn-thread-comment-1");
    fireEvent.click(commentLikeBtn);

    expect(toggleLikeMutate).toHaveBeenCalledWith({
      targetType: "thread",
      targetId: "thread-comment-1",
    });
  });

  it("2. sends targetType 'thread' when liking a Q&A question entry", () => {
    render(
      <Discussion
        persistenceKey="test-like-qa"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const qaLikeBtn = screen.getByTestId("like-btn-thread-qa-1");
    fireEvent.click(qaLikeBtn);

    expect(toggleLikeMutate).toHaveBeenCalledWith({
      targetType: "thread",
      targetId: "thread-qa-1",
    });
  });

  it("3. sends targetType 'note' when liking a Note entry", () => {
    render(
      <Discussion
        persistenceKey="test-like-note"
        courseId="course-1"
        lessonId="lesson-1"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    const noteLikeBtn = screen.getByTestId("like-btn-note-1");
    fireEvent.click(noteLikeBtn);

    expect(toggleLikeMutate).toHaveBeenCalledWith({
      targetType: "note",
      targetId: "note-1",
    });
  });

  it("4. leaves reply liking unaffected (sends targetType 'reply')", () => {
    render(
      <DiscussionThreadPanel
        open={true}
        activeEntryId="thread-comment-1"
        entries={[
          {
            id: "thread-comment-1",
            name: "Rohit Sharma",
            time: "10 minutes ago",
            avatar: "/avatar.webp",
            text: "Great breakdown!",
            likes: 5,
            replies: 1,
            isOwn: false,
          },
        ]}
        isBackendMode={true}
        currentUserId="user-123"
        currentUser={{ name: "Ashi Singh", avatar: "/avatar.webp" }}
        onOpenChange={vi.fn()}
        onActiveEntryChange={vi.fn()}
        onLike={vi.fn()}
        onReport={vi.fn()}
        onAddReply={vi.fn()}
        onEditEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
        onEditReply={vi.fn()}
        onDeleteReply={vi.fn()}
      />,
    );

    const likeReplyBtn = screen.getByRole("button", { name: "Like reply" });
    fireEvent.click(likeReplyBtn);

    expect(toggleLikeMutateAsync).toHaveBeenCalledWith({
      targetType: "reply",
      targetId: "reply-1",
    });
  });
});
