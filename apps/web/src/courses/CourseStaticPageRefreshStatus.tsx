import {
  usePublicCoursePageRefreshStatus,
  useRetryPublicCoursePageRefresh,
} from "../services/courses";

export function CourseStaticPageRefreshStatus({
  courseId,
}: {
  courseId: string | null;
}) {
  const statusQuery = usePublicCoursePageRefreshStatus(courseId);
  const retryMutation = useRetryPublicCoursePageRefresh();
  const status = statusQuery.data;

  if (!courseId || !status || status.status === "idle") return null;

  const isActive = status.status === "queued" || status.status === "running";
  const isFailed = status.status === "failed";

  return (
    <div
      className={`mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        isFailed
          ? "border-red-500/30 bg-red-500/8 text-red-300"
          : status.status === "succeeded"
            ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-300"
            : "border-(--accent)/25 bg-(--accent)/6 text-(--text)"
      }`}
      role={isFailed ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="min-w-0 flex-1">
        <p className="m-0 font-semibold">
          {isFailed
            ? "Public course page update failed"
            : status.status === "queued"
              ? "Public course page update queued"
              : status.status === "running"
                ? "Publishing public course pages…"
                : "Public course pages updated"}
        </p>
        <p className="m-0 mt-1 break-words text-xs text-(--muted)">
          {isFailed
            ? `${status.message ?? "The course was saved, but its public pages could not be updated."} The course data remains saved.`
            : status.message}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {status.runUrl ? (
          <a
            href={status.runUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-(--accent) underline underline-offset-2"
          >
            View deploy
          </a>
        ) : null}
        {isFailed ? (
          <button
            type="button"
            className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate(courseId)}
          >
            {retryMutation.isPending ? "Retrying…" : "Retry publish"}
          </button>
        ) : null}
        {isActive ? (
          <span
            className="size-4 animate-spin rounded-full border-2 border-current/25 border-t-current motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {retryMutation.isError ? (
        <p className="m-0 w-full text-xs text-red-300" role="alert">
          Retry could not be queued: {retryMutation.error.message}
        </p>
      ) : null}
    </div>
  );
}
