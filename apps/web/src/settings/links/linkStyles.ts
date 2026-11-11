import { elevatedCardClasses } from "../../components/ElevatedCard";

/** The Links tab's card and field looks, as the Coupons pages draw them. */
export const linkCardClass = `${elevatedCardClasses} text-(--text)`;

export const linkInputClass =
  "h-10 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-3 text-sm text-(--text) outline-none transition-[border-color,box-shadow] placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

export const linkBadgeClass =
  "inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap text-(--muted)";

/** The site's own address, as links are shown and copied. */
export function siteOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}
