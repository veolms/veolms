import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { classNames } from "../../utils/classNames";
import { getPlayerThemeStyle } from "../../themes/playerThemes";
import { usePlayerTheme } from "../../themes/PlayerThemeContext";
import { usePlayerMobileInteraction } from "../../react/PlayerInteractionMode";

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
  /** Optional fullscreen-local host for a mobile sheet. Defaults to document.body. */
  mobileSheetPortalTarget?: HTMLElement | null;
  /** Classes applied only when the mobile sheet presentation is active. */
  mobileSheetPanelClassName?: string;
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
  "absolute z-70 max-h-[min(70vh,24rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border-0 bg-[color-mix(in_srgb,var(--video-player-menu-surface,rgb(11_11_13_/_0.88))_78%,transparent)] p-1.5 text-(--video-player-menu-text) shadow-[0_16px_40px_rgba(0,0,0,0.38)] focus:outline-none";

const mobileSheetPanelClass =
  "pointer-events-auto inset-x-0 bottom-0 z-180 flex max-h-[min(82dvh,36rem)] w-full flex-col overflow-hidden rounded-t-2xl border-0 text-(--video-player-menu-text) shadow-[0_-18px_48px_rgba(0,0,0,0.38)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus:outline-none motion-reduce:transition-none";

const mobileSheetDismissDistance = 72;

export function PopoverMenu({
  align = "end",
  children,
  className,
  defaultOpen = false,
  disabled = false,
  label,
  menuLabel,
  mobilePresentation = "popover",
  mobileSheetPanelClassName,
  mobileSheetPortalTarget,
  onOpenChange,
  open: controlledOpen,
  panelClassName,
  side = "top",
  trigger,
  triggerClassName,
}: PopoverMenuProps) {
  const theme = usePlayerTheme();
  const mobileInteraction = usePlayerMobileInteraction();
  const generatedId = useId();
  const menuId = `video-player-menu-${generatedId.replaceAll(":", "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<InitialFocus>("selected");
  const mobileSheetDragRef = useRef<{
    pointerId: number;
    startY: number;
  } | null>(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [mobileSheetDragOffset, setMobileSheetDragOffset] = useState(0);
  const [mobileSheetDragging, setMobileSheetDragging] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = controlledOpen ?? internalOpen;
  const isMobileSheet = mobilePresentation === "sheet" && mobileInteraction;
  const isContainedMobileSheet =
    isMobileSheet && Boolean(mobileSheetPortalTarget);

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
    if (!isOpen || isMobileSheet) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        closeMenu();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [closeMenu, isMobileSheet, isOpen]);

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
    mobileSheetDragRef.current = null;
    setMobileSheetDragOffset(0);
    setMobileSheetDragging(false);
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

  const handleMobileSheetDragStart = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    mobileSheetDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
    };
    setMobileSheetDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleMobileSheetDragMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const drag = mobileSheetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setMobileSheetDragOffset(Math.max(0, event.clientY - drag.startY));
  };

  const finishMobileSheetDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const drag = mobileSheetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    mobileSheetDragRef.current = null;
    setMobileSheetDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    const dragDistance = Math.max(0, event.clientY - drag.startY);
    if (!cancelled && dragDistance >= mobileSheetDismissDistance) {
      closeAndRestoreFocus();
      return;
    }
    setMobileSheetDragOffset(0);
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
      style={{
        ...getPlayerThemeStyle(theme),
        transform:
          isMobileSheet && mobileSheetDragOffset > 0
            ? `translate3d(0, ${mobileSheetDragOffset}px, 0)`
            : undefined,
        transitionDuration:
          isMobileSheet && mobileSheetDragging ? "0ms" : undefined,
      }}
      className={classNames(
        isMobileSheet
          ? classNames(
              mobileSheetPanelClass,
              isContainedMobileSheet ? "absolute" : "fixed",
              mobileSheetPanelClassName,
            )
          : classNames(panelClass, positionClass),
        panelClassName,
      )}
      onClick={handleMenuClick}
      onKeyDown={handleMenuKeyDown}
    >
      {isMobileSheet ? (
        <div
          data-video-player-mobile-sheet-drag-handle=""
          className="flex min-h-16 shrink-0 touch-none cursor-grab flex-col items-center justify-center gap-2 px-4 pb-3 pt-2 active:cursor-grabbing"
          onPointerDown={handleMobileSheetDragStart}
          onPointerMove={handleMobileSheetDragMove}
          onPointerUp={finishMobileSheetDrag}
          onPointerCancel={(event) => finishMobileSheetDrag(event, true)}
        >
          <span
            aria-hidden="true"
            className="h-1 w-12 rounded-full bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_34%,transparent)]"
          />
          <div
            id={`${menuId}-title`}
            className="w-full text-center text-base font-semibold text-(--video-player-menu-text)"
          >
            {resolvedMenuLabel}
          </div>
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
              className={`${isContainedMobileSheet ? "absolute" : "fixed"} pointer-events-auto inset-0 z-170 bg-black/60 transition-opacity duration-200 ease-out motion-reduce:transition-none`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                closeAndRestoreFocus();
              }}
            />
            {panel}
          </>,
          mobileSheetPortalTarget ?? document.body,
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
        className={classNames(
          triggerClass,
          mobileInteraction && "!text-xs",
          triggerClassName,
        )}
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup={isMobileSheet ? "dialog" : "menu"}
        aria-label={label}
        data-player-control=""
        disabled={disabled}
        onClick={() => {
          initialFocusRef.current = "selected";
          if (!isOpen) {
            mobileSheetDragRef.current = null;
            setMobileSheetDragOffset(0);
            setMobileSheetDragging(false);
          }
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
