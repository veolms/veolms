import {
  WORKSHOP_DEFAULT_TIME_ZONE,
  formatMoney,
  type WorkshopAdminListItem,
  type WorkshopPublicState,
  type WorkshopSessionState,
} from "@veolms/contracts";

import { elevatedCardClasses } from "../components/ElevatedCard";
import { getApiRequestUrl } from "../lib/api-client";

export const surfaceClass = `${elevatedCardClasses} overflow-hidden text-(--text)`;

export const inputClass =
  "h-9 sm:h-10 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-2.5 sm:px-3.5 text-xs sm:text-sm text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

export const fieldClass = `${inputClass} h-11 rounded-xl`;

export const selectTriggerClass =
  "h-11! p-0! bg-transparent! shadow-none! border-0! text-sm font-medium hover:bg-transparent! flex w-full items-center justify-between";

/** What a card says about a workshop, in one word. */
export type WorkshopDisplayStatus =
  "draft" | "upcoming" | "live" | "past" | "cancelled";

export function workshopDisplayStatus(
  item: Pick<
    WorkshopAdminListItem,
    "status" | "nextSessionAt" | "lastSessionEndsAt"
  >,
  now: number = Date.now(),
): WorkshopDisplayStatus {
  if (item.status === "draft") return "draft";
  if (item.status === "cancelled") return "cancelled";
  const lastEnd = item.lastSessionEndsAt
    ? new Date(item.lastSessionEndsAt).getTime()
    : null;
  if (lastEnd !== null && lastEnd <= now) return "past";
  const next = item.nextSessionAt
    ? new Date(item.nextSessionAt).getTime()
    : null;
  if (next !== null && next <= now) return "live";
  return "upcoming";
}

export function workshopStatusLabel(status: WorkshopDisplayStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "upcoming":
      return "Upcoming";
    case "live":
      return "Live now";
    case "past":
      return "Ended";
    case "cancelled":
      return "Cancelled";
  }
}

export function workshopStatusClass(status: WorkshopDisplayStatus): string {
  switch (status) {
    case "upcoming":
      return "bg-(--accent)/12 text-(--accent) border border-(--accent)/20";
    case "live":
      return "bg-emerald-500/12 text-emerald-500 border border-emerald-500/20";
    case "cancelled":
      return "bg-rose-500/12 text-rose-500 border border-rose-500/20";
    case "past":
    case "draft":
      return "bg-(--canvas) text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]";
  }
}

export function sessionStateLabel(state: WorkshopSessionState): string {
  switch (state) {
    case "upcoming":
      return "Upcoming";
    case "join_open":
      return "Starting soon";
    case "live":
      return "Live now";
    case "ended":
      return "Ended";
  }
}

export function formatWorkshopPrice(
  priceMinor: number | null,
  currency: string,
): string {
  if (priceMinor === null || priceMinor === 0) return "Free";
  return formatMoney(priceMinor, { currency });
}

export function formatRegistrations(
  count: number,
  capacity: number | null,
): string {
  if (capacity === null) {
    return count === 1 ? "1 registered" : `${count} registered`;
  }
  return `${count} / ${capacity} seats`;
}

/** "Wed, 12 Nov 2026" */
export function formatSessionDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

