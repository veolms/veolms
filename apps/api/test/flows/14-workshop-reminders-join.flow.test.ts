/**
 * Workshops, step 3: the Join button (a redirect to the meeting link that
 * counts as attendance, only for registrants and only while the window is
 * open) and the reminder poller (a day before, an hour before, at the start,
 * each once per session).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { WorkshopAdmin, WorkshopViewer } from "@veolms/contracts";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
  type FlowClient,
} from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
// Loaded after the flow environment is set, so config points at the test DB.
const { WorkshopReminderWorker } =
  await import("../../src/modules/workshops/workshop-reminder.worker.ts");
const { renderNotificationTemplate } =
  await import("../../src/modules/notifications/notifications.templates.ts");
const admin = await signedInAdmin(flow);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MEET = "https://meet.google.com/join-test-abc";

function at(offsetMs: number): Date {
  return new Date(Date.now() + offsetMs);
}

async function publishedWorkshop(
  client: FlowClient,
  title: string,
  sessions: { startsAt: Date; endsAt: Date; passcode?: string }[],
  extra: Record<string, unknown> = {},
): Promise<WorkshopAdmin> {
  const created = await client.post<WorkshopAdmin>("/v1/workshops/admin", {
    title,
    ...extra,
    summary: "A live session.",
    sessions: sessions.map((session) => ({
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      timeZone: "Asia/Kolkata",
      joinUrl: MEET,
      passcode: session.passcode ?? null,
    })),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const published = await client.post<WorkshopAdmin>(
    `/v1/workshops/admin/${created.body.data!.id}/publish`,
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return published.body.data!;
}

// A course workshop: its course's learners are in, others are not.
const course = await createCourse(flow, {
  title: "Join and remind course",
  pricing: "free",
});

// Session 1 opens for joining now (starts in 10 minutes); session 2 is in
// two days.
const workshop = await publishedWorkshop(
  admin,
  "Join and remind",
  [
    { startsAt: at(10 * MINUTE), endsAt: at(70 * MINUTE), passcode: "4242" },
    { startsAt: at(2 * DAY), endsAt: at(2 * DAY + HOUR) },
  ],
  { courseId: course.id },
);
const [soon, later] = workshop.sessions;
assert.ok(soon && later);

const learner = await signedUpLearner(flow, "wsjoin");
assert.equal((await enrollForFree(learner.client, course)).status, 200);
const outsider = await signedUpLearner(flow, "wsoutsider");

await test("a registrant sees which session is joinable, with its passcode, and nobody else does", async () => {
  const registered = await learner.client.post(
    `/v1/workshops/${workshop.id}/register`,
  );
  assert.equal(registered.status, 201, JSON.stringify(registered.body));

  const me = await learner.client.get<WorkshopViewer>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  assert.equal(me.status, 200);
  assert.deepEqual(me.body.data?.joinable, [
    { sessionId: soon.id, passcode: "4242" },
  ]);

  const notRegistered = await outsider.client.get<WorkshopViewer>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  assert.deepEqual(notRegistered.body.data?.joinable, []);
  assert.equal(
    JSON.stringify(notRegistered.body).includes("4242"),
    false,
    "the passcode is for registrants",
  );
});

await test("Join redirects a registrant to the meeting link and records the attendance", async () => {
  const join = await learner.client.request(
    "GET",
    `/v1/workshops/${workshop.id}/sessions/${soon.id}/join`,
  );
  assert.equal(join.status, 302, JSON.stringify(join.body));
  assert.equal(join.headers.location, MEET);
  assert.equal(join.headers["cache-control"], "no-store");

  const me = await learner.client.get<WorkshopViewer>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  assert.deepEqual(me.body.data?.joinedSessionIds, [soon.id]);

  // A second click is not a second attendance.
  await learner.client.request(
    "GET",
    `/v1/workshops/${workshop.id}/sessions/${soon.id}/join`,
  );
  const again = await learner.client.get<WorkshopViewer>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  assert.deepEqual(again.body.data?.joinedSessionIds, [soon.id]);
});

await test("Join is refused before the window opens, for non-registrants, and signed out", async () => {
  const early = await learner.client.request(
    "GET",
    `/v1/workshops/${workshop.id}/sessions/${later.id}/join`,
  );
  assert.equal(early.status, 409);
  assert.equal(early.body.error?.code, "WORKSHOP_JOIN_NOT_OPEN");

  const stranger = await outsider.client.request(
    "GET",
    `/v1/workshops/${workshop.id}/sessions/${soon.id}/join`,
  );
  assert.equal(stranger.status, 403);
  assert.equal(stranger.body.error?.code, "WORKSHOP_NOT_REGISTERED");

  const anonymous = await flow
    .visitor()
    .request("GET", `/v1/workshops/${workshop.id}/sessions/${soon.id}/join`);
  assert.equal(anonymous.status, 401);

  const unknown = await learner.client.request(
    "GET",
    `/v1/workshops/${workshop.id}/sessions/${crypto.randomUUID()}/join`,
  );
  assert.equal(unknown.status, 404);
});

await test("the poller queues each reminder once per session and window", async () => {
  const worker = new WorkshopReminderWorker({ database: flow.database });
  const laterStart = new Date(later.startsAt);
  const soonStart = new Date(soon.startsAt);

  // Other tests leave sessions around that may fall into the same windows,
  // so the counts only say "something" or "nothing new"; the dedupe keys
  // below say exactly what was queued for this workshop.
  const dayBefore = new Date(laterStart.getTime() - 23 * HOUR);
  assert.ok((await worker.publishDue(dayBefore)) >= 1);
  // The same minute again: nothing new.
  assert.equal(await worker.publishDue(dayBefore), 0);
  // 50 minutes before: the hour-before reminder. At the start: live now.
  assert.ok(
    (await worker.publishDue(new Date(laterStart.getTime() - 50 * MINUTE))) >=
      1,
  );
  assert.ok((await worker.publishDue(laterStart)) >= 1);
  // The soon session is 10 minutes out: its day and hour windows have
  // passed and its start has not come, so nothing is queued for it until
  // it starts.
  await worker.publishDue(new Date());
  assert.ok(
    (await worker.publishDue(new Date(soonStart.getTime() + 3 * MINUTE))) >= 1,
  );

  const queued = (
    await flow.database
      .selectFrom("outbox_events")
      .select(["dedupe_key", "payload"])
      .where("event_type", "=", "workshop.reminder")
      .orderBy("created_at", "asc")
      .execute()
  ).filter((event) => {
    const { workshopId } = event.payload as { workshopId: string };
    return workshopId === workshop.id;
  });
  assert.deepEqual(
    queued.map((event) => event.dedupe_key),
    [
      `workshop.reminder:${later.id}:day`,
      `workshop.reminder:${later.id}:hour`,
      `workshop.reminder:${later.id}:now`,
      `workshop.reminder:${soon.id}:now`,
    ],
  );
  const payload = queued[0]!.payload as {
    workshopId: string;
    workshopSlug: string;
    sessionId: string;
    window: string;
  };
  assert.equal(payload.workshopId, workshop.id);
  assert.equal(payload.workshopSlug, workshop.slug);
  assert.equal(payload.sessionId, later.id);
  assert.equal(payload.window, "day");
});

await test("each window has its own wording", () => {
  const data = {
    workshopTitle: "Join and remind",
    workshopSlug: workshop.slug,
    sessionTitle: "",
    startsAt: later.startsAt,
    endsAt: later.endsAt,
    timeZone: "Asia/Kolkata",
  };
  const day = renderNotificationTemplate(
    "workshop.reminder",
    { ...data, window: "day" },
    `/workshops/${workshop.slug}`,
  );
  assert.equal(day.inApp.title, "Tomorrow: your workshop");
  assert.equal(day.email.subject, "Tomorrow: Join and remind");
  const hour = renderNotificationTemplate(
    "workshop.reminder",
    { ...data, window: "hour" },
    `/workshops/${workshop.slug}`,
  );
  assert.equal(hour.inApp.title, "Starting in an hour");
  assert.match(hour.email.text, /15 minutes before/);
  const now = renderNotificationTemplate(
    "workshop.reminder",
    { ...data, window: "now" },
    `/workshops/${workshop.slug}`,
  );
  assert.equal(now.inApp.title, "Live now");
  assert.match(now.email.html, /Join now/);
  assert.match(now.email.text, new RegExp(`/workshops/${workshop.slug}`));
});

await flow.close();
