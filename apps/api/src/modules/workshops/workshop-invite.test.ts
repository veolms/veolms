import assert from "node:assert/strict";
import { test } from "node:test";

import { parseMailbox, workshopInvite } from "./workshop-calendar.ts";

const base = {
  title: "React Performance Day",
  summary: "Rendering, memoisation and profiling.",
  pageUrl: "https://procodrr.com/workshops/react-performance-day",
  uidDomain: "procodrr.com",
  organizer: { name: "ProCodrr", email: "hello@procodrr.com" },
  attendeeEmail: "learner@example.com",
  sequence: 1794200000,
  now: new Date("2026-11-10T10:00:00Z"),
  sessions: [
    {
      id: "6b1f0a52-0d3a-4a57-9f53-3e1a9b2c7d10",
      title: null,
      startsAt: new Date("2026-11-12T13:30:00Z"),
      endsAt: new Date("2026-11-12T15:00:00Z"),
    },
  ],
};

await test("a REQUEST invites the learner to each session, with an organizer to reply to", () => {
  const ics = workshopInvite({ ...base, method: "REQUEST" });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nMETHOD:REQUEST\r\n/);
  assert.match(
    ics,
    /\r\nUID:6b1f0a52-0d3a-4a57-9f53-3e1a9b2c7d10@procodrr\.com\r\n/,
  );
  assert.match(ics, /\r\nSEQUENCE:1794200000\r\n/);
  assert.match(ics, /\r\nDTSTART:20261112T133000Z\r\n/);
  assert.match(ics, /\r\nORGANIZER;CN=ProCodrr:mailto:hello@procodrr\.com\r\n/);
  // Gmail shows Yes / No / Maybe only for an attendee asked to reply.
  assert.match(
    ics.replace(/\r\n /g, ""),
    /ATTENDEE;[^\r\n]*RSVP=TRUE:mailto:learner@example\.com/,
  );
  assert.match(ics, /\r\nSTATUS:CONFIRMED\r\n/);
  assert.match(ics, /\r\nBEGIN:VALARM\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  for (const line of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `folded: ${line}`);
  }
});

await test("a CANCEL removes the same entries", () => {
  const ics = workshopInvite({ ...base, method: "CANCEL" });
  assert.match(ics, /\r\nMETHOD:CANCEL\r\n/);
  assert.match(ics, /\r\nSTATUS:CANCELLED\r\n/);
  assert.match(ics, /UID:6b1f0a52-0d3a-4a57-9f53-3e1a9b2c7d10@procodrr\.com/);
  assert.doesNotMatch(ics, /VALARM/);
});

await test("the sender address gives the organizer's name and email", () => {
  assert.deepEqual(parseMailbox("ProCodrr <hello@procodrr.com>"), {
    name: "ProCodrr",
    email: "hello@procodrr.com",
  });
  assert.deepEqual(parseMailbox('"Pro Codrr" <a@b.co>'), {
    name: "Pro Codrr",
    email: "a@b.co",
  });
  assert.deepEqual(parseMailbox("noreply@veolms.org"), {
    name: null,
    email: "noreply@veolms.org",
  });
});
