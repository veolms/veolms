export function StudentDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-48 rounded-[14px] sm:rounded-[24px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-6 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-24 rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-4 animate-pulse"
          />
        ))}
      </div>
      <div className="h-64 rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-6 animate-pulse" />
    </div>
  );
}
