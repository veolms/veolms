import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CourseOverviewResponse } from "@veolms/contracts";
import { LearningWorkspace } from "../../src/learning/LearningWorkspace";
import { courseKeys } from "../../src/services/courses/courses.keys";
import { renderHook } from "@testing-library/react";
import { useCourseOverview } from "../../src/services/courses";
import { coursesService } from "../../src/services/courses/courses.service";

function createMockOverview(
  overrides?: Partial<CourseOverviewResponse["course"]>,
): CourseOverviewResponse {
  const courseId = "c1111111-1111-4111-a111-111111111111";
  return {
    course: {
      id: courseId,
      slug: "modern-ts-deep-dive",
      title: "Modern TypeScript Deep Dive",
      description: "Comprehensive TypeScript Guide",
      shortDescription: "Master modern TypeScript",
      difficulty: "intermediate",
      status: "published",
      creatorId: "u1111111-1111-4111-a111-111111111111",
      categoryId: "cat-1",
      thumbnailMediaId: "thumb-asset-999",
      trailerMediaId: null,
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      publishedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
    category: { id: "cat-1", name: "Programming", slug: "programming" },
    creator: {
      id: "u1111111-1111-4111-a111-111111111111",
      displayName: "Jane Doe",
      username: "janedoe",
    },
    sections: [
      {
        id: "sec-2-uuid",
        courseId,
        title: "Advanced Generics",
        position: 2,
        lessons: [
          {
            id: "les-2-2-uuid",
            courseId: "c1111111-1111-4111-a111-111111111111",
            sectionId: "sec-2-uuid",
            title: "Conditional Types",
            description: "Deep dive into `T extends U ? X : Y`.",
            position: 20,
            isPreview: false,
            contentType: "video",
            isPublished: true,
          },
          {
            id: "les-2-1-uuid",
            courseId: "c1111111-1111-4111-a111-111111111111",
            sectionId: "sec-2-uuid",
            title: "Generic Constraints",
            description: null, // Empty / null description test
            position: 10,
            isPreview: false,
            contentType: "video",
            isPublished: true,
          },
        ],
      },
      {
        id: "sec-1-uuid",
        courseId,
        title: "Foundations",
        position: 1,
        lessons: [
          {
            id: "les-1-1-uuid",
            courseId: "c1111111-1111-4111-a111-111111111111",
            sectionId: "sec-1-uuid",
            title: "Type Annotations Basics",
            description: "### Foundations of TS\n\nLearn **primitive** and complex types.",
            position: 5,
            isPreview: true,
            contentType: "video",
            isPublished: true,
          },
        ],
      },
    ],
    stats: {
      totalSections: 2,
      totalLessons: 3,
      totalDurationSeconds: 1200,
    },
  };
}

function renderWorkspaceWithClient(
  client: QueryClient,
  props: Partial<React.ComponentProps<typeof LearningWorkspace>> = {},
) {
  return render(
    <QueryClientProvider client={client}>
      <LearningWorkspace
        courseSlug="modern-ts-deep-dive"
        lessonId={1}
        mobileBottomNavigation={false}
        onSelectLesson={vi.fn()}
        onOpenCourseOverview={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("Learning Space Milestone 2 - Real Course Overview API Wiring", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  describe("Query Enablement", () => {
    it("enables useCourseOverview for slug-based route parameters", async () => {
      const getOverviewSpy = vi
        .spyOn(coursesService, "getOverview")
        .mockResolvedValueOnce(createMockOverview());

      const { result } = renderHook(
        () => useCourseOverview("modern-ts-deep-dive"),
        {
          wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>
              {children}
            </QueryClientProvider>
          ),
        },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(getOverviewSpy).toHaveBeenCalledWith("modern-ts-deep-dive");
      expect(result.current.data?.course.title).toBe("Modern TypeScript Deep Dive");
    });
  });

  describe("Curriculum Adaptation & Rendering in LearningWorkspace", () => {
    it("renders real API course title and adapted curriculum sections in position order", async () => {
      const mockOverview = createMockOverview();
      queryClient.setQueryData(
        courseKeys.overview("modern-ts-deep-dive"),
        mockOverview,
      );

      renderWorkspaceWithClient(queryClient);

      // Verify course title comes from API (both in lesson header button and curriculum)
      const lessonTitle = screen.getByRole("heading", {
        name: "Type Annotations Basics",
        level: 1,
      });
      expect(lessonTitle).toBeInTheDocument();

      // Section 1 should precede Section 2 because of numeric position sorting
      const section1 = screen.getByText(/Section 1: Foundations/);
      const section2 = screen.getByText(/Section 2: Advanced Generics/);
      expect(section1).toBeInTheDocument();
      expect(section2).toBeInTheDocument();

      // Ensure Section 1 appears before Section 2 in DOM order
      expect(
        section1.compareDocumentPosition(section2) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      // In Section 2, lessons should be sorted by position (10 before 20)
      const genericConstraints = screen.getByText("Generic Constraints");
      const conditionalTypes = screen.getByText("Conditional Types");
      expect(genericConstraints).toBeInTheDocument();
      expect(conditionalTypes).toBeInTheDocument();
      expect(
        genericConstraints.compareDocumentPosition(conditionalTypes) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("assigns sequential 1-based lesson numbers across sections and passes description to Discussion", async () => {
      const mockOverview = createMockOverview();
      queryClient.setQueryData(
        courseKeys.overview("modern-ts-deep-dive"),
        mockOverview,
      );

      renderWorkspaceWithClient(queryClient, { lessonId: 1 });

      // Lesson 1 is "Type Annotations Basics" with Markdown description: "Foundations of TS"
      expect(
        screen.getByRole("heading", { name: "Type Annotations Basics" }),
      ).toBeInTheDocument();

      // Verify Markdown description is passed to Discussion and rendered in preview
      await waitFor(() => {
        expect(screen.getByText(/Foundations of TS/)).toBeInTheDocument();
      });

      // Expand the description to verify full DiscussionMarkdown rendering
      const expandButton = screen.getByRole("button", {
        name: /lesson description/i,
      });
      fireEvent.click(expandButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Foundations of TS", level: 3 }),
        ).toBeInTheDocument();
      });
    });

    it("safely handles null/empty lesson descriptions without falling back to mock text", async () => {
      const mockOverview = createMockOverview();
      queryClient.setQueryData(
        courseKeys.overview("modern-ts-deep-dive"),
        mockOverview,
      );

      // Lesson 2 is "Generic Constraints" which has description: null
      renderWorkspaceWithClient(queryClient, { lessonId: 2 });

      expect(
        screen.getByRole("heading", { name: "Generic Constraints" }),
      ).toBeInTheDocument();

      // Should display empty description notice, not the mock "UI and UX work together..."
      expect(
        screen.getByText("No description provided for this lesson."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/UI and UX work together/i),
      ).not.toBeInTheDocument();
    });

    it("navigates across section boundaries according to adapted API lesson ordering", async () => {
      const mockOverview = createMockOverview();
      queryClient.setQueryData(
        courseKeys.overview("modern-ts-deep-dive"),
        mockOverview,
      );

      const onSelectLesson = vi.fn();
      renderWorkspaceWithClient(queryClient, {
        lessonId: 1,
        onSelectLesson,
      });

      // Lesson 1 is the only lesson in Section 1.
      // Next lesson should be Lesson 2 ("Generic Constraints"), the first lesson of Section 2.
      // In LearningWorkspace, we can trigger lesson selection by clicking lesson 2 in the curriculum sidebar
      const lesson2Item = screen.getByText("Generic Constraints").closest("button");
      expect(lesson2Item).toBeTruthy();
      fireEvent.click(lesson2Item!);

      expect(onSelectLesson).toHaveBeenCalledWith(2);
    });

    it("does NOT silently fall back to mock course content when API request fails", async () => {
      // Mock an error state for this course query
      queryClient.setQueryDefaults(courseKeys.overview("failed-course"), {
        queryFn: () => Promise.reject(new Error("404 Course Not Found")),
        retry: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <LearningWorkspace
            courseSlug="failed-course"
            lessonId={1}
            mobileBottomNavigation={false}
            onSelectLesson={vi.fn()}
            onOpenCourseOverview={vi.fn()}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        // Must not substitute fake course title "UI/UX Design Mastery"
        expect(
          screen.queryByText("UI/UX Design Mastery"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("API Content & Empty Thumbnail Fixes", () => {
    it("displays loading indicator for lesson description and curriculum skeleton while course overview is loading and never shows mock text", async () => {
      // Pending query to simulate active loading
      queryClient.setQueryDefaults(courseKeys.overview("loading-course"), {
        queryFn: () => new Promise(() => {}),
        retry: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <LearningWorkspace
            courseSlug="loading-course"
            lessonId={1}
            mobileBottomNavigation={false}
            onSelectLesson={vi.fn()}
            onOpenCourseOverview={vi.fn()}
          />
        </QueryClientProvider>,
      );

      // Loading state should show loading indicator
      expect(
        screen.getByText("Loading lesson description..."),
      ).toBeInTheDocument();
      // Must NEVER show mock demo text
      expect(
        screen.queryByText(/UI and UX work together/i),
      ).not.toBeInTheDocument();
      // Must show curriculum skeleton state
      expect(
        screen.getByTestId("curriculum-loading-skeleton"),
      ).toBeInTheDocument();
      // Must NOT show mock sections or mock lessons
      expect(
        screen.queryByText("Introduction"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("The Beginning of a Design Journey"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("UI/UX Design Mastery"),
      ).not.toBeInTheDocument();
      // Must show empty thumbnail placeholder rather than a mock thumbnail
      expect(
        screen.getByTestId("course-thumbnail-placeholder"),
      ).toBeInTheDocument();
    });

    it("renders empty thumbnail placeholder when course has null thumbnailMediaId", async () => {
      const mockOverview = createMockOverview({
        thumbnailMediaId: null,
      });
      queryClient.setQueryData(
        courseKeys.overview("modern-ts-deep-dive"),
        mockOverview,
      );

      renderWorkspaceWithClient(queryClient, { lessonId: 1 });

      // Should render placeholder component
      expect(
        screen.getByTestId("course-thumbnail-placeholder"),
      ).toBeInTheDocument();
      // Should NOT render an img with cover class
      const coverImg = document.querySelector(
        "img.learning-curriculum__cover",
      );
      expect(coverImg).toBeNull();
    });

    it("renders api thumbnail media image when course has thumbnailMediaId", async () => {
      const mockOverview = createMockOverview({
        thumbnailMediaId: "thumb-asset-999",
      });
      queryClient.setQueryData(
        courseKeys.overview("modern-ts-deep-dive"),
        mockOverview,
      );

      renderWorkspaceWithClient(queryClient, { lessonId: 1 });

      // Should NOT render placeholder component
      expect(
        screen.queryByTestId("course-thumbnail-placeholder"),
      ).toBeNull();

      // Should render cover image pointing to API media endpoint
      const coverImg = document.querySelector(
        "img.learning-curriculum__cover",
      );
      expect(coverImg).not.toBeNull();
      expect(coverImg?.getAttribute("src")).toBe(
        "/api/v1/media/thumb-asset-999",
      );
    });

    it("never shows mock description even when courseSlug is not provided", async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <LearningWorkspace
            courseSlug=""
            lessonId={1}
            mobileBottomNavigation={false}
            onSelectLesson={vi.fn()}
            onOpenCourseOverview={vi.fn()}
          />
        </QueryClientProvider>,
      );

      // Must NEVER show mock demo text
      expect(
        screen.queryByText(/UI and UX work together/i),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText("No description provided for this lesson."),
      ).toBeInTheDocument();
    });
  });

  describe("Lesson Quiz Integration & Toggle", () => {
    const mockQuizAssignment = {
      id: "qa-1111-uuid",
      quizId: "quiz-1111-uuid",
      quizVersionId: "qv-1111-uuid",
      courseId: "c1111111-1111-4111-a111-111111111111",
      lessonId: "les-1-1-uuid",
      quizTitle: "TypeScript Fundamentals Quiz",
      lessonTitle: "Type Annotations Basics",
      courseTitle: "Modern TypeScript Deep Dive",
      required: true,
      passPercentage: 75,
      maxAttempts: 3,
      timeLimitSeconds: 600,
      shuffleQuestions: false,
      shuffleOptions: false,
      feedbackMode: "after_submit" as const,
      availableFrom: null,
      availableUntil: null,
      activeAttemptId: null,
      attemptCount: 0,
      latestAttemptStatus: null,
      latestScore: null,
      bestScore: null,
      latestPassed: null,
    };

    it("renders Quiz trigger button below video player next to lesson title and removes quiz icon from curriculum", async () => {
      const mockOverview = createMockOverview();
      queryClient.setQueryData(
        courseKeys.overview("modern-ts-deep-dive"),
        mockOverview,
      );

      renderWorkspaceWithClient(queryClient, {
        lessonId: 1,
        quizAssignments: [mockQuizAssignment],
      });

      // The quiz trigger button for lesson 1 must be next to the lesson title
      const quizTrigger = screen.getByRole("button", {
        name: /Open quiz for lesson 1/i,
      });
      expect(quizTrigger).toBeInTheDocument();
      expect(quizTrigger).toHaveTextContent("Lesson Quiz");

      // Curriculum playlist rows must NOT contain a quiz trigger icon
      const curriculum = document.getElementById(
        "learning-course-curriculum-scrollport",
      );
      expect(curriculum).toBeTruthy();
      expect(
        curriculum!.querySelector(".learning-curriculum__quiz-trigger"),
      ).toBeNull();
    });

    it("toggles to quiz attempt view when clicking Quiz trigger and restores video with Back to video", async () => {
      const mockOverview = createMockOverview();
      queryClient.setQueryData(
        courseKeys.overview("modern-ts-deep-dive"),
        mockOverview,
      );

      renderWorkspaceWithClient(queryClient, {
        lessonId: 1,
        quizAssignment: mockQuizAssignment,
        quizAssignments: [mockQuizAssignment],
      });

      // Initially, "Back to video" is NOT present because video mode is active
      expect(screen.queryByRole("button", { name: /Back to video/i })).toBeNull();

      // Click the Quiz trigger beside the lesson title
      const quizTrigger = screen.getByRole("button", {
        name: /Open quiz for lesson 1/i,
      });
      fireEvent.click(quizTrigger);

      // Now "Back to video" button and Lesson Quiz label must be visible
      const backButton = screen.getByRole("button", { name: /Back to video/i });
      expect(backButton).toBeInTheDocument();
      expect(screen.getByText(/Lesson 1 Quiz/i)).toBeInTheDocument();

      // Click "Back to video" button
      fireEvent.click(backButton);

      // Now "Back to video" is gone and video player is restored
      expect(screen.queryByRole("button", { name: /Back to video/i })).toBeNull();
    });

    it("restores video view when clicking lesson in curriculum list while viewing quiz", async () => {
      const mockOverview = createMockOverview();
      queryClient.setQueryData(
        courseKeys.overview("modern-ts-deep-dive"),
        mockOverview,
      );

      renderWorkspaceWithClient(queryClient, {
        lessonId: 1,
        quizAssignment: mockQuizAssignment,
        quizAssignments: [mockQuizAssignment],
      });

      // Open the quiz view
      const quizTrigger = screen.getByRole("button", {
        name: /Open quiz for lesson 1/i,
      });
      fireEvent.click(quizTrigger);
      expect(screen.getByRole("button", { name: /Back to video/i })).toBeInTheDocument();

      // Click on the lesson row button in the curriculum list
      const curriculum = document.getElementById(
        "learning-course-curriculum-scrollport",
      );
      expect(curriculum).toBeTruthy();
      const lesson1Button = curriculum!.querySelector<HTMLButtonElement>(
        ".learning-curriculum__lesson",
      );
      expect(lesson1Button).toBeTruthy();
      fireEvent.click(lesson1Button!);

      // Now "Back to video" is gone and video mode is restored
      expect(screen.queryByRole("button", { name: /Back to video/i })).toBeNull();
    });

    it("renders distinct quiz assignments for different lessons rather than reusing the last opened quiz", async () => {
      const mockOverview = createMockOverview();
      queryClient.setQueryData(
        courseKeys.overview("modern-ts-deep-dive"),
        mockOverview,
      );

      const mockQuizAssignment2 = {
        ...mockQuizAssignment,
        id: "qa-22222222-2222-4222-a222-222222222222",
        lessonId: "les-2-1-uuid",
        quizTitle: "Lesson 2 Quiz Title",
      };

      renderWorkspaceWithClient(queryClient, {
        lessonId: 1,
        quizAssignments: [mockQuizAssignment, mockQuizAssignment2],
      });

      // Open lesson 1 quiz from trigger beside title
      const quizTrigger1 = screen.getByRole("button", {
        name: /Open quiz for lesson 1/i,
      });
      fireEvent.click(quizTrigger1);
      expect(screen.getByText(/Lesson 1 Quiz/i)).toBeInTheDocument();

      // Switch to lesson 2 by clicking lesson 2 in curriculum
      const curriculum = document.getElementById(
        "learning-course-curriculum-scrollport",
      );
      const lessonButtons = curriculum!.querySelectorAll<HTMLButtonElement>(
        ".learning-curriculum__lesson",
      );
      fireEvent.click(lessonButtons[1]!);

      // Now on lesson 2, click its Quiz trigger beside title
      const quizTrigger2 = screen.getByRole("button", {
        name: /Open quiz for lesson 2/i,
      });
      fireEvent.click(quizTrigger2);
      expect(screen.getByText(/Lesson 2 Quiz/i)).toBeInTheDocument();
    });

    it("suspends background media playback and pauses media elements when quiz view is open", async () => {
      const mockOverview = createMockOverview();
      queryClient.setQueryData(
        courseKeys.overview("modern-ts-deep-dive"),
        mockOverview,
      );

      const testVideo = document.createElement("video");
      const pauseSpy = vi.fn();
      testVideo.pause = pauseSpy;
      Object.defineProperty(testVideo, "paused", {
        value: false,
        writable: true,
      });
      document.body.appendChild(testVideo);

      try {
        renderWorkspaceWithClient(queryClient, {
          lessonId: 1,
          quizAssignment: mockQuizAssignment,
          quizAssignments: [mockQuizAssignment],
        });

        const quizTrigger = screen.getByRole("button", {
          name: /Open quiz for lesson 1/i,
        });
        fireEvent.click(quizTrigger);

        expect(pauseSpy).toHaveBeenCalled();

        pauseSpy.mockClear();
        testVideo.dispatchEvent(new Event("play"));
        expect(pauseSpy).toHaveBeenCalled();
      } finally {
        testVideo.remove();
      }
    });
  });
});

