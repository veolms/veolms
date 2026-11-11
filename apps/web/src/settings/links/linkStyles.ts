import type { ShortLink } from "@veolms/contracts";

/** The Links tab's field look, as the Coupons pages draw theirs. */
export const linkInputClass =
  "h-10 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-3 text-sm text-(--text) outline-none transition-[border-color,box-shadow] placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

/** Small square icon buttons in rows and the drawer. */
export const linkIconButtonClass =
  "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:cursor-default disabled:opacity-50";

/** The site's own address, as links are shown and copied. */
export function siteOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function siteHost(): string {
  return siteOrigin().replace(/^https?:\/\//u, "");
}

export function linkAddress(link: Pick<ShortLink, "path">): string {
  return `${siteOrigin()}${link.path}`;
}

/** The destination without its scheme, for compact display. */
export function shortDestination(destination: string): string {
  return destination.replace(/^https:\/\//u, "").replace(/\/$/u, "");
}

export function modeLabel(link: Pick<ShortLink, "mode" | "redirectStatus">) {
  return link.mode === "rewrite"
    ? "Shown here"
    : `Redirect ${link.redirectStatus}`;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatLinkDate(value: string): string {
  return dateFormatter.format(new Date(value));
}
