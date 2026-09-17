import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LearningRoute from "../../src/routes/learning";
import type { CourseOverviewResponse, LearningThread } from "@veolms/contracts";

const testCurrentUser = {
  id: "user-current",
  displayName: "Ashi Singh",
  avatarDataUrl: "/assets/sofia-avatar-160.webp",
  roles: ["Student"],
};

const mockCoursesState = vi.hoisted(() => {
  const overview = {
    course: {
      id: "course-uuid-1",
      title: "Test Course",
      slug: "my-course",
      description: "Test description",
      publishedAt: "2026-09-01T12:00:00.000Z",
    },
    sections: [
      {
        id: "sec-1",
        courseId: "course-uuid-1",
        title: "Section 1",
        position: 1,
        lessons: [
          {
            id: "lesson-uuid-1",
            courseId: "course-uuid-1",
            sectionId: "sec-1",
            title: "Lecture 1",
            position: 1,
            contentType: "video",
            isPublished: true,
            isPreview: true,
          },
          {
            id: "lesson-uuid-2",
            courseId: "course-uuid-1",
            sectionId: "sec-1",
            title: "Lecture 2",
            position: 2,
            contentType: "video",
            isPublished: true,
            isPreview: true,
          },
        ],
      },
    ],
    settings: {
      id: "set-1",
      courseId: "course-uuid-1",
      allowComments: true,
      allowNotes: true,
      allowQa: true,
      allowDownloads: true,
      certificateEnabled: false,
      showInstructorName: true,
      language: "en",
    },
  } as unknown as CourseOverviewResponse;
  return {
    defaultOverview: overview,
    overview: {
      data: overview as CourseOverviewResponse | undefined,
      isLoading: false,
      isError: false,
    },
  };
});

