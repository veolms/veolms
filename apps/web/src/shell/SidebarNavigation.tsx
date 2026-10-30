import {
  Fragment,
  useLayoutEffect,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { SidebarResizeReadout } from "./SidebarResizeReadout";
import { getNavigationIconColor, type NavigationItem } from "./navigation";
import type { NavigationItemWithMetadata } from "./navigation";
import type { SidebarPreferences } from "../settings/settingsPreferences";
import { SIDEBAR_NAV_ITEM_SQUIRCLE_CLASS } from "./academyShellClasses";
import type { SidebarTooltip } from "./academyShellTypes";
import { ShortcutKeys } from "./ShortcutKeys";
import { useHydrated } from "../courses/viewerCourseState";

export interface SidebarNavigationProps {
  navigationScrollFade: { top: boolean; bottom: boolean; overflow: boolean };
  navigationRef: RefObject<HTMLElement | null>;
  setSidebarTooltip: Dispatch<SetStateAction<SidebarTooltip | null>>;
  updateNavigationScrollFade: () => void;
  navigation: NavigationItem[];
  isNavigationItemActive: (item: NavigationItemWithMetadata) => boolean;
  sidebarPreferences: SidebarPreferences;
  primaryShortcutModifier: "Meta" | "Control";
  selectNavigation: (label: string, item?: NavigationItemWithMetadata) => void;
  navigationUsesCompactInteraction: boolean;
  showSidebarTooltip: (
    event:
      ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
    label: string,
    active: boolean,
    showWhenExpanded?: boolean,
    preferenceControlled?: boolean,
  ) => void;
  hideCollapsedNavigationTooltip: (
    event:
      ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
  ) => void;
  showKeyboardShortcuts: boolean;
  settingsShortcutKeys: string[];
  sidebarResizing: boolean;
  sidebarResizePreviewWidth: number | null;
  renderedSidebarWidth: number;
}

export function SidebarNavigation({
  navigationScrollFade,
  navigationRef,
  setSidebarTooltip,
  updateNavigationScrollFade,
  navigation,
  isNavigationItemActive,
  sidebarPreferences,
  primaryShortcutModifier,
  selectNavigation,
  navigationUsesCompactInteraction,
  showSidebarTooltip,
  hideCollapsedNavigationTooltip,
  showKeyboardShortcuts,
  settingsShortcutKeys,
  sidebarResizing,
  sidebarResizePreviewWidth,
  renderedSidebarWidth,
}: SidebarNavigationProps) {
  // The menu item a page was opened from is lit by the document's head
  // before the page runs (see routing/navigationOriginEarlyState.ts), by
  // changing the built page's classes. React leaves a class it did not put
  // there, so where the app then decided on another item (a lesson page
  // whose origin it does not take), both stayed lit. Once the page runs,
  // every item is set to what the app decided.
  const hydrated = useHydrated();
  const activeLabels = navigation
    .filter((item) => isNavigationItemActive(item))
    .map(([label]) => label)
    .join("|");
  useLayoutEffect(() => {
    const menu = navigationRef.current;
    if (!hydrated || !menu) return;
    const active = new Set(activeLabels.split("|"));
    for (const item of menu.querySelectorAll(":scope > button")) {
      item.classList.toggle(
        "is-active",
        active.has(item.getAttribute("aria-label") ?? ""),
      );
    }
  }, [activeLabels, hydrated, navigationRef]);

  // prettier-ignore
  return (
    <nav
      id="courses-sidebar-nav-scrollport"
      className={[
        // A size container, so menu items can tell when the rail
        // has finished narrowing. The side padding lines the menu
        // items up with the profile button's left and right edges.
        // The top padding keeps the first item on the same row in every
        // state: collapsed, the list starts 16px higher (a 2px shorter
        // brand above it and the stylesheet's -4px margin instead of
        // 10px), so it has 16px more room inside. While a drag out of
        // the rail shows the labels (`resize-content-visible`), the brand
        // is back to its full height and the margin is -1px, so the list
        // starts 11px higher and has 11px more. It is padding rather
        // than margin because the list clips at its own edge: the room
        // has to be inside it, or the first item's shadow is cut off at
        // the top.
        "courses-nav @container gap-2! px-[9.5px]! pt-[11px]! [.courses-app--collapsed_&]:pt-[22px]! [.courses-app--collapsed:not(.courses-app--resize-content-visible)_&]:pt-[27px]!",
        // The list scrolls, and a browser decides how a finger may pan
        // from the scroll area itself, not from the sidebar around
        // it. Without this it claims sideways swipes on the menu
        // (and sends none to the page), so the swipe that resizes
        // the sidebar never began here on a real touch screen.
        "touch-pan-y touch-pinch-zoom",
        navigationScrollFade.top ? "has-scroll-top" : "",
        navigationScrollFade.bottom ? "has-scroll-bottom" : "",
        navigationScrollFade.overflow ? "has-overflow" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      ref={navigationRef}
      onScroll={() => {
        setSidebarTooltip(null);
        updateNavigationScrollFade();
      }}
    >
      {navigation.map((item, navigationIndex) => {
        const [label, Icon] = item;
        const active = isNavigationItemActive(item);
        const navigationShortcutIndex = navigationIndex + 1;
        const displayLabel = label;
        const accessibleLabel = displayLabel;
        return (
          <Fragment key={label}>
            <button
              type="button"
              className={`${active ? "is-active " : ""}${SIDEBAR_NAV_ITEM_SQUIRCLE_CLASS}`}
              style={
                {
                  "--nav-icon-color": getNavigationIconColor(
                    label,
                    sidebarPreferences,
                  ),
                } as CSSProperties
              }
              aria-label={accessibleLabel}
              aria-current={active ? "page" : undefined}
              aria-keyshortcuts={
                label === "Settings"
                  ? `${navigationIndex + 1} ${primaryShortcutModifier}+Comma`
                  : String(navigationIndex + 1)
              }
              onClick={() => selectNavigation(label, item)}
              onContextMenu={(event) => {
                if (navigationUsesCompactInteraction)
                  event.preventDefault();
              }}
              onMouseEnter={(event) =>
                showSidebarTooltip(event, displayLabel, active)
              }
              onMouseLeave={hideCollapsedNavigationTooltip}
              onFocus={(event) =>
                showSidebarTooltip(event, displayLabel, active)
              }
              onBlur={hideCollapsedNavigationTooltip}
            >
              {/* Both drawings, the item's active class choosing: the
                  document's head can then move the highlight to the
                  section the reader came from before the first paint
                  (see navigationOriginEarlyState.ts), which a weight
                  chosen here could not follow. */}
              <Icon
                size={26}
                weight="regular"
                className="[.is-active>&]:hidden!"
              />
              <Icon
                size={26}
                weight="fill"
                className="hidden! [.is-active>&]:block!"
              />
              <span className="courses-nav__text">{displayLabel}</span>
              {showKeyboardShortcuts && (
                <ShortcutKeys
                  className="courses-nav__shortcut"
                  keys={
                    label === "Settings"
                      ? settingsShortcutKeys
                      : [String(navigationShortcutIndex)]
                  }
                />
              )}
            </button>
          </Fragment>
        );
      })}
      {/* Blank room the height of two menu items, shown only when
                  the list scrolls, so the last items can be brought up
                  clear of the profile button (see navigation.css). */}
      <div
        className="courses-nav__end-space"
        data-nav-end-space=""
        aria-hidden="true"
      />
      {sidebarResizing &&
      sidebarPreferences.showResizeDimensions === true ? (
        <SidebarResizeReadout
          sidebarWidth={
            sidebarResizePreviewWidth ?? renderedSidebarWidth
          }
        />
      ) : null}
    </nav>
  );
}
