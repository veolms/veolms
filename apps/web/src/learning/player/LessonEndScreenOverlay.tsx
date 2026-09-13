import { useEffect, useState } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";

export interface NextLessonInfo {
  id: number;
  title: string;
  duration?: string;
  sectionTitle?: string;
  thumbnailSrc?: string;
  lectureNumber?: number;
  totalLessons?: number;
}

export interface LessonEndScreenOverlayProps {
  nextLesson?: NextLessonInfo;
  autoplayEnabled?: boolean;
  onGoNext: () => void;
  onRestart: () => void;
  onCancelAutoplay: () => void;
  onClose?: () => void;
  countdownSeconds?: number;
}

export function LessonEndScreenOverlay({
  nextLesson,
  autoplayEnabled = true,
  onGoNext,
  onRestart,
  onCancelAutoplay,
  onClose,
  countdownSeconds = 5,
}: LessonEndScreenOverlayProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(countdownSeconds);
  const [imgError, setImgError] = useState(false);
  const hasNextLesson = Boolean(nextLesson);
  const isCountdownActive =
    autoplayEnabled && hasNextLesson && secondsRemaining > 0;

  useEffect(() => {
    setImgError(false);
  }, [nextLesson?.id, nextLesson?.thumbnailSrc]);

  useEffect(() => {
    if (!autoplayEnabled || !hasNextLesson) return;

    if (secondsRemaining <= 0) {
      onGoNext();
      return;
    }

    const timer = window.setTimeout(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoplayEnabled, hasNextLesson, onGoNext, secondsRemaining]);

  const circleCircumference = 2 * Math.PI * 9;
  const strokeDashoffset =
    circleCircumference * (1 - secondsRemaining / countdownSeconds);

  return (
    <div
      data-lesson-end-screen=""
      role="dialog"
      aria-label="Lecture completed"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6 backdrop-blur-[8px] transition-opacity duration-200 select-none pointer-events-auto"
    >
      <div
        className="relative flex w-full max-w-md sm:max-w-lg min-w-0 flex-col overflow-hidden rounded-[20px] sm:rounded-[24px] border-none bg-(--card-surface,var(--surface)) text-(--text) shadow-[var(--surface-frame-edge-shadow),var(--card-floating-shadow)] animate-in zoom-in-95 duration-150"
      >
        {hasNextLesson && nextLesson ? (
          <>
            {/* Header Section */}
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3.5 sm:px-6 sm:pt-6 sm:pb-4 border-b border-[color-mix(in_srgb,var(--text)_7%,transparent)]">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-none bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-(--accent) shadow-[inset_0_1px_0_color-mix(in_srgb,white_15%,transparent)]"
                >
                  Up Next
                </span>
                <span className="truncate text-xs font-semibold text-(--text-secondary)">
                  {nextLesson.sectionTitle ? `${nextLesson.sectionTitle} • ` : ""}
                  {nextLesson.lectureNumber
                    ? `Lecture ${nextLesson.lectureNumber}${nextLesson.totalLessons ? ` of ${nextLesson.totalLessons}` : ""}`
                    : `Lecture ${nextLesson.id}`}
                </span>
              </div>

              {onClose ? (
                <button
                  type="button"
                  aria-label="Dismiss end screen"
                  title="Dismiss end screen"
                  onClick={onClose}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border-none bg-[color-mix(in_srgb,var(--text)_7%,transparent)] text-(--muted) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface)_80%,transparent),0_1px_2px_color-mix(in_srgb,var(--text)_8%,transparent)] transition-all hover:bg-[color-mix(in_srgb,var(--text)_13%,transparent)] hover:text-(--text) active:scale-95 cursor-pointer"
                >
                  <X size={16} weight="bold" />
                </button>
              ) : null}
            </div>

            {/* Body Section */}
            <div className="flex flex-col gap-3.5 sm:gap-4 px-5 py-4.5 sm:px-6 sm:py-5">
              {/* Next Lecture Card: 3D raised card */}
              <div
                role="button"
                tabIndex={0}
                onClick={onGoNext}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onGoNext();
                  }
                }}
                className="group flex cursor-pointer items-center gap-3.5 sm:gap-4.5 rounded-[14px] sm:rounded-[16px] border-none bg-(--card-surface-raised,color-mix(in_srgb,var(--surface-strong,var(--surface))_85%,var(--surface))) p-3.5 sm:p-4 shadow-(--card-shadow,var(--surface-depth-shadow)) transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_5%,var(--surface))] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-(--accent)"
              >
                <div className="relative aspect-video w-28 sm:w-34 shrink-0 overflow-hidden rounded-[10px] sm:rounded-[12px] border-none bg-[linear-gradient(155deg,color-mix(in_srgb,var(--canvas)_85%,var(--surface))_0%,color-mix(in_srgb,var(--surface)_70%,var(--canvas))_100%)] shadow-[inset_0_2px_5px_color-mix(in_srgb,black_30%,transparent)]">
                  {!imgError && nextLesson.thumbnailSrc ? (
                    <img
                      src={nextLesson.thumbnailSrc}
                      alt=""
                      onError={() => setImgError(true)}
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <div
                        className="grid size-8 sm:size-9 place-items-center rounded-[10px] border-none bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_24%,var(--surface))_0%,color-mix(in_srgb,var(--accent)_12%,var(--canvas))_100%)] text-(--accent) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_12%,transparent))] transition-transform duration-150 group-hover:scale-110"
                      >
                        <Play size={15} weight="fill" />
                      </div>
                    </div>
                  )}
                  {nextLesson.duration ? (
                    <span className="absolute bottom-1.5 right-1.5 rounded-md border-none bg-black/80 px-1.5 py-0.5 text-[10px] font-bold tracking-tight text-white shadow-xs backdrop-blur-xs">
                      {nextLesson.duration}
                    </span>
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <h4 className="line-clamp-2 text-sm sm:text-[0.95rem] font-bold text-(--text) leading-snug transition-colors group-hover:text-(--accent)">
                    {nextLesson.title}
                  </h4>
                  {nextLesson.duration ? (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-(--text-secondary)">
                      <Clock size={13} weight="bold" />
                      <span>{nextLesson.duration}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Countdown bar: 3D inset well */}
              {isCountdownActive ? (
                <div className="flex items-center justify-between gap-3 rounded-[14px] sm:rounded-[16px] border-none bg-[linear-gradient(155deg,color-mix(in_srgb,var(--canvas)_80%,var(--surface))_0%,color-mix(in_srgb,var(--surface)_65%,var(--canvas))_100%)] px-4 py-2.5 sm:px-4.5 sm:py-3 shadow-[inset_0_2px_6px_color-mix(in_srgb,black_28%,transparent),inset_0_1px_2px_color-mix(in_srgb,var(--text)_10%,transparent),inset_0_-1px_0_color-mix(in_srgb,var(--surface)_90%,transparent)]">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <svg
                      className="size-5 -rotate-90 shrink-0"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        className="stroke-[color-mix(in_srgb,var(--text)_18%,transparent)]"
                        strokeWidth="2.5"
                        fill="none"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        style={{
                          stroke: "var(--accent)",
                        }}
                        className="transition-all duration-1000 ease-linear"
                        strokeWidth="2.5"
                        strokeDasharray={circleCircumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                    <span className="text-xs sm:text-sm font-medium text-(--text)">
                      Starting next lecture in{" "}
                      <span className="font-bold text-(--accent)">
                        {secondsRemaining}s
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onCancelAutoplay}
                    className="inline-flex h-7.5 items-center justify-center rounded-[8px] border-none bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 text-xs font-semibold text-(--text) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface)_80%,transparent),0_1px_2px_color-mix(in_srgb,var(--text)_8%,transparent)] transition-all hover:bg-[color-mix(in_srgb,var(--text)_13%,transparent)] active:scale-95 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>

            {/* Footer Action Bar */}
            <div className="flex items-center justify-end gap-3 px-5 pb-5 pt-3 sm:px-6 sm:pb-6 sm:pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
              <button
                type="button"
                onClick={onRestart}
                className="inline-flex h-10 sm:h-10.5 min-w-28 items-center justify-center gap-2 rounded-[10px] border-none bg-[color-mix(in_srgb,var(--text)_8%,var(--surface))] px-5 text-[0.82rem] sm:text-[0.84rem] font-semibold text-(--text) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_10%,transparent))] transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_13%,var(--surface))] active:bg-[color-mix(in_srgb,var(--text)_5%,var(--surface))] active:scale-[0.98] cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-(--accent)"
              >
                <ArrowCounterClockwise size={16} weight="bold" />
                <span>Restart</span>
              </button>
              <button
                type="button"
                onClick={onGoNext}
                className="inline-flex h-10 sm:h-10.5 flex-1 items-center justify-center gap-2 rounded-[10px] border-none bg-(--accent) px-5 text-[0.82rem] sm:text-[0.85rem] font-bold text-(--on-accent,#ffffff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_25%,transparent),0_2px_6px_rgba(0,0,0,0.2)] transition-all duration-150 hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98] cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-(--accent)"
              >
                <Play size={16} weight="fill" />
                <span>Next Lecture</span>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Header Section for Course Completed */}
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3.5 sm:px-6 sm:pt-6 sm:pb-4 border-b border-[color-mix(in_srgb,var(--text)_7%,transparent)]">
              <span className="text-xs font-semibold uppercase tracking-wider text-(--text-secondary)">
                Course Status
              </span>
              {onClose ? (
                <button
                  type="button"
                  aria-label="Dismiss end screen"
                  title="Dismiss end screen"
                  onClick={onClose}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border-none bg-[color-mix(in_srgb,var(--text)_7%,transparent)] text-(--muted) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface)_80%,transparent),0_1px_2px_color-mix(in_srgb,var(--text)_8%,transparent)] transition-all hover:bg-[color-mix(in_srgb,var(--text)_13%,transparent)] hover:text-(--text) active:scale-95 cursor-pointer"
                >
                  <X size={16} weight="bold" />
                </button>
              ) : null}
            </div>

            {/* Body Section for Course Completed */}
            <div className="flex flex-col items-center px-5 py-8 sm:px-6 sm:py-10 text-center">
              <div
                className="mb-4 flex size-15 sm:size-16 items-center justify-center rounded-[16px] border-none bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_24%,var(--surface))_0%,color-mix(in_srgb,var(--accent)_12%,var(--canvas))_100%)] text-(--accent) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_12%,transparent))]"
              >
                <CheckCircle size={34} weight="duotone" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-(--text)">Course Completed!</h3>
              <p className="mt-2 text-sm sm:text-base text-(--text-secondary) max-w-sm leading-relaxed">
                You've watched all available lectures in this course.
              </p>
            </div>

            {/* Footer Action Bar for Course Completed */}
            <div className="flex items-center justify-center px-5 pb-5 pt-3.5 sm:px-6 sm:pb-6 sm:pt-4 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
              <button
                type="button"
                onClick={onRestart}
                className="inline-flex h-10.5 items-center justify-center gap-2 rounded-[10px] border-none bg-(--accent) px-7 text-[0.84rem] sm:text-[0.86rem] font-bold text-(--on-accent,#ffffff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_25%,transparent),0_2px_6px_rgba(0,0,0,0.2)] transition-all duration-150 hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98] cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-(--accent)"
              >
                <ArrowCounterClockwise size={16} weight="bold" />
                <span>Restart Lecture</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
