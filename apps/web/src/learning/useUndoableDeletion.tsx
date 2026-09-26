import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";

export interface UndoDeleteButtonProps {
  name: string;
  seconds: number;
  onUndo: () => void;
  className?: string;
  compact?: boolean;
}

export function UndoDeleteButton({
  name,
  seconds,
  onUndo,
  className = "",
  compact = false,
}: UndoDeleteButtonProps) {
  return (
    <button
      type="button"
      data-undo-delete
      aria-label={`Undo deletion of ${name}'s entry`}
      onClick={onUndo}
      className={`${className} z-30 inline-flex h-9 items-center ${compact ? "gap-1.5 px-2.5" : "gap-2 px-3"} rounded-full bg-(--surface-elevated,var(--surface)) text-xs font-semibold text-(--text) shadow-[0_10px_30px_rgba(0,0,0,0.28),0_0_0_1px_color-mix(in_srgb,var(--accent)_38%,transparent)] transition-[background-color,box-shadow] hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)`}
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
