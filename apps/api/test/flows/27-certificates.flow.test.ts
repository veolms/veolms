/**
 * Course certificates: locked until the learner has finished the course's
 * share of lessons, then unlocked for good (even if the course grows);
 * claimed once whatever the retries; the PDF for its owner; the public
 * check by code; name corrections; and staff listing, revoking and
 * restoring.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
const visitor = flow.visitor();

interface Status {
  state: "disabled" | "locked" | "unlocked" | "issued";
  thresholdPercent: number;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  recipientName: string;
  nameProblem: string | null;
  certificate: Certificate | null;
}

interface Certificate {
  code: string;
  displayCode: string;
  recipientName: string;
  courseTitle: string;
  status: "active" | "revoked";
  revision: number;
  verifyUrl: string;
  nameCorrectionsLeft: number;
  issuedOn: string;
}

interface PublicCertificate {
  status: "valid" | "revoked";
  recipientName: string | null;
  courseTitle: string;
  displayCode: string;
  revokedOn: string | null;
}

interface StaffList {
  thresholdPercent: number;
  issuedCount: number;
  items: { id: string; code: string; status: string; recipientName: string }[];
  nextCursor: string | null;
}

function ok<T>(
  response: { status: number; body: { data?: T; error?: unknown } },
  status = 200,
): T {
  assert.equal(
    response.status,
    status,
    `answered ${response.status}: ${JSON.stringify(response.body.error)}`,
  );
  return response.body.data as T;
}

async function certificateCourse(lessons = 10): Promise<FlowCourse> {
  const course = await createCourse(flow, {
    pricing: "free",
    lessons: Array.from({ length: lessons }, () => ({})),
  });
  await flow.database
    .insertInto("course_settings")
    .values({
      id: crypto.randomUUID(),
      course_id: course.id,
      certificate_enabled: true,
    })
    .execute();
  return course;
}

/** The player reporting lessons as watched to the end. */
async function finish(
  client: FlowClient,
  course: FlowCourse,
  lessonIndexes: number[],
) {
  const response = await client.post(
    `/v1/learning-progress/${course.slug}/batch`,
    {
      items: lessonIndexes.map((index) => ({
        lessonId: course.lessons[index]!.id,
        progressPercent: 100,
      })),
      watchedSeconds: 30,
      timeZone: "Asia/Kolkata",
    },
  );
  assert.ok(response.status < 300, `progress answered ${response.status}`);
}

/** The learner changes the name on their profile, as Settings does. */
async function setProfileName(client: FlowClient, displayName: string) {
  const response = await client.patch("/v1/auth/me", { displayName });
  assert.equal(response.status, 200, JSON.stringify(response.body.error));
}

/** Claiming sends nothing: the certificate takes the profile name. */
const claim = (client: FlowClient, course: FlowCourse) =>
  client.post<Certificate>(`/v1/certificates/courses/${course.slug}/claim`, {});

const statusOf = async (client: FlowClient, course: FlowCourse) =>
  ok<Status>(await client.get(`/v1/certificates/courses/${course.slug}`));

// These tests claim by hand; automatic issue is covered in test 29.
test.before(async () => {
  ok(await admin.put("/v1/certificates/settings", { autoIssue: false }));
});

test.after(async () => {
  ok(await admin.put("/v1/certificates/settings", { autoIssue: true }));
  await flow.close();
});

