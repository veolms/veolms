import type { CSSProperties } from "react";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import {
  NAV_COUNT_BADGE_CLASS,
  NAV_COUNT_BADGE_CORNER_CLASS,
} from "./NavCountBadge";
import { formatBadgeCount } from "./navCount";

export interface SidebarNotificationsButtonProps {
  /** Unread notifications; 0 for a guest. */
  unreadCount: number;
  /** The notifications page is the one open. */
  active: boolean;
  iconColor?: string;
  onOpen: () => void;
}

/**
 * The bell in the sidebar's bottom row (and the phone menu's): opens the
 * notifications, with the unread count on its corner.
 */
export function SidebarNotificationsButton({
  unreadCount,
  active,
  iconColor,
  onOpen,
}: SidebarNotificationsButtonProps) {
  const label =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";
  return (
    <button
      data-dock-item="notifications"
      type="button"
      // The dock colours its icons with the accent; the bell takes its own
      // navigation colour, as the gear does.
      className={`sidebar-appearance__notifications relative [&>svg]:text-(--nav-icon-color,var(--accent-ink,var(--accent)))!${active ? " is-active" : ""}`}
      style={
        iconColor
          ? ({ "--nav-icon-color": iconColor } as CSSProperties)
          : undefined
      }
      aria-label={label}
      title="Notifications"
      aria-current={active ? "page" : undefined}
      onClick={onOpen}
    >
      <Bell size={20} weight={active ? "fill" : "regular"} />
      {/* An <em>, not a <span>: the collapsed sidebar hides its dock
          buttons' spans (their labels), which took the count with them. */}
      {unreadCount > 0 ? (
        <em
          className={`${NAV_COUNT_BADGE_CLASS} ${NAV_COUNT_BADGE_CORNER_CLASS}`}
          aria-hidden="true"
          data-notifications-badge=""
        >
          {formatBadgeCount(unreadCount, 9)}
        </em>
      ) : null}
    </button>
  );
}
