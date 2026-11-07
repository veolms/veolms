/** Time and label helpers for chat, shaped like WhatsApp's. */

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function startOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/** "7:09 PM" inside a bubble. */
export function messageTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** The chat list's time column: today's time, "Yesterday", a weekday, or a date. */
export function listTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86_400_000,
  );
  if (days <= 0) return timeFormat.format(date);
  if (days === 1) return "Yesterday";
  if (days < 7) return weekdayFormat.format(date);
  return dateFormat.format(date);
}

/** The date chip between days: "TODAY", "YESTERDAY", weekday or date. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86_400_000,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return weekdayFormat.format(date);
  return dateFormat.format(date);
}

export function sameDay(a: string, b: string) {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Sender names in groups get a stable colour from their id (as in
 * WhatsApp), from a set readable on both light and dark bubbles.
 */
const NAME_TONES = [
  "text-[#e5427a] [:root[data-theme=dark]_&]:text-[#f472b6]",
  "text-[#0f8f6b] [:root[data-theme=dark]_&]:text-[#34d399]",
  "text-[#b45309] [:root[data-theme=dark]_&]:text-[#fbbf24]",
  "text-[#2563eb] [:root[data-theme=dark]_&]:text-[#60a5fa]",
  "text-[#7c3aed] [:root[data-theme=dark]_&]:text-[#a78bfa]",
  "text-[#c2410c] [:root[data-theme=dark]_&]:text-[#fb923c]",
  "text-[#0e7490] [:root[data-theme=dark]_&]:text-[#22d3ee]",
  "text-[#be123c] [:root[data-theme=dark]_&]:text-[#fb7185]",
];

export function nameTone(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1)
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return NAME_TONES[Math.abs(hash) % NAME_TONES.length]!;
}

export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  instructor: "Instructor",
  staff: "Staff",
  helper: "Helper",
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (
      (parts[0]?.[0] ?? "") +
      (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
    ).toUpperCase() || "?"
  );
}
