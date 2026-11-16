/**
 * Workshops, step 5 (changes): registrants hear when a published workshop
 * is cancelled or its sessions move; drafts and untouched times tell nobody.
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

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
const { renderNotificationTemplate } =
  await import("../../src/modules/notifications/notifications.templates.ts");

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

async function publishedWorkshop(
  client: FlowClient,
  title: string,
): Promise<WorkshopAdmin> {
  const start = new Date(Date.now() + 3 * DAY);
  const created = await client.post<WorkshopAdmin>("/v1/workshops/admin", {
    title,
    summary: "A live session.",
    sessions: [
      {
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + HOUR).toISOString(),
        timeZone: "Asia/Kolkata",
        joinUrl: "https://meet.google.com/chg-test-abc",
      },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const published = await client.post<WorkshopAdmin>(
    `/v1/workshops/admin/${created.body.data!.id}/publish`,
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return published.body.data!;
}

const updates = async (workshopId: string) =>
  (
    await flow.database
      .selectFrom("outbox_events")
      .select(["dedupe_key", "payload"])
      .where("event_type", "=", "workshop.updated")
      .orderBy("created_at", "asc")
      .execute()
  ).filter(
    (event) =>
      (event.payload as { workshopId: string }).workshopId === workshopId,
  );

await test("moving a session of a published workshop tells registrants once; a same-time save does not", async () => {
  const workshop = await publishedWorkshop(admin, "Moving workshop");
  const learner = await signedUpLearner(flow, "wsmove");
  assert.equal(
    (await learner.client.post(`/v1/workshops/${workshop.id}/register`)).status,
    201,
  );
  const session = workshop.sessions[0]!;

  // Saving the same times again is not a change.
  const same = await admin.patch<WorkshopAdmin>(
    `/v1/workshops/admin/${workshop.id}`,
    {
      sessions: [
        {
          id: session.id,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          timeZone: session.timeZone,
          joinUrl: "https://meet.google.com/chg-test-abc",
        },
      ],
    },
  );
  assert.equal(same.status, 200, JSON.stringify(same.body));
  assert.equal((await updates(workshop.id)).length, 0);

  const movedStart = new Date(new Date(session.startsAt).getTime() + DAY);
  const moved = await admin.patch<WorkshopAdmin>(
    `/v1/workshops/admin/${workshop.id}`,
    {
      sessions: [
        {
          id: session.id,
          startsAt: movedStart.toISOString(),
          endsAt: new Date(movedStart.getTime() + HOUR).toISOString(),
          timeZone: session.timeZone,
          joinUrl: "https://meet.google.com/chg-test-abc",
        },
      ],
    },
  );
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  const events = await updates(workshop.id);
  assert.equal(events.length, 1);
  const payload = events[0]!.payload as {
    change: string;
    startsAt: string | null;
  };
  assert.equal(payload.change, "rescheduled");
  assert.equal(payload.startsAt, movedStart.toISOString());

  const rendered = renderNotificationTemplate(
    "workshop.updated",
    {
      workshopTitle: "Moving workshop",
      change: "rescheduled",
      startsAt: movedStart.toISOString(),
      timeZone: "Asia/Kolkata",
    },
    `/workshops/${workshop.slug}`,
  );
  assert.equal(rendered.inApp.title, "Workshop time changed");
  assert.match(rendered.inApp.body, /now starts/);
});

await test("cancelling a published workshop tells registrants with the reason; a draft tells nobody", async () => {
  const workshop = await publishedWorkshop(admin, "Cancelled workshop");
  const learner = await signedUpLearner(flow, "wscancel");
  assert.equal(
    (await learner.client.post(`/v1/workshops/${workshop.id}/register`)).status,
    201,
  );

  const cancelled = await admin.post<WorkshopAdmin>(
    `/v1/workshops/admin/${workshop.id}/cancel`,
    { reason: "The host is unwell." },
  );
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.data?.status, "cancelled");

  const events = await updates(workshop.id);
  assert.equal(events.length, 1);
  const payload = events[0]!.payload as {
    change: string;
    reason: string | null;
    refunding: boolean;
  };
  assert.deepEqual(payload, {
    ...payload,
    change: "cancelled",
    reason: "The host is unwell.",
    refunding: false,
  });

  const rendered = renderNotificationTemplate(
    "workshop.updated",
    {
      workshopTitle: "Cancelled workshop",
      change: "cancelled",
      reason: "The host is unwell.",
      refunding: "",
    },
    `/workshops/${workshop.slug}`,
  );
  assert.equal(rendered.inApp.title, "Workshop cancelled");
  assert.match(rendered.inApp.body, /The host is unwell/);

  // The page now says so, and nobody can register.
  const me = await learner.client.get<WorkshopViewer>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  assert.equal(me.body.data?.reason, "cancelled");

  // Cancelling again changes nothing and tells nobody twice.
  await admin.post(`/v1/workshops/admin/${workshop.id}/cancel`, {
    reason: "Again.",
  });
  assert.equal((await updates(workshop.id)).length, 1);

  const draft = await admin.post<WorkshopAdmin>("/v1/workshops/admin", {
    title: "Draft to cancel",
  });
  const draftCancel = await admin.post(
    `/v1/workshops/admin/${draft.body.data!.id}/cancel`,
    { reason: "Never happened." },
  );
  assert.equal(draftCancel.status, 200);
  assert.equal((await updates(draft.body.data!.id)).length, 0);
});

await flow.close();
