/**
 * The daily goal as the learner types it on the home page: one line of
 * text, read the way people write a length of time. "45", "45m", "45 min",
 * "1.5 hrs", "1h 30", "1 hr 30 min", "1 hour and 30 minutes", "1:30" and
 * "half an hour" all work, in any case and spacing. The API keeps whole
 * minutes between these bounds (`learningGoalSettingsSchema`), so they are
 * checked here before a save and the learner is told what is wrong in
 * words.
 *
 * A number on its own is hours up to 12 and minutes from 15: no goal can be
 * under 15 minutes, so "2" can only mean two hours.
 */
export const GOAL_MINUTES_MIN = 15;
export const GOAL_MINUTES_MAX = 720;

/** Every way of writing the format the field is told to use. */
export const GOAL_FORMAT_HINT = "Try 45 min, 1.5 hr or 1 hr 30 min";

/** "h" to "hours", "m" to "minutes", and the usual short forms and slips. */
const HOUR_WORDS = new Set([
  ...prefixes("hours"),
  "hr",
  "hrs",
  "hrz",
  "hors",
  "hous",
  "houre",
  "houres",
]);
const MINUTE_WORDS = new Set([
  ...prefixes("minutes"),
  "mins",
  "mn",
  "mns",
  "mnt",
  "mnts",
  "mt",
  "mts",
  "mint",
  "mints",
  "minuts",
  "minets",
  "mintues",
]);

function prefixes(word: string) {
  return Array.from(word, (_, index) => word.slice(0, index + 1));
}

function unitOf(word: string): "h" | "m" | null {
  if (HOUR_WORDS.has(word)) return "h";
  if (MINUTE_WORDS.has(word)) return "m";
  return null;
}

/** The field's text when it opens: "45 min", "1 hr", "1 hr 30 min". */
export function goalTextFromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** The same text, normalised so that only numbers and unit words are left. */
function normalise(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      // A decimal comma ("1,5 h"); any other comma separates the parts.
      .replace(/(\d),(\d)/g, "$1.$2")
      .replace(/,/g, " ")
      .replace(/½/g, ".5")
      // "a day", "per day", "/day", "daily" say nothing the field does not.
      .replace(/\s*(?:(?:a|per|each|every)\s+day|\/\s*day|daily)$/, "")
      .replace(/\b(?:an?|one)\s+hours?\s+and\s+a\s+half\b/g, "1.5 hr")
      .replace(/(\d+)\s*(?:hours?|hrs?|h)\s+and\s+a\s+half\b/g, "$1.5 hr")
      .replace(/\bhalf\s+(?:an?\s+)?hours?\b/g, "30 min")
      .replace(/\b(?:an?|one)\s+hours?\b/g, "1 hr")
      .replace(/(\d+)\s+and\s+a\s+half\b/g, "$1.5")
      .replace(/\band\b|[&+]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** The minutes the text stands for, or null when it cannot be read. */
export function parseGoalMinutes(value: string): number | null {
  const text = normalise(value);
  if (!text) return null;

  // A unit word with no number: "hour" is one hour.
  if (/^[a-z]+$/.test(text)) return unitOf(text) === "h" ? 60 : null;

  // A clock-style length: "1:30", "0:45", "1:30 hr".
  const clock = /^(\d{1,2}):([0-5]\d)(?:\s*([a-z]+))?$/.exec(text);
  if (clock) {
    if (clock[3] && unitOf(clock[3]) !== "h") return null;
    return Number(clock[1]) * 60 + Number(clock[2]);
  }

  // Up to two parts, each a number and maybe its unit: "1 hr 30 min",
  // "1h30", "90m".
  const parts: Array<{ amount: number; unit: "h" | "m" | null }> = [];
  const part = /\s*(\d+(?:\.\d*)?|\.\d+)\s*([a-z]+)?\.?\s*/y;
  while (part.lastIndex < text.length) {
    const match = part.exec(text);
    if (!match) return null;
    const unit = match[2] ? unitOf(match[2]) : null;
    if (match[2] && !unit) return null;
    parts.push({ amount: Number(match[1]), unit });
  }

  const [first, second, ...more] = parts;
  if (!first || more.length) return null;
  if (!second) {
    if (first.unit === "h") return first.amount * 60;
    if (first.unit === "m") return first.amount;
    return first.amount <= GOAL_MINUTES_MAX / 60
      ? first.amount * 60
      : first.amount;
  }
  // Hours first, then the minutes, which may go without their unit.
  if (first.unit !== "h" || second.unit === "h") return null;
  return first.amount * 60 + second.amount;
}

/** How far one press of the up or down arrow moves the goal. */
export const GOAL_STEP_MINUTES = 15;

/**
 * The field's text one step up or down from what it says: to the next
 * quarter hour, so "40 min" goes up to "45 min" and down to "30 min". Text
 * that cannot be read starts from the shortest goal; the result stays
 * within the goal's bounds.
 */
export function stepGoalText(value: string, direction: 1 | -1): string {
  const minutes = parseGoalMinutes(value);
  const current =
    minutes === null || !Number.isFinite(minutes)
      ? GOAL_MINUTES_MIN - direction * GOAL_STEP_MINUTES
      : Math.round(minutes);
  const stepped =
    direction > 0
      ? (Math.floor(current / GOAL_STEP_MINUTES) + 1) * GOAL_STEP_MINUTES
      : (Math.ceil(current / GOAL_STEP_MINUTES) - 1) * GOAL_STEP_MINUTES;
  return goalTextFromMinutes(
    Math.min(GOAL_MINUTES_MAX, Math.max(GOAL_MINUTES_MIN, stepped)),
  );
}

export type GoalInputCheck =
  { ok: true; minutes: number } | { ok: false; message: string };

/** The whole minutes the field stands for, or what is wrong with it. */
export function checkGoalInput(value: string): GoalInputCheck {
  if (!value.trim()) {
    return { ok: false, message: "Enter a goal, like 45 min or 1.5 hr" };
  }
  const minutes = parseGoalMinutes(value);
  if (minutes === null || !Number.isFinite(minutes)) {
    return { ok: false, message: GOAL_FORMAT_HINT };
  }
  // 1.33 hours is 79.8 minutes; the nearest whole minute is meant.
  const whole = Math.round(minutes);
  if (whole < GOAL_MINUTES_MIN) {
    return { ok: false, message: "Set at least 15 min a day" };
  }
  if (whole > GOAL_MINUTES_MAX) {
    return { ok: false, message: "Set at most 12 hr a day" };
  }
  return { ok: true, minutes: whole };
}
