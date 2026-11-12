import type { ReactNode } from "react";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle } from "../../components/ui/drawer";
import { useSidePanelVariant } from "../../components/useSidePanelVariant";

export const filterTriggerClasses =
  "inline-flex h-11 min-w-0 items-center gap-2 rounded-xl border border-(--border) bg-(--card-surface) px-3.5 text-sm font-semibold text-(--text) transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) data-[open]:border-(--accent) data-[open]:bg-[color-mix(in_srgb,var(--accent)_10%,var(--card-surface))]";

export interface FilterDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the button shows (its label, a dot). */
  trigger: ReactNode;
  /** Names the control for assistive tech and titles the phone sheet. */
  label: string;
  triggerClassName?: string;
  /** Hide the ▾ (for an icon-only button). */
  hideCaret?: boolean;
  align?: "start" | "center" | "end";
  contentClassName?: string;
  children: ReactNode;
}

/**
 * A filter's button and what it opens: a dropdown under the button on a
 * tablet or a computer, a sheet from the bottom on a phone, where a
 * dropdown would be cramped.
 */
export function FilterDropdown({
  open,
  onOpenChange,
  trigger,
  label,
  triggerClassName = "",
  hideCaret = false,
  align = "start",
  contentClassName = "",
  children,
}: FilterDropdownProps) {
  const phone = useSidePanelVariant() === "phone";
  const buttonContent = (
    <>
      {trigger}
      {!hideCaret && (
        <CaretDown
          size={13}
          weight="bold"
          aria-hidden="true"
          className="ml-auto shrink-0 text-(--muted)"
        />
      )}
    </>
  );

  if (phone) {
    return (
      <>
        <button
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-open={open ? "" : undefined}
          onClick={() => onOpenChange(true)}
          className={`${filterTriggerClasses} ${triggerClassName}`}
        >
          {buttonContent}
        </button>
        <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
          <DrawerContent
            aria-label={label}
            className="bg-(--surface) data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-2.5rem)]"
          >
            <DrawerTitle className="sr-only">{label}</DrawerTitle>
            <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
              {children}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        aria-label={label}
        className={`${filterTriggerClasses} ${triggerClassName}`}
      >
        {buttonContent}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={`flex max-w-[calc(100vw-1rem)] flex-col overflow-hidden ${contentClassName}`}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
