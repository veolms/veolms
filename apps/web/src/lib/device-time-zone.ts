/**
 * Known legacy-to-canonical aliases where Intl.resolvedOptions().timeZone
 * retains the legacy name (e.g. Asia/Calcutta in ICU/V8) rather than the
 * modern identifier recognized by PostgreSQL (Asia/Kolkata).
 */
const TIME_ZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
};

/** The IANA time zone this device is set to, or "UTC" when unknown. */
export function getDeviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return TIME_ZONE_ALIASES[zone] ?? zone;
  } catch {
    return "UTC";
  }
}