/** "7:00 PM" */
export function formatSessionTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** "IST" or "GMT+5:30", whichever the browser knows the zone as. */
export function timeZoneShortName(
  timeZone: string,
  at: Date = new Date(),
): string {
  const part = new Intl.DateTimeFormat("en-IN", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(at)
    .find((item) => item.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/** "Wed, 12 Nov 2026 · 7:00 PM – 8:30 PM IST" */
export function formatSessionWhen(
  startsAt: string,
  endsAt: string,
  timeZone: string,
): string {
  return `${formatSessionDay(startsAt, timeZone)} · ${formatSessionTime(startsAt, timeZone)} – ${formatSessionTime(endsAt, timeZone)} ${timeZoneShortName(timeZone, new Date(startsAt))}`;
}

export function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.max(
    0,
    Math.round(
      (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000,
    ),
  );
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export const DURATION_OPTIONS: readonly [string, string][] = [
  ["30", "30 minutes"],
  ["45", "45 minutes"],
  ["60", "1 hour"],
  ["90", "1 hour 30 minutes"],
  ["120", "2 hours"],
  ["180", "3 hours"],
  ["240", "4 hours"],
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

const wallFormatters = new Map<string, Intl.DateTimeFormat>();

function wallParts(date: Date, timeZone: string) {
  let formatter = wallFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    wallFormatters.set(timeZone, formatter);
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: (parts.hour ?? 0) % 24,
    minute: parts.minute ?? 0,
  };
}

/**
 * The wall-clock value the date picker shows ("YYYY-MM-DDTHH:mm") for an
 * instant, in the session's time zone, not the browser's.
 */
export function instantToWallValue(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = wallParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** The instant a wall-clock value in a time zone names, or null. */
export function wallValueToInstant(
  wall: string,
  timeZone: string,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wall);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number) as number[];
  const wanted = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  let utc = wanted;
  // The zone's offset at the guessed instant corrects the guess; twice
  // covers a daylight-saving boundary.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const got = wallParts(new Date(utc), timeZone);
    const asUtc = Date.UTC(
      got.year,
      got.month - 1,
      got.day,
      got.hour,
      got.minute,
    );
    const difference = wanted - asUtc;
    if (difference === 0) break;
    utc += difference;
  }
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function browserTimeZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      WORKSHOP_DEFAULT_TIME_ZONE
    );
  } catch {
    return WORKSHOP_DEFAULT_TIME_ZONE;
  }
}

function zoneOffsetLabel(timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date())
      .find((item) => item.type === "timeZoneName");
    return part?.value ?? "";
  } catch {
    return "";
  }
}

let cachedZoneOptions: readonly [string, string][] | null = null;

/** Every time zone the browser knows, the default first, labelled with its offset. */
export function timeZoneOptions(): readonly [string, string][] {
  if (cachedZoneOptions) return cachedZoneOptions;
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [WORKSHOP_DEFAULT_TIME_ZONE, "UTC"];
  const zones = [
    WORKSHOP_DEFAULT_TIME_ZONE,
    ...supported.filter((zone) => zone !== WORKSHOP_DEFAULT_TIME_ZONE),
  ];
  cachedZoneOptions = zones.map((zone) => {
    const offset = zoneOffsetLabel(zone);
    return [zone, offset ? `${zone.replace(/_/g, " ")} (${offset})` : zone];
  });
  return cachedZoneOptions;
}

// --- Learner pages ---

export function publicStateLabel(state: WorkshopPublicState): string {
  switch (state) {
    case "live":
      return "Live now";
    case "ended":
      return "Ended";
    case "upcoming":
      return "Upcoming";
  }
}

export function publicStateClass(state: WorkshopPublicState): string {
  switch (state) {
    case "live":
      return "bg-emerald-500 text-white";
    case "ended":
      return "bg-black/60 text-white";
    case "upcoming":
      return "bg-(--accent) text-(--on-accent)";
  }
}

/** One line for a card: "Tue, 10 Nov 2026 · 7:00 PM IST" in the viewer's zone. */
export function formatNextSession(
  iso: string | null,
  timeZone: string,
): string {
  if (!iso) return "Date to be announced";
  return `${formatSessionDay(iso, timeZone)} · ${formatSessionTime(iso, timeZone)} ${timeZoneShortName(timeZone, new Date(iso))}`;
}

export function seatsLeftLabel(seatsLeft: number | null): string | null {
  if (seatsLeft === null) return null;
  if (seatsLeft === 0) return "Full";
  return seatsLeft === 1 ? "1 seat left" : `${seatsLeft} seats left`;
}

/** The signed-in learner's calendar file for a workshop they registered for. */
export function workshopCalendarUrl(workshopId: string): string {
  return getApiRequestUrl(`/workshops/${workshopId}/calendar.ics`);
}
