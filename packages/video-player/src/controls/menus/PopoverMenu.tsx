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
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { classNames } from "../../utils/classNames";
import { getPlayerThemeStyle } from "../../themes/playerThemes";
import { usePlayerTheme } from "../../themes/PlayerThemeContext";

export type PopoverMenuSide = "top" | "bottom";
export type PopoverMenuAlign = "start" | "end";
export type PopoverMenuMobilePresentation = "popover" | "sheet";

export interface PopoverMenuRenderContext {
  close: () => void;
}

export interface PopoverMenuProps {
  /** Accessible name used by both the trigger and menu when no menuLabel is set. */
  label: string;
  trigger: ReactNode;
  children: ReactNode | ((context: PopoverMenuRenderContext) => ReactNode);
  menuLabel?: string;
  mobilePresentation?: PopoverMenuMobilePresentation;
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
  "player-menu-trigger inline-flex min-h-9 max-w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-[background-color,border-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text) disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm";

const panelClass =
  "absolute z-70 max-h-[min(70vh,24rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border border-[color-mix(in_srgb,var(--text,#fff)_16%,transparent)] bg-[color-mix(in_srgb,var(--surface,#0b0b0b)_78%,transparent)] p-1.5 text-(--text) shadow-[0_16px_40px_rgba(0,0,0,0.38)] backdrop-blur-md focus:outline-none";

const mobileSheetPanelClass =
  "fixed inset-x-0 bottom-0 z-180 flex max-h-[min(82dvh,36rem)] w-full flex-col overflow-hidden rounded-t-2xl border-t border-[color-mix(in_srgb,var(--text,#fff)_16%,transparent)] bg-[color-mix(in_srgb,var(--surface,#0b0b0b)_86%,transparent)] text-(--text) shadow-[0_-18px_48px_rgba(0,0,0,0.38)] backdrop-blur-md focus:outline-none";

const mobileSheetQuery = "(max-width: 640px)";

const subscribeToMobileSheetViewport = (onStoreChange: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mediaQuery = window.matchMedia(mobileSheetQuery);
  mediaQuery.addEventListener?.("change", onStoreChange);
  return () => mediaQuery.removeEventListener?.("change", onStoreChange);
};

const getMobileSheetViewportSnapshot = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(mobileSheetQuery).matches;

const getMobileSheetViewportServerSnapshot = () => false;

export function PopoverMenu({
  align = "end",
  children,
  className,
  defaultOpen = false,
  disabled = false,
  label,
  menuLabel,
  mobilePresentation = "popover",
  onOpenChange,
  open: controlledOpen,
  panelClassName,
  side = "top",
  trigger,
  triggerClassName,
}: PopoverMenuProps) {
  const theme = usePlayerTheme();
  const CloseIcon = theme.icons.close;
  const generatedId = useId();
  const menuId = `video-player-menu-${generatedId.replaceAll(":", "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<InitialFocus>("selected");
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = controlledOpen ?? internalOpen;
  const mobileSheetViewport = useSyncExternalStore(
    subscribeToMobileSheetViewport,
    getMobileSheetViewportSnapshot,
    getMobileSheetViewportServerSnapshot,
  );
  const isMobileSheet = mobilePresentation === "sheet" && mobileSheetViewport;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  const closeMenu = useCallback(() => setOpen(false), [setOpen]);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen]);

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
  }, [getItems, isMobileSheet, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        if (isMobileSheet) closeAndRestoreFocus();
        else closeMenu();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [closeAndRestoreFocus, closeMenu, isMobileSheet, isOpen]);

  useEffect(() => {
    if (!isOpen || !isMobileSheet) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileSheet, isOpen]);

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
      closeAndRestoreFocus();
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
      closeMenu();
    }
  };

  const handleMenuClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const item = target.closest<HTMLElement>(menuItemSelector);
    if (item && !item.hasAttribute("data-menu-keep-open")) {
      closeAndRestoreFocus();
    }
  };

  const positionClass = classNames(
    side === "top" ? "bottom-full mb-2" : "top-full mt-2",
    align === "start" ? "left-0" : "right-0",
  );
  const resolvedMenuLabel = menuLabel ?? label;
  const panel = isOpen ? (
    <div
      ref={panelRef}
      id={menuId}
      role={isMobileSheet ? "dialog" : "menu"}
      tabIndex={-1}
      aria-label={isMobileSheet ? undefined : resolvedMenuLabel}
      aria-labelledby={isMobileSheet ? `${menuId}-title` : undefined}
      aria-modal={isMobileSheet || undefined}
      data-video-player-mobile-sheet={isMobileSheet ? "" : undefined}
      data-video-player-menu-panel=""
      data-player-theme={theme.id}
      style={getPlayerThemeStyle(theme)}
      className={classNames(
        isMobileSheet
          ? mobileSheetPanelClass
          : classNames(panelClass, positionClass),
        panelClassName,
      )}
      onClick={handleMenuClick}
      onKeyDown={handleMenuKeyDown}
    >
      {isMobileSheet ? (
        <div className="flex min-h-14 shrink-0 items-center justify-between border-b border-[color-mix(in_srgb,var(--text,#fff)_10%,transparent)] px-4">
          <div
            id={`${menuId}-title`}
            className="text-base font-semibold text-(--text)"
          >
            {resolvedMenuLabel}
          </div>
          <button
            type="button"
            className="grid size-11 shrink-0 place-items-center rounded-full text-(--text-secondary) transition-colors hover:bg-[color-mix(in_srgb,var(--text,#fff)_10%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--text)"
            aria-label={`Close ${resolvedMenuLabel.toLowerCase()}`}
            onClick={closeAndRestoreFocus}
          >
            <CloseIcon size={20} />
          </button>
        </div>
      ) : null}
      {isMobileSheet ? (
        <div
          role="menu"
          aria-label={resolvedMenuLabel}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          {typeof children === "function"
            ? children({ close: closeMenu })
            : children}
        </div>
      ) : typeof children === "function" ? (
        children({ close: closeMenu })
      ) : (
        children
      )}
    </div>
  ) : null;
  const menuLayer =
    isOpen && isMobileSheet && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              aria-hidden="true"
              data-video-player-mobile-sheet-backdrop=""
              className="fixed inset-0 z-170 bg-black/60"
            />
            {panel}
          </>,
          document.body,
        )
      : panel;

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
        aria-haspopup={isMobileSheet ? "dialog" : "menu"}
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

      {menuLayer}
    </div>
  );
}
