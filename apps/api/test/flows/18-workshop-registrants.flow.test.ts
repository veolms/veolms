/**
 * Workshops, step 6: the registrants list and its CSV, adding someone by
 * email, taking a seat back, and the card a learner's home points at.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  WorkshopAdmin,
  WorkshopHomeCard,
  WorkshopRegistrantsResponse,
} from "@veolms/contracts";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
  type FlowClient,
} from "./setup/flow-app.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

async function publishedWorkshop(
  client: FlowClient,
  title: string,
  startsInMs: number,
): Promise<WorkshopAdmin> {
  const start = new Date(Date.now() + startsInMs);
  const created = await client.post<WorkshopAdmin>("/v1/workshops/admin", {
    title,
    summary: "A live session.",
    sessions: [
      {
        title: "Only session",
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + HOUR).toISOString(),
        timeZone: "Asia/Kolkata",
        joinUrl: "https://meet.google.com/reg-test-abc",
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

const workshop = await publishedWorkshop(
  admin,
  "Registrants workshop",
  5 * DAY,
);
const learner = await signedUpLearner(flow, "wsregone");
const otherAccount = await signedUpLearner(flow, "wsregtwo");

await test("the list shows who registered, how, and whether they joined; the CSV matches", async () => {
  assert.equal(
    (await learner.client.post(`/v1/workshops/${workshop.id}/register`)).status,
    201,
  );
  const list = await admin.get<WorkshopRegistrantsResponse>(
    `/v1/workshops/admin/${workshop.id}/registrants`,
  );
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.data?.items.length, 1);
  const [row] = list.body.data!.items;
  assert.equal(row!.source, "free");
  assert.equal(row!.email, learner.learner.email);
  assert.deepEqual(row!.joinedSessionIds, []);

  const csv = await admin.request(
    "GET",
    `/v1/workshops/admin/${workshop.id}/registrants.csv`,
  );
  assert.equal(csv.status, 200);
  assert.match(String(csv.headers["content-type"]), /text\/csv/);
  const text = String(csv.body.raw ?? "");
  assert.match(
    text,
    /^Name,Username,Email,Registered at,How,Order,Joined Only session\r\n/,
  );
  assert.match(text, new RegExp(`${learner.learner.email},[^,]+,Free,,no\r\n`));

  const denied = await learner.client.get(
    `/v1/workshops/admin/${workshop.id}/registrants`,
  );
  assert.equal(denied.status, 403, "learners never see the list");
});

await test("staff add someone by email, who is told like anyone; unknown emails are refused", async () => {
  const added = await admin.post<WorkshopRegistrantsResponse>(
    `/v1/workshops/admin/${workshop.id}/registrants`,
    { email: otherAccount.learner.email.toUpperCase() },
  );
  assert.equal(added.status, 201, JSON.stringify(added.body));
  assert.equal(added.body.data?.items.length, 2);
  const row = added.body.data!.items.find(
    (item) => item.email === otherAccount.learner.email,
  );
  assert.equal(row?.source, "admin");

  const told = await flow.database
    .selectFrom("outbox_events")
    .select(["payload"])
    .where("event_type", "=", "workshop.registered")
    .execute();
  const theirs = told.filter(
    (event) =>
      (event.payload as { workshopId: string; recipientUserId: string })
        .workshopId === workshop.id,
  );
  assert.equal(
    theirs.length,
    1,
    "the person staff added is told; everyone else was in already",
  );

  const again = await admin.post<WorkshopRegistrantsResponse>(
    `/v1/workshops/admin/${workshop.id}/registrants`,
    { email: otherAccount.learner.email },
  );
  assert.equal(again.status, 201);
  assert.equal(again.body.data?.items.length, 2, "adding twice is harmless");

  const unknown = await admin.post(
    `/v1/workshops/admin/${workshop.id}/registrants`,
    { email: "nobody-here@flow.test" },
  );
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error?.code, "USER_NOT_FOUND");

  const learnerTry = await learner.client.post(
    `/v1/workshops/admin/${workshop.id}/registrants`,
    { email: otherAccount.learner.email },
  );
  assert.equal(learnerTry.status, 403);
});

await test("taking a seat back removes them from the list", async () => {
  const removed = await admin.delete<WorkshopRegistrantsResponse>(
    `/v1/workshops/admin/${workshop.id}/registrants/${otherAccount.userId}`,
  );
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(removed.body.data?.items.length, 1);
  const me = await otherAccount.client.get<{ registered: boolean }>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  // An open workshop is for every learner, so they are still in it.
  assert.equal(me.body.data?.registered, true);
});

await test("the home card points at the next registered session, else the soonest open workshop", async () => {
  // The learner is registered for the workshop 5 days out; a sooner one
  // exists that they have not joined.
  const sooner = await publishedWorkshop(admin, "Sooner workshop", 2 * DAY);
  const mine = await learner.client.get<WorkshopHomeCard | null>(
    "/v1/workshops/me/next",
  );
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.equal(mine.body.data?.id, workshop.id, "registered beats soonest");
  assert.equal(mine.body.data?.registered, true);
  assert.equal(mine.body.data?.state, "upcoming");

  const nobody = await signedUpLearner(flow, "wsnocard");
  const theirs = await nobody.client.get<WorkshopHomeCard | null>(
    "/v1/workshops/me/next",
  );
  // Other flow files leave workshops behind, so "soonest" may be one of
  // theirs: it is open, not registered, and no later than ours.
  assert.equal(theirs.body.data?.registered, false);
  assert.ok(
    new Date(theirs.body.data!.startsAt).getTime() <=
      new Date(sooner.sessions[0]!.startsAt).getTime(),
    "the soonest open one",
  );

  const anonymous = await flow.visitor().get("/v1/workshops/me/next");
  assert.equal(anonymous.status, 401);
});

await flow.close();
