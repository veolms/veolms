import { useEffect, useLayoutEffect, useRef } from "react";
import type { MouseEvent } from "react";
import type { SettingsTab } from "../routing/tabSessionState";
import { SETTINGS_TABS } from "./settingsTabs";

interface SettingsQuickMenuProps {
  id: string;
  className?: string;
  isOpen: boolean;
  activeTab: SettingsTab | null;
  onNavigate: (tab: SettingsTab) => void;
}

export function SettingsQuickMenu({
  id,
  className = "",
  isOpen,
  activeTab,
  onNavigate,
}: SettingsQuickMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const activeIndex = SETTINGS_TABS.findIndex(({ id: tab }) => tab === activeTab);

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

      const items = itemRefs.current.filter((item): item is HTMLAnchorElement => item !== null);
      if (items.length === 0) return;

      event.preventDefault();
      event.stopPropagation();

      const focusedIndex = items.indexOf(document.activeElement as HTMLAnchorElement);
      const currentIndex = focusedIndex >= 0 ? focusedIndex : Math.max(activeIndex, 0);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (currentIndex + direction + items.length) % items.length;
      items[nextIndex]?.focus();
    };

    document.addEventListener("keydown", handleMenuKeyDown, true);
    return () => document.removeEventListener("keydown", handleMenuKeyDown, true);
  }, [activeIndex, isOpen]);

  const handleNavigate = (event: MouseEvent<HTMLAnchorElement>, tab: SettingsTab) => {
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
      <div className="page-tabs settings-quick-menu__items" role="group">
        {SETTINGS_TABS.map(({ id: tab, label, Icon, tone }, index) => (
          <a
            key={tab}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            href={`/settings/${tab}`}
            role="menuitem"
            aria-current={activeTab === tab ? "page" : undefined}
            data-page-tab-tone={tone}
            className={`profile-menu__item settings-quick-menu__item${activeTab === tab ? "is-active" : ""}`}
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
