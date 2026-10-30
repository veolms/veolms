export function QuizAuthoringLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading quiz section"
      className="rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-3.5 sm:p-5"
    >
      <div className="animate-pulse motion-reduce:animate-none space-y-3">
        <div className="h-4 w-40 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
        <div className="h-9 w-full rounded-[10px] bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
        <div className="h-24 w-full rounded-[10px] bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
      </div>
      <span className="sr-only">Loading quiz data…</span>
    </div>
  );
}
