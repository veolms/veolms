/**
 * Workshops, the admin side: a draft with sessions, what stops it from
 * being published, publishing, the list's tabs, cancelling and deleting,
 * and that learners are kept out of all of it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  WorkshopAdmin,
  WorkshopAdminListResponse,
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

function inDays(days: number, hour = 13): string {
  const date = new Date(Date.now() + days * DAY);
  date.setUTCHours(hour, 30, 0, 0);
  return date.toISOString();
}

function session(
  startsAt: string,
  joinUrl: string | null = "https://zoom.us/j/1234567890",
) {
  return {
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 90 * 60_000).toISOString(),
    timeZone: "Asia/Kolkata",
    joinUrl,
  };
}

async function createDraft(
  client: FlowClient,
  body: Record<string, unknown>,
): Promise<WorkshopAdmin> {
  const response = await client.post<WorkshopAdmin>(
    "/v1/workshops/admin",
    body,
  );
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data!;
}

async function list(client: FlowClient, tab: string) {
  const response = await client.get<WorkshopAdminListResponse>(
    `/v1/workshops/admin?tab=${tab}`,
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data!;
}

await test("a draft gets an address from its title and keeps its meeting link private to staff", async () => {
  const draft = await createDraft(admin, {
    title: "React Performance Day!",
    summary: "One afternoon on rendering and profiling.",
    sessions: [session(inDays(3))],
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.slug, "react-performance-day");
  assert.equal(draft.sessions.length, 1);
  assert.equal(draft.sessions[0]?.joinUrl, "https://zoom.us/j/1234567890");
  assert.equal(draft.sessions[0]?.state, "upcoming");
  assert.equal(draft.host.username, "flow_admin");
  assert.equal(draft.priceMinor, null);

  const again = await createDraft(admin, {
    title: "React performance day",
    sessions: [session(inDays(4))],
  });
  assert.equal(
    again.slug,
    "react-performance-day-2",
    "a second one gets a suffix",
  );

  const taken = await admin.post("/v1/workshops/admin", {
    title: "Something else",
    slug: "react-performance-day",
  });
  assert.equal(taken.status, 409);
  const reserved = await admin.post("/v1/workshops/admin", {
    title: "Admin page",
    slug: "admin",
  });
  assert.equal(reserved.status, 400, "reserved addresses are refused");
});

await test("publishing needs a summary, a future session and every meeting link", async () => {
  const draft = await createDraft(admin, {
    title: "Node internals",
    sessions: [session(inDays(2), null)],
  });
  const check = await admin.get<{
    canPublish: boolean;
    issues: { field: string }[];
  }>(`/v1/workshops/admin/${draft.id}/publish-check`);
  assert.equal(check.status, 200);
  assert.equal(check.body.data?.canPublish, false);
  assert.deepEqual(check.body.data?.issues.map((issue) => issue.field).sort(), [
    "joinUrl",
    "summary",
  ]);

  const refused = await admin.post(`/v1/workshops/admin/${draft.id}/publish`);
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error?.code, "WORKSHOP_NOT_READY");

  const fixed = await admin.patch<WorkshopAdmin>(
    `/v1/workshops/admin/${draft.id}`,
    {
      summary: "Event loop, streams and the things that bite in production.",
      sessions: [
        { ...session(inDays(2)), id: draft.sessions[0]!.id, title: "Day 1" },
        { ...session(inDays(3)), title: "Day 2" },
      ],
    },
  );
  assert.equal(fixed.status, 200, JSON.stringify(fixed.body));
  assert.equal(fixed.body.data?.sessions.length, 2);
  assert.equal(
    fixed.body.data?.sessions[0]?.id,
    draft.sessions[0]!.id,
    "the known session was updated, not replaced",
  );
  assert.equal(fixed.body.data?.sessions[1]?.title, "Day 2");

  const published = await admin.post<WorkshopAdmin>(
    `/v1/workshops/admin/${draft.id}/publish`,
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.data?.status, "published");
  assert.ok(published.body.data?.publishedAt);

  const locked = await admin.patch(`/v1/workshops/admin/${draft.id}`, {
    slug: "node-internals-new",
  });
  assert.equal(locked.status, 409, "a published address cannot change");

  const cannotDelete = await admin.delete(`/v1/workshops/admin/${draft.id}`);
  assert.equal(
    cannotDelete.status,
    409,
    "published workshops are not deleted outright",
  );
});

await test("the list's tabs sort workshops by what is next, and cancelling keeps the reason", async () => {
  const soon = await createDraft(admin, {
    title: "Tab test soon",
    summary: "s",
    sessions: [session(inDays(1))],
  });
  const later = await createDraft(admin, {
    title: "Tab test later",
    summary: "s",
    sessions: [session(inDays(10))],
  });
  const over = await createDraft(admin, {
    title: "Tab test over",
    summary: "s",
    sessions: [session(inDays(-5))],
  });
  for (const workshop of [soon, later]) {
    const published = await admin.post(
      `/v1/workshops/admin/${workshop.id}/publish`,
    );
    assert.equal(published.status, 200, JSON.stringify(published.body));
  }
  // A workshop whose only session is over cannot be published, so it is
  // published through the past: publish with a future session, then move it.
  const overPublish = await admin.post(
    `/v1/workshops/admin/${over.id}/publish`,
  );
  assert.equal(overPublish.status, 400);

  const upcoming = await list(admin, "upcoming");
  const titles = upcoming.items.map((item) => item.title);
  assert.ok(
    titles.indexOf("Tab test soon") < titles.indexOf("Tab test later"),
    titles.join(", "),
  );
  assert.ok(upcoming.counts.upcoming >= 2);
  assert.ok(upcoming.counts.drafts >= 1);

  const cancelled = await admin.post<WorkshopAdmin>(
    `/v1/workshops/admin/${later.id}/cancel`,
    { reason: "The host is unwell; a new date follows." },
  );
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.data?.status, "cancelled");
  assert.equal(
    cancelled.body.data?.cancelReason,
    "The host is unwell; a new date follows.",
  );
  const cancelledTab = await list(admin, "cancelled");
  assert.ok(cancelledTab.items.some((item) => item.id === later.id));
  const republish = await admin.post(`/v1/workshops/admin/${later.id}/publish`);
  assert.equal(republish.status, 409);

  const deleted = await admin.delete(`/v1/workshops/admin/${over.id}`);
  assert.equal(deleted.status, 200);
  const drafts = await list(admin, "drafts");
  assert.ok(!drafts.items.some((item) => item.id === over.id));
  const gone = await admin.get(`/v1/workshops/admin/${over.id}`);
  assert.equal(gone.status, 404);

  const searched = await admin.get<WorkshopAdminListResponse>(
    "/v1/workshops/admin?tab=upcoming&search=soon",
  );
  assert.equal(searched.status, 200);
  assert.deepEqual(
    searched.body.data?.items.map((item) => item.title),
    ["Tab test soon"],
  );
});

await test("learners and visitors are kept out of the admin side", async () => {
  const { client: learner } = await signedUpLearner(flow, "wslearner");
  assert.equal((await learner.get("/v1/workshops/admin")).status, 403);
  assert.equal(
    (await learner.post("/v1/workshops/admin", { title: "Mine" })).status,
    403,
  );
  const visitor = flow.visitor();
  assert.equal((await visitor.get("/v1/workshops/admin")).status, 401);
});

await flow.close();
