import {
  type CSSProperties,
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
import { playerRectOf, toPlayerPoint } from "../../react/pageFullscreen";
import { usePlayerTheme } from "../../themes/PlayerThemeContext";
import { usePlayerMobileInteraction } from "../../react/PlayerInteractionMode";

export type PopoverMenuSide = "top" | "bottom";
export type PopoverMenuAlign = "start" | "end";
export type PopoverMenuMobilePresentation = "popover" | "sheet";

export interface PopoverMenuRenderContext {
  close: () => void;
  /** The menu is the bottom sheet, which draws its own title. */
  sheet: boolean;
}

export interface PopoverMenuProps {
  /** Accessible name used by both the trigger and menu when no menuLabel is set. */
  label: string;
  trigger: ReactNode;
  children: ReactNode | ((context: PopoverMenuRenderContext) => ReactNode);
  menuLabel?: string;
  /** What the sheet shows as its title (default: the menu label). */
  sheetTitle?: ReactNode;
  /**
   * `side` fills the player's height along its right edge instead of
   * opening beside the trigger; `corner` opens above the trigger's row but
   * against the player's right edge, so it stays put wherever the trigger
   * is (neither applies to the sheet).
   */
  placement?: "anchored" | "corner" | "side";
  mobilePresentation?: PopoverMenuMobilePresentation;
  /**
   * Uses the sheet outside the phone layout too (only with
   * `mobilePresentation="sheet"`): for a player too short to hold the
   * popover.
   */
  forceSheet?: boolean;
  /** Optional fullscreen-local host for a mobile sheet. Defaults to document.body. */
  mobileSheetPortalTarget?: HTMLElement | null;
  /** Classes applied only when the mobile sheet presentation is active. */
  mobileSheetPanelClassName?: string;
  /** Inline styles applied only when the mobile sheet presentation is active. */
  mobileSheetStyle?: CSSProperties;
  /**
   * Lets the mobile sheet be dragged up from its resting height to fill the
   * screen, and back down again, like a drawer with two snap points.
   */
  mobileSheetExpandable?: boolean;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  side?: PopoverMenuSide;
  align?: PopoverMenuAlign;
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  /** Whether activating a menu item dismisses the menu. */
  closeOnItemSelect?: boolean;
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
  "absolute z-200 max-h-[min(70vh,24rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border-0 bg-[color-mix(in_srgb,var(--video-player-menu-surface,rgb(11_11_13_/_0.88))_78%,transparent)] p-1.5 text-(--video-player-menu-text) shadow-[0_16px_40px_rgba(0,0,0,0.38)] focus:outline-none";
const popoverGapPx = 8;
const popoverEdgePadPx = 8;
const popoverMinHeightPx = 96;
const popoverMaxHeightCapPx = 24 * 16;

/** Gap between a `corner` panel and the right edge of the controls. */
const popoverCornerInsetPx = 12;

type PopoverPanelLayout = {
  host: HTMLElement;
  maxHeight: number;
  /**
   * Where a `corner` panel sits: against the right edge of the controls
   * that hold the trigger, which in full screen with the lessons beside the
   * video is the video's edge, not the host's.
   */
  cornerRight: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

/** How far down a sheet drag is, in the player's own axes. */
function sheetDragY(event: ReactPointerEvent<HTMLElement>): number {
  return toPlayerPoint(event.clientX, event.clientY, event.currentTarget).y;
}

function getPopoverOverlayHost(from: HTMLElement | null) {
  if (!from) return null;
  return (
    from.closest<HTMLElement>(".video-shell") ??
    from.closest<HTMLElement>("[data-video-player-root]")
  );
}

function measurePopoverPanelLayout(
  trigger: HTMLElement,
  side: PopoverMenuSide,
  align: PopoverMenuAlign,
): PopoverPanelLayout | null {
  const host = getPopoverOverlayHost(trigger);
  if (!host) return null;
  const player =
    trigger.closest<HTMLElement>("[data-video-player-root]") ?? host;
  // In the player's own axes, which a page full screen can turn a quarter.
  const hostRect = playerRectOf(host);
  const playerRect = playerRectOf(player);
  const triggerRect = playerRectOf(trigger);
  const controls =
    trigger.closest<HTMLElement>("[data-player-control-frame]") ?? player;
  const cornerRight =
    hostRect.right - playerRectOf(controls).right + popoverCornerInsetPx;
  const horizontal =
    align === "start"
      ? { left: triggerRect.left - hostRect.left }
      : { right: hostRect.right - triggerRect.right };

  if (side === "bottom") {
    return {
      host,
      ...horizontal,
      cornerRight,
      top: triggerRect.bottom - hostRect.top + popoverGapPx,
      maxHeight: Math.min(
        popoverMaxHeightCapPx,
        Math.max(
          popoverMinHeightPx,
          playerRect.bottom -
            triggerRect.bottom -
            popoverGapPx -
            popoverEdgePadPx,
        ),
      ),
    };
  }

  return {
    host,
    ...horizontal,
    cornerRight,
    bottom: hostRect.bottom - triggerRect.top + popoverGapPx,
    maxHeight: Math.min(
      popoverMaxHeightCapPx,
      Math.max(
        popoverMinHeightPx,
        triggerRect.top - playerRect.top - popoverGapPx - popoverEdgePadPx,
      ),
    ),
  };
}

const mobileSheetPanelClass =
  "pointer-events-auto inset-x-0 bottom-0 z-180 flex max-h-[min(82dvh,36rem)] w-full flex-col overflow-hidden rounded-t-2xl border-0 text-(--video-player-menu-text) shadow-[0_-18px_48px_rgba(0,0,0,0.38)] transition-[transform,height,border-radius] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus:outline-none motion-reduce:transition-none";

const mobileSheetDismissDistance = 72;
/** A finger that moved less than this was a tap, not a drag. */
const mobileSheetTapSlop = 6;
/** Leaving at this speed (px/ms) closes or steps the sheet however short the drag. */
const mobileSheetFlickSpeed = 0.45;

export function PopoverMenu({
  align = "end",
  children,
  className,
  closeOnItemSelect = true,
  defaultOpen = false,
  disabled = false,
  forceSheet = false,
  label,
  menuLabel,
  mobilePresentation = "popover",
  mobileSheetExpandable = false,
  mobileSheetPanelClassName,
  mobileSheetPortalTarget,
  mobileSheetStyle,
  onOpenChange,
  open: controlledOpen,
  panelClassName,
  placement = "anchored",
  sheetTitle,
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
    /** The last two points, for the speed the finger leaves at. */
    lastY: number;
    lastTime: number;
    previousY: number;
    previousTime: number;
    /** Gone past a tap's slop. */
    moved: boolean;
  } | null>(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [mobileSheetDragOffset, setMobileSheetDragOffset] = useState(0);
  const [mobileSheetDragging, setMobileSheetDragging] = useState(false);
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false);
  const [mobileSheetDragStartHeight, setMobileSheetDragStartHeight] = useState<
    number | null
  >(null);
  const [panelLayout, setPanelLayout] = useState<PopoverPanelLayout | null>(
    null,
  );
  const isControlled = controlledOpen !== undefined;
  const isOpen = controlledOpen ?? internalOpen;
  const isMobileSheet =
    mobilePresentation === "sheet" && (mobileInteraction || forceSheet);
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

  useLayoutEffect(() => {
    if (!isOpen || isMobileSheet) return;
    const trigger = triggerRef.current;
    if (!trigger) return;

    const update = () => {
      setPanelLayout(measurePopoverPanelLayout(trigger, side, align));
    };
    update();
    const observed =
      trigger.closest("[data-video-player-root]") ??
      getPopoverOverlayHost(trigger);
    const observer =
      observed && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : null;
    if (observed) observer?.observe(observed);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      // The layout is only ever set by `update` above, so clearing it here
      // covers every way the anchored panel stops being shown.
      setPanelLayout(null);
    };
  }, [align, isMobileSheet, isOpen, side]);

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
    setMobileSheetExpanded(false);
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
    if (
      closeOnItemSelect &&
      item &&
      !item.hasAttribute("data-menu-keep-open")
    ) {
      closeAndRestoreFocus();
    }
  };

  const expandableSheet = isMobileSheet && mobileSheetExpandable;

  const handleMobileSheetDragStart = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const y = sheetDragY(event);
    mobileSheetDragRef.current = {
      pointerId: event.pointerId,
      startY: y,
      lastY: y,
      lastTime: event.timeStamp,
      previousY: y,
      previousTime: event.timeStamp,
      moved: false,
    };
    setMobileSheetDragStartHeight(
      panelRef.current ? playerRectOf(panelRef.current).height : null,
    );
    setMobileSheetDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleMobileSheetDragMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const drag = mobileSheetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const y = sheetDragY(event);
    const dragDelta = y - drag.startY;
    drag.previousY = drag.lastY;
    drag.previousTime = drag.lastTime;
    drag.lastY = y;
    drag.lastTime = event.timeStamp;
    if (Math.abs(dragDelta) > mobileSheetTapSlop) drag.moved = true;
    // Dragging up only means something on an expandable sheet that is not
    // already filling the screen.
    setMobileSheetDragOffset(
      expandableSheet && !mobileSheetExpanded
        ? dragDelta
        : Math.max(0, dragDelta),
    );
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
    const dragDelta = sheetDragY(event) - drag.startY;
    // A finger that stopped before it let go leaves at no speed.
    const speed =
      event.timeStamp - drag.lastTime > 100
        ? 0
        : (drag.lastY - drag.previousY) /
          Math.max(1, drag.lastTime - drag.previousTime);
    // Far enough, or flicked: a quick short drag counts as a long one.
    const wentDown =
      dragDelta >= mobileSheetDismissDistance ||
      (dragDelta > mobileSheetTapSlop && speed >= mobileSheetFlickSpeed);
    const wentUp =
      dragDelta <= -mobileSheetDismissDistance ||
      (dragDelta < -mobileSheetTapSlop && speed <= -mobileSheetFlickSpeed);
    if (!cancelled && expandableSheet) {
      if (!mobileSheetExpanded && wentUp) {
        setMobileSheetExpanded(true);
        setMobileSheetDragOffset(0);
        return;
      }
      if (mobileSheetExpanded) {
        // One drag is one step, like the lessons drawer: the expanded sheet
        // settles back to its resting height, never straight to closed.
        if (wentDown) {
          setMobileSheetExpanded(false);
        }
        setMobileSheetDragOffset(0);
        return;
      }
    }
    if (!cancelled && wentDown) {
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
  const collapsedSheetHeight =
    typeof mobileSheetStyle?.height === "number"
      ? mobileSheetStyle.height
      : null;
  /** Live height while an expandable sheet is being dragged taller or shorter. */
  const sheetDragHeight = (() => {
    if (
      !expandableSheet ||
      !mobileSheetDragging ||
      mobileSheetDragOffset === 0
    ) {
      return null;
    }
    // Dragging a resting sheet down is the dismiss gesture, not a resize.
    if (!mobileSheetExpanded && mobileSheetDragOffset > 0) return null;
    if (mobileSheetDragStartHeight === null || typeof window === "undefined") {
      return null;
    }
    return Math.max(
      collapsedSheetHeight ?? 0,
      Math.min(
        window.innerHeight,
        mobileSheetDragStartHeight - mobileSheetDragOffset,
      ),
    );
  })();
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
      data-video-player-mobile-sheet-expanded={
        isMobileSheet && mobileSheetExpanded ? "" : undefined
      }
      data-video-player-menu-panel=""
      data-video-player-menu-placement={
        !isMobileSheet && placement === "side" ? "side" : undefined
      }
      data-player-theme={theme.id}
      style={{
        ...getPlayerThemeStyle(theme),
        ...(panelLayout && placement === "side"
          ? { top: 0, bottom: 0, right: 0, left: "auto", maxHeight: "none" }
          : panelLayout
            ? {
                top: panelLayout.top,
                bottom: panelLayout.bottom,
                left: placement === "corner" ? "auto" : panelLayout.left,
                right:
                  placement === "corner"
                    ? panelLayout.cornerRight
                    : panelLayout.right,
                // A panel class may lift the panel off its trigger with a
                // margin; it names that lift so the panel still fits.
                maxHeight: `calc(${panelLayout.maxHeight}px - var(--video-player-menu-lift, 0px))`,
              }
            : {}),
        ...(isMobileSheet ? mobileSheetStyle : undefined),
        ...(isMobileSheet && mobileSheetExpanded
          ? { height: "100dvh", maxHeight: "100dvh" }
          : undefined),
        ...(sheetDragHeight !== null
          ? { height: sheetDragHeight, maxHeight: "none" }
          : undefined),
        transform:
          isMobileSheet &&
          !mobileSheetExpanded &&
          sheetDragHeight === null &&
          mobileSheetDragOffset > 0
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
          : classNames(
              panelClass,
              panelLayout ? "pointer-events-auto" : positionClass,
            ),
        panelClassName,
      )}
      onClick={handleMenuClick}
      onKeyDown={handleMenuKeyDown}
    >
      {isMobileSheet ? (
        // The header floats over the top of the list (the list starts
        // under it, see its top padding): frosted rather than solid, so
        // rows show faintly as they pass behind, and with a soft edge
        // below so they fade out instead of being cut off in a line.
        <div
          data-video-player-mobile-sheet-drag-handle=""
          className="relative z-10 -mb-16 flex h-16 shrink-0 touch-none cursor-grab flex-col items-center justify-center gap-2 bg-[color-mix(in_srgb,var(--video-player-menu-solid-surface,rgb(11_11_13))_62%,transparent)] px-5 pb-3 pt-2 backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-5 after:bg-linear-to-b after:from-[color-mix(in_srgb,var(--video-player-menu-solid-surface,rgb(11_11_13))_62%,transparent)] after:to-transparent after:content-[''] active:cursor-grabbing"
          onPointerDown={handleMobileSheetDragStart}
          onPointerMove={handleMobileSheetDragMove}
          onPointerUp={finishMobileSheetDrag}
          onPointerCancel={(event) => finishMobileSheetDrag(event, true)}
        >
          <span
            aria-hidden="true"
            data-video-player-sheet-grip=""
            className="h-1 w-12 rounded-full bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_34%,transparent)]"
          />
          <div
            id={`${menuId}-title`}
            className="w-full text-left text-lg font-semibold tracking-[-0.01em] text-(--video-player-menu-text)"
          >
            {sheetTitle ?? resolvedMenuLabel}
          </div>
        </div>
      ) : null}
      {isMobileSheet ? (
        <div
          role="menu"
          aria-label={resolvedMenuLabel}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pt-18 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          {typeof children === "function"
            ? children({ close: closeMenu, sheet: isMobileSheet })
            : children}
        </div>
      ) : typeof children === "function" ? (
        children({ close: closeMenu, sheet: isMobileSheet })
      ) : (
        children
      )}
    </div>
  ) : null;
  const menuLayer =
    isOpen && isMobileSheet && typeof document !== "undefined"
      ? createPortal(
          <>
            {/* A tap on the dimmed page closes the sheet; a swipe on it
                moves the sheet as its grip does (a flick closes it), and
                never the page or the player under it. */}
            <div
              aria-hidden="true"
              data-video-player-mobile-sheet-backdrop=""
              className={`${isContainedMobileSheet ? "absolute" : "fixed"} pointer-events-auto inset-0 z-170 touch-none bg-black/60 transition-opacity duration-200 ease-out motion-reduce:transition-none`}
              onPointerDown={(event) => {
                event.stopPropagation();
                handleMobileSheetDragStart(event);
              }}
              onPointerMove={handleMobileSheetDragMove}
              onPointerUp={(event) => {
                const tapped =
                  mobileSheetDragRef.current?.pointerId === event.pointerId &&
                  !mobileSheetDragRef.current.moved;
                finishMobileSheetDrag(event);
                if (tapped) closeAndRestoreFocus();
              }}
              onPointerCancel={(event) => finishMobileSheetDrag(event, true)}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
            {panel}
          </>,
          mobileSheetPortalTarget ?? document.body,
        )
      : isOpen && panelLayout && typeof document !== "undefined"
        ? createPortal(panel, panelLayout.host)
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
