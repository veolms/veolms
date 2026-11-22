import { useState, type ReactNode } from "react";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";

/**
 * The compact lesson card's practice, next to its "Add Quiz": a button that
 * opens the lecture's Practice panel in place. Kept behind the click so it
 * cannot slow opening a lesson.
 */
export function InlineLessonPractice({
  panel,
  disabled,
}: {
  panel: ReactNode;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <div className="pt-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 text-xs font-semibold text-(--accent-ink,var(--accent)) transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CodeGlyph size={15} weight="bold" aria-hidden="true" />
          Coding practice
        </button>
      </div>
    );
  return (
    <div className="flex flex-col gap-3 pt-4">
      <div className="flex justify-end">
        <button
          type="button"
          className="inline-flex min-h-8 items-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-transparent px-2.5 text-xs font-semibold text-(--muted) transition-colors hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:text-(--text)"
          onClick={() => setOpen(false)}
        >
          Close practice
        </button>
      </div>
      {panel}
    </div>
  );
}
