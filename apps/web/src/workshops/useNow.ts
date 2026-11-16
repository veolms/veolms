import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs` so countdowns and the
 * "Join now" switch move on their own.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** "in 2h 14m", "in 3 days", "in 5 min": how long until `iso`. */
export function formatCountdown(iso: string, now: number): string {
  const minutes = Math.max(
    0,
    Math.round((new Date(iso).getTime() - now) / 60_000),
  );
  if (minutes < 1) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest > 0 ? `in ${hours}h ${rest}m` : `in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

/** Join opens 15 minutes before the start, as the API allows. */
export const JOIN_OPENS_MS = 15 * 60_000;
