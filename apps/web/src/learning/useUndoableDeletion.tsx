import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";

export interface UndoDeleteButtonProps {
  name: string;
  seconds: number;
  onUndo: () => void;
  className?: string;
}

export function UndoDeleteButton({
  name,
  seconds,
  onUndo,
  className = "",
}: UndoDeleteButtonProps) {
  return (
    <button
      type="button"
      data-undo-delete
      aria-label={`Undo deletion of ${name}'s entry`}
      onClick={onUndo}
      className={`${className} z-30 inline-flex h-9 items-center gap-2 rounded-full bg-(--surface-elevated,var(--surface)) px-3 text-xs font-semibold text-(--text) shadow-[0_10px_30px_rgba(0,0,0,0.28),0_0_0_1px_color-mix(in_srgb,var(--accent)_38%,transparent)] transition-[background-color,box-shadow] hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)`}
    >
      <ArrowCounterClockwise
        size={16}
        weight="bold"
        className="text-(--accent-ink,var(--accent))"
        aria-hidden="true"
      />
      <span>Undo</span>
      <span className="min-w-5 text-right font-medium tabular-nums text-(--muted)">
        {seconds}s
      </span>
    </button>
  );
}
