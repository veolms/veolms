/**
 * Workshops: a course workshop includes its course's learners without
 * registering (announced on publish, Join, reminders, the home card), its
 * recording becomes a lesson of the course, an open workshop may be
 * announced to everyone, and a CSV of attendees is imported in one go.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ImportWorkshopRegistrantsResponse,
  WorkshopAdmin,
  WorkshopHomeCard,
  WorkshopPublic,
  WorkshopRegistrantsResponse,
  WorkshopViewer,
} from "@veolms/contracts";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
  type FlowClient,
} from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";
import { FLOW_ADMIN } from "./setup/flow-fixtures.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

async function draftWorkshop(
  client: FlowClient,
  title: string,
  extra: Record<string, unknown>,
  startsInMs = 3 * DAY,
): Promise<WorkshopAdmin> {
  const start = new Date(Date.now() + startsInMs);
  const created = await client.post<WorkshopAdmin>("/v1/workshops/admin", {
    title,
    summary: "A live session.",
    sessions: [
      {
        title: "Main",
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + HOUR).toISOString(),
        timeZone: "Asia/Kolkata",
        joinUrl: "https://meet.google.com/crs-test-abc",
      },
    ],
    ...extra,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.data!;
}

const announcements = async (workshopId: string) =>
  (
    await flow.database
      .selectFrom("outbox_events")
      .select(["payload"])
      .where("event_type", "=", "workshop.announced")
      .execute()
  ).filter(
    (event) =>
      (event.payload as { workshopId: string }).workshopId === workshopId,
  );

const course = await createCourse(flow, {
  title: "Course with a workshop",
  pricing: "free",
});
const learner = await signedUpLearner(flow, "wscourse");
assert.equal((await enrollForFree(learner.client, course)).status, 200);
const outsider = await signedUpLearner(flow, "wscourseout");

// Opens for joining in ten minutes' time, so Join can be tried at once.
const courseWorkshop = await draftWorkshop(
  admin,
  "Course workshop",
  { courseId: course.id },
  5 * MINUTE,
);

await test("publishing a course workshop announces it to the course, once", async () => {
  const published = await admin.post<WorkshopAdmin>(
    `/v1/workshops/admin/${courseWorkshop.id}/publish`,
    {},
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));
  const sent = await announcements(courseWorkshop.id);
  assert.equal(sent.length, 1);
  assert.equal((sent[0]!.payload as { audience: string }).audience, "course");

  await admin.post(`/v1/workshops/admin/${courseWorkshop.id}/unpublish`);
  await admin.post(`/v1/workshops/admin/${courseWorkshop.id}/publish`, {});
  assert.equal(
    (await announcements(courseWorkshop.id)).length,
    1,
    "a second publish does not announce again",
  );
});

await test("the course's learners are in without registering; others are not", async () => {
  const me = await learner.client.get<WorkshopViewer>(
    `/v1/workshops/${courseWorkshop.slug}/me`,
  );
  assert.equal(me.status, 200, JSON.stringify(me.body));
  assert.equal(me.body.data?.registered, true);
  assert.equal(me.body.data?.viaCourse, true);
  assert.equal(me.body.data?.reason, "registered");
  assert.equal(me.body.data?.joinable.length, 1, "Join is open for them");

  const other = await outsider.client.get<WorkshopViewer>(
    `/v1/workshops/${courseWorkshop.slug}/me`,
  );
  assert.equal(other.body.data?.registered, false);
  assert.equal(other.body.data?.reason, "course_required");

  // Joining notes their attendance as a course learner, taking no seat.
  const sessionId = courseWorkshop.sessions[0]!.id;
  const join = await learner.client.request(
    "GET",
    `/v1/workshops/${courseWorkshop.id}/sessions/${sessionId}/join`,
  );
  assert.equal(join.status, 302, JSON.stringify(join.body));
  const list = await admin.get<WorkshopRegistrantsResponse>(
    `/v1/workshops/admin/${courseWorkshop.id}/registrants`,
  );
  const row = list.body.data!.items.find(
    (item) => item.userId === learner.userId,
  );
  assert.equal(row?.source, "course");
  assert.deepEqual(row?.joinedSessionIds, [sessionId]);
  const confirmations = await flow.database
    .selectFrom("outbox_events")
    .select(["payload"])
    .where("event_type", "=", "workshop.registered")
    .execute();
  assert.equal(
    confirmations.filter(
      (event) =>
        (event.payload as { workshopId: string }).workshopId ===
        courseWorkshop.id,
    ).length,
    0,
    "no registration email for a course learner",
  );

  const card = await learner.client.get<WorkshopHomeCard | null>(
    "/v1/workshops/me/next",
  );
  assert.equal(card.body.data?.id, courseWorkshop.id);
  assert.equal(card.body.data?.registered, true);
});

await test("a course workshop's recording becomes a lesson of the course", async () => {
  const mediaId = crypto.randomUUID();
  await flow.database
    .insertInto("media_assets")
    .values({
      id: mediaId,
      owner_id: FLOW_ADMIN.id,
      type: "video",
      storage_provider: "s3",
      storage_key: `protected/videos/${mediaId}/source.mp4`,
      original_filename: "recording.mp4",
      mime_type: "video/mp4",
      size_bytes: 1024,
      duration_seconds: 3600,
      status: "ready",
      metadata: {},
    })
    .execute();
  const sessionId = courseWorkshop.sessions[0]!.id;
  const attached = await admin.request<WorkshopAdmin>(
    "PUT",
    `/v1/workshops/admin/${courseWorkshop.id}/sessions/${sessionId}/recording`,
    { mediaId },
  );
  assert.equal(attached.status, 200, JSON.stringify(attached.body));
  const session = attached.body.data!.sessions[0]!;
  assert.ok(session.recordingLessonId, "a lesson was created");
  assert.equal(
    session.recordingLessonPath,
    `/learn/${course.slug}?lessonId=${session.recordingLessonId}`,
  );

  const lesson = await flow.database
    .selectFrom("course_lessons as l")
    .innerJoin("course_sections as s", "s.id", "l.section_id")
    .select([
      "l.course_id",
      "l.content_type",
      "l.content_media_id",
      "l.is_published",
      "s.title as section_title",
    ])
    .where("l.id", "=", session.recordingLessonId!)
    .executeTakeFirstOrThrow();
  assert.deepEqual(lesson, {
    course_id: course.id,
    content_type: "video",
    content_media_id: mediaId,
    is_published: true,
    section_title: "Workshop recordings",
  });

  const page = await learner.client.get<WorkshopPublic>(
    `/v1/workshops/${courseWorkshop.slug}`,
  );
  assert.equal(
    page.body.data?.sessions[0]?.recordingLessonPath,
    session.recordingLessonPath,
  );
  const ready = await flow.database
    .selectFrom("outbox_events")
    .select(["payload"])
    .where("event_type", "=", "workshop.recording_ready")
    .execute();
  const mine = ready.find(
    (event) =>
      (event.payload as { workshopId: string }).workshopId ===
      courseWorkshop.id,
  );
  assert.equal(
    (mine?.payload as { lessonPath?: string } | undefined)?.lessonPath,
    session.recordingLessonPath,
  );

  const sections = await admin.get<{ items: { title: string }[] }>(
    `/v1/workshops/admin/${courseWorkshop.id}/course-sections`,
  );
  assert.ok(
    sections.body.data?.items.some(
      (section) => section.title === "Workshop recordings",
    ),
  );
});

await test("a free open workshop is announced to everyone; a paid one only when asked", async () => {
  const free = await draftWorkshop(admin, "Free open workshop", {});
  await admin.post(`/v1/workshops/admin/${free.id}/publish`, {});
  const freeSent = await announcements(free.id);
  assert.equal(freeSent.length, 1);
  assert.equal((freeSent[0]!.payload as { audience: string }).audience, "all");

  const quiet = await draftWorkshop(admin, "Quiet paid workshop", {
    priceMinor: 9_900,
  });
  await admin.post(`/v1/workshops/admin/${quiet.id}/publish`, {});
  assert.equal((await announcements(quiet.id)).length, 0);

  const loud = await draftWorkshop(admin, "Announced paid workshop", {
    priceMinor: 9_900,
  });
  await admin.post(`/v1/workshops/admin/${loud.id}/publish`, {
    announce: true,
  });
  const sent = await announcements(loud.id);
  assert.equal(sent.length, 1);
  assert.equal((sent[0]!.payload as { audience: string }).audience, "all");
});

await test("a CSV import registers accounts, creates missing ones, and reports the rest", async () => {
  const open = await draftWorkshop(admin, "Imported workshop", {});
  await admin.post(`/v1/workshops/admin/${open.id}/publish`, {});
  const newEmail = `imported.${Date.now()}@flow.test`;
  const imported = await admin.post<ImportWorkshopRegistrantsResponse>(
    `/v1/workshops/admin/${open.id}/registrants/import`,
    {
      rows: [
        { email: learner.learner.email },
        { email: newEmail, name: "Imported Person" },
        { email: "not-an-email" },
        { email: learner.learner.email.toUpperCase() },
      ],
    },
  );
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
  assert.deepEqual(
    {
      added: imported.body.data?.added,
      accountsCreated: imported.body.data?.accountsCreated,
      alreadyRegistered: imported.body.data?.alreadyRegistered,
      skipped: imported.body.data?.skipped.map((entry) => entry.reason),
    },
    {
      added: 2,
      accountsCreated: 1,
      alreadyRegistered: 0,
      skipped: ["invalid_email", "duplicate"],
    },
  );
  const account = await flow.database
    .selectFrom("users")
    .select(["display_name"])
    .where("email", "=", newEmail)
    .executeTakeFirstOrThrow();
  assert.equal(account.display_name, "Imported Person");

  const again = await admin.post<ImportWorkshopRegistrantsResponse>(
    `/v1/workshops/admin/${open.id}/registrants/import`,
    { rows: [{ email: newEmail }], createAccounts: false },
  );
  assert.equal(again.body.data?.alreadyRegistered, 1);
  const noAccount = await admin.post<ImportWorkshopRegistrantsResponse>(
    `/v1/workshops/admin/${open.id}/registrants/import`,
    {
      rows: [{ email: `nobody.${Date.now()}@flow.test` }],
      createAccounts: false,
    },
  );
  assert.deepEqual(
    noAccount.body.data?.skipped.map((entry) => entry.reason),
    ["no_account"],
  );

  const denied = await learner.client.post(
    `/v1/workshops/admin/${open.id}/registrants/import`,
    { rows: [{ email: newEmail }] },
  );
  assert.equal(denied.status, 403);
});

await test("seats count only free and paid registrations", async () => {
  const small = await draftWorkshop(admin, "Two seats", { capacity: 1 });
  await admin.post(`/v1/workshops/admin/${small.id}/publish`, {});
  await admin.post(`/v1/workshops/admin/${small.id}/registrants`, {
    email: learner.learner.email,
  });
  const page = await outsider.client.get<WorkshopPublic>(
    `/v1/workshops/${small.slug}`,
  );
  assert.equal(page.body.data?.seatsLeft, 1, "a staff-added seat is free");
  const registered = await outsider.client.post(
    `/v1/workshops/${small.id}/register`,
  );
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
});

await flow.close();
