import { useEffect, useState, type ReactNode } from "react";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { XIcon as X } from "@phosphor-icons/react/X";

import { SlideOverFrame } from "../../components/SlideOverPanel";
import { Drawer, DrawerContent } from "../../components/ui/drawer";
import {
  useSidePanelVariant,
  type SidePanelVariant,
} from "../../components/useSidePanelVariant";
import { useBackDismiss } from "../../navigation/useBackDismiss";
import { panelHeaderTint } from "./AdminPanelBits";

export interface AdminPanelStep {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** "3 of 34" among the page's rows. */
  position: { index: number; total: number } | null;
}

export interface AdminSidePanelProps {
  /** The open row's id; none while the panel is closed. */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  /** Names the panel ("Affiliate"). */
  label: string;
  /** Where the desktop panel's width is remembered. */
  storageKey: string;
  /** What the bar shows on its right (a code, a number). */
  heading?: ReactNode;
  step?: AdminPanelStep;
  /** The body, in boxes. */
  children: ReactNode;
  /** Buttons at the foot, two to a row. */
  footer?: ReactNode;
}

/**
 * The open row of a list: a full-height panel from the right on a computer
 * or tablet, a sheet from the bottom on a phone.
 */
export function AdminSidePanel(props: AdminSidePanelProps) {
  const variant = useSidePanelVariant();
  usePanelKeys(props);
  if (!props.openId) return null;
  if (variant === "phone") return <PhonePanel {...props} />;
  return <TabletPanel {...props} variant={variant} />;
}

/** Esc closes; ← and → step through the page. Left to a field or menu. */
function usePanelKeys({ openId, onOpenChange, step }: AdminSidePanelProps) {
  useEffect(() => {
    if (!openId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=true], [role=menu], [role=listbox]",
        ) ||
        document.querySelector("dialog[open], [role=alertdialog]")
      )
        return;
      if (event.key === "Escape") onOpenChange(null);
      else if (event.key === "ArrowLeft" && step?.hasPrev) step.onPrev();
      else if (event.key === "ArrowRight" && step?.hasNext) step.onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openId, onOpenChange, step]);
}

const ghostIcon =
  "grid size-8 shrink-0 place-items-center rounded-lg text-(--muted) hover:text-(--text) transition-colors hover:bg-(--hover) disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-(--accent)";

function PanelContent({
  label,
  heading,
  step,
  children,
  footer,
  variant,
  onClose,
}: AdminSidePanelProps & {
  variant: SidePanelVariant;
  onClose?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`flex h-14 shrink-0 items-center gap-1.5 px-3 ${panelHeaderTint}`}
      >
        {step && (
          <>
            <button
              type="button"
              onClick={step.onPrev}
              disabled={!step.hasPrev}
              aria-label="Previous"
              title="Previous (←)"
              className={ghostIcon}
            >
              <CaretLeft size={14} weight="bold" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={step.onNext}
              disabled={!step.hasNext}
              aria-label="Next"
              title="Next (→)"
              className={ghostIcon}
            >
              <CaretRight size={14} weight="bold" aria-hidden="true" />
            </button>
            {step.position && (
              <span className="ml-1 text-xs whitespace-nowrap text-(--muted) tabular-nums">
                {step.position.index} of {step.position.total}
              </span>
            )}
          </>
        )}
        <span className="ml-auto min-w-0 truncate px-2 text-xs font-semibold text-(--muted)">
          {heading}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${label.toLowerCase()}`}
            title="Close (Esc)"
            className={ghostIcon}
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        {children}
      </div>
      {footer ? (
        <div
          className={`grid shrink-0 grid-cols-2 gap-2 border-t border-(--border) p-3 ${variant === "phone" ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : ""}`}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/** A list and its open row's panel side by side (the panel only when open). */
export function AdminWithPanel({
  panel,
  children,
}: {
  panel: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-5">{children}</div>
      {panel}
    </div>
  );
}

/**
 * The app's side panel (as Team's and the invite panel): the window's full
 * height, over the page from the right, with the list dimmed behind it.
 */
function TabletPanel(
  props: AdminSidePanelProps & { variant: SidePanelVariant },
) {
  const { onOpenChange, label } = props;
  const close = () => onOpenChange(null);
  // The panel covers the page, so Back closes it rather than leaving.
  useBackDismiss({ open: true, onDismiss: close });
  return (
    <SlideOverFrame
      label={label}
      onClose={close}
      className="w-full max-w-[min(34rem,calc(100vw-3rem))] min-w-[min(22rem,100vw)]"
      backdropClassName="bg-black/40"
    >
      <PanelContent {...props} onClose={close} />
    </SlideOverFrame>
  );
}

function PhonePanel(props: AdminSidePanelProps) {
  const { onOpenChange, label } = props;
  const [open, setOpen] = useState(true);
  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setOpen(false);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onOpenChange(null);
      }}
      showSwipeHandle
    >
      <DrawerContent
        aria-label={label}
        finalFocus={false}
        className="bg-(--surface) data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-2.5rem)]"
      >
        <PanelContent {...props} variant="phone" />
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Steps through the rows of the page shown: the open row's neighbours.
 */
export function usePanelStep<Row extends { id: string }>(
  rows: readonly Row[],
  openId: string | null,
  open: (id: string) => void,
  offset: number,
  total: number,
): AdminPanelStep {
  const index = openId ? rows.findIndex((row) => row.id === openId) : -1;
  return {
    hasPrev: index > 0,
    hasNext: index >= 0 && index < rows.length - 1,
    onPrev: () => {
      const row = rows[index - 1];
      if (row) open(row.id);
    },
    onNext: () => {
      const row = rows[index + 1];
      if (row) open(row.id);
    },
    position: index >= 0 ? { index: offset + index + 1, total } : null,
  };
}
