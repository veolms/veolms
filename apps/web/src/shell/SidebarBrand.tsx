import type { MouseEventHandler, PointerEventHandler } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useBuildArtworkIsOurs, useSiteBrandAssets } from "../site/siteBrand";
import { SiteIcon, SiteWordmark, useSiteLogoImages } from "../site/SiteLogo";
import { useSiteName } from "../site/siteName";
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
  const siteName = useSiteName();
  const logoImages = useSiteLogoImages();
  const { iconUrl } = useSiteBrandAssets();
  const buildArtwork = useBuildArtworkIsOurs();
  // A long academy name steps down in size, then ends in "…" inside the
  // logo's window (the full name is its accessible name and tooltip).
  const nameSize =
    siteName.length > 18
      ? "text-[1rem]"
      : siteName.length > 12
        ? "text-[1.15rem]"
        : "text-[1.35rem]";
  // The build's own wordmark, cut to its P in the compact rail, until the
  // academy uploads artwork of its own (or the build has none).
  const ownArtwork = logoImages !== null || iconUrl !== null || !buildArtwork;
  const logoProps = {
    "data-sidebar-resize-reader": "",
    role: "img",
    "aria-label": siteName,
    title: "Home. Click, then hold to float the sidebar",
    "data-second-press-holding":
      sidebarLogoGesture.isSecondPressHolding || undefined,
    ...sidebarLogoGesture.handlers,
  } as const;
  // prettier-ignore
  return (
    <div
      className={SIDEBAR_BRAND_CLASS}
      title={sidebarBrandTitle}
      data-double-tap-ignore
      onMouseDown={preventSidebarBrandTextSelection}
      onPointerUp={handleSidebarBrandPress}
    >
      {ownArtwork ? (
        // The academy's logo while the sidebar is open, its square icon in
        // the compact rail (navigation.css, "An academy's own artwork").
        <span className="courses-logo-clip" data-brand="custom" {...logoProps}>
          <span className="courses-logo-clip__wordmark">
            <SiteWordmark
              decorative
              className="h-full max-w-37"
              nameClassName={`${nameSize} leading-none`}
            />
          </span>
          <span className="courses-logo-clip__icon">
            <SiteIcon className="size-[21px] rounded-[6px] text-[12px]" />
          </span>
        </span>
      ) : (
        <span
          className="courses-logo-clip"
          {...logoProps}
          dangerouslySetInnerHTML={{ __html: procodrrLogoSvg }}
        />
      )}
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
