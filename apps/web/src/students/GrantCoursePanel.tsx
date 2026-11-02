import { XIcon as X } from "@phosphor-icons/react/X";
import { useState } from "react";
import { Button } from "../components/Button";
import { SlideOverFrame } from "../components/SlideOverPanel";
import { useGrantCourseAccess } from "../services/access";
import { secondaryButtonClassName } from "../team/TeamBits";
import { accessEndFromInput, CourseAccessFields } from "./CourseAccessFields";

const line = "border-(--border)";

/**
 * Staff open published courses for one student, lifetime or until a date.
 * Courses the student already holds, or lost and can get back with
 * Restore, are not offered. Mounted only while open.
 */
export function GrantCoursePanel({
  userId,
  studentName,
  heldCourseIds,
  onClose,
  onGranted,
}: {
  userId: string;
  studentName: string;
  heldCourseIds: readonly string[];
  onClose: () => void;
  onGranted: (count: number) => void;
}) {
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [accessEnd, setAccessEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const grant = useGrantCourseAccess();

  const save = () => {
    if (courseIds.length === 0) {
      setError("Pick at least one course.");
      return;
    }
    setError(null);
    grant.mutate(
      { userId, courseIds, validUntil: accessEndFromInput(accessEnd) },
      {
        onSuccess: () => onGranted(courseIds.length),
        onError: (cause) =>
          setError(cause.message || "Could not give access. Please try again."),
      },
    );
  };

  return (
    <SlideOverFrame
      label="Grant course access"
      onClose={onClose}
      className="max-w-[520px]"
    >
      <form
        noValidate
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className={`shrink-0 border-b px-6 pt-6 pb-5 ${line}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-(--text)">
                Grant course access
              </h2>
              <p className="mt-1 truncate text-xs text-(--muted)">
                Open published courses for {studentName}. No payment is taken.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          <CourseAccessFields
            selectedIds={courseIds}
            onSelectedIdsChange={setCourseIds}
            excludedIds={heldCourseIds}
            accessEnd={accessEnd}
            onAccessEndChange={setAccessEnd}
            error={error ?? undefined}
          />
        </div>

        <div
          className={`flex shrink-0 items-center justify-between gap-3 border-t px-6 py-4 ${line}`}
        >
          <p className="min-w-0 truncate text-xs text-(--muted)">
            {courseIds.length > 0
              ? `${courseIds.length} course${courseIds.length === 1 ? "" : "s"} · ${accessEnd ? `until ${accessEnd}` : "lifetime"}`
              : "Choose courses to open"}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={onClose}
            >
              Cancel
            </button>
            <Button
              type="submit"
              elevation="flat"
              motion="static"
              disabled={grant.isPending || courseIds.length === 0}
            >
              {grant.isPending ? "Granting…" : "Grant access"}
            </Button>
          </div>
        </div>
      </form>
    </SlideOverFrame>
  );
}
