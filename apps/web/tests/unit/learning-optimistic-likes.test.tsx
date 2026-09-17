import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  LearningNote,
  LearningReply,
  LearningThread,
} from "@veolms/contracts";

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

const mockCurrentUser = {
  id: "user-current",
  username: "currentuser",
  displayName: "Current User",
  avatarDataUrl: "/avatar.webp",
  roles: ["student"],
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

describe("Learning Space Optimistic Likes Integration", () => {
  let queryClient: QueryClient;
  let toggleLikeSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
    (desiredStateCoordinator as any).queryClient = queryClient;
    desiredStateCoordinator.reset();

    toggleLikeSpy = vi
      .spyOn(learningInteractionsService, "toggleLike")
      .mockResolvedValue({
        targetType: "thread",
        targetId: "thread-101",
        liked: true,
        likesCount: 1,
      });
  });

  it("1. Thread like updates UI immediately and does NOT invalidate learningInteractionKeys.all", async () => {
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
      userId: "other-user",
      author: {
        id: "other-user",
        displayName: "Other User",
        username: "other",
        role: "Student",
      },
      kind: "comment",
      content: "Interesting question!",
      plainText: "Interesting question!",
      visibility: "public",
      status: "active",
      isLocked: false,
      likesCount: 3,
      repliesCount: 0,
      isLiked: false,
      isOwn: false,
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

    // Initial state: 3 likes, not pressed
    const likeButton = screen.getByRole("button", { name: "Like" });
    expect(likeButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("3")).toBeInTheDocument();

    // Click like
    fireEvent.click(likeButton);

    // 0ms instant optimistic update
    await waitFor(() => {
      expect(likeButton).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("4")).toBeInTheDocument();
    });

    // Broad keys.all must NOT have been invalidated
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: learningInteractionKeys.all }),
    );
  });

  it("2. Reply like updates UI immediately and does NOT invalidate learningInteractionKeys.all", async () => {
    const threadId = "thread-101";
    const replyKey = learningInteractionKeys.threadReplies(threadId, undefined);

    const reply: LearningReply = {
      id: "reply-201",
      threadId,
      userId: "other-user",
      author: {
        id: "other-user",
        displayName: "Replier",
        username: "replier",
        role: "Student",
      },
      content: "This is a helpful reply",
      plainText: "This is a helpful reply",
      status: "active",
      likesCount: 0,
      isLiked: false,
      isAccepted: false,
      createdAt: "2026-03-01T11:00:00.000Z",
      updatedAt: "2026-03-01T11:00:00.000Z",
    };

    queryClient.setQueryData(replyKey, {
      replies: [reply],
      nextCursor: null,
      totalCount: 1,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <DiscussionThreadPanel
          open={true}
          activeEntryId={threadId}
          entries={[
            {
              id: threadId,
              name: "Thread Author",
              time: "Just now",
              avatar: "/avatar.webp",
              text: "Thread content",
              likes: 1,
              replies: 1,
              isOwn: false,
            },
          ]}
          isBackendMode={true}
          currentUserId={mockCurrentUser?.id}
          currentUser={{ name: "Current User", avatar: "/avatar.webp" }}
          onOpenChange={vi.fn()}
          onActiveEntryChange={vi.fn()}
          onLike={vi.fn()}
          onReport={vi.fn()}
          onAddReply={vi.fn()}
          onEditEntry={vi.fn()}
          onDeleteEntry={vi.fn()}
          onEditReply={vi.fn()}
          onDeleteReply={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const replyLikeBtn = await screen.findByRole("button", { name: "Like reply" });
    expect(replyLikeBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(replyLikeBtn);

    // Instant optimistic update in cache
    await waitFor(() => {
      expect(replyLikeBtn).toHaveAttribute("aria-pressed", "true");
      expect(replyLikeBtn).toHaveTextContent("1");
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: learningInteractionKeys.all }),
    );
  });

  it("3. Note like updates UI immediately in Note entry card", async () => {
    const noteKey = learningInteractionKeys.notes({
      courseId: "course-1",
      lessonId: "lesson-1",
      limit: 20,
    });

    const note: LearningNote = {
      id: "note-301",
      courseId: "course-1",
      lessonId: "lesson-1",
      userId: "user-current",
      authorName: "Current User",
      content: "Important study note",
      plainText: "Important study note",
      visibility: "public",
      likesCount: 5,
      isLiked: false,
      isOwn: true,
      tags: [],
      attachments: [],
      createdAt: "2026-03-01T12:00:00.000Z",
      updatedAt: "2026-03-01T12:00:00.000Z",
    };

    queryClient.setQueryData(noteKey, {
      notes: [note],
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

    // Switch to Notes filter
    const notesFilterBtn = screen.getByRole("button", { name: "Notes" });
    fireEvent.click(notesFilterBtn);

    const noteLikeBtn = screen.getByRole("button", { name: "Like" });
    expect(noteLikeBtn).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("5")).toBeInTheDocument();

    fireEvent.click(noteLikeBtn);

    // Synchronously updated
    await waitFor(() => {
      expect(noteLikeBtn).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("6")).toBeInTheDocument();
    });
  });

  it("4. Preserves reply composer draft when thread reconciliation occurs (clientId stability)", () => {
    // Thread with clientId "client-temp-thread-1"
    const entry = {
      id: "client-temp-thread-1",
      clientId: "client-temp-thread-1",
      name: "Author",
      time: "Just now",
      avatar: "/avatar.webp",
      text: "Hello world",
      likes: 0,
      replies: 0,
      isOwn: true,
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <DiscussionThreadPanel
          open={true}
          activeEntryId={entry.id}
          entries={[entry]}
          isBackendMode={false}
          currentUser={{ name: "Current User", avatar: "/avatar.webp" }}
          onOpenChange={vi.fn()}
          onActiveEntryChange={vi.fn()}
          onLike={vi.fn()}
          onReport={vi.fn()}
          onAddReply={vi.fn()}
          onEditEntry={vi.fn()}
          onDeleteEntry={vi.fn()}
          onEditReply={vi.fn()}
          onDeleteReply={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const composerElement = screen.getByRole("textbox", { name: /reply to author/i });
    typeIntoEditor(composerElement, "Typing an insightful response...");

    const view = EditorView.findFromDOM(composerElement);
    expect(view?.state.doc.toString()).toBe("Typing an insightful response...");

    // Server reconciles: real server ID arrives, but stable clientId remains the same
    const reconciledEntry = {
      ...entry,
      id: "real-server-uuid-12345",
      clientId: "client-temp-thread-1",
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <DiscussionThreadPanel
          open={true}
          activeEntryId={reconciledEntry.id}
          entries={[reconciledEntry]}
          isBackendMode={false}
          currentUser={{ name: "Current User", avatar: "/avatar.webp" }}
          onOpenChange={vi.fn()}
          onActiveEntryChange={vi.fn()}
          onLike={vi.fn()}
          onReport={vi.fn()}
          onAddReply={vi.fn()}
          onEditEntry={vi.fn()}
          onDeleteEntry={vi.fn()}
          onEditReply={vi.fn()}
          onDeleteReply={vi.fn()}
        />
      </QueryClientProvider>,
    );

    // Composer draft was NOT wiped because clientId is stable
    const reconciledView = EditorView.findFromDOM(composerElement);
    expect(reconciledView?.state.doc.toString()).toBe("Typing an insightful response...");

    // Conversely, when switching to a DIFFERENT thread (different clientId), the composer draft resets
    const differentThreadEntry = {
      id: "other-thread-id",
      clientId: "other-thread-client-id",
      name: "Different Author",
      time: "Just now",
      avatar: "/avatar.webp",
      text: "Another thread",
      likes: 0,
      replies: 0,
      isOwn: false,
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <DiscussionThreadPanel
          open={true}
          activeEntryId={differentThreadEntry.id}
          entries={[differentThreadEntry]}
          isBackendMode={false}
          currentUser={{ name: "Current User", avatar: "/avatar.webp" }}
          onOpenChange={vi.fn()}
          onActiveEntryChange={vi.fn()}
          onLike={vi.fn()}
          onReport={vi.fn()}
          onAddReply={vi.fn()}
          onEditEntry={vi.fn()}
          onDeleteEntry={vi.fn()}
          onEditReply={vi.fn()}
          onDeleteReply={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const switchedComposerElement = screen.getByRole("textbox", { name: /reply to different author/i });
    const switchedView = EditorView.findFromDOM(switchedComposerElement);
    expect(switchedView?.state.doc.toString()).toBe("");
  });
});
