import type { GuestHomePageResponse } from "@veolms/contracts";
import {
  clearSessionCache,
  readSessionCache,
  writeSessionCache,
} from "../../lib/session-cache";

// The suffix names the shape that is kept; a change to what the page needs
// from the response takes a new one, so an older copy is not read as it.
const GUEST_HOME_PAGE_SESSION_KEY = "veolms-guest-home-page:v1";

/**
 * How long a tab goes on showing the home page it was given before asking
 * whether the academy admin has changed it. The page is the same for every
 * visitor and changes only when it is edited in Home Page settings.
 */
export const GUEST_HOME_PAGE_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

const hasList = (section: unknown, list: string) =>
  Boolean(section) &&
  typeof section === "object" &&
  Array.isArray((section as Record<string, unknown>)[list]);

// The parts the page reads without a fallback. The full schema is left out
// on purpose: it would bring the validation library into every page's
// startup code for a copy this app wrote itself.
function isGuestHomePage(value: unknown): value is GuestHomePageResponse {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return (
    Boolean(page.hero) &&
    typeof page.hero === "object" &&
    hasList(page.highlights, "items") &&
    hasList(page.popularCourses, "courses") &&
    hasList(page.freeCourses, "courses") &&
    hasList(page.discussions, "items")
  );
}

export function readSessionGuestHomePage() {
  return readSessionCache(
    GUEST_HOME_PAGE_SESSION_KEY,
    GUEST_HOME_PAGE_SESSION_MAX_AGE_MS,
    isGuestHomePage,
  );
}

export function saveSessionGuestHomePage(page: GuestHomePageResponse) {
  writeSessionCache(GUEST_HOME_PAGE_SESSION_KEY, page);
}

export function clearSessionGuestHomePage() {
  clearSessionCache(GUEST_HOME_PAGE_SESSION_KEY);
}
