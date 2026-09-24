import type { ReactNode } from "react";

export function StatCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
  compact = false,
}: {
  icon?: ReactNode;
  label: string;
  value: number | string;
  detail?: string;
  tone?: "default" | "success" | "danger";
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) transition-all duration-200 hover:shadow-(--card-hover-shadow) ${
        compact ? "p-2 sm:p-3.5" : "p-2.5 sm:p-5"
      }`}
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
          {label}
        </p>
        {icon ? (
          <span className="flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={`mt-1.5 sm:mt-2.5 text-xl sm:text-[1.75rem] font-bold tracking-tight ${
          tone === "success"
            ? "text-emerald-500"
            : tone === "danger"
              ? "text-rose-500"
              : "text-(--text)"
        }`}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 sm:mt-1 truncate text-[0.68rem] sm:text-xs text-(--muted)">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export function MetricTile({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <p className="text-xs text-(--muted)">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

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
    <div className="flex items-start justify-between gap-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-2.5 sm:p-7">
      <div>
        <h2 className="text-base sm:text-lg font-bold tracking-tight text-(--text)">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-(--muted)">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
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

export function LoadingCards() {
  return (
    <>
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-56 animate-pulse rounded-xl bg-(--canvas)"
        />
      ))}
    </>
  );
}
