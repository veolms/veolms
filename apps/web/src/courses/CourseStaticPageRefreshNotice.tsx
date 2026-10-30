import {
  useCourseStaticPageRefreshStatus,
  useRetryCourseStaticPageRefresh,
} from "../services/courses";

export function CourseStaticPageRefreshNotice({
  courseId,
}: {
  courseId: string | null;
}) {
  const statusQuery = useCourseStaticPageRefreshStatus(courseId);
  const retryMutation = useRetryCourseStaticPageRefresh();
  const status = statusQuery.data;

  if (
    !courseId ||
    !status ||
    status.status === "idle" ||
    (status.status === "failed" &&
      status.message?.startsWith("Course page refresh is not configured."))
  ) {
    return null;
  }

  const busy = status.status === "queued" || status.status === "running";
  const text =
    status.status === "queued"
      ? "Public course pages are queued to update."
      : status.status === "running"
        ? "Updating public course pages…"
        : status.status === "succeeded"
          ? "Public course pages are up to date."
          : (status.message ?? "Public course pages could not be updated.");

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm"
      role={status.status === "failed" ? "alert" : "status"}
      aria-live={status.status === "failed" ? "assertive" : "polite"}
    >
      <span className="min-w-0 text-(--text-secondary)">{text}</span>
      <span className="flex shrink-0 items-center gap-3">
        {status.runUrl ? (
          <a
            href={status.runUrl}
            target="_blank"
            rel="noreferrer"
            className="text-(--accent) underline"
          >
            View deployment
          </a>
        ) : null}
        {status.status === "failed" ? (
          <button
            type="button"
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate(courseId)}
            className="rounded-lg border border-(--border) px-3 py-1.5 font-semibold text-(--text) disabled:cursor-wait disabled:opacity-60"
          >
            {retryMutation.isPending ? "Retrying…" : "Retry"}
          </button>
        ) : null}
      </span>
    </div>
  );
}
