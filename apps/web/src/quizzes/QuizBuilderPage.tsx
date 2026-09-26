import { useMemo, useState } from "react";
import {
  BookOpenIcon as BookOpen,
  CircleNotchIcon as CircleNotch,
  MagnifyingGlassIcon as MagnifyingGlass,
  PlusIcon as Plus,
  PuzzlePieceIcon as PuzzlePiece,
  ArrowLeftIcon as ArrowLeft,
} from "@phosphor-icons/react";
import { QuizAuthoringPanel } from "./QuizAuthoringPanel";
import { useMyCourses } from "../services/courses";
import { Button } from "../components/Button";

interface Props {
  quizId?: string;
  onNavigatePage?: (destination: string) => void;
}

export function QuizBuilderPage({ quizId, onNavigatePage }: Props) {
  const coursesQuery = useMyCourses({ enabled: !quizId });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const rawCourses = coursesQuery.data?.courses ?? [];

  const filteredCourses = useMemo(() => {
    if (!searchQuery.trim()) return rawCourses;
    const lower = searchQuery.toLowerCase().trim();
    return rawCourses.filter((course) =>
      course.title.toLowerCase().includes(lower),
    );
  }, [rawCourses, searchQuery]);

  const handleProceed = (courseId: string) => {
    onNavigatePage?.(`/courses/create?edit=${encodeURIComponent(courseId)}&tab=curriculum`);
  };

  if (quizId) {
    return (
      <main
        data-quiz-surface=""
        className="mx-auto w-full max-w-[1320px] px-0 py-0.5 sm:px-4 sm:py-6 lg:px-8"
      >
        <QuizAuthoringPanel
          initialQuizId={quizId}
          onBack={() => onNavigatePage?.("/quizzes")}
        />
      </main>
    );
  }

  return (
    <main
      data-quiz-surface=""
      className="mx-auto w-full max-w-[1100px] px-3 py-4 sm:px-6 sm:py-8"
    >
      {/* Back button & Page header */}
      <div className="mb-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onNavigatePage?.("/quizzes")}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-(--muted) hover:text-(--text) transition-colors"
        >
          <ArrowLeft size={14} weight="bold" />
          <span>Back to Quizzes</span>
        </button>

        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-(--accent)">
            <span
              className="size-1.5 rounded-full bg-(--accent)"
              aria-hidden="true"
            />
            Assessment Workspace
          </p>
          <h1 className="text-[clamp(1.5rem,2.5vw,2.2rem)] font-bold tracking-tight text-(--text)">
            Create New Quiz
          </h1>
          <p className="max-w-2xl text-xs sm:text-sm text-(--muted)">
            Select a course to create or manage quizzes directly inside its curriculum.
          </p>
        </div>
      </div>

      {/* Course Selection Card */}
      <div className="rounded-[18px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface,var(--surface)) p-5 sm:p-7 shadow-(--card-shadow)">
        <div className="flex items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-(--accent)">
              <PuzzlePiece size={22} weight="duotone" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-(--text) m-0">
                Choose Target Course
              </h2>
              <p className="text-xs text-(--muted) m-0">
                Quizzes are attached to lessons in your course curriculum.
              </p>
            </div>
          </div>
        </div>

        {/* Search Input */}
        {rawCourses.length > 0 && (
          <div className="relative flex items-center w-full mb-4">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 text-(--muted) pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your courses..."
              className="w-full h-10 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] pl-9 pr-3 text-xs sm:text-sm text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20"
            />
          </div>
        )}

        {/* Courses list */}
        <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
          {coursesQuery.isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-(--muted) text-xs">
              <CircleNotch size={24} className="animate-spin text-(--accent)" />
              <span>Loading your courses...</span>
            </div>
          ) : rawCourses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-(--accent) mb-3">
                <BookOpen size={24} weight="duotone" />
              </div>
              <h3 className="text-sm font-semibold text-(--text) mb-1">
                No courses found
              </h3>
              <p className="text-xs text-(--muted) max-w-sm mb-4">
                You must have an existing course to create and attach quizzes in its curriculum.
              </p>
              <Button
                onClick={() => onNavigatePage?.("/courses/create")}
                className="inline-flex items-center gap-1.5"
              >
                <Plus size={15} weight="bold" />
                <span>Create a Course First</span>
              </Button>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="py-10 text-center text-xs text-(--muted)">
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
                  className={`group flex items-center justify-between gap-3 p-3.5 rounded-[12px] border transition-all cursor-pointer select-none ${
                    isSelected
                      ? "border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] shadow-xs"
                      : "border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                        isSelected
                          ? "border-(--accent) bg-(--accent) text-(--on-accent,#ffffff)"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] text-(--muted) group-hover:text-(--text)"
                      }`}
                    >
                      <BookOpen size={20} weight="duotone" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-(--text) truncate">
                        {course.title || "Untitled Course"}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[0.72rem] text-(--muted)">
                        <span
                          className={`inline-flex items-center rounded-full px-1.5 py-0.2 text-[0.68rem] font-medium ${
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
                    className={`inline-flex shrink-0 items-center gap-1 rounded-[8px] px-3 py-1.5 text-xs font-semibold transition-all ${
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

        {/* Action Button */}
        {rawCourses.length > 0 && (
          <div className="flex items-center justify-end gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-4 mt-4">
            <Button
              disabled={!selectedCourseId}
              onClick={() => {
                if (selectedCourseId) handleProceed(selectedCourseId);
              }}
              className="inline-flex items-center gap-2"
            >
              <span>Continue to Course Curriculum</span>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
