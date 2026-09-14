import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuizAttemptPanel } from "../../src/quizzes/QuizAttemptPanel";
import { quizKeys } from "../../src/services/quizzes/quizzes.keys";
import { quizzesService } from "../../src/services/quizzes/quizzes.service";
import type { LearnerQuizAttempt, QuizResult } from "@veolms/contracts";

vi.mock("../../src/services/quizzes/quizzes.service", () => ({
  quizzesService: {
    getAttempt: vi.fn(),
    start: vi.fn(),
    submit: vi.fn(),
    saveAnswers: vi.fn().mockResolvedValue({ saved: true, answerCount: 1 }),
  },
}));

const mockAttempt: LearnerQuizAttempt = {
  id: "att-11111111-1111-4111-a111-111111111111",
  assignmentId: "qa-11111111-1111-4111-a111-111111111111",
  quizVersionId: "qv-11111111-1111-4111-a111-111111111111",
  attemptNumber: 1,
  status: "in_progress",
  startedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  questions: [
    {
      id: "q-1",
      prompt: "Next.js supports Server-Side Rendering (SSR).",
      questionType: "true_false",
      points: 1,
      position: 1,
      options: [
        { id: "opt-true", text: "True", position: 1 },
        { id: "opt-false", text: "False", position: 2 },
      ],
    },
  ],
  answers: {},
};

const mockResult: QuizResult = {
  attemptId: "att-11111111-1111-4111-a111-111111111111",
  assignmentId: "qa-11111111-1111-4111-a111-111111111111",
  quizVersionId: "qv-11111111-1111-4111-a111-111111111111",
  attemptNumber: 1,
  score: 1,
  maxScore: 1,
  percentage: 100,
  passed: true,
  status: "graded",
  feedbackMode: "after_submit",
  submittedAt: "2026-01-01T00:10:00.000Z",
  answers: [
    {
      questionId: "q-1",
      prompt: "Next.js supports Server-Side Rendering (SSR).",
      selectedOptionIds: ["opt-true"],
      selectedOptionTexts: ["True"],
      correctOptionTexts: ["True"],
      isCorrect: true,
      pointsAwarded: 1,
      explanation: "Next.js provides SSR capabilities out of the box.",
    },
  ],
};

describe("QuizAttemptPanel", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(quizzesService.getAttempt).mockResolvedValue(mockAttempt);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  function renderPanel(props: Partial<React.ComponentProps<typeof QuizAttemptPanel>> = {}) {
    return render(
      <QueryClientProvider client={queryClient}>
        <QuizAttemptPanel
          assignmentId="qa-11111111-1111-4111-a111-111111111111"
          activeAttemptId="att-11111111-1111-4111-a111-111111111111"
          maxAttempts={3}
          {...props}
        />
      </QueryClientProvider>,
    );
  }

  it("displays attempt count badge and assessment attempt number", async () => {
    queryClient.setQueryData(quizKeys.attempt(mockAttempt.id), mockAttempt);

    renderPanel({ maxAttempts: 3 });

    // Expect attempt indicator in header
    expect(screen.getByText(/Attempt 1 of 3/i)).toBeInTheDocument();
    // Expect badge pill with Attempt 1 / 3
    expect(screen.getByText(/Attempt 1 \/ 3/i)).toBeInTheDocument();
    // Expect the question to be visible
    expect(screen.getByText("Next.js supports Server-Side Rendering (SSR).")).toBeInTheDocument();
  });

  it("retains the quiz result card upon submitting and does NOT re-open the quiz", async () => {
    queryClient.setQueryData(quizKeys.attempt(mockAttempt.id), mockAttempt);
    vi.mocked(quizzesService.submit).mockResolvedValue(mockResult);

    const { rerender } = renderPanel({ maxAttempts: 3 });

    // Select the answer "True"
    const trueOption = screen.getByText("True");
    fireEvent.click(trueOption);

    // Open submit confirmation
    const submitPromptButton = screen.getByRole("button", { name: /^Submit$/i });
    expect(submitPromptButton).toBeInTheDocument();
    fireEvent.click(submitPromptButton);

    // Confirm submission
    const confirmButton = screen.getByRole("button", { name: /Submit quiz/i });
    expect(confirmButton).toBeInTheDocument();
    fireEvent.click(confirmButton);

    // Result card must now be displayed with percentage and attempt number
    await waitFor(() => {
      expect(screen.getByText("100%")).toBeInTheDocument();
      expect(screen.getByText(/PASSED/i)).toBeInTheDocument();
      expect(screen.getByText(/#1 of 3/i)).toBeInTheDocument();
    });

    // Simulate query cache invalidation setting activeAttemptId to null (as backend does after submission)
    rerender(
      <QueryClientProvider client={queryClient}>
        <QuizAttemptPanel
          assignmentId="qa-11111111-1111-4111-a111-111111111111"
          activeAttemptId={null}
          maxAttempts={3}
        />
      </QueryClientProvider>,
    );

    // Result card must STILL be visible! Quizzes service start must NOT have been called!
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText(/PASSED/i)).toBeInTheDocument();
    expect(screen.queryByText("Next.js supports Server-Side Rendering (SSR).")).toBeNull();
    expect(quizzesService.start).not.toHaveBeenCalled();
  });

  it("renders 'Back to video' in result card and triggers onBackToVideo callback", async () => {
    queryClient.setQueryData(quizKeys.attempt(mockAttempt.id), mockAttempt);
    vi.mocked(quizzesService.submit).mockResolvedValue(mockResult);
    const onBackToVideo = vi.fn();

    renderPanel({ maxAttempts: 3, onBackToVideo });

    // Select answer and submit
    fireEvent.click(screen.getByText("True"));
    fireEvent.click(screen.getByRole("button", { name: /^Submit$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Submit quiz/i }));

    // Wait for result card
    await waitFor(() => {
      expect(screen.getByText("100%")).toBeInTheDocument();
    });

    // Back to video button must be present in result card
    const backBtn = screen.getByRole("button", { name: /Back to video/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(onBackToVideo).toHaveBeenCalledTimes(1);
  });
});
