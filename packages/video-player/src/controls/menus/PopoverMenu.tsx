import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { classNames } from "../../utils/classNames";

export type PopoverMenuSide = "top" | "bottom";
export type PopoverMenuAlign = "start" | "end";

export interface PopoverMenuRenderContext {
  close: (restoreFocus?: boolean) => void;
}

export interface PopoverMenuProps {
  /** Accessible name used by both the trigger and menu when no menuLabel is set. */
  label: string;
  trigger: ReactNode;
  children: ReactNode | ((context: PopoverMenuRenderContext) => ReactNode);
  menuLabel?: string;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  side?: PopoverMenuSide;
  align?: PopoverMenuAlign;
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type InitialFocus = "selected" | "first" | "last";

const menuItemSelector = [
  '[role="menuitem"]:not([aria-disabled="true"])',
  '[role="menuitemradio"]:not([aria-disabled="true"])',
  '[role="menuitemcheckbox"]:not([aria-disabled="true"])',
].join(",");

const triggerClass =
  "inline-flex min-h-9 max-w-full items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-black/32 px-2.5 text-xs font-medium text-white shadow-sm shadow-black/20 transition-[background-color,border-color,color] duration-150 hover:border-white/20 hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm";

const panelClass =
  "absolute z-70 max-h-[min(70vh,24rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border border-white/12 bg-black/92 p-1.5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl focus:outline-none";

export function PopoverMenu({
  align = "end",
  children,
  className,
  defaultOpen = false,
  disabled = false,
  label,
  menuLabel,
  onOpenChange,
  open: controlledOpen,
  panelClassName,
  side = "top",
  trigger,
  triggerClassName,
}: PopoverMenuProps) {
  const generatedId = useId();
  const menuId = `video-player-menu-${generatedId.replaceAll(":", "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<InitialFocus>("selected");
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = controlledOpen ?? internalOpen;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  const close = useCallback(
    (restoreFocus = false) => {
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [setOpen],
  );

  const getItems = useCallback((): HTMLElement[] => {
    if (!panelRef.current) return [];
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(menuItemSelector),
    ).filter((item) => !item.hasAttribute("disabled"));
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const items = getItems();
    if (items.length === 0) {
      panelRef.current?.focus();
      return;
    }

    const selected = items.find(
      (item) =>
        item.getAttribute("aria-checked") === "true" ||
        item.getAttribute("aria-current") === "true",
    );
    const target =
      initialFocusRef.current === "last"
        ? items.at(-1)
        : initialFocusRef.current === "first"
          ? items[0]
          : (selected ?? items[0]);
    target?.focus();
    initialFocusRef.current = "selected";
  }, [getItems, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        close(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [close, isOpen]);

  const openWithFocus = (focus: InitialFocus) => {
    initialFocusRef.current = focus;
    setOpen(true);
  };

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openWithFocus("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openWithFocus("last");
    }
  };

  const focusItem = (index: number) => {
    const items = getItems();
    if (items.length === 0) return;
    items[(index + items.length) % items.length]?.focus();
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = getItems();
    const currentIndex = items.findIndex(
      (item) => item === document.activeElement,
    );
    const navigationOwner =
      event.target instanceof Element &&
      event.target.closest("input, textarea, select, [role='slider']");

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (navigationOwner) {
      return;
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(currentIndex < 0 ? 0 : currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(currentIndex < 0 ? items.length - 1 : currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(items.length - 1);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  const handleMenuClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const item = target.closest<HTMLElement>(menuItemSelector);
    if (item && !item.hasAttribute("data-menu-keep-open")) close(true);
  };

  const positionClass = classNames(
    side === "top" ? "bottom-full mb-2" : "top-full mt-2",
    align === "start" ? "left-0" : "right-0",
  );

  return (
    <div
      ref={rootRef}
      className={classNames("relative inline-flex", className)}
    >
      <button
        ref={triggerRef}
        type="button"
        className={classNames(triggerClass, triggerClassName)}
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          initialFocusRef.current = "selected";
          setOpen(!isOpen);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {trigger}
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label={menuLabel ?? label}
          className={classNames(panelClass, positionClass, panelClassName)}
          onClick={handleMenuClick}
          onKeyDown={handleMenuKeyDown}
        >
          {typeof children === "function" ? children({ close }) : children}
        </div>
      ) : null}
    </div>
  );
}
