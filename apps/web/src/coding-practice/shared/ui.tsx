import type { ReactNode } from "react";

/**
 * The look coding practice shares with the lesson quiz: no card inside the
 * lesson card, hairlines from the text colour, status colours mixed with
 * the text colour so they read on every palette in light and dark.
 */
export const HAIRLINE =
  "border-[color-mix(in_srgb,var(--text)_9%,transparent)]";
export const CODE_TONES =
  "[--code-pass:color-mix(in_srgb,var(--success,#22c55e)_50%,var(--text))] [--code-fail:color-mix(in_srgb,var(--danger,#f43f5e)_68%,var(--text))] [--code-warn:color-mix(in_srgb,#f59e0b_50%,var(--text))]";
export const EYEBROW =
  "text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-(--accent-ink,var(--accent))";
export const RAISED =
  "bg-(--card-surface-raised,var(--surface-strong)) ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_7%,transparent)]";
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";
export const MONO = "font-mono";

export interface PanelTab<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  /** A count or status after the label ("3/5"). */
  badge?: ReactNode;
  disabled?: boolean;
}

/**
 * A row of tabs. Arrow keys move between them, as screen-reader users
 * expect of a tablist; the panel it controls is `${idPrefix}-panel`.
 */
export function PanelTabs<T extends string>({
  tabs,
  active,
  onChange,
  idPrefix,
  label,
  className = "",
  trailing,
}: {
  tabs: PanelTab<T>[];
  active: T;
  onChange: (id: T) => void;
  idPrefix: string;
  label: string;
  className?: string;
  trailing?: ReactNode;
}) {
  const enabled = tabs.filter((tab) => !tab.disabled);
  return (
    <div
      className={`flex min-h-11 items-center gap-1 overflow-x-auto border-b px-2 [scrollbar-width:none] ${HAIRLINE} ${className}`}
    >
      <div
        role="tablist"
        aria-label={label}
        className="flex items-center gap-1"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`${idPrefix}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                  return;
                event.preventDefault();
                const index = enabled.findIndex((item) => item.id === active);
                const next =
                  enabled[
                    (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      enabled.length) %
                      enabled.length
                  ];
                if (next) {
                  onChange(next.id);
                  document
                    .getElementById(`${idPrefix}-tab-${next.id}`)
                    ?.focus();
                }
              }}
              className={`inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem]! font-semibold! whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${FOCUS_RING} ${
                selected
                  ? "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text)"
                  : "text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge}
            </button>
          );
        })}
      </div>
      {trailing ? (
        <div className="ml-auto flex items-center gap-1">{trailing}</div>
      ) : null}
    </div>
  );
}

/** A small round icon button, as the lesson toolbar's. */
export function IconAction({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-45 ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}

export function DifficultyLabel({
  difficulty,
}: {
  difficulty: "easy" | "medium" | "hard";
}) {
  const tone =
    difficulty === "easy"
      ? "text-(--code-pass) bg-[color-mix(in_srgb,var(--code-pass)_13%,transparent)]"
      : difficulty === "medium"
        ? "text-(--code-warn) bg-[color-mix(in_srgb,var(--code-warn)_14%,transparent)]"
        : "text-(--code-fail) bg-[color-mix(in_srgb,var(--code-fail)_13%,transparent)]";
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold capitalize ${CODE_TONES} ${tone}`}
    >
      {difficulty}
    </span>
  );
}

/**
 * The app's text field, as the quiz builder and course editor draw it. The
 * size needs `!`: a global `button, input { font: inherit }` outranks
 * utilities. 16px on phones stops iOS zooming in on focus.
 */
export const FIELD =
  "w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-3 text-base! sm:text-sm! text-(--text) outline-none transition-[border-color,box-shadow] placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20 disabled:opacity-60";

/** Trigger of a ThemedSelect, matching FIELD (it otherwise takes the font of its parent). */
export const SELECT_TRIGGER =
  "h-10! rounded-[10px]! border! border-[color-mix(in_srgb,var(--text)_12%,transparent)]! bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))]! px-3! text-sm! font-medium! text-(--text)! focus:border-(--accent)!";

export const KIND_LABELS = {
  function: "Function (tested with calls)",
  web: "Web page (HTML, CSS, JS)",
  react: "React component",
  node: "Node.js (modules, events, fs)",
} as const;

/** Short labels for lists. */
export const KIND_SHORT = {
  function: "Function",
  web: "Web page",
  react: "React",
  node: "Node.js",
} as const;

/** What the language of an exercise is, from its entry file. */
export function languageOf(entryFile: string) {
  return /\.tsx?$/.test(entryFile) ? "TypeScript" : "JavaScript";
}
