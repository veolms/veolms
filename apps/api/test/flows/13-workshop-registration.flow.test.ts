/**
 * Workshops, the learner side: the public list and page, registering for a
 * free workshop, what keeps a learner out (seats, a linked course, a paid
 * workshop), cancelling, the calendar file, and the confirmation that is
 * queued.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  WorkshopAdmin,
  WorkshopPublic,
  WorkshopPublicListResponse,
  WorkshopViewer,
} from "@veolms/contracts";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
  type FlowClient,
} from "./setup/flow-app.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

const DAY = 24 * 60 * 60 * 1000;

function inDays(days: number): string {
  const date = new Date(Date.now() + days * DAY);
  date.setUTCHours(13, 30, 0, 0);
  return date.toISOString();
}

async function publishedWorkshop(
  client: FlowClient,
  body: Record<string, unknown>,
): Promise<WorkshopAdmin> {
  const created = await client.post<WorkshopAdmin>("/v1/workshops/admin", {
    summary: "A live session.",
    sessions: [
      {
        startsAt: inDays(2),
        endsAt: new Date(
          new Date(inDays(2)).getTime() + 60 * 60_000,
        ).toISOString(),
        timeZone: "Asia/Kolkata",
        joinUrl: "https://meet.google.com/abc-defg-hij",
      },
    ],
    ...body,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const published = await client.post<WorkshopAdmin>(
    `/v1/workshops/admin/${created.body.data!.id}/publish`,
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return published.body.data!;
}

const free = await publishedWorkshop(admin, { title: "Open house on React" });

await test("visitors see published workshops and their page, never the meeting link", async () => {
  const visitor = flow.visitor();
  const list = await visitor.get<WorkshopPublicListResponse>("/v1/workshops");
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const item = list.body.data!.upcoming.find((entry) => entry.id === free.id);
  assert.ok(item, "the published workshop is listed");
  assert.equal(item.state, "upcoming");
  assert.equal(item.priceMinor, null);
  assert.equal(JSON.stringify(list.body).includes("meet.google.com"), false);

  const page = await visitor.get<WorkshopPublic>(`/v1/workshops/${free.slug}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.data?.sessions.length, 1);
  assert.equal(JSON.stringify(page.body).includes("meet.google.com"), false);
  assert.equal(JSON.stringify(page.body).includes("joinUrl"), false);

  const draft = await admin.post<WorkshopAdmin>("/v1/workshops/admin", {
    title: "Still a draft",
  });
  const hidden = await visitor.get(`/v1/workshops/${draft.body.data!.slug}`);
  assert.equal(hidden.status, 404, "drafts are not public");

  const me = await visitor.get(`/v1/workshops/${free.slug}/me`);
  assert.equal(me.status, 401);
  const register = await visitor.post(`/v1/workshops/${free.id}/register`);
  assert.equal(register.status, 401);
});

await test("a learner registers once, gets a confirmation queued, and can leave again", async () => {
  const { client } = await signedUpLearner(flow, "wsreg");

  const before = await client.get<WorkshopViewer>(
    `/v1/workshops/${free.slug}/me`,
  );
  assert.equal(before.status, 200);
  assert.deepEqual(
    {
      registered: before.body.data?.registered,
      reason: before.body.data?.reason,
    },
    { registered: false, reason: "ok" },
  );

  const registered = await client.post<{
    registered: true;
    registrationId: string;
  }>(`/v1/workshops/${free.id}/register`);
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const again = await client.post<{ registrationId: string }>(
    `/v1/workshops/${free.id}/register`,
  );
  assert.equal(again.status, 201, "registering twice is harmless");
  assert.equal(
    again.body.data?.registrationId,
    registered.body.data?.registrationId,
  );

  const after = await client.get<WorkshopViewer>(
    `/v1/workshops/${free.slug}/me`,
  );
  assert.equal(after.body.data?.registered, true);
  assert.equal(after.body.data?.reason, "registered");
  assert.equal(after.body.data?.canRegister, false);

  const page = await client.get<WorkshopPublic>(`/v1/workshops/${free.slug}`);
  assert.equal(page.body.data?.registrationCount, 1);

  const queued = await flow.database
    .selectFrom("outbox_events")
    .select(["event_type", "payload"])
    .where("event_type", "=", "workshop.registered")
    .execute();
  assert.equal(queued.length, 1, "one confirmation was queued");
  assert.equal(
    (queued[0]!.payload as { workshopId: string }).workshopId,
    free.id,
  );

  const calendar = await client.request(
    "GET",
    `/v1/workshops/${free.id}/calendar.ics`,
  );
  assert.equal(calendar.status, 200);
  assert.match(String(calendar.headers["content-type"]), /text\/calendar/);
  const ics = String(calendar.body.raw ?? "");
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /SUMMARY:Open house on React/);
  assert.match(ics, /\r\n$/, "calendar lines end with CRLF");

  const left = await client.delete<{ registered: false }>(
    `/v1/workshops/${free.id}/register`,
  );
  assert.equal(left.status, 200);
  const gone = await client.get<WorkshopViewer>(
    `/v1/workshops/${free.slug}/me`,
  );
  assert.equal(gone.body.data?.registered, false);
  assert.equal(gone.body.data?.reason, "ok", "they may register again");
  const noCalendar = await client.request(
    "GET",
    `/v1/workshops/${free.id}/calendar.ics`,
  );
  assert.equal(noCalendar.status, 403, "the calendar file is for registrants");
});

await test("seats, a linked course and a price keep learners out, each with its own reason", async () => {
  const oneSeat = await publishedWorkshop(admin, {
    title: "One seat only",
    capacity: 1,
  });
  const first = await signedUpLearner(flow, "seatone");
  const second = await signedUpLearner(flow, "seattwo");
  assert.equal(
    (await first.client.post(`/v1/workshops/${oneSeat.id}/register`)).status,
    201,
  );
  const full = await second.client.post(`/v1/workshops/${oneSeat.id}/register`);
  assert.equal(full.status, 409);
  assert.equal(full.body.error?.code, "WORKSHOP_FULL");
  const seen = await second.client.get<WorkshopViewer>(
    `/v1/workshops/${oneSeat.slug}/me`,
  );
  assert.equal(seen.body.data?.reason, "full");
  const page = await second.client.get<WorkshopPublic>(
    `/v1/workshops/${oneSeat.slug}`,
  );
  assert.equal(page.body.data?.seatsLeft, 0);

  const paid = await publishedWorkshop(admin, {
    title: "Paid deep dive",
    priceMinor: 49_900,
    currency: "INR",
  });
  const paidTry = await first.client.post(`/v1/workshops/${paid.id}/register`);
  assert.equal(paidTry.status, 409);
  assert.equal(paidTry.body.error?.code, "WORKSHOP_PAYMENT_REQUIRED");

  const courses = await admin.post<{ id: string }>("/v1/courses", {
    title: "Workshop host course",
  });
  if (courses.status === 201 && courses.body.data?.id) {
    const linked = await publishedWorkshop(admin, {
      title: "For course learners",
      courseId: courses.body.data.id,
    });
    const outsider = await first.client.post(
      `/v1/workshops/${linked.id}/register`,
    );
    assert.equal(outsider.status, 403);
    assert.equal(outsider.body.error?.code, "WORKSHOP_COURSE_REQUIRED");
    const reason = await first.client.get<WorkshopViewer>(
      `/v1/workshops/${linked.slug}/me`,
    );
    assert.equal(reason.body.data?.reason, "course_required");
  }
});

await flow.close();
