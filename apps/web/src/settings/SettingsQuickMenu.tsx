import { useEffect, useLayoutEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import type { SettingsTab } from "../routing/tabSessionState";
import { getSettingsTabs } from "./settingsTabs";

/** The reading mode switch at the top of the menu. */
export interface SettingsQuickMenuReadingMode {
  enabled: boolean;
  onToggle: () => void;
  /** Its colour and texture settings, on a right-click of the row. */
  onOpenSettings: () => void;
}

interface SettingsQuickMenuProps {
  id: string;
  className?: string;
  isOpen: boolean;
  activeTab: SettingsTab | null;
  onNavigate: (tab: SettingsTab) => void;
  /** Profile, notifications, privacy and account: signed-in accounts only. */
  showSignedInTabs: boolean;
  readingMode?: SettingsQuickMenuReadingMode;
}

export function SettingsQuickMenu({
  id,
  className = "",
  isOpen,
  activeTab,
  onNavigate,
  showSignedInTabs,
  readingMode,
}: SettingsQuickMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // The reading mode row first (when shown), then one per settings page.
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const tabs = getSettingsTabs(showSignedInTabs);
  const tabOffset = readingMode ? 1 : 0;
  const activeTabIndex = tabs.findIndex(({ id: tab }) => tab === activeTab);
  const activeIndex = activeTabIndex >= 0 ? activeTabIndex + tabOffset : -1;

  useLayoutEffect(() => {
    if (!isOpen) return;
    itemRefs.current[activeIndex >= 0 ? activeIndex : 0]?.focus();
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']") &&
        !menuRef.current?.contains(target)
      ) {
        return;
      }

      const items = itemRefs.current.filter(
        (item): item is HTMLElement => item !== null,
      );
      if (items.length === 0) return;

      event.preventDefault();
      event.stopPropagation();

      const focusedIndex = items.indexOf(document.activeElement as HTMLElement);
      const currentIndex =
        focusedIndex >= 0 ? focusedIndex : Math.max(activeIndex, 0);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (currentIndex + direction + items.length) % items.length;
      items[nextIndex]?.focus();
    };

    document.addEventListener("keydown", handleMenuKeyDown, true);
    return () =>
      document.removeEventListener("keydown", handleMenuKeyDown, true);
  }, [activeIndex, isOpen]);

  const handleNavigate = (
    event: MouseEvent<HTMLAnchorElement>,
    tab: SettingsTab,
  ) => {
    if (
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      onNavigate(tab);
    }
  };

  return (
    <div
      id={id}
      ref={menuRef}
      className={`profile-menu settings-quick-menu ${className}`.trim()}
      role="menu"
      aria-label="Settings pages"
      aria-hidden={!isOpen ? true : undefined}
      inert={!isOpen ? true : undefined}
      data-open={isOpen ? "true" : "false"}
      data-settings-quick-menu
    >
      <p className="profile-menu__section">Settings</p>
      {readingMode ? (
        <div className="settings-quick-menu__reading-mode" role="group">
          <button
            ref={(element) => {
              itemRefs.current[0] = element;
            }}
            type="button"
            role="menuitemcheckbox"
            aria-checked={readingMode.enabled}
            data-reading-mode-trigger
            className="profile-menu__item settings-quick-menu__item grid-cols-[28px_minmax(0,1fr)_auto]! rounded-[9px]!"
            title="Reading mode (right-click for its settings)"
            onClick={readingMode.onToggle}
            onContextMenu={(event) => {
              event.preventDefault();
              readingMode.onOpenSettings();
            }}
          >
            <Eye
              size={19}
              weight={readingMode.enabled ? "fill" : "regular"}
              aria-hidden="true"
              style={{ color: "var(--dock-reading-mode-icon-color, inherit)" }}
            />
            <span>Reading mode</span>
            <span
              className={`settings-toggle pointer-events-none shrink-0 ${readingMode.enabled ? "is-on" : ""}`}
              aria-hidden="true"
            >
              <span />
            </span>
          </button>
          <div
            className="profile-menu__divider"
            role="separator"
            aria-orientation="horizontal"
          />
        </div>
      ) : null}
      <div className="page-tabs settings-quick-menu__items" role="group">
        {tabs.map(({ id: tab, label, Icon, tone }, index) => (
          <a
            key={tab}
            ref={(element) => {
              itemRefs.current[index + tabOffset] = element;
            }}
            href={`/settings/${tab}`}
            role="menuitem"
            aria-current={activeTab === tab ? "page" : undefined}
            data-page-tab-tone={tone}
            className={`profile-menu__item settings-quick-menu__item${activeTab === tab ? " is-active" : ""}`}
            onClick={(event) => handleNavigate(event, tab)}
          >
            <Icon
              size={19}
              weight={activeTab === tab ? "fill" : "regular"}
              aria-hidden="true"
              style={{ color: "var(--page-tab-tone)" }}
            />
            <span>{label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
