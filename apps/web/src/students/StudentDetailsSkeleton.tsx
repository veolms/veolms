export function StudentDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-48 animate-pulse rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-6 sm:rounded-[24px]" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-4 sm:rounded-[16px]"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-6" />
    </div>
  );
}
