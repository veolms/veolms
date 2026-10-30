import type { IncomingHttpHeaders } from "node:http";

/**
 * Roughly where a request came from, as Cloudflare (in front of the API)
 * says: the country always, the city and region once "Add visitor location
 * headers" is turned on (Rules > Transform Rules > Managed Transforms).
 * Without Cloudflare in front (local development) it is unknown.
 *
 * Only ever shown to the account's owner to tell their devices apart, never
 * used to decide anything: a client reaching the API directly could send
 * these headers itself.
 */
export interface SessionLocation {
  city: string | null;
  region: string | null;
  /** ISO 3166-1 alpha-2, upper case. */
  country: string | null;
}

const MAX_PLACE_LENGTH = 80;

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  if (!text) return null;
  // Cloudflare sends place names percent-encoded where they are not ASCII.
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // Kept as sent.
  }
  return (
    decoded.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_PLACE_LENGTH) ||
    null
  );
}

export function requestLocation(headers: IncomingHttpHeaders): SessionLocation {
  const country = header(headers, "cf-ipcountry")?.toUpperCase() ?? null;
  return {
    city: header(headers, "cf-ipcity"),
    region: header(headers, "cf-region"),
    // "XX" is no country known, "T1" is Tor.
    country:
      country && /^[A-Z]{2}$/.test(country) && country !== "XX"
        ? country
        : null,
  };
}

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "Mumbai, Maharashtra, India"; null when nothing is known. */
export function formatSessionLocation(location: {
  location_city: string | null;
  location_region: string | null;
  location_country: string | null;
}): string | null {
  let country: string | null = null;
  if (location.location_country) {
    try {
      country =
        countryNames.of(location.location_country) ?? location.location_country;
    } catch {
      country = location.location_country;
    }
  }
  const parts = [
    location.location_city,
    location.location_region,
    country,
  ].filter((part): part is string => Boolean(part));
  // A city named like its region ("Delhi, Delhi") says it once.
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.length > 0 ? unique.join(", ") : null;
}
