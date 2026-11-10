/**
 * Queued email, through the real worker against the flow database: a
 * learner's own mail goes out before course-wide mail, bulk mail is capped
 * per cycle, a throttling provider pauses a lane without losing a message,
 * a dead address is never mailed again, and the unsubscribe link every
 * optional notice carries turns that kind of email off.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import type { FastifyBaseLogger } from "fastify";
import type {
  EmailContent,
  EmailSendOptions,
  EmailService,
} from "@veolms/services/email";

import { signedUpLearner, startFlowApp } from "./setup/flow-app.ts";
import { FLOW_ADMIN } from "./setup/flow-fixtures.ts";

const flow = await startFlowApp();
const { config } = await import("../../src/config.ts");
const { createOutboxService } =
  await import("../../src/events/outbox.service.ts");
const { createNotificationProcessor } =
  await import("../../src/modules/notifications/notification-processor.ts");
const { createAuthService } = await import("../../src/modules/auth/index.ts");
const { unsubscribeUrlFor } =
  await import("../../src/modules/notifications/email-unsubscribe.ts");
const { listPlatformPermissionHolderIds } =
  await import("../../src/modules/authorization/authorization.repository.ts");

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

interface Sent {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

/** A mail provider the test scripts: records sends, fails when told to. */
class ScriptedEmail implements EmailService {
  readonly sent: Sent[] = [];
  /** The next failures, by recipient; each is used once. */
  readonly failures = new Map<string, Error[]>();

  failNext(to: string, responseCode: number, response: string) {
    const list = this.failures.get(to.toLowerCase()) ?? [];
    list.push(
      Object.assign(new Error(response), {
        code: "EENVELOPE",
        responseCode,
        response,
      }),
    );
    this.failures.set(to.toLowerCase(), list);
  }

  async send(
    to: string,
    content: EmailContent,
    options: EmailSendOptions = {},
  ) {
    const planned = this.failures.get(to.toLowerCase());
    const error = planned?.shift();
    if (error) return { status: "failed" as const, error };
    this.sent.push({
      to: to.toLowerCase(),
      subject: content.subject,
      text: content.text,
      html: content.html,
      headers: { ...(options.headers ?? {}) },
    });
    return { status: "sent" as const, messageId: crypto.randomUUID() };
  }

  async verify() {
    return true;
  }

  async close() {}
}

/** The worker as production runs it, with a scripted provider. */
function worker(email: ScriptedEmail, bulkPerCycle: number) {
  const auth = createAuthService({ database: flow.database });
  return createNotificationProcessor({
    database: flow.database,
    email,
    logger: silentLogger,
    config: {
      ...config,
      NOTIFICATION_BULK_PER_CYCLE: bulkPerCycle,
      NOTIFICATION_THROTTLE_PAUSE_SECONDS: 900,
    },
    handlers: { listActiveCourseRecipientUserIds: async () => [] },
    recipients: {
      findRecipient: async (userId) => {
        const user = await auth.findUserByIdForNotification(userId);
        return user
          ? { id: user.id, email: user.email, isDeleted: user.is_deleted }
          : undefined;
      },
      findRecipients: (userIds) =>
        auth.listNotificationRecipientsByIds(userIds),
    },
  });
}

const outbox = createOutboxService();

/** A daily reminder for the learner: course-wide-style mail, bulk lane. */
async function queueReminder(userId: string) {
  await flow.database.transaction().execute(async (trx) => {
    await outbox.publish(trx, {
      type: "learning.reminder",
      version: 1,
      dedupeKey: `learning.reminder:${userId}:${crypto.randomUUID()}`,
      occurredAt: new Date(),
      payload: {
        recipientUserId: userId,
        dailyGoalMinutes: 20,
        streakDays: 3,
        localDate: "2026-11-10",
      },
    });
  });
}

/** A purchase receipt for the learner: their own mail, transactional lane. */
async function queueReceipt(userId: string) {
  await flow.database.transaction().execute(async (trx) => {
    await outbox.publish(trx, {
      type: "payment.completed",
      version: 1,
      dedupeKey: `payment.completed:${crypto.randomUUID()}`,
      occurredAt: new Date(),
      payload: {
        paymentId: crypto.randomUUID(),
        orderId: crypto.randomUUID(),
        orderNumber: "ORD-20261110-FLOW01",
        recipientUserId: userId,
        totalAmount: 79900,
        currency: "INR",
        itemTitles: ["The Complete JavaScript Course"],
      },
    });
  });
}

/** The learner's queued emails, by lane and status. */
async function deliveries(userId: string) {
  return await flow.database
    .selectFrom("notification_deliveries as d")
    .innerJoin("notifications as n", "n.id", "d.notification_id")
    .select([
      "d.id",
      "d.lane",
      "d.status",
      "d.attempt_count",
      "d.next_attempt_at",
      "d.last_error",
      "n.type",
    ])
    .where("n.recipient_user_id", "=", userId)
    .where("d.channel", "=", "email")
    .orderBy("d.created_at", "asc")
    .execute();
}

