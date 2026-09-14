import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adaptLearningNoteToComment } from "../../src/learning/learning-notes.adapter";
import { CommentCard } from "../../src/learning/CommentCard";
import { Discussion } from "../../src/learning/Discussion";
import { learningInteractionKeys } from "../../src/services/learning-interactions/learning-interactions.keys";
import { authKeys } from "../../src/services/auth/auth.keys";
import { learningSpaceKeys } from "../../src/services/learning-space";
import type {
  CurrentUserResponse,
  LearningNote,
  LoginResponse,
} from "@veolms/contracts";

// Mock router
const mockNavigate = vi.fn();
let mockSearchParams = new URLSearchParams("from=courses");

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams, vi.fn()],
  };
});

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
  useThreadDetails: vi.fn(),
  useDiscussionAutocompleteUsers: vi.fn(() => ({ data: { users: [] } })),
}));

vi.mock("../../src/services/learning-interactions", () => mockInteractions);
vi.mock("../../src/services/learning-interactions/learning-interactions.queries", () => ({
  useUserNotes: mockInteractions.useUserNotes,
  useLessonThreads: mockInteractions.useLessonThreads,
  useThreadReplies: mockInteractions.useThreadReplies,
  useThreadDetails: mockInteractions.useThreadDetails,
  useDiscussionAutocompleteUsers: mockInteractions.useDiscussionAutocompleteUsers,
}));

vi.mock("../../src/services/learning-interactions/learning-interactions.mutations", () => ({
  useCreateNote: mockInteractions.useCreateNote,
  useUpdateNote: mockInteractions.useUpdateNote,
  useDeleteNote: mockInteractions.useDeleteNote,
  useCreateLessonThread: mockInteractions.useCreateLessonThread,
  useUpdateThread: mockInteractions.useUpdateThread,
  useDeleteThread: mockInteractions.useDeleteThread,
  useToggleLike: mockInteractions.useToggleLike,
  useToggleBookmark: mockInteractions.useToggleBookmark,
  useToggleFollow: mockInteractions.useToggleFollow,
  useCreateReply: mockInteractions.useCreateReply,
  useUpdateReply: mockInteractions.useUpdateReply,
  useDeleteReply: mockInteractions.useDeleteReply,
  useAcceptReply: mockInteractions.useAcceptReply,
  useLockThread: mockInteractions.useLockThread,
  useCreateReport: mockInteractions.useCreateReport,
}));

const mockCurrentUser = {
  id: "student-hero-alom-id",
  username: "heroalom",
  displayName: "Hero Alom",
  avatarDataUrl: "https://example.com/hero-alom.webp",
  roles: ["student"],
};

vi.mock("../../src/services/auth", () => ({
  useCurrentUser: () => ({ data: mockCurrentUser }),
  useLogout: vi.fn(),
  authKeys: {
    me: () => ["auth", "me"] as const,
    sessions: () => ["auth", "sessions"] as const,
  },
}));

