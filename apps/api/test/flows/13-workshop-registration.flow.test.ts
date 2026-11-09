/**
 * Workshops, the learner side: who is in. Nobody registers: an open free
 * workshop is for every learner, a course workshop for its course's
 * learners, a paid one for its buyers. "I'm not going" stops the reminders
 * and can be undone. Visitors see the page but never the meeting link.
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
import { createCourse } from "./setup/flow-courses.ts";

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
    {},
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return published.body.data!;
}

const open = await publishedWorkshop(admin, { title: "Open house on React" });

await test("visitors see published workshops and their page, never the meeting link", async () => {
  const visitor = flow.visitor();
  const list = await visitor.get<WorkshopPublicListResponse>("/v1/workshops");
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const item = list.body.data!.upcoming.find((entry) => entry.id === open.id);
  assert.ok(item, "the published workshop is listed");
  assert.ok(item.nextSessionId, "the next session is named for Join");
  assert.equal(JSON.stringify(list.body).includes("meet.google.com"), false);

  const page = await visitor.get<WorkshopPublic>(`/v1/workshops/${open.slug}`);
  assert.equal(page.status, 200);
  assert.equal(JSON.stringify(page.body).includes("meet.google.com"), false);

  const draft = await admin.post<WorkshopAdmin>("/v1/workshops/admin", {
    title: "Still a draft",
  });
  const hidden = await visitor.get(`/v1/workshops/${draft.body.data!.slug}`);
  assert.equal(hidden.status, 404, "drafts are not public");
  assert.equal(
    (await visitor.get(`/v1/workshops/${open.slug}/me`)).status,
    401,
  );
});

await test("every learner is in an open free workshop without registering", async () => {
  const { client } = await signedUpLearner(flow, "wsopen");
  const me = await client.get<WorkshopViewer>(`/v1/workshops/${open.slug}/me`);
  assert.equal(me.status, 200);
  assert.deepEqual(
    {
      registered: me.body.data?.registered,
      reason: me.body.data?.reason,
      audience: me.body.data?.audience,
      declined: me.body.data?.declined,
    },
    {
      registered: true,
      reason: "registered",
      audience: "everyone",
      declined: false,
    },
  );

  const standings = await client.get<{
    items: { workshopId: string; attending: boolean }[];
  }>("/v1/workshops/me/standings");
  assert.equal(standings.status, 200);
  assert.equal(
    standings.body.data?.items.find((item) => item.workshopId === open.id)
      ?.attending,
    true,
  );
});

await test("'I'm not going' stops the reminders and can be undone", async () => {
  const { client, userId } = await signedUpLearner(flow, "wsdecline");
  const declined = await client.delete(`/v1/workshops/${open.id}/register`);
  assert.equal(declined.status, 200, JSON.stringify(declined.body));
  const me = await client.get<WorkshopViewer>(`/v1/workshops/${open.slug}/me`);
  assert.equal(me.body.data?.declined, true);
  assert.equal(me.body.data?.registered, false);
  assert.equal(me.body.data?.reason, "declined");

  const { listWorkshopAudienceUserIds } =
    await import("../../src/modules/workshops/workshop-audience.ts");
  const audience = await listWorkshopAudienceUserIds(
    flow.database,
    open.id,
    async () => [],
  );
  assert.equal(audience.includes(userId), false, "no more notices for them");

  const back = await client.post(`/v1/workshops/${open.id}/register`);
  assert.equal(back.status, 201, JSON.stringify(back.body));
  const again = await client.get<WorkshopViewer>(
    `/v1/workshops/${open.slug}/me`,
  );
  assert.equal(again.body.data?.declined, false);
  assert.equal(again.body.data?.registered, true);
});

await test("a course workshop is for its learners, a paid one for its buyers", async () => {
  const learner = await signedUpLearner(flow, "wsoutside");
  const course = await createCourse(flow, { title: "Workshop host course" });
  const forCourse = await publishedWorkshop(admin, {
    title: "For course learners",
    courseId: course.id,
  });
  const courseView = await learner.client.get<WorkshopViewer>(
    `/v1/workshops/${forCourse.slug}/me`,
  );
  assert.equal(courseView.body.data?.reason, "course_required");
  assert.equal(courseView.body.data?.registered, false);

  const paid = await publishedWorkshop(admin, {
    title: "Paid deep dive",
    priceMinor: 49_900,
    currency: "INR",
  });
  const paidView = await learner.client.get<WorkshopViewer>(
    `/v1/workshops/${paid.slug}/me`,
  );
  assert.equal(paidView.body.data?.reason, "payment_required");
  const free = await learner.client.post(`/v1/workshops/${paid.id}/register`);
  assert.equal(free.status, 409);
  assert.equal(free.body.error?.code, "WORKSHOP_PAYMENT_REQUIRED");
});

await flow.close();
