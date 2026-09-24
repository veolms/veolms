export interface ParsedInlineTimestamp {
  token: string;
  seconds: number;
  hours: number | null;
  minutes: number;
  secondsPart: number;
}

export type InlineTimestampPart =
  | { type: "text"; value: string }
  | ({ type: "timestamp"; value: string } & ParsedInlineTimestamp);

const TIMESTAMP_CANDIDATE_PATTERN = /~\d+(?::\d+){1,2}/g;

export function parseInlineTimestampToken(
  token: string,
): ParsedInlineTimestamp | null {
  if (!/^~\d+(?::\d+){1,2}$/.test(token)) return null;

  const segments = token.slice(1).split(":");
  if (segments.length !== 2 && segments.length !== 3) return null;

  const [first, second, third] = segments;
  const hasHours = segments.length === 3;
  const minutesText = hasHours ? second : first;
  const secondsText = hasHours ? third : second;

  if (
    !minutesText ||
    !secondsText ||
    !/^\d{2}$/.test(secondsText) ||
    (hasHours ? !/^\d{2}$/.test(minutesText) : !/^\d+$/.test(minutesText))
  ) {
    return null;
  }

  const hours = hasHours ? Number(first) : null;
  const minutes = Number(minutesText);
  const secondsPart = Number(secondsText);

  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(secondsPart) ||
    (hasHours && !Number.isFinite(hours)) ||
    secondsPart > 59 ||
    (hasHours && minutes > 59)
  ) {
    return null;
  }

  const totalSeconds = (hours ?? 0) * 3600 + minutes * 60 + secondsPart;
  if (!Number.isFinite(totalSeconds)) return null;

  return {
    token,
    seconds: totalSeconds,
    hours,
    minutes,
    secondsPart,
  };
}

function hasTimestampBoundary(
  text: string,
  start: number,
  end: number,
): boolean {
  const previous = text[start - 1];
  const next = text[end];

  if (previous && /[A-Za-z0-9_~]/.test(previous)) return false;
  if (next && /[A-Za-z0-9_:~]/.test(next)) return false;
  return true;
}

export function tokenizeInlineTimestamps(text: string): InlineTimestampPart[] {
  const parts: InlineTimestampPart[] = [];
  const regex = new RegExp(TIMESTAMP_CANDIDATE_PATTERN.source, "g");
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const value = match[0];
    const start = match.index;
    const end = start + value.length;
    if (!hasTimestampBoundary(text, start, end)) continue;

    const parsed = parseInlineTimestampToken(value);
    if (!parsed) continue;

    if (start > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, start) });
    }
    parts.push({ type: "timestamp", value, ...parsed });
    cursor = end;
  }

  if (parts.length === 0) return [{ type: "text", value: text }];
  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }
  return parts;
}

function formatUnit(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}

export function formatInlineTimestampAriaLabel(
  timestamp: ParsedInlineTimestamp,
): string {
  const time =
    timestamp.hours === null
      ? `${formatUnit(timestamp.minutes, "minute")} ${formatUnit(timestamp.secondsPart, "second")}`
      : `${formatUnit(timestamp.hours, "hour")} ${formatUnit(timestamp.minutes, "minute")} ${formatUnit(timestamp.secondsPart, "second")}`;
  return `Seek video to ${time}`;
}
