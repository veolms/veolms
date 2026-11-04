import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEventHandler,
  type PointerEventHandler,
} from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { LogoMenu } from "./LogoMenu";
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
  logoMenuOpen: boolean;
  onLogoMenuOpenChange: (open: boolean) => void;
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
  logoMenuOpen,
  onLogoMenuOpenChange,
}: SidebarBrandProps) {
  const logoRef = useRef<HTMLSpanElement>(null);
  const openLogoMenuFromKeyboard = (
    event: ReactKeyboardEvent<HTMLSpanElement>,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onLogoMenuOpenChange(true);
  };
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
        ref={logoRef}
        className="courses-logo-clip cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        data-sidebar-resize-reader=""
        role="button"
        tabIndex={0}
        aria-label="ProCodrr menu"
        aria-haspopup="menu"
        aria-expanded={logoMenuOpen}
        title="Help and legal pages. Click, then hold to float the sidebar"
        onKeyDown={openLogoMenuFromKeyboard}
        data-second-press-holding={
          sidebarLogoGesture.isSecondPressHolding || undefined
        }
        {...sidebarLogoGesture.handlers}
        dangerouslySetInnerHTML={{ __html: procodrrLogoSvg }}
      />
      <LogoMenu
        open={logoMenuOpen}
        onOpenChange={onLogoMenuOpenChange}
        anchor={logoRef}
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
