/**
 * Email marketing (creator-features/34-email-marketing-plan.md): an admin
 * writes a broadcast, picks an audience and sends it; each student gets
 * their own copy with their name, tracked links and an unsubscribe link;
 * the report counts opens, clicks and unsubscribes; "Resend" goes only to
 * those who didn't open; a ready automation emails once and stops when it
 * is no longer needed.
 *
 * The send itself is the real sender (`createMarketingSender`) with the
 * flow app's capturing email service, run by hand instead of on a timer.
 * Audiences are narrowed to a course made here: the database is shared
 * with the other flow files.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { grantPlatformRole } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";
import {
  signedUpLearner,
  startFlowApp,
  type FlowResponse,
} from "./setup/flow-app.ts";

const { config } = await import("../../src/config.ts");
const { createMarketingSender } =
  await import("../../src/modules/marketing/marketing-sender.ts");

const flow = await startFlowApp();

const silentLogger = {
  level: "silent",
  fatal() {},
  error() {},
  warn() {},
  info() {},
  debug() {},
  trace() {},
  silent() {},
  child() {
    return silentLogger;
  },
} as unknown as FastifyBaseLogger;

const adminAccount = await signedUpLearner(flow, "mktadmin");
await grantPlatformRole(flow.database, {
  userId: adminAccount.userId,
  roleId: SYSTEM_ROLES.admin.id,
});
const admin = flow.visitor();
await admin.signIn(adminAccount.learner.email);

const course = await createCourse(flow, {
  title: "Marketing Flow Course",
  pricing: "free",
});
const asha = await signedUpLearner(flow, "asha");
const ravi = await signedUpLearner(flow, "ravi");
const meera = await signedUpLearner(flow, "meera");
for (const person of [asha, ravi]) {
  assert.equal((await enrollForFree(person.client, course)).status, 200);
}
const visitor = flow.visitor();

interface Email {
  id: string;
  status: string;
  subject: string;
  blocks: { id: string; type: string; url?: string }[];
  audience: unknown;
  stats: {
    recipients: number;
    sent: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
    skipped: number;
  };
}

function ok<T>(response: FlowResponse<T>, status = 200): T {
  assert.equal(
    response.status,
    status,
    `answered ${response.status}: ${JSON.stringify(response.body.error)}`,
  );
  return response.body.data as T;
}

const boughtThisCourse = {
  segment: { type: "bought", courseIds: [course.id] },
  excludeCourseIds: [],
};

function sender() {
  return createMarketingSender({
    database: flow.database,
    email: flow.email,
    logger: silentLogger,
    config,
  });
}

/** One send cycle after another until nothing is due. */
async function sendAll() {
  const run = sender();
  await run.prepare();
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const result = await run.send({
      budget: 50,
      isPaused: () => false,
      pause: () => {},
    });
    if (result.sent + result.retried + result.failed + result.skipped === 0)
      return;
  }
}

function lastEmailTo(address: string) {
  const email = flow.email.sent.findLast(
    (mail) => mail.to === address.toLowerCase(),
  );
  assert.ok(email, `nothing was emailed to ${address}`);
  return email;
}

function tokenIn(text: string, kind: "o" | "c"): string {
  const token = text.match(
    new RegExp(`/v1/email/${kind}/([A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+)`, "u"),
  )?.[1];
  assert.ok(token, `no /email/${kind}/ link in the email`);
  return token;
}

test.after(async () => {
  await flow.close();
});

test("only staff with marketing.manage reach email marketing", async () => {
  assert.equal((await visitor.get("/v1/marketing/emails")).status, 401);
  assert.equal((await asha.client.get("/v1/marketing/emails")).status, 403);
  assert.equal(
    (await asha.client.post("/v1/marketing/emails", { template: "blank" }))
      .status,
    403,
  );
  assert.equal((await admin.get("/v1/marketing/emails")).status, 200);
});

let sentEmailId = "";

