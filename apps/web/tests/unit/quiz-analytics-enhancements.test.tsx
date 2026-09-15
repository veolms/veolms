import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuizAnalyticsPage } from "../../src/quizzes/QuizAnalyticsPage";

// Mock courses
const mockCourses = [
  { id: "c-1", title: "Course 1", slug: "c-1", updatedAt: "2026-09-15T00:00:00Z" },
  { id: "c-2", title: "Course 2", slug: "c-2", updatedAt: "2026-09-14T00:00:00Z" },
  { id: "c-3", title: "Course 3", slug: "c-3", updatedAt: "2026-09-13T00:00:00Z" },
  { id: "c-4", title: "Course 4", slug: "c-4", updatedAt: "2026-09-12T00:00:00Z" },
  { id: "c-5", title: "Course 5", slug: "c-5", updatedAt: "2026-09-11T00:00:00Z" },
  { id: "c-6", title: "Course 6", slug: "c-6", updatedAt: "2026-09-10T00:00:00Z" },
  { id: "c-7", title: "Course 7", slug: "c-7", updatedAt: "2026-09-09T00:00:00Z" },
];

// Generate 35 mock quizzes to test limit 20
const mockQuizzes = Array.from({ length: 35 }, (_, i) => ({
  id: `quiz-${i + 1}`,
  title: `Assessment Quiz ${i + 1}`,
  description: `Description ${i + 1}`,
  status: "published" as const,
  updatedAt: new Date(Date.now() - i * 10000).toISOString(),
  versions: [
    {
      id: `v-${i + 1}`,
      versionNumber: 1,
      publishedAt: new Date().toISOString(),
      questions: [{ id: `q-${i + 1}` }],
    },
  ],
}));

const mockStudents = Array.from({ length: 30 }, (_, i) => ({
  studentId: `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  studentName: `Learner ${i + 1}`,
  attemptCount: 1,
  latestScore: 85,
  bestScore: 90,
  status: "passed" as const,
  lastAttempt: "2026-09-15T00:00:00Z",
}));

vi.mock("../../src/services/courses", () => ({
  useMyCourses: () => ({
    data: { courses: mockCourses },
    isLoading: false,
  }),
}));

vi.mock("../../src/services/quizzes", () => ({
  useMyQuizzes: () => ({
    data: mockQuizzes,
    isLoading: false,
  }),
  useCourseQuizAnalytics: (courseId: string | null) => ({
    data: {
      totalQuizzes: 5,
      requiredQuizzes: 2,
      students: 30,
      averageQuizScore: 78,
      quizCompletionRate: 85,
      passRate: 90,
      quizzes: [
        {
          assignmentId: "asg-1",
          quizId: "quiz-1",
          quizTitle: "Assessment Quiz 1",
          averageScore: 85,
          completionRate: 90,
          passRate: 95,
        },
      ],
    },
    isLoading: false,
  }),
  useCourseQuizAssignments: (courseId: string | null) => ({
    data: [
      {
        id: "asg-1",
        courseId: "c-1",
        lessonId: "l-1",
        quizId: "quiz-1",
        quizTitle: "Assessment Quiz 1",
      },
    ],
    isLoading: false,
  }),
  useQuizAnalytics: (assignmentId: string | null) => ({
    data: {
      assignedStudents: 30,
      attempted: 25,
      passed: 22,
      failed: 3,
      notAttempted: 5,
      averageScore: 80,
      highestScore: 100,
      lowestScore: 40,
      students: mockStudents,
    },
    isLoading: false,
  }),
  useStudentQuizReport: () => ({
    data: null,
    isLoading: false,
  }),
  useMyQuizAssignments: () => ({
    data: { assignments: [] },
    isLoading: false,
  }),
  useQuizHistory: () => ({
    data: [],
    isLoading: false,
  }),
}));

describe("Quiz Command Centre Enhancements", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it("switches to analytics tab when 'Review analytics' quick action is clicked", () => {
    const onNavigatePage = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizAnalyticsPage role="creator" onNavigatePage={onNavigatePage} />
      </QueryClientProvider>,
    );

    // Click "Review analytics" quick action
    const reviewBtn = screen.getByRole("button", { name: /Review analytics/i });
    fireEvent.click(reviewBtn);

    // Performance overview header appears
    expect(screen.getByText("Performance overview")).toBeInTheDocument();
    expect(screen.getByText("Instructor reporting")).toBeInTheDocument();
  });

  it("navigates to learner quiz attempt flow when 'Preview learner view' is clicked", () => {
    const onNavigatePage = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizAnalyticsPage role="creator" onNavigatePage={onNavigatePage} />
      </QueryClientProvider>,
    );

    // Click "Preview learner view" quick action
    const previewBtn = screen.getByRole("button", {
      name: /Preview learner view/i,
    });
    fireEvent.click(previewBtn);

    expect(onNavigatePage).toHaveBeenCalledWith(
      expect.stringContaining("/learn/c-1?lessonId=l-1&view=quiz"),
    );
  });

  it("switches to quiz library when 'View library' button is clicked", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QuizAnalyticsPage role="creator" onNavigatePage={vi.fn()} />
      </QueryClientProvider>,
    );

    const viewLibraryBtn = screen.getByRole("button", { name: "View library" });
    fireEvent.click(viewLibraryBtn);

    expect(screen.getByText("All quizzes")).toBeInTheDocument();
    expect(screen.getByText("Content library")).toBeInTheDocument();
  });

  it("shows search and limits course lens options to the top 5 courses by default", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QuizAnalyticsPage role="creator" onNavigatePage={vi.fn()} />
      </QueryClientProvider>,
    );

    const courseLensTrigger = screen.getByRole("button", {
      name: /Choose a course for the overview/i,
    });
    fireEvent.click(courseLensTrigger);

    // Search input exists at top
    expect(screen.getByPlaceholderText("Search courses...")).toBeInTheDocument();

    // Default limit shows header ("All courses") + top 5 courses = 6 options
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(6);
    expect(screen.getByRole("option", { name: "Course 1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Course 2" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Course 3" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Course 4" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Course 5" })).toBeInTheDocument();
    // Course 6 and 7 outside the top 5 are hidden initially
    expect(screen.queryByRole("option", { name: "Course 6" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Course 7" })).not.toBeInTheDocument();

    // Searching reveals Course 7
    const searchInput = screen.getByPlaceholderText("Search courses...");
    fireEvent.change(searchInput, { target: { value: "Course 7" } });
    expect(screen.getByRole("option", { name: "Course 7" })).toBeInTheDocument();
  });

  it("applies limit 20 to Recent assessments list", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QuizAnalyticsPage role="creator" onNavigatePage={vi.fn()} />
      </QueryClientProvider>,
    );

    // 35 mock quizzes exist, but only 20 are displayed initially in the list
    expect(screen.getByText("Assessment Quiz 1")).toBeInTheDocument();
    expect(screen.getByText("Assessment Quiz 20")).toBeInTheDocument();
    expect(screen.queryByText("Assessment Quiz 21")).not.toBeInTheDocument();
  });

  it("applies limit 20 to Student outcomes list in Analytics view", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QuizAnalyticsPage role="creator" onNavigatePage={vi.fn()} />
      </QueryClientProvider>,
    );

    // Switch to analytics
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));

    // 30 mock students exist, only 20 rendered initially
    expect(screen.getByText("Learner 1")).toBeInTheDocument();
    expect(screen.getByText("Learner 20")).toBeInTheDocument();
    expect(screen.queryByText("Learner 21")).not.toBeInTheDocument();
  });
});
