import type { RefObject } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { SIDEBAR_MIN_WIDTH } from "./sidebarPreferences";
import { SIDEBAR_COLLAPSED_WIDTH } from "./academyShellConstants";
import type { SidebarResize, PointerPositionEvent } from "./academyShellTypes";

export interface SidebarResizeHandleProps {
  compactNavigation: boolean;
  sidebarPresentedAsOverlay: boolean;
  edgeSidebarOpen: boolean;
  sidebarControlKey: "prerender" | "client";
  primaryShortcutModifier: "Meta" | "Control";
  showKeyboardShortcuts: boolean;
  sidebarShortcutTitle: "⌘+B" | "Ctrl+B";
  sidebarMaxWidth: number;
  sidebarResizePreviewWidth: number | null;
  renderedSidebarWidth: number;
  sidebarCollapsed: boolean;
  handleSidebarResizeKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => void;
  toggleSidebarWidth: () => void;
  dismissSidebarTooltipImmediately: () => void;
  startSidebarResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  moveSidebarResize: (event: PointerPositionEvent) => void;
  endSidebarResize: (event: PointerPositionEvent, cancelled?: boolean) => void;
  sidebarResizeRef: RefObject<SidebarResize | null>;
}

export function SidebarResizeHandle({
  compactNavigation,
  sidebarPresentedAsOverlay,
  edgeSidebarOpen,
  sidebarControlKey,
  primaryShortcutModifier,
  showKeyboardShortcuts,
  sidebarShortcutTitle,
  sidebarMaxWidth,
  sidebarResizePreviewWidth,
  renderedSidebarWidth,
  sidebarCollapsed,
  handleSidebarResizeKeyDown,
  toggleSidebarWidth,
  dismissSidebarTooltipImmediately,
  startSidebarResize,
  moveSidebarResize,
  endSidebarResize,
  sidebarResizeRef,
}: SidebarResizeHandleProps) {
  // prettier-ignore
  return (
    <>
      {((!compactNavigation && !sidebarPresentedAsOverlay) ||
        (sidebarPresentedAsOverlay && edgeSidebarOpen)) && (
        <div
          key={sidebarControlKey}
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-keyshortcuts={`${primaryShortcutModifier}+B`}
          title={
            showKeyboardShortcuts
              ? `Resize sidebar | ${sidebarShortcutTitle}`
              : "Resize sidebar"
          }
          aria-valuemin={
            sidebarPresentedAsOverlay
              ? SIDEBAR_MIN_WIDTH
              : SIDEBAR_COLLAPSED_WIDTH
          }
          aria-valuemax={sidebarMaxWidth}
          aria-valuenow={Math.round(
            sidebarResizePreviewWidth ??
              (sidebarPresentedAsOverlay
                ? renderedSidebarWidth
                : sidebarCollapsed
                  ? SIDEBAR_COLLAPSED_WIDTH
                  : renderedSidebarWidth),
          )}
          aria-valuetext={
            sidebarPresentedAsOverlay
              ? `${Math.round(sidebarResizePreviewWidth ?? renderedSidebarWidth)} pixel temporary sidebar`
              : sidebarCollapsed
                ? "Collapsed sidebar"
                : `${Math.round(renderedSidebarWidth)} pixels wide`
          }
          tabIndex={0}
          onKeyDown={handleSidebarResizeKeyDown}
          onDoubleClick={toggleSidebarWidth}
          onPointerEnter={dismissSidebarTooltipImmediately}
          onPointerDown={startSidebarResize}
          onPointerMove={moveSidebarResize}
          onPointerUp={endSidebarResize}
          onPointerCancel={(event) => endSidebarResize(event, true)}
          onLostPointerCapture={(event) => {
            if (sidebarResizeRef.current?.pointerId === event.pointerId) {
              endSidebarResize(event, true);
            }
          }}
        />
      )}
    </>
  );
}
