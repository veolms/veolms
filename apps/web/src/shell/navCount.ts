/** "9" up to the cap, then "9+" (or "99+"). */
export function formatBadgeCount(count: number, max: number): string {
  return count > max ? `${max}+` : String(count);
}
