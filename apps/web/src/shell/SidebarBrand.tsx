import type { MouseEventHandler, PointerEventHandler } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { SidebarToggleIcon } from "./SidebarToggleIcon";
import { procodrrLogoSvg } from "./academyShellConstants";
import {
  SIDEBAR_BRAND_CLASS,
  SIDEBAR_COLLAPSE_BUTTON_CLASS,
} from "./academyShellClasses";

export interface SidebarBrandProps {
  sidebarBrandTitle:
    | "Navigation"
    | "Double-click to pin sidebar"
    | "Double-click to float sidebar";
  preventSidebarBrandTextSelection: (
    event: ReactMouseEvent<HTMLElement>,
  ) => void;
  handleSidebarBrandPress: (event: ReactPointerEvent<HTMLElement>) => void;
  sidebarLogoGesture: {
    readonly isSecondPressHolding: boolean;
    readonly handlers: {
      onClick: MouseEventHandler<HTMLSpanElement>;
      onLostPointerCapture: PointerEventHandler<HTMLSpanElement>;
      onPointerCancel: PointerEventHandler<HTMLSpanElement>;
      onPointerDown: PointerEventHandler<HTMLSpanElement>;
      onPointerMove: PointerEventHandler<HTMLSpanElement>;
      onPointerUp: PointerEventHandler<HTMLSpanElement>;
    };
  };
  sidebarControlKey: "prerender" | "client";
  sidebarControlAction:
    | "Close navigation"
    | "Pin navigation"
    | "Expand navigation"
    | "Collapse navigation";
  compactNavigation: boolean;
  sidebarCollapsed: boolean;
  primaryShortcutModifier: "Control" | "Meta";
  sidebarControlTitle: string;
  sidebarToggleGesture: {
    readonly isSecondPressHolding: boolean;
    readonly handlers: {
      onClick: MouseEventHandler<HTMLButtonElement>;
      onLostPointerCapture: PointerEventHandler<HTMLButtonElement>;
      onPointerCancel: PointerEventHandler<HTMLButtonElement>;
      onPointerDown: PointerEventHandler<HTMLButtonElement>;
      onPointerMove: PointerEventHandler<HTMLButtonElement>;
      onPointerUp: PointerEventHandler<HTMLButtonElement>;
    };
  };
  sidebarVisuallyCollapsed: boolean;
  sidebarPresentedAsOverlay: boolean;
  sidebarDraggedToCollapsedWidth: boolean;
}

export function SidebarBrand({
  sidebarBrandTitle,
  preventSidebarBrandTextSelection,
  handleSidebarBrandPress,
  sidebarLogoGesture,
  sidebarControlKey,
  sidebarControlAction,
  compactNavigation,
  sidebarCollapsed,
  primaryShortcutModifier,
  sidebarControlTitle,
  sidebarToggleGesture,
  sidebarVisuallyCollapsed,
  sidebarPresentedAsOverlay,
  sidebarDraggedToCollapsedWidth,
}: SidebarBrandProps) {
  // prettier-ignore
  return (
    <div
      className={SIDEBAR_BRAND_CLASS}
      title={sidebarBrandTitle}
      data-double-tap-ignore
      onMouseDown={preventSidebarBrandTextSelection}
      onPointerUp={handleSidebarBrandPress}
    >
      <span
        className="courses-logo-clip"
        data-sidebar-resize-reader=""
        role="img"
        aria-label="ProCodrr"
        title="Home. Click, then hold to float the sidebar"
        data-second-press-holding={
          sidebarLogoGesture.isSecondPressHolding || undefined
        }
        {...sidebarLogoGesture.handlers}
        dangerouslySetInnerHTML={{ __html: procodrrLogoSvg }}
      />
      <button
        key={sidebarControlKey}
        type="button"
        className={SIDEBAR_COLLAPSE_BUTTON_CLASS}
        aria-label={sidebarControlAction}
        aria-pressed={compactNavigation ? undefined : sidebarCollapsed}
        aria-keyshortcuts={`${primaryShortcutModifier}+B`}
        title={sidebarControlTitle}
        data-second-press-holding={
          sidebarToggleGesture.isSecondPressHolding || undefined
        }
        {...sidebarToggleGesture.handlers}
      >
        <span
          className="sidebar-collapse__asset [--sidebar-resize-preview-width:inherit]"
          aria-hidden="true"
        >
          <SidebarToggleIcon
            direction={
              compactNavigation
                ? "left"
                : sidebarVisuallyCollapsed ||
                    sidebarPresentedAsOverlay ||
                    sidebarDraggedToCollapsedWidth
                  ? "right"
                  : "left"
            }
          />
        </span>
      </button>
    </div>
  );
}