test("locked below the threshold, unlocked at it, and unlocked for good", async () => {
  const course = await certificateCourse(10);
  const { client } = await signedUpLearner(flow, "cert");
  assert.equal((await enrollForFree(client, course)).status, 200);

  await finish(client, course, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  let status = await statusOf(client, course);
  assert.equal(status.state, "locked");
  assert.equal(status.thresholdPercent, 95);
  assert.equal(status.completedLessons, 9);
  assert.equal(status.progressPercent, 90);

  assert.equal((await claim(client, course)).status, 409);

  await finish(client, course, [9]);
  status = await statusOf(client, course);
  assert.equal(status.state, "unlocked");

  // Two new lessons bring the learner back to 83%: still unlocked.
  const last = await flow.database
    .selectFrom("course_lessons")
    .select(["section_id", "position"])
    .where("course_id", "=", course.id)
    .orderBy("position", "desc")
    .executeTakeFirstOrThrow();
  for (const extra of [1, 2]) {
    await flow.database
      .insertInto("course_lessons")
      .values({
        id: crypto.randomUUID(),
        course_id: course.id,
        section_id: last.section_id,
        title: `Added lesson ${extra}`,
        description: "Added after the learner unlocked the certificate.",
        content_type: "video",
        content_media_id: null,
        position: Number(last.position) + extra,
        is_preview: false,
        is_published: true,
        deleted_at: null,
      })
      .execute();
  }
  status = await statusOf(client, course);
  assert.equal(status.totalLessons, 12);
  assert.equal(status.state, "unlocked");
});

test("claimed once: retries and parallel claims get the same certificate", async () => {
  const course = await certificateCourse(3);
  const { client, learner } = await signedUpLearner(flow, "certclaim");
  assert.equal((await enrollForFree(client, course)).status, 200);
  await finish(client, course, [0, 1, 2]);

  // The name comes from the profile. One that cannot be printed (another
  // alphabet, digits) is refused, and the learner is sent to their profile.
  for (const name of ["प्रशांत तिवारी", "முருகன்", "Aarav 123"]) {
    await setProfileName(client, name);
    const status = await statusOf(client, course);
    assert.equal(status.recipientName, name);
    assert.ok(status.nameProblem, name);
    const refused = await claim(client, course);
    assert.equal(refused.status, 422);
    assert.match(String(refused.body.error?.message), /Settings > Profile/u);
  }

  await setProfileName(client, "  Aarav   Sharma ");
  const ready = await statusOf(client, course);
  assert.equal(ready.recipientName, "Aarav Sharma");
  assert.equal(ready.nameProblem, null);
  const claims = await Promise.all([1, 2, 3].map(() => claim(client, course)));
  const statuses = claims.map((claim) => claim.status).sort();
  assert.deepEqual(statuses, [200, 200, 201]);
  const codes = new Set(claims.map((claim) => claim.body.data!.code));
  assert.equal(codes.size, 1);
  const certificate = claims[0]!.body.data!;
  assert.equal(certificate.recipientName, "Aarav Sharma");
  assert.match(certificate.code, /^[0-9A-HJKMNP-TV-Z]{16}$/u);
  assert.match(
    certificate.verifyUrl,
    new RegExp(`/verify/${certificate.code}$`),
  );

  const rows = await flow.database
    .selectFrom("certificates")
    .select("id")
    .where("course_id", "=", course.id)
    .execute();
  assert.equal(rows.length, 1);
  const events = await flow.database
    .selectFrom("outbox_events")
    .select("payload")
    .where("event_type", "=", "certificate.generated")
    .where("dedupe_key", "=", `certificate.generated:${rows[0]!.id}`)
    .execute();
  assert.equal(events.length, 1);

  const mine = ok<{ items: Certificate[] }>(
    await client.get("/v1/certificates/mine"),
  );
  assert.deepEqual(
    mine.items.map((item) => item.code),
    [certificate.code],
  );
  assert.equal((await statusOf(client, course)).state, "issued");
  assert.ok(learner.email);
});

test("the owner downloads the PDF; others cannot", async () => {
  const course = await certificateCourse(3);
  const { client } = await signedUpLearner(flow, "certpdf");
  assert.equal((await enrollForFree(client, course)).status, 200);
  await finish(client, course, [0, 1, 2]);
  await setProfileName(client, "Prashant Tiwari");
  const certificate = ok<Certificate>(await claim(client, course), 201);

  const pdf = await client.get(
    `/v1/certificates/${certificate.displayCode.toLowerCase()}/download`,
  );
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers["content-type"], "application/pdf");
  assert.match(String(pdf.headers["content-disposition"]), /^attachment; /u);
  assert.match(
    String(pdf.headers["content-disposition"]),
    /filename\*=UTF-8''/u,
  );
  assert.ok(String(pdf.body.raw).startsWith("%PDF-"));

  const { client: stranger } = await signedUpLearner(flow, "certstranger");
  assert.equal(
    (await stranger.get(`/v1/certificates/${certificate.code}/download`))
      .status,
    404,
  );
  assert.equal(
    (await visitor.get(`/v1/certificates/${certificate.code}/download`)).status,
    401,
  );
  // Staff who may see the course's certificates may download it.
  assert.equal(
    (await admin.get(`/v1/certificates/${certificate.code}/download`)).status,
    200,
  );
});

test("anyone checks a certificate by code; it never shows private details", async () => {
  const course = await certificateCourse(3);
  const { client, learner } = await signedUpLearner(flow, "certpublic");
  assert.equal((await enrollForFree(client, course)).status, 200);
  await finish(client, course, [0, 1, 2]);
  await setProfileName(client, "Zoë O'Neil");
  const certificate = ok<Certificate>(await claim(client, course), 201);

  const response = await visitor.get<PublicCertificate>(
    `/v1/certificates/public/${certificate.displayCode}`,
  );
  const found = ok<PublicCertificate>(response);
  assert.equal(found.status, "valid");
  assert.equal(found.recipientName, "Zoë O'Neil");
  assert.equal(found.courseTitle, course.title);
  assert.equal(response.headers["x-robots-tag"], "noindex");
  const text = JSON.stringify(found);
  assert.ok(!text.includes(learner.email));
  assert.ok(!text.includes("percent"));

  // An unknown code and a malformed one get the same answer.
  const unknown = await visitor.get(
    "/v1/certificates/public/0000-0000-0000-0000",
  );
  const malformed = await visitor.get("/v1/certificates/public/not-a-code");
  assert.equal(unknown.status, 404);
  assert.equal(malformed.status, 404);
  assert.deepEqual(unknown.body.error, malformed.body.error);
});

