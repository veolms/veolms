import type { ReactNode, Ref } from "react";
import { createPortal } from "react-dom";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { XIcon as X } from "@phosphor-icons/react/X";

/** The header's small square buttons: previous, next, and the like. */
const slideOverIconButtonClasses =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-(--muted) hover:bg-(--hover) hover:text-(--text) hover:border-(--accent) disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer";

/** Previous and next buttons for stepping through the list behind a panel. */
export function SlideOverStepButtons({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  noun,
}: {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  noun: string;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        disabled={!hasPrev}
        onClick={onPrev}
        aria-label={`Previous ${noun}`}
        title={`Previous ${noun}`}
        className={slideOverIconButtonClasses}
      >
        <CaretLeft size={14} weight="bold" />
      </button>
      <button
        type="button"
        disabled={!hasNext}
        onClick={onNext}
        aria-label={`Next ${noun}`}
        title={`Next ${noun}`}
        className={slideOverIconButtonClasses}
      >
        <CaretRight size={14} weight="bold" />
      </button>
    </div>
  );
}

/**
 * The bare slide-over: a dimmed backdrop that closes it when pressed, and a
 * panel from the right edge, drawn at the end of `<body>` above the whole
 * shell. `SlideOverPanel` adds the standard header.
 */
export function SlideOverFrame({
  label,
  onClose,
  className = "max-w-[500px]",
  backdropClassName = "bg-black/65 backdrop-blur-xs",
  children,
}: {
  label: string;
  onClose: () => void;
  /** The panel's width limit and any extra classes. */
  className?: string;
  /** How the page behind is dimmed. */
  backdropClassName?: string;
  children: ReactNode;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={`fixed inset-0 transition-opacity animate-in fade-in duration-200 ${backdropClassName}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label={label}
        aria-modal="true"
        className={`relative z-10 flex h-full w-full flex-col border-l border-(--border) bg-(--card-surface,var(--surface)) shadow-2xl animate-in slide-in-from-right duration-200 ${className}`}
        style={{ boxShadow: "var(--card-floating-shadow,var(--card-shadow))" }}
      >
        {children}
      </aside>
    </div>,
    document.body,
  );
}

/**
 * A panel that slides over the page from the right, over a dimmed backdrop,
 * with a title and a close button: the Orders page's order details.
 * `children` is everything below the header, usually a scrolling body and a
 * footer.
 */
export function SlideOverPanel({
  label,
  title,
  onClose,
  closeLabel = "Close details",
  closeRef,
  headerActions,
  headerContent,
  className,
  children,
}: {
  label: string;
  title: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  closeRef?: Ref<HTMLButtonElement>;
  /** Buttons beside the close button, such as a menu. */
  headerActions?: ReactNode;
  /** Header rows under the title. */
  headerContent?: ReactNode;
  /** The panel's width limit, when the default 500px is too narrow. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <SlideOverFrame label={label} onClose={onClose} className={className}>
      <div className="flex flex-col border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-5 sm:p-6 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight text-(--text)">
            {title}
          </h2>
          <div className="flex items-center gap-1.5">
            {headerActions}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-(--muted) hover:bg-(--hover) hover:text-(--text) transition-colors cursor-pointer"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>
        {headerContent}
      </div>
      {children}
    </SlideOverFrame>
  );
}
