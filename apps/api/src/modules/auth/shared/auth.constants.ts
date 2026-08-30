/**
 * Tunables for the auth flows. Centralised because several of these values are
 * quoted to users in email and SMS copy, and a drift between the number in the
 * message and the number the API enforces is a support ticket.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// --- One-time passcodes -----------------------------------------------------

/** Quoted in the OTP email and SMS templates. */
export const OTP_TTL_MINUTES = 5;
export const OTP_TTL_MS = OTP_TTL_MINUTES * MINUTE_MS;

/** Wrong guesses before the outstanding code is burned. */
export const OTP_MAX_ATTEMPTS = 3;

/** Minimum gap between sends for one identifier and purpose. */
export const OTP_RESEND_WINDOW_MS = 60 * 1000;

/** Ceiling per identifier and purpose, so the resend gap cannot be looped. */
export const OTP_DAILY_LIMIT = 10;
export const OTP_DAILY_WINDOW_MS = DAY_MS;

// --- Sessions ---------------------------------------------------------------

export const SESSION_TTL_DAYS = 30;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * DAY_MS;
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

/**
 * `last_used_at` is only refreshed once a session is older than this, to keep
 * an authenticated request from writing on every call.
 */
export const SESSION_TOUCH_INTERVAL_MS = 15 * MINUTE_MS;

// --- Multi-factor -----------------------------------------------------------

export const TOTP_MAX_FAILED_ATTEMPTS = 5;
export const TOTP_LOCK_DURATION_MS = 5 * MINUTE_MS;

export const BACKUP_CODE_COUNT = 10;
/** Backup codes are 8 digits, distinguishing them from 6-digit TOTP codes. */
export const BACKUP_CODE_MIN = 10_000_000;
export const BACKUP_CODE_MAX = 99_999_999;

export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * MINUTE_MS;

// --- Platform setup ---------------------------------------------------------

export const SETUP_SESSION_TTL_MS = 30 * MINUTE_MS;
export const SETUP_SESSION_TTL_SECONDS = 30 * 60;

// --- Cookies ----------------------------------------------------------------

export const SESSION_COOKIE = "veolms-session";
export const OAUTH_STATE_COOKIE = "veolms-oauth-state";
export const SETUP_COOKIE = "veolms-setup-token";

export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

// --- Roles ------------------------------------------------------------------

export const ADMIN_ROLE = "admin";
export const INSTRUCTOR_ROLE = "instructor";
export const STUDENT_ROLE = "student";

/** Bounded so a pathological username prefix cannot spin indefinitely. */
export const USERNAME_SUFFIX_ATTEMPTS = 10;
