import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InfiniteData } from "@tanstack/react-query";
import type { StudentListResponse } from "@veolms/contracts";
import { StudentDetailsPage } from "../../src/students/StudentDetailsPage";
import { StudentsPage } from "../../src/students/StudentsPage";

const mockStudentsListResponse: InfiniteData<StudentListResponse> = {
  pageParams: [undefined],
  pages: [
    {
      students: [
        {
          id: "33333333-3333-4000-8000-000000000001",
          username: "alex_chen",
          displayName: "Alex Chen",
          email: "alex@example.com",
          avatarUrl: null,
          bio: "Passionate full-stack developer learning TypeScript & Node.js.",
          joinedAt: "2026-01-15T10:00:00.000Z",
          enrolledCoursesCount: 2,
          completedCoursesCount: 1,
          averageProgressPercent: 75,
          lastActiveAt: "2026-09-10T12:00:00.000Z",
          enrolledCoursesPreview: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              title: "Complete Backend Development with Node.js",
              slug: "complete-backend-development-with-nodejs",
              progressPercent: 100,
            },
            {
              id: "00000000-0000-4000-8000-000000000002",
              title: "The Ultimate TypeScript Course",
              slug: "ultimate-typescript-course",
              progressPercent: 50,
            },
          ],
        },
        {
          id: "33333333-3333-4000-8000-000000000002",
          username: "sarah_miller",
          displayName: "Sarah Miller",
          email: "sarah@example.com",
          avatarUrl: null,
          bio: "UI Designer learning backend architectures.",
          joinedAt: "2026-02-20T10:00:00.000Z",
          enrolledCoursesCount: 1,
          completedCoursesCount: 0,
          averageProgressPercent: 30,
          lastActiveAt: "2026-09-08T15:30:00.000Z",
          enrolledCoursesPreview: [
            {
              id: "00000000-0000-4000-8000-000000000002",
              title: "The Ultimate TypeScript Course",
              slug: "ultimate-typescript-course",
              progressPercent: 30,
            },
          ],
        },
      ],
      nextCursor: "2026-02-20T10:00:00.000Z",
      totalCount: 2,
    },
  ],
};

const mockStudentDetailResponse = {
  student: {
    id: "33333333-3333-4000-8000-000000000001",
    username: "alex_chen",
    displayName: "Alex Chen",
    email: "alex@example.com",
    phoneNo: "+1234567890",
    avatarUrl: null,
    bio: "Passionate full-stack developer learning TypeScript & Node.js.",
    joinedAt: "2026-01-15T10:00:00.000Z",
    socials: {
      githubUrl: "https://github.com/alexchen",
      linkedinUrl: "https://linkedin.com/in/alexchen",
      websiteUrl: "https://alexchen.dev",
    },
  },
  metrics: {
    enrolledCoursesCount: 2,
    completedCoursesCount: 1,
    inProgressCoursesCount: 1,
    averageProgressPercent: 75,
    totalLessonsCompleted: 15,
    lastActiveAt: "2026-09-10T12:00:00.000Z",
  },
  courses: [
    {
      courseId: "00000000-0000-4000-8000-000000000001",
      courseTitle: "Complete Backend Development with Node.js",
      courseSlug: "complete-backend-development-with-nodejs",
      courseDescription: "Learn backend development with Node.js.",
      courseThumbnailUrl: null,
      difficulty: "intermediate",
      enrolledAt: "2026-01-15T10:00:00.000Z",
      enrollmentStatus: "active",
      enrollmentSource: "direct_purchase",
      accessExpiresAt: null,
      progressPercent: 100,
      completedLessonsCount: 10,
      totalLessonsCount: 10,
      lastAccessedAt: "2026-09-10T12:00:00.000Z",
    },
    {
      courseId: "00000000-0000-4000-8000-000000000002",
      courseTitle: "The Ultimate TypeScript Course",
      courseSlug: "ultimate-typescript-course",
      courseDescription: "Master TypeScript from fundamentals to advanced.",
      courseThumbnailUrl: null,
      difficulty: "beginner",
      enrolledAt: "2026-02-01T10:00:00.000Z",
      enrollmentStatus: "active",
      enrollmentSource: "free_grant",
      accessExpiresAt: null,
      progressPercent: 50,
      completedLessonsCount: 5,
      totalLessonsCount: 10,
      lastAccessedAt: "2026-09-08T10:00:00.000Z",
    },
  ],
};

let mockUseStudentsState = {
  data: mockStudentsListResponse,
  isLoading: false,
  isError: false,
  hasNextPage: true,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
};

