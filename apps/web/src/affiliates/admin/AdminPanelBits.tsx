import type { ComponentType, ReactNode } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";

/**
 * The parts of a side panel's body, top to bottom: the hero (who or what it
 * is, on the header's tint), the sections (cards with a titled header and
 * divided rows), and the actions pinned to the foot.
 */

/** The header's tint, shared by the panel's top bar and the hero. */
export const panelHeaderTint =
  "bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]";

export function PanelHero({ children }: { children: ReactNode }) {
  return (
    <div
      className={`shrink-0 border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] px-5 pt-0 pb-4 ${panelHeaderTint}`}
    >
      {children}
    </div>
  );
}

/** The cards under the hero. */
export function PanelSections({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 p-4 sm:p-5">{children}</div>;
}

type IconType = ComponentType<{
  size?: number;
  weight?: "duotone" | "bold" | "regular";
  className?: string;
  "aria-hidden"?: boolean | "true";
}>;

/** A titled card: an icon and a title, then its content. */
export function PanelSection({
  title,
  icon: Icon,
  aside,
  tone = "plain",
  children,
}: {
  title: string;
  icon?: IconType;
  /** Shown at the right of the title row (a count, a small button). */
  aside?: ReactNode;
  tone?: "plain" | "warning";
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border ${
        tone === "warning"
          ? "border-amber-500/30 bg-amber-500/6"
          : "border-(--border) bg-[color-mix(in_srgb,var(--surface-strong)_40%,transparent)]"
      }`}
    >
      <header className="flex items-center gap-2 border-b border-(--border) px-4 py-2.5">
        {Icon ? (
          <Icon
            size={16}
            weight="duotone"
            aria-hidden="true"
            className={tone === "warning" ? "text-amber-500" : "text-(--muted)"}
          />
        ) : null}
        <h3 className="m-0 flex-1 text-xs font-bold tracking-wider text-(--text-secondary) uppercase">
          {title}
        </h3>
        {aside}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** Label-value rows with a line between them. */
export function PanelRows({ children }: { children: ReactNode }) {
  return (
    <dl className="m-0 -my-1 divide-y divide-[color-mix(in_srgb,var(--text)_7%,transparent)]">
      {children}
    </dl>
  );
}

export function PanelRow({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt
        className={`shrink-0 text-sm ${strong ? "font-bold text-(--text)" : "text-(--muted)"}`}
      >
        {label}
      </dt>
      <dd
        className={`m-0 min-w-0 truncate text-right text-sm text-(--text) tabular-nums ${strong ? "font-bold" : "font-medium"}`}
      >
        {children}
      </dd>
    </div>
  );
}

/** Figures in a grid of small tiles; the first can stand out. */
export function PanelStats({
  stats,
}: {
  stats: readonly {
    label: string;
    value: string;
    note?: string;
    highlight?: boolean;
  }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`min-w-0 rounded-xl border px-3 py-2 ${
            stat.highlight
              ? "border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
              : "border-(--border) bg-(--card-surface)"
          }`}
        >
          <p className="m-0 truncate text-xs font-semibold text-(--muted)">
            {stat.label}
          </p>
          <p
            className={`m-0 mt-0.5 truncate text-base font-bold tracking-tight tabular-nums ${stat.highlight ? "text-(--accent)" : "text-(--text)"}`}
            title={stat.value}
          >
            {stat.value}
          </p>
          {stat.note ? (
            <p className="m-0 truncate text-[0.6875rem] text-(--muted)">
              {stat.note}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** The actions, pinned to the panel's foot while the body scrolls. */
export function PanelActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-auto grid shrink-0 grid-cols-2 gap-2 border-t border-(--border) bg-(--card-surface,var(--surface)) p-4 pb-[max(1rem,env(safe-area-inset-bottom))] [&>*:only-child]:col-span-2">
      {children}
    </div>
  );
}

/** A code shown as a chip. */
export function CodeChip({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2 py-0.5 font-mono text-xs font-bold tracking-wide text-(--accent)">
      {code}
    </span>
  );
}

/**
 * A row of steps joined by a line: done steps ticked, the current one
 * ringed (amber with `warn`), the rest grey.
 */
export function ProgressSteps({
  steps,
  reached,
  allDone = false,
  warn = false,
}: {
  steps: readonly { label: string; note: string }[];
  /** The index of the step it stands at. */
  reached: number;
  /** Every step done, the last included. */
  allDone?: boolean;
  warn?: boolean;
}) {
  const held = warn;
  return (
    <ol
      aria-label="Progress"
      className="m-0 mt-4 flex list-none items-start p-0"
    >
      {steps.map((step, index) => {
        // Steps before this one are done; this one is where it stands (a
        // paid commission has every step done).
        const complete =
          index < reached || (allDone && index === steps.length - 1);
        const current = index === reached && !complete;
        const ring = held
          ? "border-amber-500 text-amber-500"
          : "border-(--accent) text-(--accent)";
        return (
          <li
            key={step.label}
            aria-current={current ? "step" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center text-center"
          >
            {/* The line to the previous step and to the next. */}
            {index > 0 && (
              <span
                aria-hidden="true"
                className={`absolute top-3 right-1/2 left-0 h-1 -translate-y-1/2 ${index <= reached ? "bg-(--accent)" : "bg-[color-mix(in_srgb,var(--text)_18%,transparent)]"}`}
              />
            )}
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`absolute top-3 right-0 left-1/2 h-1 -translate-y-1/2 ${index < reached ? "bg-(--accent)" : "bg-[color-mix(in_srgb,var(--text)_18%,transparent)]"}`}
              />
            )}
            <span
              aria-hidden="true"
              className={`relative z-10 grid size-6 place-items-center rounded-full ${
                complete
                  ? "bg-(--accent) text-(--on-accent)"
                  : current
                    ? `border-[2.5px] bg-(--card-surface) ${ring}`
                    : "border-2 border-[color-mix(in_srgb,var(--text)_22%,transparent)] bg-(--card-surface)"
              }`}
            >
              {complete ? (
                <Check size={12} weight="bold" />
              ) : current ? (
                <span
                  className={`size-2 rounded-full ${held ? "bg-amber-500" : "bg-(--accent)"}`}
                />
              ) : null}
            </span>
            <span
              className={`mt-1.5 block max-w-full truncate px-0.5 text-[0.6875rem] font-bold tracking-wide uppercase ${
                current
                  ? held
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-(--accent)"
                  : complete
                    ? "text-(--text)"
                    : "text-(--muted)"
              }`}
            >
              {step.label}
            </span>
            <span className="block max-w-full truncate px-0.5 text-[0.6875rem] text-(--muted)">
              {step.note || "\u00a0"}
            </span>
            <span className="sr-only">
              {complete ? "done" : current ? "now" : "to come"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