test("the learner corrects the name twice, keeping the code", async () => {
  const course = await certificateCourse(3);
  const { client } = await signedUpLearner(flow, "certname");
  assert.equal((await enrollForFree(client, course)).status, 200);
  await finish(client, course, [0, 1, 2]);
  await setProfileName(client, "Arav Sharma");
  const certificate = ok<Certificate>(await claim(client, course), 201);
  assert.equal(certificate.nameCorrectionsLeft, 2);
  const update = () =>
    client.patch<Certificate>(`/v1/certificates/${certificate.code}/name`, {});

  // Nothing changed in the profile: nothing to update, nothing used up.
  let fixed = ok<Certificate>(await update());
  assert.equal(fixed.revision, 1);
  assert.equal(fixed.nameCorrectionsLeft, 2);

  await setProfileName(client, "Aarav Sharma");
  fixed = ok<Certificate>(await update());
  assert.equal(fixed.code, certificate.code);
  assert.equal(fixed.recipientName, "Aarav Sharma");
  assert.equal(fixed.revision, 2);
  assert.equal(fixed.nameCorrectionsLeft, 1);
  await setProfileName(client, "Aarav K. Sharma");
  fixed = ok<Certificate>(await update());
  assert.equal(fixed.nameCorrectionsLeft, 0);
  await setProfileName(client, "Someone Else");
  assert.equal((await update()).status, 409);

  // Another learner cannot put their name on it.
  const { client: stranger } = await signedUpLearner(flow, "certnamex");
  assert.equal(
    (await stranger.patch(`/v1/certificates/${certificate.code}/name`, {}))
      .status,
    404,
  );
});

test("staff list, revoke and restore; a revoked certificate says so", async () => {
  const course = await certificateCourse(3);
  const { client } = await signedUpLearner(flow, "certrevoke");
  assert.equal((await enrollForFree(client, course)).status, 200);
  await finish(client, course, [0, 1, 2]);
  await setProfileName(client, "Revoked Learner");
  const certificate = ok<Certificate>(await claim(client, course), 201);

  assert.equal(
    (await client.get(`/v1/certificates/admin/courses/${course.id}`)).status,
    403,
  );
  const list = ok<StaffList>(
    await admin.get(`/v1/certificates/admin/courses/${course.id}`),
  );
  assert.equal(list.issuedCount, 1);
  assert.equal(list.items[0]!.code, certificate.code);
  const id = list.items[0]!.id;

  assert.equal(
    (
      await client.post(`/v1/certificates/admin/${id}/revoke`, {
        reason: "Refunded",
      })
    ).status,
    403,
  );
  const revoked = ok<{ status: string }>(
    await admin.post(`/v1/certificates/admin/${id}/revoke`, {
      reason: "Refunded",
    }),
  );
  assert.equal(revoked.status, "revoked");

  const page = ok<PublicCertificate>(
    await visitor.get(`/v1/certificates/public/${certificate.code}`),
  );
  assert.equal(page.status, "revoked");
  assert.ok(page.revokedOn);
  assert.ok(!JSON.stringify(page).includes("Refunded"));
  assert.equal(
    (await client.get(`/v1/certificates/${certificate.code}/download`)).status,
    410,
  );

  const restored = ok<{ status: string }>(
    await admin.post(`/v1/certificates/admin/${id}/restore`, {}),
  );
  assert.equal(restored.status, "active");
  assert.equal(
    (await client.get(`/v1/certificates/${certificate.code}/download`)).status,
    200,
  );
});

test("staff set the share of lessons a course asks for", async () => {
  const course = await certificateCourse(4);
  const { client } = await signedUpLearner(flow, "certthreshold");
  assert.equal((await enrollForFree(client, course)).status, 200);
  await finish(client, course, [0, 1, 2]);
  assert.equal((await statusOf(client, course)).state, "locked");

  assert.equal(
    (
      await client.put(`/v1/certificates/admin/courses/${course.id}/settings`, {
        thresholdPercent: 70,
      })
    ).status,
    403,
  );
  const bad = await admin.put(
    `/v1/certificates/admin/courses/${course.id}/settings`,
    { thresholdPercent: 20 },
  );
  assert.equal(bad.status, 400);
  ok(
    await admin.put(`/v1/certificates/admin/courses/${course.id}/settings`, {
      thresholdPercent: 75,
    }),
  );
  const status = await statusOf(client, course);
  assert.equal(status.thresholdPercent, 75);
  assert.equal(status.state, "unlocked");
});

test("a course without certificates says so", async () => {
  const course = await createCourse(flow, { pricing: "free" });
  const { client } = await signedUpLearner(flow, "certoff");
  assert.equal((await enrollForFree(client, course)).status, 200);
  assert.equal((await statusOf(client, course)).state, "disabled");
});
