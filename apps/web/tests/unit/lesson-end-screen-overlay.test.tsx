import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LessonEndScreenOverlay,
  type NextLessonInfo,
} from "../../src/learning/player/LessonEndScreenOverlay";

describe("LessonEndScreenOverlay", () => {
  const sampleNextLesson: NextLessonInfo = {
    id: 3,
    title: "The Design Mindset",
    duration: "03:45",
    sectionTitle: "Section 1: Introduction",
    thumbnailSrc: "https://example.com/thumb.jpg",
    lectureNumber: 3,
    totalLessons: 10,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders next lecture details accurately", () => {
    render(
      <LessonEndScreenOverlay
        nextLesson={sampleNextLesson}
        autoplayEnabled={true}
        onGoNext={vi.fn()}
        onRestart={vi.fn()}
        onCancelAutoplay={vi.fn()}
      />,
    );

    expect(screen.getByText("Up Next")).toBeInTheDocument();
    expect(screen.getByText("The Design Mindset")).toBeInTheDocument();
    expect(
      screen.getByText("Section 1: Introduction • Lecture 3 of 10"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("03:45")[0]).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next lecture/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restart/i })).toBeInTheDocument();
  });

  it("counts down and automatically triggers onGoNext when autoplay is enabled", () => {
    const onGoNext = vi.fn();

    render(
      <LessonEndScreenOverlay
        nextLesson={sampleNextLesson}
        autoplayEnabled={true}
        countdownSeconds={5}
        onGoNext={onGoNext}
        onRestart={vi.fn()}
        onCancelAutoplay={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/starting next lecture in/i),
    ).toBeInTheDocument();
    expect(screen.getByText("5s")).toBeInTheDocument();

    // Advance 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("4s")).toBeInTheDocument();

    // Advance 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("3s")).toBeInTheDocument();
    expect(onGoNext).not.toHaveBeenCalled();

    // Advance 3 more seconds to finish countdown
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onGoNext).toHaveBeenCalledTimes(1);
  });

  it("allows cancelling the autoplay countdown", () => {
    const onCancelAutoplay = vi.fn();
    const onGoNext = vi.fn();

    const { rerender } = render(
      <LessonEndScreenOverlay
        nextLesson={sampleNextLesson}
        autoplayEnabled={true}
        countdownSeconds={5}
        onGoNext={onGoNext}
        onRestart={vi.fn()}
        onCancelAutoplay={onCancelAutoplay}
      />,
    );

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButton);
    expect(onCancelAutoplay).toHaveBeenCalledTimes(1);

    // If parent updates autoplayEnabled to false upon cancel:
    rerender(
      <LessonEndScreenOverlay
        nextLesson={sampleNextLesson}
        autoplayEnabled={false}
        countdownSeconds={5}
        onGoNext={onGoNext}
        onRestart={vi.fn()}
        onCancelAutoplay={onCancelAutoplay}
      />,
    );

    // Advancing timers should not call onGoNext
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onGoNext).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/starting next lecture in/i),
    ).not.toBeInTheDocument();
  });

  it("triggers onGoNext immediately when clicking Next Lecture button", () => {
    const onGoNext = vi.fn();

    render(
      <LessonEndScreenOverlay
        nextLesson={sampleNextLesson}
        autoplayEnabled={false}
        onGoNext={onGoNext}
        onRestart={vi.fn()}
        onCancelAutoplay={vi.fn()}
      />,
    );

    const nextButton = screen.getByRole("button", { name: /next lecture/i });
    fireEvent.click(nextButton);
    expect(onGoNext).toHaveBeenCalledTimes(1);
  });

  it("triggers onRestart when clicking Restart button", () => {
    const onRestart = vi.fn();

    render(
      <LessonEndScreenOverlay
        nextLesson={sampleNextLesson}
        autoplayEnabled={false}
        onGoNext={vi.fn()}
        onRestart={onRestart}
        onCancelAutoplay={vi.fn()}
      />,
    );

    const restartButton = screen.getByRole("button", { name: /restart/i });
    fireEvent.click(restartButton);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("renders course completion state when there is no next lesson", () => {
    const onRestart = vi.fn();

    render(
      <LessonEndScreenOverlay
        nextLesson={undefined}
        autoplayEnabled={true}
        onGoNext={vi.fn()}
        onRestart={onRestart}
        onCancelAutoplay={vi.fn()}
      />,
    );

    expect(screen.getByText("Course Completed!")).toBeInTheDocument();
    expect(
      screen.getByText(/you've watched all available lectures in this course/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/starting next lecture in/i),
    ).not.toBeInTheDocument();

    const restartButton = screen.getByRole("button", {
      name: /restart lecture/i,
    });
    fireEvent.click(restartButton);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("supports dismissing via close button if onClose is provided", () => {
    const onClose = vi.fn();

    render(
      <LessonEndScreenOverlay
        nextLesson={sampleNextLesson}
        autoplayEnabled={false}
        onGoNext={vi.fn()}
        onRestart={vi.fn()}
        onCancelAutoplay={vi.fn()}
        onClose={onClose}
      />,
    );

    const closeButton = screen.getByRole("button", {
      name: /dismiss end screen/i,
    });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
