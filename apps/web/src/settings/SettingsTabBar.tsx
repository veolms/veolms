import type { RefObject } from "react";
import {
  handleRovingTabKeyDown,
  scrollKeyboardFocusedTabIntoView,
} from "../accessibility/rovingTabFocus";
import type { PageTabDefinition } from "./settingsTabs";

export interface SettingsTabBarProps<Id extends string> {
  tabs: readonly PageTabDefinition<Id>[];
  activeTab: Id;
  /** Each tab's id is `<idPrefix>-<tab id>`; the panel names it. */
  idPrefix: string;
  panelId: string;
  label: string;
  /** The tab list, for the panel's swipe and indicator. */
  navRef: RefObject<HTMLElement | null>;
  /** A tab the pointer or focus reached: its section can be prepared. */
  onPrepare: (id: Id) => void;
  onSelect: (id: Id) => void;
  /** Classes for one tab beyond the shared ones. */
  getTabClassName?: (id: Id) => string;
}

/**
 * The section tabs of a settings-style page (Settings, Platform): pinned
 * while the page scrolls, with a coloured icon per section and the sliding
 * indicator the panel below positions.
 */
export function SettingsTabBar<Id extends string>({
  tabs,
  activeTab,
  idPrefix,
  panelId,
  label,
  navRef,
  onPrepare,
  onSelect,
  getTabClassName,
}: SettingsTabBarProps<Id>) {
  return (
    // The tabs stay pinned while the page scrolls under them, so they have a
    // ground of their own: exactly the page's (the main area's own rule, see
    // deepGroundClasses), so no band of another colour shows.
    <nav
      ref={navRef}
      className="settings-tabs page-tabs sticky! top-(--settings-page-sticky-top,0px) z-25 mx-[calc(-1*var(--settings-tab-nav-bleed))]! bg-(--main-surface) px-(--settings-tab-nav-bleed)! in-data-[content-layout=framed]:bg-(--card-ground)!"
      aria-label={label}
      role="tablist"
    >
      {tabs.map(({ id, label: tabLabel, Icon, tone }, index) => {
        const isActive = activeTab === id;
        const extraClassName = getTabClassName?.(id);
        return (
          <button
            type="button"
            key={id}
            id={`${idPrefix}-${id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={panelId}
            aria-keyshortcuts={`Alt+${index + 1}`}
            data-page-tab-tone={tone}
            data-swipe-tab-id={id}
            tabIndex={isActive ? 0 : -1}
            className={`group${isActive ? " is-active" : ""}${
              extraClassName ? ` ${extraClassName}` : ""
            }`}
            onPointerEnter={() => onPrepare(id)}
            onPointerDown={() => onPrepare(id)}
            onClick={() => onSelect(id)}
            onKeyDown={handleRovingTabKeyDown}
            onFocus={(event) => {
              onPrepare(id);
              scrollKeyboardFocusedTabIntoView(event);
            }}
          >
            <span className="settings-tab__press-content inline-flex origin-bottom items-center gap-2 transition-transform duration-150 ease-out group-active:scale-[0.985] motion-reduce:duration-[0.01ms]">
              <Icon size={17} weight={isActive ? "fill" : "regular"} />
              <span>{tabLabel}</span>
            </span>
          </button>
        );
      })}
      <span className="page-tabs__indicator" aria-hidden="true" />
    </nav>
  );
}