vi.mock("../../src/services/learning-space", () => ({
  learningSpaceKeys: {
    all: ["learning-space"] as const,
  },
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

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
}

describe("Learning Space Notes Ownership & Privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams("from=courses");

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
    mockInteractions.useLessonThreads.mockReturnValue({
      data: { threads: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockInteractions.useUserNotes.mockReturnValue({
      data: { notes: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockInteractions.useThreadDetails.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });
    mockInteractions.useThreadReplies.mockReturnValue({
      data: { replies: [] },
      isLoading: false,
      isError: false,
    });
  });

  describe("1. Creator public note returned to student", () => {
    const creatorPublicNote: LearningNote = {
      id: "note-creator-1",
      courseId: "course-123",
      lessonId: "lesson-456",
      userId: "creator-user-id",
      authorName: "VeoLMS Creator",
      authorUsername: "creator",
      content: "sssssss",
      plainText: "sssssss",
      visibility: "public",
      likesCount: 7,
      isLiked: true,
      isOwn: false,
      tags: [],
      createdAt: "2026-03-01T12:00:00.000Z",
      updatedAt: "2026-03-01T12:00:00.000Z",
      attachments: [],
    };

    it("rendered author remains creator, isOwn=false, does not use student avatar", () => {
      const comment = adaptLearningNoteToComment(
        creatorPublicNote,
        mockCurrentUser.displayName,
        mockCurrentUser.avatarDataUrl,
        mockCurrentUser.id,
      );

      // Rendered author must remain the creator
      expect(comment.name).toBe("VeoLMS Creator");
      // Ownership must be false
      expect(comment.isOwn).toBe(false);
      // Likes from server note DTO
      expect(comment.likes).toBe(7);
      expect(comment.liked).toBe(true);
      // Avatar must NOT be the student's avatar
      expect(comment.avatar).not.toBe(mockCurrentUser.avatarDataUrl);
    });

    it("makes Edit/Delete unavailable for foreign creator note in CommentCard", () => {
      const comment = adaptLearningNoteToComment(
        creatorPublicNote,
        mockCurrentUser.displayName,
        mockCurrentUser.avatarDataUrl,
        mockCurrentUser.id,
      );

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <CommentCard
            comment={comment}
            onLike={vi.fn()}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
          />
        </QueryClientProvider>,
      );

      // Open action menu
      const menuTrigger = screen.getByRole("button", {
        name: /more actions for veolms creator/i,
      });
      fireEvent.click(menuTrigger);

      // Edit and Delete actions must NOT be present
      expect(screen.queryByText(/edit note/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/delete note/i)).not.toBeInTheDocument();

      // Only safe public actions appear
      expect(screen.getByText(/share note/i)).toBeInTheDocument();
      expect(screen.getByText(/report note/i)).toBeInTheDocument();
    });

    it("renders creator public note in Discussion feed without impersonating student", () => {
      mockInteractions.useUserNotes.mockReturnValue({
        data: {
          notes: [creatorPublicNote],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <Discussion
            courseId="course-123"
            courseSlug="test-course"
            lessonId="lesson-456"
            persistenceKey="course-123:lesson-456"
          />
        </QueryClientProvider>,
      );

      // Switch to Notes filter
      const notesButton = screen.getByRole("button", { name: "Notes" });
      fireEvent.click(notesButton);

      // Creator name and note content are visible
      expect(screen.getByText("VeoLMS Creator")).toBeInTheDocument();
      expect(screen.getByText("sssssss")).toBeInTheDocument();

      // Student name is NOT stamped on creator's note
      const noteAuthorHeadings = screen.getAllByRole("heading", { level: 2 });
      const creatorHeading = noteAuthorHeadings.find(
        (h) => h.textContent === "VeoLMS Creator",
      );
      expect(creatorHeading).toBeDefined();
    });
  });

  describe("2. Own student note", () => {
    const studentOwnNote: LearningNote = {
      id: "note-student-1",
      courseId: "course-123",
      lessonId: "lesson-456",
      userId: mockCurrentUser.id,
      authorName: mockCurrentUser.displayName,
      content: "My personal study note",
      plainText: "My personal study note",
      visibility: "private",
      likesCount: 0,
      isLiked: false,
      isOwn: true,
      tags: [],
      createdAt: "2026-03-01T12:00:00.000Z",
      updatedAt: "2026-03-01T12:00:00.000Z",
      attachments: [],
    };

    it("renders as student and provides Edit/Delete actions", () => {
      const comment = adaptLearningNoteToComment(
        studentOwnNote,
        mockCurrentUser.displayName,
        mockCurrentUser.avatarDataUrl,
        mockCurrentUser.id,
      );

      expect(comment.name).toBe("Hero Alom");
      expect(comment.isOwn).toBe(true);
      expect(comment.avatar).toBe(mockCurrentUser.avatarDataUrl);

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <CommentCard
            comment={comment}
            onLike={vi.fn()}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
          />
        </QueryClientProvider>,
      );

      const menuTrigger = screen.getByRole("button", {
        name: /more actions for hero alom/i,
      });
      fireEvent.click(menuTrigger);

      expect(screen.getByText(/edit note/i)).toBeInTheDocument();
      expect(screen.getByText(/delete note/i)).toBeInTheDocument();
    });
  });

  describe("3. Account switch clears learning-interaction caches", () => {
    it("clears cached notes when Account A logs out or Account B logs in with same QueryClient", () => {
      const sharedQueryClient = createTestQueryClient();

      const accountANotes: LearningNote[] = [
        {
          id: "note-a",
          courseId: "course-1",
          lessonId: "lesson-1",
          userId: "account-a-id",
          authorName: "Instructor Alice",
          content: "Alice private notes",
          plainText: "Alice private notes",
          visibility: "private",
          likesCount: 1,
          isLiked: false,
          isOwn: true,
          tags: [],
          createdAt: "2026-03-01T10:00:00.000Z",
          updatedAt: "2026-03-01T10:00:00.000Z",
          attachments: [],
        },
      ];

      // 1. Account A caches lesson notes
      const notesKey = learningInteractionKeys.notes({
        courseId: "course-1",
        lessonId: "lesson-1",
        limit: 50,
      });

      sharedQueryClient.setQueryData(notesKey, { notes: accountANotes });
      sharedQueryClient.setQueryData(authKeys.me(), {
        id: "account-a-id",
        displayName: "Instructor Alice",
      });

      expect(sharedQueryClient.getQueryData(notesKey)).toEqual({
        notes: accountANotes,
      });

      // 2. Account A logs out -> auth mutations remove learningInteractionKeys.all
      sharedQueryClient.setQueryData(authKeys.me(), null);
      sharedQueryClient.removeQueries({ queryKey: authKeys.me() });
      sharedQueryClient.removeQueries({ queryKey: learningSpaceKeys.all });
      sharedQueryClient.removeQueries({ queryKey: learningInteractionKeys.all });

      // Verify Account A cache was removed
      expect(sharedQueryClient.getQueryData(notesKey)).toBeUndefined();

      // 3. Account B logs in (persistAuthenticatedSession also removes learningInteractionKeys.all)
      sharedQueryClient.removeQueries({ queryKey: learningInteractionKeys.all });
      sharedQueryClient.setQueryData(authKeys.me(), {
        id: "account-b-id",
        displayName: "Student Bob",
      });

      // Account B receives fresh state, no leftover cache from Account A
      expect(sharedQueryClient.getQueryData(notesKey)).toBeUndefined();
    });
  });
});