const mockInteractions = vi.hoisted(() => ({
  useLessonInteractionCounts: vi.fn((..._args: any[]) => ({ data: undefined })),
  useUserNotes: vi.fn((..._args: any[]) => ({ data: { notes: [] }, isLoading: false, isError: false })),
  useCreateNote: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateNote: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteNote: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useLessonThreads: vi.fn((..._args: any[]) => ({ data: { threads: [], total: 0 }, isLoading: false, isError: false })),
  useCreateLessonThread: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateThread: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteThread: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useToggleLike: vi.fn((..._args: any[]) => ({ mutate: vi.fn(), isPending: false })),
  useToggleBookmark: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useToggleFollow: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useThreadReplies: vi.fn((..._args: any[]) => ({ data: { replies: [] }, isLoading: false, isError: false })),
  useThreadDetails: vi.fn((..._args: any[]): any => ({ data: undefined, isLoading: false, isError: false })),
  useCreateReply: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateReply: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteReply: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useAcceptReply: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useLockThread: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
  useCreateReport: vi.fn((..._args: any[]) => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("../../src/services/auth", () => ({
  useCurrentUser: () => ({
    data: testCurrentUser,
  }),
}));

vi.mock("../../src/services/courses", () => ({
  useCourseOverview: () => mockCoursesState.overview,
  useCourses: () => ({ data: { courses: [] }, isLoading: false }),
}));

vi.mock("../../src/services/learning-space", () => ({
  useUpsertLearningSpaceSession: () => ({ mutate: vi.fn() }),
  useLearningProgress: () => ({ lessonProgress: {}, recordProgress: vi.fn() }),
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
  useCreateLessonThread: (...args: any[]) => mockInteractions.useCreateLessonThread(...args),
  useUpdateThread: (...args: any[]) => mockInteractions.useUpdateThread(...args),
  useDeleteThread: (...args: any[]) => mockInteractions.useDeleteThread(...args),
  useToggleLike: (...args: any[]) => mockInteractions.useToggleLike(...args),
  useToggleBookmark: () => mockInteractions.useToggleBookmark(),
  useToggleFollow: () => mockInteractions.useToggleFollow(),
  useThreadReplies: (...args: any[]) => mockInteractions.useThreadReplies(...args),
  useThreadDetails: (...args: any[]) => mockInteractions.useThreadDetails(...args),
  useCreateReply: (...args: any[]) => mockInteractions.useCreateReply(...args),
  useUpdateReply: (...args: any[]) => mockInteractions.useUpdateReply(...args),
  useDeleteReply: (...args: any[]) => mockInteractions.useDeleteReply(...args),
  useAcceptReply: (...args: any[]) => mockInteractions.useAcceptReply(...args),
  useLockThread: (...args: any[]) => mockInteractions.useLockThread(...args),
  useCreateReport: (...args: any[]) => mockInteractions.useCreateReport(...args),
}));

function LocationObserver({ onLocation }: { onLocation: (loc: ReturnType<typeof useLocation>) => void }) {
  const loc = useLocation();
  React.useEffect(() => {
    onLocation(loc);
  }, [loc, onLocation]);
  return null;
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

function renderLearningRoute(initialPath: string, onLocationChange?: (loc: ReturnType<typeof useLocation>) => void) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        {onLocationChange && <LocationObserver onLocation={onLocationChange} />}
        <Routes>
          <Route path="/learn/:courseSlug/:lectureSlug?" element={<LearningRoute />} />
          <Route path="/learn/:courseSlug" element={<LearningRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Learning Space Cold-Load and Refresh Deep Linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCoursesState.overview = {
      data: mockCoursesState.defaultOverview,
      isLoading: false,
      isError: false,
    };
    mockInteractions.useThreadDetails.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
  });

  it("1. cold load: /learn/course/lecture-2?from=courses&thread=<id> -> thread survives after route initialization", async () => {
    let currentLoc: any;
    renderLearningRoute(
      "/learn/my-course/lecture-2?from=courses&thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24",
      (loc) => (currentLoc = loc),
    );

    await waitFor(() => {
      expect(currentLoc).toBeDefined();
    });

    expect(currentLoc.pathname).toBe("/learn/my-course/lecture-2");
    expect(currentLoc.search).toContain("thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24");
    expect(currentLoc.search).toContain("from=courses");
  });

  it("2. cold load without lecture: /learn/course?thread=<id> -> canonical lesson URL still contains thread=<id>", async () => {
    let currentLoc: any;
    renderLearningRoute(
      "/learn/my-course?thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24",
      (loc) => (currentLoc = loc),
    );

    await waitFor(() => {
      expect(currentLoc.pathname).toBe("/learn/my-course/lecture-1");
    });

    expect(currentLoc.search).toContain("thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24");
    expect(currentLoc.search).toContain("from=courses");
  });

  it("3. refresh-equivalent initialization preserves thread while courseOverview is initially loading", async () => {
    let currentLoc: any;
    const queryClient = createTestQueryClient();
    mockCoursesState.overview = {
      data: undefined,
      isLoading: true,
      isError: false,
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/learn/my-course/lecture-2?from=courses&thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24"]}>
          <LocationObserver onLocation={(loc) => (currentLoc = loc)} />
          <Routes>
            <Route path="/learn/:courseSlug/:lectureSlug?" element={<LearningRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // While courseOverview is loading, thread must NOT be stripped
    expect(currentLoc.search).toContain("thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24");

    // Course overview finishes loading
    mockCoursesState.overview = {
      data: mockCoursesState.defaultOverview,
      isLoading: false,
      isError: false,
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[currentLoc.pathname + currentLoc.search]}>
          <LocationObserver onLocation={(loc) => (currentLoc = loc)} />
          <Routes>
            <Route path="/learn/:courseSlug/:lectureSlug?" element={<LearningRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(currentLoc.search).toContain("thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24");
    });
  });

  it("4. from + thread survive together", async () => {
    let currentLoc: any;
    renderLearningRoute(
      "/learn/my-course/lecture-2?from=home&thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24",
      (loc) => (currentLoc = loc),
    );

    await waitFor(() => {
      expect(currentLoc).toBeDefined();
    });

    expect(currentLoc.search).toContain("from=home");
    expect(currentLoc.search).toContain("thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24");
  });

  it("5. returnTo + thread survive together", async () => {
    let currentLoc: any;
    renderLearningRoute(
      "/learn/my-course/lecture-2?from=courses&returnTo=%2Fcourses%2Fmy-course%2Foverview&thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24",
      (loc) => (currentLoc = loc),
    );

    await waitFor(() => {
      expect(currentLoc).toBeDefined();
    });

    expect(currentLoc.search).toContain("from=courses");
    expect(currentLoc.search).toContain("returnTo=%2Fcourses%2Fmy-course%2Foverview");
    expect(currentLoc.search).toContain("thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24");
  });

  it("6. unknown query params remain excluded during canonicalization", async () => {
    let currentLoc: any;
    renderLearningRoute(
      "/learn/my-course?from=courses&returnTo=%2Fcourses%2Fmy-course%2Foverview&thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24&unknown_tracking_id=12345&debug=true",
      (loc) => (currentLoc = loc),
    );

    await waitFor(() => {
      expect(currentLoc.pathname).toBe("/learn/my-course/lecture-1");
    });

    expect(currentLoc.search).toContain("thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24");
    expect(currentLoc.search).toContain("from=courses");
    expect(currentLoc.search).toContain("returnTo=%2Fcourses%2Fmy-course%2Foverview");

    expect(currentLoc.search).not.toContain("unknown_tracking_id");
    expect(currentLoc.search).not.toContain("debug");
  });

  it("7. Discussion receives the surviving thread ID and opens the exact fetched thread", async () => {
    const directThread: LearningThread = {
      id: "0156b3dc-5232-4d8f-ab3a-cdb96ce77a24",
      academyId: "acad-1",
      courseId: "course-uuid-1",
      lessonId: "lesson-uuid-2",
      userId: "user-ext",
      author: {
        id: "user-ext",
        displayName: "Sonia Patel",
        username: "soniap",
        role: "Student",
      },
      kind: "comment",
      content: "Cold-loaded direct link comment text",
      plainText: "Cold-loaded direct link comment text",
      visibility: "public",
      status: "active",
      isLocked: false,
      likesCount: 5,
      repliesCount: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };

    mockInteractions.useThreadDetails.mockReturnValue({
      data: directThread,
      isLoading: false,
      isError: false,
    });

    let currentLoc: any;
    renderLearningRoute(
      "/learn/my-course/lecture-2?from=courses&thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24",
      (loc) => (currentLoc = loc),
    );

    await waitFor(() => {
      expect(screen.getByRole("region", { name: /swipe between discussion threads/i })).toBeInTheDocument();
    });

    expect(screen.getByText("Cold-loaded direct link comment text")).toBeInTheDocument();
    expect(currentLoc.search).toContain("thread=0156b3dc-5232-4d8f-ab3a-cdb96ce77a24");
  });
});