test("a broadcast goes to its audience, each copy with the person's name, tracked links and an unsubscribe link", async () => {
  const draft = ok<Email>(
    await admin.post("/v1/marketing/emails", { template: "launch" }),
  );
  assert.equal(draft.status, "draft");
  assert.ok(draft.blocks.length > 0, "the template's blocks come with it");

  // Not ready without a subject.
  ok(await admin.patch(`/v1/marketing/emails/${draft.id}`, { subject: "" }));
  const notReady = await admin.post(
    `/v1/marketing/emails/${draft.id}/schedule`,
    { sendAt: null },
  );
  assert.equal(notReady.status, 400);

  // An unsafe link is refused.
  const badLink = await admin.patch(`/v1/marketing/emails/${draft.id}`, {
    blocks: [
      { id: "b1", type: "button", label: "Go", url: "javascript:alert(1)" },
    ],
  });
  assert.equal(badLink.status, 400);

  ok(
    await admin.patch(`/v1/marketing/emails/${draft.id}`, {
      subject: "Hi {first_name}, it's here",
      blocks: [
        { id: "h1", type: "heading", text: "New course" },
        { id: "t1", type: "text", text: "Hello {first_name}," },
        {
          id: "b1",
          type: "button",
          label: "See it",
          url: "https://example.com/launch",
        },
      ],
      audience: boughtThisCourse,
    }),
  );
  const count = ok<{ count: number }>(
    await admin.post("/v1/marketing/audience/count", {
      audience: boughtThisCourse,
    }),
  );
  assert.equal(count.count, 2, "the two learners who have the course");

  // "Send now" starts at once: the queue is filled in the same request.
  const started = ok<Email>(
    await admin.post(`/v1/marketing/emails/${draft.id}/schedule`, {
      sendAt: null,
    }),
  );
  assert.equal(started.status, "sending");
  assert.equal(started.stats.recipients, 2);
  await sendAll();

  const sent = ok<Email>(await admin.get(`/v1/marketing/emails/${draft.id}`));
  assert.equal(sent.status, "sent");
  assert.equal(sent.stats.sent, 2);
  const toAsha = lastEmailTo(asha.learner.email);
  assert.equal(
    toAsha.subject,
    `Hi ${asha.learner.displayName.split(" ")[0]}, it's here`,
  );
  assert.match(toAsha.text, /\/v1\/email\/unsubscribe\/[^"?\s]+\?m=/u);
  assert.doesNotMatch(
    toAsha.text,
    /https:\/\/example\.com\/launch/u,
    "links are tracked",
  );
  assert.equal(
    flow.email.sent.some(
      (mail) =>
        mail.to === meera.learner.email.toLowerCase() &&
        mail.subject.includes("it's here"),
    ),
    false,
    "someone outside the audience gets nothing",
  );

  // A sent email can't be changed.
  assert.equal(
    (
      await admin.patch(`/v1/marketing/emails/${draft.id}`, {
        subject: "Changed",
      })
    ).status,
    409,
  );
  sentEmailId = draft.id;
});

test("opens and clicks are counted; a click goes on to the email's own link", async () => {
  const toAsha = lastEmailTo(asha.learner.email);
  const pixel = await visitor.get(`/v1/email/o/${tokenIn(toAsha.text, "o")}`);
  assert.equal(pixel.status, 200);
  assert.equal(pixel.headers["content-type"], "image/gif");

  const click = await visitor.get(`/v1/email/c/${tokenIn(toAsha.text, "c")}`);
  assert.equal(click.status, 302);
  assert.equal(click.headers.location, "https://example.com/launch");

  // A forged token changes nothing and goes to the academy's site.
  const forged = await visitor.get(
    `/v1/email/c/${tokenIn(toAsha.text, "c").slice(0, -2)}xx`,
  );
  assert.equal(forged.status, 302);
  assert.notEqual(forged.headers.location, "https://example.com/launch");

  const report = ok<{ stats: Email["stats"]; revenue: { amount: number } }>(
    await admin.get(`/v1/marketing/emails/${sentEmailId}/report`),
  );
  assert.equal(report.stats.opened, 1);
  assert.equal(report.stats.clicked, 1);

  const clicked = ok<{ recipients: { email: string }[]; total: number }>(
    await admin.get(
      `/v1/marketing/emails/${sentEmailId}/recipients?filter=clicked`,
    ),
  );
  assert.deepEqual(
    clicked.recipients.map((row) => row.email),
    [asha.learner.email.toLowerCase()],
  );
});

test("'Resend' reaches only those who didn't open, and an unsubscribe is counted and respected", async () => {
  const resend = ok<Email>(
    await admin.post(`/v1/marketing/emails/${sentEmailId}/resend`, {
      subject: "In case you missed it",
    }),
  );
  assert.equal(resend.status, "draft");
  const notOpened = {
    segment: { type: "not_opened", emailId: sentEmailId },
    excludeCourseIds: [],
  };
  assert.equal(
    ok<{ count: number }>(
      await admin.post("/v1/marketing/audience/count", { audience: notOpened }),
    ).count,
    1,
    "only Ravi did not open",
  );

  // Ravi unsubscribes from the footer link (one click, as a mail client does).
  const toRavi = lastEmailTo(ravi.learner.email);
  const link = toRavi.text.match(
    /\/v1\/email\/unsubscribe\/([^"?\s]+)\?m=([0-9a-f-]{36})/u,
  );
  assert.ok(link);
  const unsubscribed = await visitor.post(
    `/v1/email/unsubscribe/${link[1]}?m=${link[2]}`,
    {},
  );
  assert.equal(unsubscribed.status, 200);

  const report = ok<{ stats: Email["stats"] }>(
    await admin.get(`/v1/marketing/emails/${sentEmailId}/report`),
  );
  assert.equal(report.stats.unsubscribed, 1);
  assert.equal(
    ok<{ count: number }>(
      await admin.post("/v1/marketing/audience/count", {
        audience: boughtThisCourse,
      }),
    ).count,
    1,
    "Ravi is no longer in any marketing audience",
  );
  // So the resend has nobody left to go to.
  assert.equal(
    (
      await admin.post(`/v1/marketing/emails/${resend.id}/schedule`, {
        sendAt: null,
      })
    ).status,
    400,
  );
});

test("a scheduled email waits for its time, and cancelling puts it back to draft", async () => {
  const draft = ok<Email>(
    await admin.post("/v1/marketing/emails", { template: "newsletter" }),
  );
  ok(
    await admin.patch(`/v1/marketing/emails/${draft.id}`, {
      audience: boughtThisCourse,
    }),
  );
  const past = await admin.post(`/v1/marketing/emails/${draft.id}/schedule`, {
    sendAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  assert.equal(past.status, 400);

  const later = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const scheduled = ok<Email>(
    await admin.post(`/v1/marketing/emails/${draft.id}/schedule`, {
      sendAt: later,
    }),
  );
  assert.equal(scheduled.status, "scheduled");
  const before = flow.email.sent.length;
  await sendAll();
  assert.equal(
    flow.email.sent.length,
    before,
    "nothing goes out before its time",
  );

  const cancelled = ok<Email>(
    await admin.post(`/v1/marketing/emails/${draft.id}/cancel`),
  );
  assert.equal(cancelled.status, "draft");
  ok(await admin.delete(`/v1/marketing/emails/${draft.id}`));
  assert.equal(
    (await admin.get(`/v1/marketing/emails/${draft.id}`)).status,
    404,
  );
});

test("'Nudge to start' emails a buyer who hasn't started once, about their course, and skips one who started meanwhile", async () => {
  // Meera joins the course too; both she and Asha bought it two days ago.
  assert.equal((await enrollForFree(meera.client, course)).status, 200);
  const email = ok<Email>(
    await admin.post("/v1/marketing/automations/start_nudge/email"),
  );
  ok(
    await admin.patch(`/v1/marketing/emails/${email.id}`, {
      settings: { wait: 1, courseId: course.id },
    }),
  );
  ok(
    await admin.post("/v1/marketing/automations/start_nudge/active", {
      active: false,
    }),
  );
  ok(
    await admin.post("/v1/marketing/automations/start_nudge/active", {
      active: true,
    }),
  );

  // Switched on three days ago; the course was bought two days ago.
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await flow.database
    .updateTable("marketing_emails")
    .set({ enabled_at: threeDaysAgo })
    .where("id", "=", email.id)
    .execute();
  await flow.database
    .updateTable("enrollments")
    .set({ created_at: twoDaysAgo })
    .where("course_id", "=", course.id)
    .execute();

  // The automation lives on between runs of this file: count what this run adds.
  const earlier = ok<{ stats: Email["stats"] }>(
    await admin.get(`/v1/marketing/emails/${email.id}/report`),
  ).stats;
  const run = sender();
  await run.prepare();
  // Meera opens a lesson after being queued: she no longer needs the nudge.
  await flow.database
    .insertInto("learning_progress")
    .values({
      id: crypto.randomUUID(),
      user_id: meera.userId,
      course_id: course.id,
      lesson_id: course.lessons[0]!.id,
      progress_percent: 10,
      position_seconds: null,
      position_updated_at: null,
    })
    .execute();
  const before = flow.email.sent.length;
  await run.send({ budget: 50, isPaused: () => false, pause: () => {} });

  const nudges = flow.email.sent.slice(before);
  assert.deepEqual(
    nudges.map((mail) => mail.to),
    [asha.learner.email.toLowerCase()],
    "Asha only: Ravi unsubscribed, Meera started",
  );
  assert.match(
    nudges[0]!.text,
    /Marketing Flow Course/u,
    "the email names the course",
  );

  const report = ok<{ stats: Email["stats"] }>(
    await admin.get(`/v1/marketing/emails/${email.id}/report`),
  );
  assert.equal(report.stats.sent - earlier.sent, 1);
  assert.equal(report.stats.skipped - earlier.skipped, 1);

  // Once per person: running it again sends nothing new.
  await sendAll();
  assert.equal(flow.email.sent.length, before + 1);
});

test("every ready audience counts, and every automation's queries run", async () => {
  const { MARKETING_AUTOMATION_KEYS, MARKETING_AUTOMATIONS } =
    await import("@veolms/contracts");
  const { qualifyingQuery, stillQualifiesQuery } =
    await import("../../src/modules/marketing/marketing-automations.ts");
  const workshopId = crypto.randomUUID();
  const segments = [
    { type: "all" },
    { type: "bought", courseIds: [course.id] },
    { type: "not_bought", courseIds: [course.id] },
    { type: "workshop", workshopId, attendance: "attended" },
    { type: "workshop", workshopId, attendance: "missed" },
    { type: "new", days: 7 },
    { type: "inactive", days: 14 },
    { type: "not_started", courseIds: [] },
    { type: "not_started", courseIds: [course.id] },
    { type: "not_opened", emailId: sentEmailId || crypto.randomUUID() },
  ];
  for (const segment of segments) {
    const response = await admin.post("/v1/marketing/audience/count", {
      audience: { segment, excludeCourseIds: [course.id] },
    });
    assert.equal(
      response.status,
      200,
      `${segment.type}: ${JSON.stringify(response.body.error)}`,
    );
  }
  for (const key of MARKETING_AUTOMATION_KEYS) {
    const settings = {
      wait: MARKETING_AUTOMATIONS[key].default || 1,
      courseId: course.id,
    };
    await qualifyingQuery(
      key,
      settings,
      new Date(Date.now() - 86_400_000),
    ).execute(flow.database);
    await qualifyingQuery(
      key,
      { ...settings, courseId: null },
      new Date(),
    ).execute(flow.database);
    await stillQualifiesQuery(key, settings, asha.userId, course.id)?.execute(
      flow.database,
    );
  }
  const options = ok<{ courses: { id: string }[] }>(
    await admin.get("/v1/marketing/audience/options"),
  );
  assert.ok(options.courses.some((option) => option.id === course.id));
  const automations = ok<{ automations: { key: string }[] }>(
    await admin.get("/v1/marketing/automations"),
  );
  assert.deepEqual(
    automations.automations.map((row) => row.key),
    [...MARKETING_AUTOMATION_KEYS],
  );
});
