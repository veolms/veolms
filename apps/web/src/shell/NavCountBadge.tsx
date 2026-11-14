import { formatBadgeCount } from "./navCount";

/**
 * A red count on a navigation item, like an app icon's on a phone. Nothing
 * is drawn for zero. Positioned by the caller (`className`): on an icon's
 * corner, or at the end of a menu row.
 *
 * The item keeps its plain `aria-label` (the menu's highlight is matched on
 * it) and points at this with `aria-describedby={id}`, so assistive tech
 * hears "Chats, 3 unread messages".
 */
/**
 * The red count pill, WhatsApp-style: solid red, white figures, fully round.
 * At the end of a menu row it stands alone; on an icon tile's corner the
 * caller adds `NAV_COUNT_BADGE_CORNER_CLASS`, which sets it half outside the
 * tile with a ring of the sidebar's ground, so it reads as cut out of the
 * corner rather than a box stuck on a box.
 */
export const NAV_COUNT_BADGE_CLASS =
  "pointer-events-none inline-grid h-5 min-w-5 place-items-center rounded-full bg-[#e5484d] px-1.5 text-[0.6875rem] leading-none font-semibold text-white not-italic tabular-nums";

/** On a tile's top-right corner, half outside it (the tile is `relative`). */
export const NAV_COUNT_BADGE_CORNER_CLASS =
  "absolute top-0 right-0 h-4.5 min-w-4.5 translate-x-[40%] -translate-y-[40%] px-1 text-[0.625rem] shadow-[0_0_0_2px_var(--sidebar-background,var(--surface))]";

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