await test("a learner's receipt goes out before course-wide mail, which is capped per cycle", async () => {
  const { learner, userId } = await signedUpLearner(flow, "lanes");
  const email = new ScriptedEmail();
  await queueReminder(userId);
  await queueReminder(userId);
  await queueReminder(userId);
  await queueReceipt(userId);

  const first = await worker(email, 1).process();
  assert.equal(first.outbox.processed, 4, JSON.stringify(first));
  assert.equal(first.email.sent, 2, "one receipt and one capped bulk mail");

  const rows = await deliveries(userId);
  assert.deepEqual(
    rows.map((row) => [row.lane, row.status]).sort(),
    [
      ["bulk", "pending"],
      ["bulk", "pending"],
      ["bulk", "sent"],
      ["transactional", "sent"],
    ].sort(),
  );
  const [receipt, reminder] = email.sent;
  assert.equal(receipt?.to, learner.email.toLowerCase());
  assert.match(receipt!.subject, /order|purchase|receipt|payment/i);
  assert.equal(receipt!.headers["Precedence"], undefined);
  assert.equal(reminder!.headers["Precedence"], "bulk");
  assert.equal(reminder!.headers["Auto-Submitted"], "auto-generated");
  for (const mail of email.sent) {
    assert.match(
      mail.headers["List-Unsubscribe"] ?? "",
      /^<https?:\/\/.+\/v1\/email\/unsubscribe\/.+>$/,
    );
    assert.equal(
      mail.headers["List-Unsubscribe-Post"],
      "List-Unsubscribe=One-Click",
    );
    assert.ok(
      mail.headers["X-Entity-Ref-ID"],
      "each delivery is its own thread",
    );
    assert.match(mail.text, /Unsubscribe from these emails: https?:\/\//);
    assert.match(mail.html, /Unsubscribe from these emails/);
  }

  await worker(email, 1).process();
  await worker(email, 1).process();
  assert.equal(
    email.sent.length,
    4,
    "the rest of the bulk mail follows, one per cycle",
  );
});

await test("a throttling provider pauses the lane; no message is lost or charged an attempt", async () => {
  const learner = await signedUpLearner(flow, "throttle");
  const buyer = await signedUpLearner(flow, "buyer");
  const email = new ScriptedEmail();
  // The provider refuses the learner's first (bulk) mail for the day.
  email.failNext(
    learner.learner.email,
    550,
    "550-5.4.5 Daily user sending limit exceeded. For more information on Gmail",
  );
  await queueReminder(learner.userId);
  await queueReminder(learner.userId);
  await queueReceipt(buyer.userId);

  const processor = worker(email, 10);
  const before = Date.now();
  const result = await processor.process();
  assert.equal(result.email.sent, 1, "the buyer's receipt still went out");
  assert.equal(
    result.email.retried,
    2,
    "the throttled mail and the one behind it wait",
  );
  assert.equal(result.email.failed, 0);

  const bulk = (await deliveries(learner.userId)).filter(
    (row) => row.lane === "bulk",
  );
  assert.equal(bulk.length, 2);
  for (const row of bulk) {
    assert.equal(row.status, "pending");
    assert.equal(row.attempt_count, 0, "a throttle is not the message's fault");
    assert.ok(
      row.next_attempt_at.getTime() >= before + 890_000,
      "it waits out the pause",
    );
  }

  const again = await processor.process();
  assert.equal(again.email.sent, 0, "the lane rests");

  await queueReceipt(buyer.userId);
  const receipt = await processor.process();
  assert.equal(
    receipt.email.sent,
    1,
    "transactional mail is unaffected by the bulk pause",
  );
});

await test("a dead address is never mailed again", async () => {
  const { learner, userId } = await signedUpLearner(flow, "bounce");
  const email = new ScriptedEmail();
  email.failNext(
    learner.email,
    550,
    "550-5.1.1 The email account that you tried to reach does not exist.",
  );
  await queueReminder(userId);

  const processor = worker(email, 10);
  const result = await processor.process();
  assert.equal(result.email.failed, 1);
  assert.equal(result.email.sent, 0);
  const suppressed = await flow.database
    .selectFrom("email_suppressions")
    .selectAll()
    .where("email", "=", learner.email.toLowerCase())
    .executeTakeFirst();
  assert.equal(suppressed?.reason, "hard_bounce");
  assert.equal(suppressed?.source, "smtp");

  await queueReminder(userId);
  await processor.process();
  const rows = await deliveries(userId);
  assert.equal(rows.length, 2);
  assert.equal(rows[1]?.status, "skipped", "no email is even queued now");
  assert.equal(email.sent.length, 0);
});

await test("the unsubscribe link turns that kind of email off, with no sign-in", async () => {
  const { client, userId } = await signedUpLearner(flow, "unsub");
  const url = unsubscribeUrlFor(userId, "learning.reminder");
  assert.ok(url);
  const path = new URL(url).pathname.replace(/^\/api(?=\/v1\/)/, "");
  const inbox = flow.visitor();

  const page = await inbox.get(path);
  assert.equal(page.status, 200);
  assert.match(String(page.body.raw), /Learning reminders/);
  assert.match(String(page.body.raw), /<form method="post">/);

  const forged = `${path.slice(0, -4)}abcd`;
  assert.equal((await inbox.post(forged)).status, 404);

  // A mail client's one-click POST: no page, just a confirmation.
  const clicked = await inbox.post<{ unsubscribed: true; group: string }>(path);
  assert.equal(clicked.status, 200, JSON.stringify(clicked.body));
  assert.deepEqual(clicked.body.data, {
    unsubscribed: true,
    group: "reminders",
  });

  const preferences = await client.get<{
    preferences: {
      notificationType: string;
      channel: string;
      enabled: boolean;
    }[];
  }>("/v1/notification-preferences");
  assert.equal(preferences.status, 200);
  const reminderEmail = preferences.body.data?.preferences.find(
    (preference) =>
      preference.notificationType === "learning.reminder" &&
      preference.channel === "email",
  );
  assert.equal(reminderEmail?.enabled, false);

  // The page's own button: a browser is sent back to the confirmation.
  const browser = await inbox.request("POST", path, undefined, {
    accept: "text/html,application/xhtml+xml",
  });
  assert.equal(browser.status, 303);
  assert.equal(browser.headers["location"], `${path}?done=1`);
  const done = await inbox.get(`${path}?done=1`);
  assert.match(String(done.body.raw), /You.re unsubscribed/);

  // The next reminder is in-app only.
  await queueReminder(userId);
  await worker(new ScriptedEmail(), 10).process();
  const rows = await deliveries(userId);
  assert.equal(rows.length, 0, "no email delivery was queued");
  const inApp = await flow.database
    .selectFrom("notification_deliveries as d")
    .innerJoin("notifications as n", "n.id", "d.notification_id")
    .select("d.status")
    .where("n.recipient_user_id", "=", userId)
    .where("d.channel", "=", "in_app")
    .execute();
  assert.equal(inApp.length, 1);
});

await test("unsubscribing from workshop emails tells the workshop team once", async () => {
  const { userId, learner } = await signedUpLearner(flow, "unsubws");
  const url = unsubscribeUrlFor(userId, "workshop.announced");
  assert.ok(url);
  const path = new URL(url).pathname.replace(/^\/api(?=\/v1\/)/, "");
  const inbox = flow.visitor();

  const first = await inbox.post<{ unsubscribed: true; group: string }>(path);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data?.group, "workshops");
  // The mail client's one-click request after a click changes nothing.
  assert.equal((await inbox.post(path)).status, 200);

  const auth = createAuthService({ database: flow.database });
  await createNotificationProcessor({
    database: flow.database,
    email: new ScriptedEmail(),
    logger: silentLogger,
    config,
    handlers: {
      listActiveCourseRecipientUserIds: async () => [],
      listPermissionHolderUserIds: (permissionKey) =>
        listPlatformPermissionHolderIds(flow.database, permissionKey),
    },
    recipients: {
      findRecipient: async (id) => {
        const user = await auth.findUserByIdForNotification(id);
        return user
          ? { id: user.id, email: user.email, isDeleted: user.is_deleted }
          : undefined;
      },
      findRecipients: (ids) => auth.listNotificationRecipientsByIds(ids),
    },
  }).process();

  const notices = await flow.database
    .selectFrom("notifications as n")
    .innerJoin("notification_deliveries as d", "d.notification_id", "n.id")
    .select(["n.recipient_user_id", "n.body", "n.deep_link", "d.channel"])
    .where("n.type", "=", "email.unsubscribed")
    .where("n.body", "like", `%${learner.email}%`)
    .execute();
  const forAdmin = notices.filter(
    (notice) => notice.recipient_user_id === FLOW_ADMIN.id,
  );
  assert.equal(forAdmin.length, 1, "the admin is told once");
  assert.equal(forAdmin[0]?.channel, "in_app", "a note in the app, not mail");
  assert.match(forAdmin[0]?.body ?? "", /Workshop invitations and reminders/);
  assert.ok(
    notices.every((notice) => notice.recipient_user_id !== userId),
    "the learner is not told about themself",
  );
});

await flow.close();
