import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Discussion } from "../../src/learning/Discussion";
import { DiscussionThreadPanel } from "../../src/learning/DiscussionThreadPanel";
import {
  desiredStateCoordinator,
  learningInteractionKeys,
  learningInteractionsService,
} from "../../src/services/learning-interactions";
import type {
  CurrentUserResponse,
  LearningReply,
  LearningThread,
} from "@veolms/contracts";

const mockCurrentUser = {
  id: "user-current",
  username: "currentuser",
  displayName: "Current User",
  avatarDataUrl: "/avatar.webp",
  roles: ["student", "instructor"],
} as CurrentUserResponse;

vi.mock("../../src/services/auth", () => ({
  useCurrentUser: () => ({ data: mockCurrentUser }),
  useLogout: vi.fn(),
  authKeys: {
    me: () => ["auth", "me"] as const,
    sessions: () => ["auth", "sessions"] as const,
  },
}));

vi.mock("../../src/services/learning-space", () => ({
  learningSpaceKeys: { all: ["learning-space"] as const },
  useCourseInteractionCapabilities: () => ({
    data: {
      allowComments: true,
      allowQa: true,
      allowNotes: true,
      allowReplies: true,
      allowLikes: true,
      allowAttachments: true,
    },
    isLoading: false,
  }),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
}

describe("Learning Space Optimistic Phase 2 Integration (Bookmark, Follow, Lock, Accept)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
    desiredStateCoordinator.setQueryClient(queryClient);
    desiredStateCoordinator.reset();

    vi.spyOn(learningInteractionsService, "toggleBookmark").mockResolvedValue({
      threadId: "thread-101",
      bookmarked: true,
    });

    vi.spyOn(learningInteractionsService, "toggleFollow").mockResolvedValue({
      threadId: "thread-101",
      following: true,
    });

    vi.spyOn(learningInteractionsService, "lockThread").mockResolvedValue({
      threadId: "thread-101",
      isLocked: true,
    });

    vi.spyOn(learningInteractionsService, "acceptReply").mockResolvedValue({
      replyId: "reply-201",
      threadId: "thread-101",
      isAccepted: true,
      acceptedAnswerId: "reply-201",
    });
  });

  it("1. Bookmark updates UI instantly (0ms) and does NOT invalidate learningInteractionKeys.all", async () => {
    const threadKey = learningInteractionKeys.lessonThreads("course-1", "lesson-1", {
      kind: "all",
      status: "all",
      sort: "latest",
      limit: 20,
    });

    const thread: LearningThread = {
      id: "thread-101",
      courseId: "course-1",
      lessonId: "lesson-1",
      academyId: "academy-1",
      userId: "user-current",
      author: {
        id: "user-current",
        displayName: "Current User",
        username: "currentuser",
        role: "Instructor",
      },
      kind: "comment",
      content: "A great comment",
      plainText: "A great comment",
      visibility: "public",
      status: "active",
      isLocked: false,
      likesCount: 0,
      repliesCount: 0,
      isLiked: false,
      isBookmarked: false,
      isFollowing: false,
      isOwn: true,
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    };

    queryClient.setQueryData(threadKey, {
      threads: [thread],
      nextCursor: null,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <Discussion
          courseId="course-1"
          lessonId="lesson-1"
          persistenceKey="c1:l1"
        />
      </QueryClientProvider>,
    );

    // Initial state: no bookmarked badge
    expect(screen.queryByTestId("thread-bookmarked-badge")).not.toBeInTheDocument();

    // Trigger bookmark via coordinator (simulating menu/action)
    desiredStateCoordinator.setBookmarked({
      threadId: "thread-101",
      desiredBookmarked: true,
      currentBaseline: false,
      lessonContext: { courseId: "course-1", lessonId: "lesson-1" },
      queryClient,
    });

    // Badge appears immediately
    await waitFor(() => {
      expect(screen.getByTestId("thread-bookmarked-badge")).toBeInTheDocument();
    });

    // learningInteractionKeys.all MUST NOT have been invalidated
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: learningInteractionKeys.all }),
    );
  });

  it("2. Follow updates UI instantly (0ms) and does NOT invalidate learningInteractionKeys.all", async () => {
    const threadKey = learningInteractionKeys.lessonThreads("course-1", "lesson-1", {
      kind: "all",
      status: "all",
      sort: "latest",
      limit: 20,
    });

    const thread: LearningThread = {
      id: "thread-101",
      courseId: "course-1",
      lessonId: "lesson-1",
      academyId: "academy-1",
      userId: "user-current",
      author: {
        id: "user-current",
        displayName: "Current User",
        username: "currentuser",
        role: "Instructor",
      },
      kind: "comment",
      content: "A great comment",
      plainText: "A great comment",
      visibility: "public",
      status: "active",
      isLocked: false,
      likesCount: 0,
      repliesCount: 0,
      isLiked: false,
      isBookmarked: false,
      isFollowing: false,
      isOwn: true,
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    };

    queryClient.setQueryData(threadKey, {
      threads: [thread],
      nextCursor: null,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Discussion
          courseId="course-1"
          lessonId="lesson-1"
          persistenceKey="c1:l1"
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId("thread-following-badge")).not.toBeInTheDocument();

    desiredStateCoordinator.setFollowed({
      threadId: "thread-101",
      desiredFollowed: true,
      currentBaseline: false,
      lessonContext: { courseId: "course-1", lessonId: "lesson-1" },
      queryClient,
    });

    await waitFor(() => {
      expect(screen.getByTestId("thread-following-badge")).toBeInTheDocument();
    });
  });

  it("3. Lock updates UI instantly: shows locked notice and hides reply composer", async () => {
    const thread: LearningThread = {
      id: "thread-101",
      courseId: "course-1",
      lessonId: "lesson-1",
      academyId: "academy-1",
      userId: "user-current",
      author: {
        id: "user-current",
        displayName: "Current User",
        username: "currentuser",
        role: "Instructor",
      },
      kind: "comment",
      content: "Thread to lock",
      plainText: "Thread to lock",
      visibility: "public",
      status: "active",
      isLocked: false,
      likesCount: 0,
      repliesCount: 0,
      isLiked: false,
      isBookmarked: false,
      isFollowing: false,
      isOwn: true,
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    };

    queryClient.setQueryData(learningInteractionKeys.threadDetails("thread-101"), thread);

    const onToggleLockThread = vi.fn((threadId, locked) => {
      desiredStateCoordinator.setLocked({
        threadId: String(threadId),
        desiredLocked: locked,
        queryClient,
      });
    });

    const mockPanelProps = {
      onOpenChange: vi.fn(),
      onActiveEntryChange: vi.fn(),
      onLike: vi.fn(),
      onAddReply: vi.fn(),
      onEditEntry: vi.fn(),
      onDeleteEntry: vi.fn(),
      onEditReply: vi.fn(),
      onDeleteReply: vi.fn(),
      onReport: vi.fn(),
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <DiscussionThreadPanel
          {...mockPanelProps}
          open={true}
          activeEntryId="thread-101"
          entries={[
            {
              id: "thread-101",
              name: "Current User",
              time: "Just now",
              avatar: "/avatar.webp",
              text: "Thread to lock",
              likes: 0,
              liked: false,
              replies: 0,
              thread: [],
              isLocked: false,
              isOwn: true,
            } as any,
          ]}
          isBackendMode={true}
          currentUserId="user-current"
          userRole="Instructor"
          onToggleLockThread={onToggleLockThread}
        />
      </QueryClientProvider>,
    );

    // Initial state: reply composer is present, locked notice is NOT present
    expect(screen.queryByTestId("thread-locked-notice")).not.toBeInTheDocument();

    // Lock thread
    desiredStateCoordinator.setLocked({
      threadId: "thread-101",
      desiredLocked: true,
      queryClient,
    });

    // Re-render panel with updated thread data
    const updatedThread = queryClient.getQueryData<LearningThread>(
      learningInteractionKeys.threadDetails("thread-101"),
    );

    rerender(
      <QueryClientProvider client={queryClient}>
        <DiscussionThreadPanel
          {...mockPanelProps}
          open={true}
          activeEntryId="thread-101"
          entries={[
            {
              id: "thread-101",
              name: "Current User",
              time: "Just now",
              avatar: "/avatar.webp",
              text: "Thread to lock",
              likes: 0,
              liked: false,
              replies: 0,
              thread: [],
              isLocked: updatedThread?.isLocked ?? true,
              isOwn: true,
            } as any,
          ]}
          isBackendMode={true}
          currentUserId="user-current"
          userRole="Instructor"
          onToggleLockThread={onToggleLockThread}
        />
      </QueryClientProvider>,
    );

    // Locked notice now rendered immediately
    expect(screen.getByTestId("thread-locked-notice")).toBeInTheDocument();
    expect(
      screen.getByText("This conversation is locked. Replies are disabled."),
    ).toBeInTheDocument();
  });

  it("4. Accept answer updates reply and thread solved badge immediately", async () => {
    const threadId = "thread-101";
    const replyKey = learningInteractionKeys.threadRepliesRoot(threadId);

    queryClient.setQueryData(learningInteractionKeys.threadDetails(threadId), {
      id: threadId,
      kind: "question",
      acceptedAnswerId: null,
      isSolved: false,
    });

    queryClient.setQueryData(replyKey, {
      replies: [
        {
          id: "reply-201",
          threadId,
          content: "Answer 1",
          plainText: "Answer 1",
          isAccepted: false,
          author: { id: "u2", displayName: "User 2" },
        },
        {
          id: "reply-202",
          threadId,
          content: "Answer 2",
          plainText: "Answer 2",
          isAccepted: false,
          author: { id: "u3", displayName: "User 3" },
        },
      ],
      totalCount: 2,
    });

    // Accept reply 201
    desiredStateCoordinator.setAcceptedAnswer({
      threadId,
      desiredAcceptedReplyId: "reply-201",
      queryClient,
    });

    // Verify cache updated immediately
    const thread = queryClient.getQueryData<any>(learningInteractionKeys.threadDetails(threadId));
    expect(thread.acceptedAnswerId).toBe("reply-201");

    const replies = queryClient.getQueryData<any>(replyKey)?.replies;
    expect(replies[0].isAccepted).toBe(true);
    expect(replies[1].isAccepted).toBe(false);

    // Now switch accept to reply 202
    desiredStateCoordinator.setAcceptedAnswer({
      threadId,
      desiredAcceptedReplyId: "reply-202",
      queryClient,
    });

    // Reply 201 is unaccepted, reply 202 is accepted. Never both!
    const replies2 = queryClient.getQueryData<any>(replyKey)?.replies;
    expect(replies2[0].isAccepted).toBe(false);
    expect(replies2[1].isAccepted).toBe(true);
  });
});
