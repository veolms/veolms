/**
 * The .ics file a registrant downloads: one event per session, in UTC, so
 * every calendar app shows it in the learner's own zone.
 */

function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

/** RFC 5545 folds lines longer than 75 octets with CRLF + one space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    // Never cut a multi-byte character in half.
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

export function workshopCalendar(input: {
  title: string;
  summary: string | null;
  pageUrl: string;
  uidDomain: string;
  now: Date;
  sessions: readonly {
    id: string;
    title: string | null;
    startsAt: Date;
    endsAt: Date;
  }[];
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VeoLMS//Workshops//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const description = [input.summary?.trim(), input.pageUrl]
    .filter(Boolean)
    .join("\n\n");
  for (const session of input.sessions) {
    const summary = session.title
      ? `${input.title}: ${session.title}`
      : input.title;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${session.id}@${input.uidDomain}`,
      `DTSTAMP:${icsStamp(input.now)}`,
      `DTSTART:${icsStamp(session.startsAt)}`,
      `DTEND:${icsStamp(session.endsAt)}`,
      `SUMMARY:${icsText(summary)}`,
      `DESCRIPTION:${icsText(description)}`,
      `URL:${input.pageUrl}`,
      "LOCATION:Online",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
