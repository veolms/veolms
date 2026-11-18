import { formatBadgeCount } from "./navCount";

/**
 * The red count pill, WhatsApp-style: solid red, white figures, fully round.
 * Callers place it: at the end of a menu row, half outside an icon tile's
 * corner (the collapsed sidebar's Chats), or half on the bell icon.
 */
export const NAV_COUNT_BADGE_CLASS =
  "pointer-events-none inline-grid h-5 min-w-5 place-items-center rounded-full bg-[#e5484d] px-1.5 text-[0.6875rem] leading-none font-semibold text-white not-italic tabular-nums";

/**
 * A red count on a navigation item, like an app icon's on a phone. Nothing
 * is drawn for zero. Positioned by the caller (`className`): on an icon's
 * corner, or at the end of a menu row.
 *
 * The item keeps its plain `aria-label` (the menu's highlight is matched on
 * it) and points at this with `aria-describedby={id}`, so assistive tech
 * hears "Chats, 3 unread messages".
 */
export function NavCountBadge({
  id,
  count,
  max = 99,
  unreadLabel,
  className = "",
}: {
  id: string;
  count: number;
  max?: number;
  /** Read after the number: "unread messages". */
  unreadLabel: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <em
      id={id}
      data-nav-count-badge=""
      className={`${NAV_COUNT_BADGE_CLASS} ${className}`}
    >
      {formatBadgeCount(count, max)}
      <span className="sr-only"> {unreadLabel}</span>
    </em>
  );
}
