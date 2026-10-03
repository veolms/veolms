import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";

export function PageBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Go back to the previous page"
      title="Go back"
      onClick={onClick}
      className="inline-flex size-9 shrink-0 items-center justify-center self-center rounded-xl border border-(--border) bg-(--card-surface) text-(--muted) shadow-sm transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
    >
      <ArrowLeft size={18} weight="bold" aria-hidden="true" />
    </button>
  );
}
