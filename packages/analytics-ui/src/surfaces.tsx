import type { ReactNode } from "react";

/**
 * An analytics card. Painted from the shared card tokens (`--card-surface`,
 * `--card-shadow`), which the academy shell points at its elevated card's
 * fill and shadow, so a card here matches the application's `ElevatedCard`
 * without importing it: this package is shared with plugins that cannot
 * reach into the web app. `data-fixed-radius` keeps the roundness
 * preference from shrinking the corners.
 */
export const analyticsCardClasses =
  "rounded-2xl border-0 bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-shadow,none)";

export const analyticsCardProps = {
  "data-fixed-radius": true,
  className: analyticsCardClasses,
} as const;

export const kpiGridClass =
  "grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 xl:grid-cols-6";

export const hairlineClass =
  "border-[color-mix(in_srgb,var(--text)_8%,transparent)]";

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 border-b ${hairlineClass} px-3 py-2.5 sm:px-6 sm:py-4`}
    >
      <div className="min-w-0">
        <h2 className="text-base sm:text-lg font-bold tracking-tight text-(--text)">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-(--muted)">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A titled card with the content inset; the one section shape every tab uses. */
export function ChartSection({
  title,
  description,
  children,
  action,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      data-fixed-radius
      className={`${analyticsCardClasses} flex flex-col ${className}`}
    >
      <SectionHeading title={title} description={description} action={action} />
      <div className={`p-3 sm:p-6 pt-2 sm:pt-4 ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`grid place-items-center text-center ${compact ? "p-5 sm:p-7" : "p-6 sm:p-12"}`}
    >
      <span className="flex size-10 sm:size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
        {icon}
      </span>
      <h3 className="mt-2.5 sm:mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-(--muted)">
        {message}
      </p>
      {action ? <div className="mt-3.5 sm:mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingRows() {
  return (
    <div className="grid gap-2.5 sm:gap-3 p-3 sm:p-7">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-16 animate-pulse rounded-xl bg-(--canvas)"
        />
      ))}
    </div>
  );
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="h-56 animate-pulse rounded-xl bg-(--canvas)"
        />
      ))}
    </>
  );
}

/** The KPI row and two chart rows, as grey blocks, while a tab loads. */
export function LoadingTab() {
  return (
    <div className="grid gap-3.5 sm:gap-6" aria-busy="true">
      <div className={kpiGridClass}>
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-28 sm:h-36 animate-pulse rounded-2xl bg-(--canvas)"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-(--canvas)" />
      <div className="grid gap-3.5 sm:gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-(--canvas)" />
        <div className="h-64 animate-pulse rounded-2xl bg-(--canvas)" />
      </div>
    </div>
  );
}
