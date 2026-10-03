import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { PuzzlePieceIcon as PuzzlePiece } from "@phosphor-icons/react/PuzzlePiece";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useMyCourses } from "../services/courses";
import { useBackDismiss } from "../navigation/useBackDismiss";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";

export interface SelectCourseForQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigatePage?: (destination: string) => void;
}

export function SelectCourseForQuizModal({
  isOpen,
  onClose,
  onNavigatePage,
}: SelectCourseForQuizModalProps) {
  const coursesQuery = useMyCourses({ enabled: isOpen });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const dismissThen = useBackDismiss({
    enabled: true,
    open: isOpen,
    onDismiss: onClose,
  });

  const dismissModal = useCallback(() => {
    dismissThen(() => {});
  }, [dismissThen]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSelectedCourseId(null);
      return undefined;
    }

    const previousActiveElement =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissModal();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) return;

      const focusableElements = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === searchInputRef.current);

      if (!focusableElements.length) return;
      const first = focusableElements[0]!;
      const last = focusableElements[focusableElements.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(timer);
      previousActiveElement?.focus();
    };
  }, [isOpen, dismissModal]);

  const rawCourses = coursesQuery.data?.courses ?? [];

  const filteredCourses = useMemo(() => {
    if (!searchQuery.trim()) return rawCourses;
    const lower = searchQuery.toLowerCase().trim();
    return rawCourses.filter((course) => course.title.toLowerCase().includes(lower));
  }, [rawCourses, searchQuery]);

  const handleProceed = useCallback(
    (courseId: string) => {
      dismissThen(() => {
        onClose();
        onNavigatePage?.(`/courses/create?edit=${encodeURIComponent(courseId)}&tab=curriculum`);
      });
    },
    [dismissThen, onClose, onNavigatePage],
  );

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm duration-150"
      onClick={dismissModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="select-course-quiz-title"
    >
      <div
        ref={modalRef}
        className="animate-in zoom-in-95 relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-[20px] border border-(--border) bg-(--card-surface,var(--surface)) p-5 text-(--text) shadow-2xl duration-150 sm:p-6"
        style={{ boxShadow: "var(--card-floating-shadow,var(--card-shadow))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-(--accent)"
              aria-hidden="true"
            >
              <PuzzlePiece size={22} weight="duotone" />
            </div>
            <div>
              <h3
                id="select-course-quiz-title"
                className="min-w-0 text-base font-bold tracking-tight text-(--text) sm:text-lg"
              >
                Select Course for Quiz
              </h3>
              <p className="m-0 text-xs text-(--muted) sm:text-sm">
                Choose the course where you want to add or manage quizzes.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg p-1.5 text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
            onClick={dismissModal}
            aria-label="Close dialog"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Search */}
        {rawCourses.length > 0 && (
          <div className="pt-4 pb-2">
            <div className="relative flex w-full items-center">
              <MagnifyingGlass
                size={16}
                className="pointer-events-none absolute left-3 text-(--muted)"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your courses..."
                className="h-9.5 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] pr-3 pl-9 text-xs text-(--text) transition-all outline-none placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20 sm:text-sm"
              />
            </div>
          </div>
        )}

        {/* Course List */}
        <div className="my-2 max-h-[340px] min-h-[180px] flex-1 space-y-2 overflow-y-auto pr-1">
          {coursesQuery.isLoading ? (
            <CenteredLoadingSpinner
              label="Loading your courses"
              className="min-h-[180px]"
              size={22}
            />
          ) : rawCourses.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-(--accent)">
                <BookOpen size={24} weight="duotone" />
              </div>
              <h4 className="mb-1 text-sm font-semibold text-(--text)">No courses found</h4>
              <p className="mb-4 max-w-xs text-xs text-(--muted)">
                You need at least one course to create and attach quizzes in the curriculum.
              </p>
              <button
                type="button"
                onClick={() => {
                  dismissThen(() => {
                    onClose();
                    onNavigatePage?.("/courses/create");
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-(--accent) px-3.5 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-xs transition-colors hover:bg-(--accent-hover,var(--accent))"
              >
                <Plus size={14} weight="bold" />
                Create a Course
              </button>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="py-8 text-center text-xs text-(--muted)">
              No courses matched &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            filteredCourses.map((course) => {
              const isSelected = selectedCourseId === course.id;
              return (
                <div
                  key={course.id}
                  onClick={() => setSelectedCourseId(course.id)}
                  onDoubleClick={() => handleProceed(course.id)}
                  className={`group flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border p-3 transition-all select-none ${
                    isSelected
                      ? "border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] shadow-xs"
                      : "border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        isSelected
                          ? "border-(--accent) bg-(--accent) text-(--on-accent,#ffffff)"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] text-(--muted) group-hover:text-(--text)"
                      }`}
                    >
                      <BookOpen size={18} weight="duotone" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-(--text) sm:text-sm">
                        {course.title || "Untitled Course"}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[0.72rem] text-(--muted)">
                        <span
                          className={`py-0.2 inline-flex items-center rounded-full px-1.5 text-[0.68rem] font-medium ${
                            course.status === "published"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted)"
                          }`}
                        >
                          {course.status === "published" ? "Published" : "Draft"}
                        </span>
                        {course.difficulty && <span>• {course.difficulty}</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProceed(course.id);
                    }}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-xs font-semibold transition-all ${
                      isSelected
                        ? "bg-(--accent) text-(--on-accent,#ffffff)"
                        : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text-secondary) group-hover:bg-(--accent) group-hover:text-(--on-accent,#ffffff)"
                    }`}
                  >
                    <span>Curriculum</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-2 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] pt-4">
          <button
            type="button"
            onClick={dismissModal}
            className="inline-flex min-h-8.5 items-center rounded-[9px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent px-3 py-1.5 text-xs font-semibold text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!selectedCourseId}
            onClick={() => {
              if (selectedCourseId) handleProceed(selectedCourseId);
            }}
            className="inline-flex min-h-8.5 items-center gap-1.5 rounded-[9px] bg-(--accent) px-4 py-1.5 text-xs font-semibold text-(--on-accent,#ffffff) shadow-xs transition-colors hover:bg-(--accent-hover,var(--accent)) disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>Continue to Curriculum</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
