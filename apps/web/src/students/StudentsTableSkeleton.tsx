export function StudentsTableSkeleton() {
  return (
    <div
      className="rounded-[18px] border border-(--border) bg-(--card-surface-raised,var(--surface)) overflow-hidden animate-pulse"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="h-11 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)]" />
      <div className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)] p-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-(--hover)" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-32 rounded bg-(--hover)" />
                <div className="h-2.5 w-20 rounded bg-(--hover)" />
              </div>
            </div>
            <div className="h-3 w-40 rounded bg-(--hover) hidden md:block" />
            <div className="h-3 w-24 rounded bg-(--hover) hidden md:block" />
            <div className="h-7 w-20 rounded-xl bg-(--hover)" />
          </div>
        ))}
      </div>
    </div>
  );
}
