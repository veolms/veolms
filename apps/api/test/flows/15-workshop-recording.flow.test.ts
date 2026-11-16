/**
 * Workshops, step 4: a session's recording. The admin attaches a video that
 * is still processing or already ready; registrants (and staff) may watch
 * it once ready and are told once; nobody else gets near the stream.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  WorkshopAdmin,
  WorkshopPublic,
  WorkshopViewer,
} from "@veolms/contracts";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
  type FlowClient,
} from "./setup/flow-app.ts";
import { FLOW_ADMIN } from "./setup/flow-fixtures.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
// Loaded after the flow environment is set, so config points at the test DB.
const { createWorkshopsService } =
  await import("../../src/modules/workshops/workshops.service.ts");
const { createMediaService } =
  await import("../../src/modules/media/media.service.ts");
const { createAuthorizationService } =
  await import("../../src/modules/authorization/authorization.service.ts");
const { fakePaymentGateways } = await import("./setup/fake-payment-gateway.ts");
const { createServices } = await import("@veolms/services");
const { config } = await import("../../src/config.ts");

const HOUR = 60 * 60_000;

async function videoAsset(status: "processing" | "ready"): Promise<string> {
  const id = crypto.randomUUID();
  await flow.database
    .insertInto("media_assets")
    .values({
      id,
      owner_id: FLOW_ADMIN.id,
      type: "video",
      storage_provider: "s3",
      storage_key: `protected/videos/${id}/source.mp4`,
      original_filename: "recording.mp4",
      mime_type: "video/mp4",
      size_bytes: 1024,
      duration_seconds: 3600,
      status,
      metadata: {},
    })
    .execute();
  return id;
}

async function imageAsset(): Promise<string> {
  const id = crypto.randomUUID();
  await flow.database
    .insertInto("media_assets")
    .values({
      id,
      owner_id: FLOW_ADMIN.id,
      type: "image",
      storage_provider: "s3",
      storage_key: `public/images/${id}/original.webp`,
      original_filename: "cover.webp",
      mime_type: "image/webp",
      size_bytes: 1024,
      status: "ready",
      metadata: {},
    })
    .execute();
  return id;
}

async function publishedWorkshop(
  client: FlowClient,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<WorkshopAdmin> {
  const start = new Date(Date.now() + 2 * HOUR);
  const created = await client.post<WorkshopAdmin>("/v1/workshops/admin", {
    title,
    ...extra,
    summary: "A live session.",
    sessions: [
      {
        title: "Main session",
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + HOUR).toISOString(),
        timeZone: "Asia/Kolkata",
        joinUrl: "https://meet.google.com/rec-test-abc",
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

// A paid workshop: an open one is for every learner, so this one shows
// who is kept away from a recording. The registrant's seat is added by staff.
const workshop = await publishedWorkshop(admin, "Recorded workshop", {
  priceMinor: 9_900,
});
const session = workshop.sessions[0]!;
const registrant = await signedUpLearner(flow, "wsrec");
const outsider = await signedUpLearner(flow, "wsrecout");
assert.equal(
  (
    await admin.post(`/v1/workshops/admin/${workshop.id}/registrants`, {
      email: registrant.learner.email,
    })
  ).status,
  201,
);

const recordingEvents = async () =>
  await flow.database
    .selectFrom("outbox_events")
    .select(["dedupe_key", "payload"])
    .where("event_type", "=", "workshop.recording_ready")
    .orderBy("created_at", "asc")
    .execute();

await test("only a video can be a recording, and only staff may attach one", async () => {
  const image = await admin.request(
    "PUT",
    `/v1/workshops/admin/${workshop.id}/sessions/${session.id}/recording`,
    { mediaId: await imageAsset() },
  );
  assert.equal(image.status, 400);
  assert.equal(image.body.error?.code, "WORKSHOP_RECORDING_INVALID");

  const unknown = await admin.request(
    "PUT",
    `/v1/workshops/admin/${workshop.id}/sessions/${session.id}/recording`,
    { mediaId: crypto.randomUUID() },
  );
  assert.equal(unknown.status, 400);

  const learnerTry = await registrant.client.request(
    "PUT",
    `/v1/workshops/admin/${workshop.id}/sessions/${session.id}/recording`,
    { mediaId: await videoAsset("ready") },
  );
  assert.equal(learnerTry.status, 403);
});

await test("a recording still processing is attached but not shown, and becomes ready later", async () => {
  const processing = await videoAsset("processing");
  const attached = await admin.request<WorkshopAdmin>(
    "PUT",
    `/v1/workshops/admin/${workshop.id}/sessions/${session.id}/recording`,
    { mediaId: processing },
  );
  assert.equal(attached.status, 200, JSON.stringify(attached.body));
  assert.deepEqual(
    {
      mediaId: attached.body.data?.sessions[0]?.recordingMediaId,
      readyAt: attached.body.data?.sessions[0]?.recordingReadyAt,
    },
    { mediaId: processing, readyAt: null },
  );

  const page = await registrant.client.get<WorkshopPublic>(
    `/v1/workshops/${workshop.slug}`,
  );
  assert.equal(page.body.data?.sessions[0]?.hasRecording, false);
  const notYet = await registrant.client.get(
    `/v1/workshops/${workshop.id}/sessions/${session.id}/recording/playback`,
  );
  assert.equal(notYet.status, 404);
  assert.equal((await recordingEvents()).length, 0, "nobody is told yet");

  // The media pipeline finishes: the worker's pass marks it and tells them.
  await flow.database
    .updateTable("media_assets")
    .set({ status: "ready" })
    .where("id", "=", processing)
    .execute();
  const service = createWorkshopsService({
    database: flow.database,
    mediaService: createMediaService({
      database: flow.database,
      services: createServices({
        config,
        logger: {
          info() {},
          warn() {},
          error() {},
          debug() {},
          child() {
            return this;
          },
        } as never,
      }),
    }),
    authorization: createAuthorizationService(flow.database),
    paymentGateways: fakePaymentGateways(flow.gateway),
  });
  assert.equal(await service.markReadyRecordings(new Date()), 1);
  assert.equal(await service.markReadyRecordings(new Date()), 0, "once");

  const ready = await admin.get<WorkshopAdmin>(
    `/v1/workshops/admin/${workshop.id}`,
  );
  assert.ok(ready.body.data?.sessions[0]?.recordingReadyAt);
  const shown = await registrant.client.get<WorkshopPublic>(
    `/v1/workshops/${workshop.slug}`,
  );
  assert.equal(shown.body.data?.sessions[0]?.hasRecording, true);

  const events = await recordingEvents();
  assert.deepEqual(
    events.map((event) => event.dedupe_key),
    [`workshop.recording_ready:${session.id}:${processing}`],
  );
  assert.equal(
    (events[0]!.payload as { workshopId: string }).workshopId,
    workshop.id,
  );
});

await test("registrants and staff may watch; outsiders and visitors may not", async () => {
  const me = await registrant.client.get<WorkshopViewer>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  assert.equal(me.body.data?.canWatchRecordings, true);
  const other = await outsider.client.get<WorkshopViewer>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  assert.equal(other.body.data?.canWatchRecordings, false);

  const refused = await outsider.client.get(
    `/v1/workshops/${workshop.id}/sessions/${session.id}/recording/playback`,
  );
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error?.code, "WORKSHOP_NOT_REGISTERED");
  const anonymous = await flow
    .visitor()
    .get(
      `/v1/workshops/${workshop.id}/sessions/${session.id}/recording/playback`,
    );
  assert.equal(anonymous.status, 401);

  // The test database has no transcoded output for the asset, so the
  // stream itself cannot be built here; what matters is that a registrant
  // and staff get past the access check (no 401/403/404).
  for (const client of [registrant.client, admin]) {
    const allowed = await client.get(
      `/v1/workshops/${workshop.id}/sessions/${session.id}/recording/playback`,
    );
    assert.ok(
      ![401, 403].includes(allowed.status),
      `expected access, got ${allowed.status} ${JSON.stringify(allowed.body)}`,
    );
    assert.notEqual(allowed.body.error?.code, "WORKSHOP_RECORDING_NOT_FOUND");
  }
});

await test("a ready video attached directly tells registrants at once; removing clears it", async () => {
  const ready = await videoAsset("ready");
  const attached = await admin.request<WorkshopAdmin>(
    "PUT",
    `/v1/workshops/admin/${workshop.id}/sessions/${session.id}/recording`,
    { mediaId: ready },
  );
  assert.equal(attached.status, 200);
  assert.ok(attached.body.data?.sessions[0]?.recordingReadyAt);
  const keys = (await recordingEvents()).map((event) => event.dedupe_key);
  assert.equal(keys.length, 2);
  assert.equal(keys[1], `workshop.recording_ready:${session.id}:${ready}`);

  const removed = await admin.request<WorkshopAdmin>(
    "PUT",
    `/v1/workshops/admin/${workshop.id}/sessions/${session.id}/recording`,
    { mediaId: null },
  );
  assert.equal(removed.status, 200);
  assert.equal(removed.body.data?.sessions[0]?.recordingMediaId, null);
  assert.equal(removed.body.data?.sessions[0]?.recordingReadyAt, null);
  const page = await registrant.client.get<WorkshopPublic>(
    `/v1/workshops/${workshop.slug}`,
  );
  assert.equal(page.body.data?.sessions[0]?.hasRecording, false);
});

await flow.close();
