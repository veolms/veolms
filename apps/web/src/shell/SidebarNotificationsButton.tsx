import type { CSSProperties } from "react";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";

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
      {unreadCount > 0 ? (
        <span
          className="pointer-events-none absolute top-1.5 left-1/2 ml-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-[#e5484d] px-1 text-[0.625rem] leading-none font-bold text-white tabular-nums shadow-[0_0_0_2px_var(--surface-strong,var(--surface))]"
          aria-hidden="true"
          data-notifications-badge=""
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
