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
      className={`pointer-events-none inline-grid h-4.5 min-w-4.5 place-items-center rounded-full bg-rose-600 px-1 text-[0.625rem] leading-none font-bold text-white not-italic tabular-nums shadow-[0_0_0_2px_var(--sidebar-background,var(--surface))] ${className}`}
    >
      {formatBadgeCount(count, max)}
      <span className="sr-only"> {unreadLabel}</span>
    </em>
  );
}
