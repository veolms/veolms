import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Discussion } from "../../src/learning/Discussion";
import {
  getCoursePlayerPath,
  getCoursePlayerReturnPath,
  getCoursePlayerSession,
  getCoursePlayerThread,
  upsertCoursePlayerSessionFromRoute,
} from "../../src/learning/coursePlayerNavigation";
import { shareDiscussionEntry } from "../../src/learning/CommentCard";
import type { LearningThread } from "@veolms/contracts";

const testCurrentUser = {
  id: "user-current",
  displayName: "Ashi Singh",
  avatarDataUrl: "/assets/sofia-avatar-160.webp",
  roles: ["Student"],
};

const mockInteractions = vi.hoisted(() => ({
  useUserNotes: vi.fn(),
  useCreateNote: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useUpdateNote: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useDeleteNote: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useLessonThreads: vi.fn(),
  useCreateLessonThread: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useUpdateThread: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useDeleteThread: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useToggleLike: vi.fn((..._args: any[]) => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useToggleBookmark: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useToggleFollow: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useThreadReplies: vi.fn((..._args: any[]) => ({
    data: { replies: [] },
    isLoading: false,
    isError: false,
  })),
  useThreadDetails: vi.fn((..._args: any[]): any => ({
    data: undefined,
    isLoading: false,
    isError: false,
  })),
  useCreateReply: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useUpdateReply: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useDeleteReply: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useAcceptReply: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useLockThread: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useCreateReport: vi.fn((..._args: any[]) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
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
  useLessonThreads: (...args: any[]) =>
    mockInteractions.useLessonThreads(...args),
  useCreateLessonThread: (...args: any[]) =>
    mockInteractions.useCreateLessonThread(...args),
  useUpdateThread: (...args: any[]) =>
    mockInteractions.useUpdateThread(...args),
  useDeleteThread: (...args: any[]) =>
    mockInteractions.useDeleteThread(...args),
  useToggleLike: (...args: any[]) => mockInteractions.useToggleLike(...args),
  useToggleBookmark: () => mockInteractions.useToggleBookmark(),
  useToggleFollow: () => mockInteractions.useToggleFollow(),
  useThreadReplies: (...args: any[]) =>
    mockInteractions.useThreadReplies(...args),
  useThreadDetails: (...args: any[]) =>
    mockInteractions.useThreadDetails(...args),
  useCreateReply: (...args: any[]) => mockInteractions.useCreateReply(...args),
  useUpdateReply: (...args: any[]) => mockInteractions.useUpdateReply(...args),
  useDeleteReply: (...args: any[]) => mockInteractions.useDeleteReply(...args),
  useAcceptReply: (...args: any[]) => mockInteractions.useAcceptReply(...args),
  useLockThread: (...args: any[]) => mockInteractions.useLockThread(...args),
  useCreateReport: (...args: any[]) =>
    mockInteractions.useCreateReport(...args),
}));

// Component to observe current URL in tests
function LocationProbe({
  onLocation,
}: {
  onLocation: (loc: ReturnType<typeof useLocation>) => void;
}) {
  const loc = useLocation();
  React.useEffect(() => {
    onLocation(loc);
  }, [loc, onLocation]);
  return null;
}

describe("Learning Space Discussion Deep-Linking", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();

    mockInteractions.useUserNotes.mockReturnValue({
      data: { notes: [], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockInteractions.useLessonThreads.mockReturnValue({
      data: {
        threads: [
          {
            id: "thr-feed-1",
            academyId: "acad-1",
            courseId: "course-1",
            lessonId: "lesson-1",
            userId: "user-1",
            author: {
              id: "user-1",
              displayName: "Feed Author 1",
              username: "author1",
            },
            kind: "comment",
            content: "First feed comment content",
            plainText: "First feed comment content",
            visibility: "public",
            status: "active",
            isLocked: false,
            likesCount: 5,
            repliesCount: 0,
            createdAt: "2026-09-01T10:00:00.000Z",
            updatedAt: "2026-09-01T10:00:00.000Z",
          },
          {
            id: "thr-feed-2",
            academyId: "acad-1",
            courseId: "course-1",
            lessonId: "lesson-1",
            userId: "user-2",
            author: {
              id: "user-2",
              displayName: "Feed Author 2",
              username: "author2",
            },
            kind: "question",
            content: "Second feed question content",
            plainText: "Second feed question content",
            visibility: "public",
            status: "active",
            isLocked: false,
            likesCount: 2,
            repliesCount: 0,
            createdAt: "2026-09-01T11:00:00.000Z",
            updatedAt: "2026-09-01T11:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockInteractions.useThreadDetails.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
  });

  describe("1. Course Player Navigation thread utilities", () => {
    it("extracts thread parameter correctly from search string", () => {
      expect(getCoursePlayerThread("?thread=thr-999")).toBe("thr-999");
      expect(
        getCoursePlayerThread(
          "?from=courses&returnTo=%2Fcourses&thread=thr-abc",
        ),
      ).toBe("thr-abc");
      expect(getCoursePlayerThread("?from=courses")).toBeNull();
      expect(getCoursePlayerThread("?thread=%20%20")).toBeNull();
      expect(getCoursePlayerThread("")).toBeNull();
    });

    it("preserves thread alongside from and returnTo in getCoursePlayerPath", () => {
      const path = getCoursePlayerPath(
        "the-ultimate-no",
        "courses",
        1,
        "/courses/the-ultimate-no/overview",
        { threadId: "thr-deep-link" },
      );
      expect(path).toBe(
        "/learn/the-ultimate-no/lecture-1?from=courses&returnTo=%2Fcourses%2Fthe-ultimate-no%2Foverview&thread=thr-deep-link",
      );
    });

    it("upserts course player session preserving thread parameter", () => {
      const path = upsertCoursePlayerSessionFromRoute(
        "the-ultimate-no",
        "?from=courses&returnTo=%2Fcourses%2Foverview&thread=thr-notification",
        1,
      );
      expect(path).toBe(
        "/learn/the-ultimate-no/lecture-1?from=courses&returnTo=%2Fcourses%2Foverview&thread=thr-notification",
      );

      const session = getCoursePlayerSession("the-ultimate-no");
      expect(session).not.toBeNull();
      expect(session?.path).toBe(
        "/learn/the-ultimate-no/lecture-1?from=courses&returnTo=%2Fcourses%2Foverview&thread=thr-notification",
      );
    });
  });

  describe("2. Mock Mode direct-thread deep link and error handling", () => {
    it("opens discussion thread panel when URL has matching mock thread ID (?thread=4)", async () => {
      render(
        <MemoryRouter
          initialEntries={["/learn/test-course/lecture-1?thread=4"]}
        >
          <Discussion persistenceKey="test-mock" />
        </MemoryRouter>,
      );

      // Thread panel header should be in document
      await waitFor(() => {
        expect(
          screen.getByRole("region", {
            name: /swipe between discussion threads/i,
          }),
        ).toBeInTheDocument();
      });
      // Should show the author of entry 4
      expect(screen.getAllByText("Rohit Sharma").length).toBeGreaterThanOrEqual(
        1,
      );
    });

    it("shows error notice and removes ?thread= with replace when thread is not found in mock mode", async () => {
      let currentLoc: any;
      render(
        <MemoryRouter
          initialEntries={[
            "/learn/test-course/lecture-1?from=courses&thread=non-existent-99999",
          ]}
        >
          <LocationProbe onLocation={(loc) => (currentLoc = loc)} />
          <Discussion persistenceKey="test-mock" />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(
          screen.getByText(
            "This discussion thread is unavailable or has been removed.",
          ),
        ).toBeInTheDocument();
      });

      // Panel should NOT be open
      expect(
        screen.queryByRole("region", {
          name: /swipe between discussion threads/i,
        }),
      ).not.toBeInTheDocument();

      // URL search should preserve from=courses and have removed thread
      await waitFor(() => {
        expect(currentLoc.search).toBe("?from=courses");
      });
    });
  });

  describe("3. Backend Mode direct-thread fetch states (loading, success, error)", () => {
    it("loading state: does NOT open feed entry 0 or show error notice while direct thread fetch is pending", async () => {
      // Mock threadDetails as loading
      mockInteractions.useThreadDetails.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      });

      render(
        <MemoryRouter
          initialEntries={["/learn/course-1/lecture-1?thread=thr-in-flight"]}
        >
          <Discussion
            persistenceKey="test-backend"
            courseId="course-1"
            lessonId="1"
          />
        </MemoryRouter>,
      );

      // Thread details query was triggered with thread ID
      expect(mockInteractions.useThreadDetails).toHaveBeenCalledWith(
        "thr-in-flight",
        { enabled: true },
      );

      // While loading, panel must NOT be open (should NOT fall back to feed entry 0)
      expect(
        screen.queryByRole("region", {
          name: /swipe between discussion threads/i,
        }),
      ).not.toBeInTheDocument();

      // Error notice must NOT be shown
      expect(
        screen.queryByText(
          "This discussion thread is unavailable or has been removed.",
        ),
      ).not.toBeInTheDocument();
    });

    it("success state: opens exact fetched direct thread even if it was not in the paginated lesson feed", async () => {
      const directThread: LearningThread = {
        id: "thr-external-99",
        academyId: "acad-1",
        courseId: "course-1",
        lessonId: "lesson-1",
        userId: "user-ext",
        author: {
          id: "user-ext",
          displayName: "External Author",
          username: "extauthor",
          role: "Student",
        },
        kind: "comment",
        content: "External direct link comment body",
        plainText: "External direct link comment body",
        visibility: "public",
        status: "active",
        isLocked: false,
        likesCount: 15,
        repliesCount: 0,
        createdAt: "2026-09-01T12:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
      };

      mockInteractions.useThreadDetails.mockReturnValue({
        data: directThread,
        isLoading: false,
        isError: false,
      });

      render(
        <MemoryRouter
          initialEntries={["/learn/course-1/lecture-1?thread=thr-external-99"]}
        >
          <Discussion
            persistenceKey="test-backend"
            courseId="course-1"
            lessonId="1"
          />
        </MemoryRouter>,
      );

      // Thread panel opens
      await waitFor(() => {
        expect(
          screen.getByRole("region", {
            name: /swipe between discussion threads/i,
          }),
        ).toBeInTheDocument();
      });

      // Shows external thread content
      expect(
        screen.getByText("External direct link comment body"),
      ).toBeInTheDocument();
    });

    it("error state: shows notice and clears only thread param with replace=true when direct thread fails to load", async () => {
      let currentLoc: any;
      mockInteractions.useThreadDetails.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      });

      render(
        <MemoryRouter
          initialEntries={[
            "/learn/course-1/lecture-1?from=courses&returnTo=%2Fcourses&thread=thr-404",
          ]}
        >
          <LocationProbe onLocation={(loc) => (currentLoc = loc)} />
          <Discussion
            persistenceKey="test-backend"
            courseId="course-1"
            lessonId="1"
          />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(
          screen.getByText(
            "This discussion thread is unavailable or has been removed.",
          ),
        ).toBeInTheDocument();
      });

      // Panel must stay closed
      expect(
        screen.queryByRole("region", {
          name: /swipe between discussion threads/i,
        }),
      ).not.toBeInTheDocument();

      // Only thread is removed, preserving from and returnTo
      await waitFor(() => {
        expect(currentLoc.search).toBe("?from=courses&returnTo=%2Fcourses");
      });
    });
  });

  describe("4. In-page URL sync (Opening, Closing, and Browser Navigation)", () => {
    it("keeps a locally selected pending thread open while its URL has no thread parameter", async () => {
      mockInteractions.useLessonThreads.mockReturnValue({
        data: {
          threads: [
            {
              id: "client-thread-pending",
              clientId: "client-thread-pending",
              creationStatus: "pending",
              academyId: "acad-1",
              courseId: "course-1",
              lessonId: "lesson-1",
              userId: "user-current",
              author: {
                id: "user-current",
                displayName: "Current User",
                username: "current",
                role: "Student",
              },
              kind: "comment",
              content: "Pending thread content",
              plainText: "Pending thread content",
              visibility: "public",
              status: "active",
              isLocked: false,
              likesCount: 0,
              repliesCount: 0,
              createdAt: "2026-09-15T12:00:00.000Z",
              updatedAt: "2026-09-15T12:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/learn/course-1/lecture-1"]}>
          <Discussion
            persistenceKey="test-pending-thread"
            courseId="course-1"
            lessonId="1"
          />
        </MemoryRouter>,
      );

      const pendingCard = screen
        .getByText("Pending thread content")
        .closest("article");
      expect(pendingCard).not.toBeNull();
      fireEvent.click(
        within(pendingCard!).getByRole("button", { name: "Reply" }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("region", {
            name: /swipe between discussion threads/i,
          }),
        ).toBeInTheDocument();
      });
    });

    it("updates URL with ?thread=<id> when clicking a discussion entry in feed", async () => {
      let currentLoc: any;
      render(
        <MemoryRouter
          initialEntries={["/learn/course-1/lecture-1?from=courses"]}
        >
          <LocationProbe onLocation={(loc) => (currentLoc = loc)} />
          <Discussion
            persistenceKey="test-backend"
            courseId="course-1"
            lessonId="1"
          />
        </MemoryRouter>,
      );

      // Click Reply on feed thread
      const replyButtons = screen.getAllByRole("button", { name: "Reply" });
      expect(replyButtons.length).toBeGreaterThan(0);

      fireEvent.click(replyButtons[0]!);

      await waitFor(() => {
        expect(currentLoc.search).toContain("thread=thr-feed-2");
      });
    });

    it("removes ?thread= when thread panel close button is clicked", async () => {
      let currentLoc: any;
      render(
        <MemoryRouter
          initialEntries={["/learn/course-1/lecture-1?thread=thr-feed-1"]}
        >
          <LocationProbe onLocation={(loc) => (currentLoc = loc)} />
          <Discussion
            persistenceKey="test-backend"
            courseId="course-1"
            lessonId="1"
          />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("region", {
            name: /swipe between discussion threads/i,
          }),
        ).toBeInTheDocument();
      });

      const closeButton = screen.getByRole("button", {
        name: /close discussion thread/i,
      });
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(currentLoc.search).not.toContain("thread=");
      });
    });
  });

  describe("5. Share action link generation", () => {
    it("copies canonical URL with ?thread=<rootId> and no hash for root threads", async () => {
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = new URL(
        "https://procodrr.local/learn/my-course/lecture-1?from=courses",
      ) as any;

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
        share: undefined,
      });

      await shareDiscussionEntry(
        "thr-root-123",
        "Alice",
        "Root thread body text",
      );

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      const copied = writeTextMock.mock.calls[0]![0];
      expect(copied).toContain("thread=thr-root-123");
      expect(copied).not.toContain("#discussion-entry");

      (window as any).location = originalLocation;
    });

    it("copies URL with ?thread=<parentId>#discussion-entry-<replyId> for replies", async () => {
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = new URL(
        "https://procodrr.local/learn/my-course/lecture-1?from=courses",
      ) as any;

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
        share: undefined,
      });

      await shareDiscussionEntry("reply-456", "Bob", "Reply text", {
        parentThreadId: "thr-root-123",
      });

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      const copied = writeTextMock.mock.calls[0]![0];
      expect(copied).toContain(
        "thread=thr-root-123#discussion-entry-reply-456",
      );

      (window as any).location = originalLocation;
    });

    it("preserves hash without thread param for notes", async () => {
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = new URL(
        "https://procodrr.local/learn/my-course/lecture-1?from=courses",
      ) as any;

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
        share: undefined,
      });

      await shareDiscussionEntry("note-789", "Alice", "My personal note", {
        isNote: true,
      });

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      const copied = writeTextMock.mock.calls[0]![0];
      expect(copied).not.toContain("thread=");
      expect(copied).toContain("#discussion-entry-note-789");

      (window as any).location = originalLocation;
    });
  });
});