let mockUseStudentState = {
  data: mockStudentDetailResponse,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

const useStudentsMock = vi.fn((_filter?: unknown) => mockUseStudentsState);

vi.mock("../../src/services/students", () => ({
  useStudents: (filter?: unknown) => useStudentsMock(filter),
  useStudent: () => mockUseStudentState,
  studentsService: {
    listStudents: vi.fn(),
    getStudentByUsername: vi.fn(),
  },
}));

vi.mock("../../src/services/courses", () => ({
  useCourses: () => ({
    data: {
      courses: [
        { id: "00000000-0000-4000-8000-000000000001", title: "Node.js Course" },
        { id: "00000000-0000-4000-8000-000000000002", title: "TypeScript Course" },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock("../../src/ThemedSelect.tsx", () => ({
  ThemedSelect: ({
    ariaLabel,
    value,
    onValueChange,
    options,
  }: {
    ariaLabel: string;
    value: string;
    onValueChange: (val: string) => void;
    options: readonly [string, string][];
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      data-testid={ariaLabel}
    >
      {options.map(([optVal, optLabel]) => (
        <option key={optVal} value={optVal}>
          {optLabel}
        </option>
      ))}
    </select>
  ),
}));

describe("StudentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStudentsState = {
      data: mockStudentsListResponse,
      isLoading: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
  });

  it("renders the Students heading, subtitle, and metrics banner", () => {
    render(<StudentsPage />);

    expect(screen.getByRole("heading", { name: "Students" })).toBeInTheDocument();
    expect(
      screen.getByText("Review learners, access, and progress across your academy."),
    ).toBeInTheDocument();
    expect(screen.getByText("Total Learners")).toBeInTheDocument();
    expect(screen.getAllByText("Active Learners").length).toBeGreaterThanOrEqual(1);
  });

  it("renders student rows with learner details, progress, and action button", () => {
    const onNavigatePage = vi.fn();
    render(<StudentsPage onNavigatePage={onNavigatePage} />);

    expect(screen.getAllByText("Alex Chen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("@alex_chen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Sarah Miller").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("@sarah_miller").length).toBeGreaterThanOrEqual(1);

    const viewButtons = screen.getAllByRole("button", { name: /View Profile/i });
    expect(viewButtons.length).toBeGreaterThan(0);

    fireEvent.click(viewButtons[0]!);
    expect(onNavigatePage).toHaveBeenCalledWith("/students/alex_chen");
  });

  it("navigates to student details when clicking anywhere on a student row", () => {
    const onNavigatePage = vi.fn();
    render(<StudentsPage onNavigatePage={onNavigatePage} />);

    const alexText = screen.getAllByText("Alex Chen")[0]!;
    // Click the row/element
    fireEvent.click(alexText);
    expect(onNavigatePage).toHaveBeenCalledWith("/students/alex_chen");
  });

  it("copies email to clipboard and notifies user when email is clicked", () => {
    const setNotice = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<StudentsPage setNotice={setNotice} />);

    const emailButton = screen.getAllByTitle("Click to copy email")[0]!;
    fireEvent.click(emailButton);

    expect(writeText).toHaveBeenCalledWith("alex@example.com");
    expect(setNotice).toHaveBeenCalledWith("Email alex@example.com copied to clipboard.");
  });

  it("renders a small spinner loader when isFetchingNextPage is true", () => {
    mockUseStudentsState = {
      ...mockUseStudentsState,
      isFetchingNextPage: true,
    };
    render(<StudentsPage />);

    expect(
      screen.getByRole("status", { name: /Loading more students/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Load more students/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing \d+ of \d+ students/i)).not.toBeInTheDocument();
  });

  it("renders empty state when no students are found", () => {
    mockUseStudentsState = {
      ...mockUseStudentsState,
      data: {
        pageParams: [undefined],
        pages: [
          {
            students: [],
            nextCursor: null,
            totalCount: 0,
          },
        ],
      },
      hasNextPage: false,
    };

    render(<StudentsPage />);
    expect(screen.getByText("No students found")).toBeInTheDocument();
  });

  it("debounces search input by 500ms before updating query filter", () => {
    vi.useFakeTimers();
    render(<StudentsPage />);

    const searchInput = screen.getByPlaceholderText(/Search students by name/i);
    fireEvent.change(searchInput, { target: { value: "Alex" } });

    // Immediately after typing, the debounced query filter has not fired yet
    expect(useStudentsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: undefined }),
    );

    // At 400ms, it still has not fired
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(useStudentsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: undefined }),
    );

    // Advance remaining 100ms (500ms total)
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Now it updates the search parameter
    expect(useStudentsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "Alex" }),
    );

    vi.useRealTimers();
  });
});

describe("StudentDetailsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStudentState = {
      data: mockStudentDetailResponse,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  });

  it("renders full student profile details, metrics, and enrolled courses", () => {
    const onNavigatePage = vi.fn();
    render(
      <StudentDetailsPage
        username="alex_chen"
        onNavigatePage={onNavigatePage}
      />,
    );

    expect(screen.getByText("Alex Chen")).toBeInTheDocument();
    expect(screen.getByText("@alex_chen")).toBeInTheDocument();
    expect(screen.getByText("alex@example.com")).toBeInTheDocument();
    expect(screen.getByText("+1234567890")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Passionate full-stack developer learning TypeScript & Node.js.",
      ),
    ).toBeInTheDocument();

    // Courses section
    expect(
      screen.getByText("Enrolled Courses (2)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Complete Backend Development with Node.js"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The Ultimate TypeScript Course"),
    ).toBeInTheDocument();

    // Back to students button
    const backBtn = screen.getByRole("button", { name: /Back to Students/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(onNavigatePage).toHaveBeenCalledWith("/students");
  });

  it("handles student not found error gracefully", () => {
    mockUseStudentState = {
      data: undefined as any,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    };

    render(<StudentDetailsPage username="unknown_user" />);
    expect(screen.getByText("Student Profile Not Found")).toBeInTheDocument();
  });
});
