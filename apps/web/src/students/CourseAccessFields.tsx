import { useId, useMemo, useState } from "react";
import { useCourses } from "../services/courses";

const FIELD_CLASS =
  "min-h-11 w-full rounded-xl border-0 bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 text-sm text-(--text) placeholder-(--muted) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)] outline-none transition-shadow focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] aria-invalid:shadow-[inset_0_0_0_1px_var(--danger)]";

/** Tomorrow, as the `yyyy-mm-dd` an `<input type="date">` takes. */
function tomorrowInputValue(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getDate()).padStart(2, "0");
  return `${tomorrow.getFullYear()}-${month}-${day}`;
}

/**
 * The end of the chosen day in the viewer's time zone, as the API takes it,
 * or null (lifetime) when no day is chosen.
 */
export function accessEndFromInput(value: string): string | null {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null;
}

/**
 * Pick published courses to open for a student, and how long for. Only the
 * published catalogue is offered: the API refuses any other course.
 */
export function CourseAccessFields({
  selectedIds,
  onSelectedIdsChange,
  excludedIds = [],
  accessEnd,
  onAccessEndChange,
  error,
}: {
  selectedIds: readonly string[];
  onSelectedIdsChange: (ids: string[]) => void;
  /** Courses the student already has; left out of the list. */
  excludedIds?: readonly string[];
  /** `yyyy-mm-dd`, or "" for lifetime. */
  accessEnd: string;
  onAccessEndChange: (value: string) => void;
  error?: string | undefined;
}) {
  const { data, isLoading, isError } = useCourses();
  const [search, setSearch] = useState("");
  const baseId = useId();

  const courses = useMemo(() => {
    const excluded = new Set(excludedIds);
    const term = search.trim().toLowerCase();
    return (data?.courses ?? []).filter(
      (course) =>
        !excluded.has(course.id) &&
        (!term || course.title.toLowerCase().includes(term)),
    );
  }, [data?.courses, excludedIds, search]);

  const toggle = (courseId: string) =>
    onSelectedIdsChange(
      selectedIds.includes(courseId)
        ? selectedIds.filter((id) => id !== courseId)
        : [...selectedIds, courseId],
    );

  const errorId = `${baseId}-error`;

  return (
    <>
      <fieldset className="flex min-w-0 flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-semibold text-(--text-secondary)">
          Courses{" "}
          <span className="font-normal text-(--muted)">
            {selectedIds.length > 0
              ? `(${selectedIds.length} selected)`
              : "(published only)"}
          </span>
        </legend>
        <input
          type="search"
          aria-label="Search courses"
          placeholder="Search courses"
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={FIELD_CLASS}
        />
        <div
          className="max-h-52 overflow-y-auto overscroll-contain rounded-xl shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)]"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          {isLoading ? (
            <p className="m-0 p-3 text-sm text-(--muted)">Loading courses…</p>
          ) : isError ? (
            <p className="m-0 p-3 text-sm text-(--danger)">
              Could not load courses.
            </p>
          ) : courses.length === 0 ? (
            <p className="m-0 p-3 text-sm text-(--muted)">
              {search ? "No course matches." : "No published course to add."}
            </p>
          ) : (
            <ul className="m-0 list-none p-1">
              {courses.map((course) => (
                <li key={course.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-(--text) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(course.id)}
                      onChange={() => toggle(course.id)}
                      className="size-4 shrink-0 accent-(--accent)"
                    />
                    <span className="min-w-0 truncate">{course.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error ? (
          <p id={errorId} role="alert" className="m-0 text-xs text-(--danger)">
            {error}
          </p>
        ) : null}
      </fieldset>

      {selectedIds.length > 0 ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-(--text-secondary)">
            Access until{" "}
            <span className="font-normal text-(--muted)">
              (empty for lifetime)
            </span>
          </span>
          <input
            type="date"
            min={tomorrowInputValue()}
            value={accessEnd}
            onChange={(event) => onAccessEndChange(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
      ) : null}
    </>
  );
}
