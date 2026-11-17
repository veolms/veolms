import type { CSSProperties } from "react";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { NAV_COUNT_BADGE_CLASS } from "./NavCountBadge";
import { formatBadgeCount } from "./navCount";
import { leavesClickToBrowser } from "./navigationLink";

const NOTIFICATIONS_PATH = "/notifications";

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
    // A link, as the sidebar's own items are: Ctrl/⌘ or middle click opens
    // the notifications in a new tab and right click offers the browser's
    // link menu. A plain click still goes through the app without a reload.
    <a
      href={NOTIFICATIONS_PATH}
      data-dock-item="notifications"
      // The dock colours its icons with the accent; the bell takes its own
      // navigation colour, as the gear does.
      className={`sidebar-appearance__notifications relative no-underline [&>svg]:text-(--nav-icon-color,var(--accent-ink,var(--accent)))!${active ? " is-active" : ""}`}
      style={
        iconColor
          ? ({ "--nav-icon-color": iconColor } as CSSProperties)
          : undefined
      }
      aria-label={label}
      title="Notifications"
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (leavesClickToBrowser(event)) return;
        event.preventDefault();
        onOpen();
      }}
    >
      <Bell size={20} weight={active ? "fill" : "regular"} />
      {/* An <em>, not a <span>: the collapsed sidebar hides its dock
          buttons' spans (their labels), which took the count with them. */}
      {unreadCount > 0 ? (
        <em
          // Half on the bell itself (its top-right), as a phone shows an
          // app's count, not on the button's corner.
          className={`${NAV_COUNT_BADGE_CLASS} absolute top-[calc(50%-8px)] left-[calc(50%+8px)] h-4.5 min-w-4.5 -translate-x-1/2 -translate-y-1/2 px-1 text-[0.625rem] shadow-[0_0_0_2px_var(--surface)]`}
          aria-hidden="true"
          data-notifications-badge=""
        >
          {formatBadgeCount(unreadCount, 9)}
        </em>
      ) : null}
    </a>
  );
}
