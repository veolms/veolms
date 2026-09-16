import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuizAuthoringPanel } from "../../src/quizzes/QuizAuthoringPanel";

let mockQuizReturn: any = null;

// Mock services needed by QuizAuthoringPanel
vi.mock("../../src/services/quizzes/quizzes.queries", () => ({
  useMyQuizzes: () => ({ data: [], isLoading: false }),
  useQuiz: () => ({ data: mockQuizReturn, isLoading: false }),
  useCourseQuizAssignments: () => ({ data: [], isLoading: false }),
}));

vi.mock("../../src/services/courses/courses.queries", () => ({
  useMyCourses: () => ({ data: [], isLoading: false }),
  useCourseEditor: () => ({ data: null, isLoading: false }),
}));

vi.mock("../../src/services/quizzes/quizzes.mutations", () => ({
  useCreateQuiz: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateQuiz: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteQuiz: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePublishQuiz: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddQuizQuestion: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateQuizQuestion: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteQuizQuestion: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssignQuiz: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateQuizAssignment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteQuizAssignment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("Curriculum & Quiz Authoring Focus Mode", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const renderPanel = (props = {}) =>
    render(
      <QueryClientProvider client={queryClient}>
        <QuizAuthoringPanel lessonTitle="Test Lesson" {...props} />
      </QueryClientProvider>,
    );

  it("renders the icon-only Focus Mode button in QuizAuthoringPanel when onToggleFocusMode is provided", () => {
    const onToggle = vi.fn();
    renderPanel({
      isFocusMode: false,
      onToggleFocusMode: onToggle,
    });

    const focusButton = screen.getByRole("button", { name: "Enter focus mode" });
    expect(focusButton).toBeInTheDocument();
    expect(focusButton).toHaveAttribute("aria-pressed", "false");
    expect(focusButton).toHaveAttribute("title", expect.stringContaining("Focus mode"));

    fireEvent.click(focusButton);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("updates button state and aria-label to 'Exit focus mode' when isFocusMode is true", () => {
    const onToggle = vi.fn();
    renderPanel({
      isFocusMode: true,
      onToggleFocusMode: onToggle,
    });

    const exitButton = screen.getByRole("button", { name: "Exit focus mode" });
    expect(exitButton).toBeInTheDocument();
    expect(exitButton).toHaveAttribute("aria-pressed", "true");
    expect(exitButton).toHaveAttribute("title", expect.stringContaining("Exit focus mode"));

    fireEvent.click(exitButton);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not render the focus mode button when onToggleFocusMode is not provided", () => {
    renderPanel();
    expect(
      screen.queryByRole("button", { name: /focus mode/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the Add question button stably without fluctuating", () => {
    renderPanel();
    const addBtn = screen.getByRole("button", { name: "Add question" });
    expect(addBtn).toBeInTheDocument();
    expect(addBtn).not.toBeDisabled();
  });

  it("renders the Done Editing button with check icon when editing a question", () => {
    mockQuizReturn = {
      id: "quiz-123",
      title: "Test Quiz",
      description: "Test description",
      status: "draft",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      versions: [
        {
          id: "ver-1",
          versionNumber: 1,
          instructions: null,
          publishedAt: null,
          questions: [
            {
              id: "q-1",
              questionType: "single_choice",
              prompt: "What is 2+2?",
              points: 1,
              position: 0,
              explanation: null,
              options: [
                { id: "opt-1", text: "4", isCorrect: true, weight: 1, position: 0 },
                { id: "opt-2", text: "5", isCorrect: false, weight: 0, position: 1 },
              ],
            },
          ],
        },
      ],
    };

    renderPanel({ lessonId: "les-1", courseId: "course-1" });

    // Click question to expand it
    const questionHeader = screen.getByText("What is 2+2?");
    fireEvent.click(questionHeader);

    // Done Editing button should appear
    const doneEditingBtn = screen.getByRole("button", {
      name: "Done editing question",
    });
    expect(doneEditingBtn).toBeInTheDocument();
    expect(doneEditingBtn).toHaveTextContent("Done Editing");

    // Click Done Editing to collapse
    fireEvent.click(doneEditingBtn);
    expect(
      screen.queryByRole("button", { name: "Done editing question" }),
    ).not.toBeInTheDocument();
  });
});
