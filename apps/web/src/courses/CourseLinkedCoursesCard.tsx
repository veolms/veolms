import { useMemo, useState } from "react";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ThemedSelect, type ThemedSelectOption } from "../ThemedSelect";
import { Button } from "../components/Button";
import {
  useLinkedCourses,
  useMyCourses,
  useSetLinkedCourse,
} from "../services/courses";

export interface CourseLinkedCoursesCardProps {
  courseId: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  archived: "Archived",
};

/**
 * Courses that come free with this one. Whoever holds this course, now or
 * later, holds the linked courses too; the order names only this course.
 * Unlinking takes a linked course away from learners who have it only
 * through this link.
 */
export function CourseLinkedCoursesCard({
  courseId,
}: CourseLinkedCoursesCardProps) {
  const linkedQuery = useLinkedCourses(courseId);
  const myCoursesQuery = useMyCourses({ enabled: Boolean(courseId) });
  const setLinked = useSetLinkedCourse();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const linked = useMemo(
    () => linkedQuery.data?.items ?? [],
    [linkedQuery.data],
  );

  const options = useMemo<ThemedSelectOption[]>(() => {
    const linkedIds = new Set(linked.map((item) => item.courseId));
    const candidates = (myCoursesQuery.data?.courses ?? [])
      .filter((course) => course.id !== courseId && !linkedIds.has(course.id))
      .map((course): ThemedSelectOption => {
        const status = STATUS_LABELS[course.status];
        return [
          course.id,
          status ? `${course.title} (${status})` : course.title,
          { searchKeywords: course.slug },
        ];
      });
    return [["", "Select a course to link"], ...candidates];
  }, [courseId, linked, myCoursesQuery.data]);

  function update(linkedCourseId: string, link: boolean) {
    if (!courseId) return;
    setPendingId(linkedCourseId);
    setConfirmingId(null);
    setLinked.mutate(
      { courseId, linkedCourseId, linked: link },
      { onSettled: () => setPendingId(null) },
    );
  }

  return (
    <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow) transition-opacity duration-200">
      <div className="mb-4.5">
        <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
          Linked courses
        </h3>
        <p className="m-0 text-(--muted) text-[0.83rem]">
          Learners who get this course also get access to the courses linked
          here, including learners who already have it. Only this course appears
          on their order.
        </p>
      </div>

      {!courseId ? (
        <div className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))] p-5 text-center text-xs text-(--muted)">
          Save course basics before linking courses.
        </div>
      ) : linkedQuery.isError ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-red-400">
            Unable to load linked courses.{" "}
            {linkedQuery.error?.message ?? "Please try again."}
          </p>
          <Button
            type="button"
            onClick={() => void linkedQuery.refetch()}
            className="w-fit"
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <ThemedSelect
            value=""
            onValueChange={(value) => {
              if (value) update(value, true);
            }}
            options={options}
            disabled={
              linkedQuery.isLoading ||
              myCoursesQuery.isLoading ||
              pendingId !== null
            }
            ariaLabel="Select a course to link"
            searchable
            searchPlaceholder="Search courses..."
            triggerClassName="!w-full !h-11 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-[10px] !px-3.5 !py-0 !text-(--text) !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.88rem] !font-medium disabled:!opacity-60 disabled:!cursor-not-allowed"
          />

          {linked.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {linked.map((item) => {
                const status = STATUS_LABELS[item.status];
                const isPending = pendingId === item.courseId;
                const isConfirming = confirmingId === item.courseId;
                return (
                  <li
                    key={item.courseId}
                    className="flex items-center gap-3 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-3.5 py-2.5"
                  >
                    <LinkSimple
                      size={16}
                      weight="bold"
                      className="shrink-0 text-(--accent)"
                    />
                    <span className="min-w-0 flex-1 truncate text-[0.88rem] font-semibold text-(--text)">
                      {item.title}
                    </span>
                    {status && (
                      <span className="shrink-0 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-0.5 text-[0.72rem] font-semibold text-(--muted)">
                        {status}
                      </span>
                    )}
                    {isPending ? (
                      <CircleNotch
                        size={16}
                        className="shrink-0 animate-spin text-(--muted)"
                      />
                    ) : isConfirming ? (
                      <span className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => update(item.courseId, false)}
                          className="cursor-pointer border-none bg-transparent p-0 text-[0.78rem] font-bold text-rose-500 hover:underline"
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="cursor-pointer border-none bg-transparent p-0 text-[0.78rem] font-semibold text-(--muted) hover:underline"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Unlink ${item.title}`}
                        onClick={() => setConfirmingId(item.courseId)}
                        disabled={pendingId !== null}
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {confirmingId && (
            <p className="m-0 text-[0.78rem] text-(--muted)">
              Learners who have that course only through this link will lose
              access to it. Learners who bought it themselves keep it.
            </p>
          )}

          {setLinked.isError && (
            <p className="m-0 text-xs font-medium text-rose-500">
              {setLinked.error?.message ?? "Could not update linked courses."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
