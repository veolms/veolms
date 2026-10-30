import { cataloguePermissions } from "@veolms/contracts";

const offered = new Set<string>(cataloguePermissions);

/** How many permissions the role editor offers. */
export const OFFERED_PERMISSION_COUNT = offered.size;

/**
 * How many of these the role editor offers: a role may also hold keys kept
 * for features not built yet, which the editor does not show.
 */
export function countOfferedPermissions(keys: Iterable<string>): number {
  let count = 0;
  for (const key of keys) if (offered.has(key)) count += 1;
  return count;
}

/** Built-in roles are stored as keys ("course_manager"); show them as words. */
export function roleLabel(name: string): string {
  if (!/^[a-z0-9_]+$/.test(name)) return name;
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatTeamDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "3 days ago", or the date once it is more than a month back. */
export function formatLastActive(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const minutes = Math.round((then - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relative.format(days, "day");
  return formatTeamDate(iso);
}

/** Splits pasted addresses on commas, semicolons, spaces and new lines. */
export function parseEmailList(text: string): {
  valid: string[];
  invalid: string[];
} {
  const parts = text
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(parts)];
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return {
    valid: unique.filter((email) => pattern.test(email)),
    invalid: unique.filter((email) => !pattern.test(email)),
  };
}

export function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

/** Initials for an avatar without a picture. */
export function initials(name: string | null, email: string): string {
  const source = (name || email).trim();
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  return (
    (words[0]?.[0] ?? "?").toUpperCase() + (words[1]?.[0] ?? "").toUpperCase()
  );
}
