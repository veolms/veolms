/**
 * The order page a buyer lands on after paying (`GET /orders/:id/
 * confirmation`) and the purchase email: who may read it, what it says in
 * each state, what each item opens, and the creator's welcome with the
 * buyer's name filled in.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import type {
  CreateCheckoutOrderResponse,
  OrderConfirmation,
  WorkshopAdmin,
} from "@veolms/contracts";
import type {
  EmailContent,
  EmailSendOptions,
  EmailService,
} from "@veolms/services/email";
import type { FastifyBaseLogger } from "fastify";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
  type FlowClient,
} from "./setup/flow-app.ts";
import { createCourse, type FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
const { config } = await import("../../src/config.ts");
const { createNotificationProcessor } =
  await import("../../src/modules/notifications/notification-processor.ts");
const { createAuthService } = await import("../../src/modules/auth/index.ts");
const { createOrderConfirmationService } =
  await import("../../src/modules/commerce/orders/order-confirmation.service.ts");

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

async function startCheckout(client: FlowClient, items: unknown[]) {
  const response = await client.post<CreateCheckoutOrderResponse>(
    "/v1/checkout/orders",
    { items },
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data!;
}

/** Buy and pay through the fake gateway, as the web app does. */
async function buy(client: FlowClient, items: unknown[]) {
  const checkout = await startCheckout(client, items);
  assert.ok(checkout.gateway, "a paid item opens the gateway");
  const paid = flow.gateway.pay(checkout.gateway.gatewayOrderId);
  const confirmed = await client.post("/v1/payments/verify", {
    orderId: checkout.order.id,
    gatewayOrderId: checkout.gateway.gatewayOrderId,
    ...paid,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  return checkout.order.id;
}

function confirmation(client: FlowClient, orderId: string) {
  return client.get<OrderConfirmation>(`/v1/orders/${orderId}/confirmation`);
}

function saveCourseWelcome(course: FlowCourse, welcome: unknown) {
  return admin.put(`/v1/courses/${course.id}/settings`, { welcome });
}

await test("the buyer's order page says paid and opens the course", async () => {
  const course = await createCourse(flow, { pricing: "paid", price: 799 });
  const buyer = await signedUpLearner(flow);
  const orderId = await buy(buyer.client, [
    { itemType: "course", courseId: course.id },
  ]);

  const response = await confirmation(buyer.client, orderId);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const order = response.body.data!;
  assert.equal(order.state, "paid");
  assert.equal(order.totalAmount, 79_900);
  assert.equal(order.items.length, 1);
  assert.deepEqual(order.items[0]!.next, {
    kind: "course",
    courseKey: course.slug,
    courseSlug: course.slug,
  });
  assert.equal(order.items[0]!.welcome, null, "no welcome was written");
  assert.equal(order.invoiceAvailable, true);
  assert.ok(order.paidAt);
  const email = buyer.learner.email;
  assert.equal(
    order.emailHint,
    `${email.slice(0, 1)}•••${email.slice(email.lastIndexOf("@"))}`,
  );
});

await test("only the buyer can read an order page", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const buyer = await signedUpLearner(flow);
  const stranger = await signedUpLearner(flow);
  const orderId = await buy(buyer.client, [
    { itemType: "course", courseId: course.id },
  ]);

  assert.equal((await confirmation(stranger.client, orderId)).status, 404);
  assert.equal((await confirmation(admin, orderId)).status, 404);
  assert.equal(
    (
      await flow
        .visitor()
        .get<OrderConfirmation>(`/v1/orders/${orderId}/confirmation`)
    ).status,
    401,
  );
  assert.equal(
    (await confirmation(buyer.client, crypto.randomUUID())).status,
    404,
  );
});

await test("an order not paid yet is pending, and a released one is not completed", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const buyer = await signedUpLearner(flow);
  const checkout = await startCheckout(buyer.client, [
    { itemType: "course", courseId: course.id },
  ]);

  const pending = (await confirmation(buyer.client, checkout.order.id)).body
    .data!;
  assert.equal(pending.state, "pending");
  assert.equal(pending.invoiceAvailable, false);

  const released = await buyer.client.post(
    `/v1/checkout/orders/${checkout.order.id}/release`,
  );
  assert.equal(released.status, 200, JSON.stringify(released.body));
  const failed = (await confirmation(buyer.client, checkout.order.id)).body
    .data!;
  assert.equal(failed.state, "failed");
});

await test("the creator's welcome reaches the buyer with their first name", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const saved = await saveCourseWelcome(course, {
    message: "Hi {first_name}! Start with lesson 1.",
    linkLabel: "Join the WhatsApp group",
    linkUrl: "https://chat.whatsapp.com/flow-test",
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  const buyer = await signedUpLearner(flow);
  await flow.database
    .updateTable("users")
    .set({ display_name: "Asha Verma" })
    .where("id", "=", buyer.userId)
    .execute();
  const orderId = await buy(buyer.client, [
    { itemType: "course", courseId: course.id },
  ]);

  const order = (await confirmation(buyer.client, orderId)).body.data!;
  assert.deepEqual(order.items[0]!.welcome, {
    message: "Hi Asha! Start with lesson 1.",
    link: {
      label: "Join the WhatsApp group",
      url: "https://chat.whatsapp.com/flow-test",
    },
  });
});

await test("a welcome button must be an https link with words", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  for (const welcome of [
    { message: null, linkLabel: "Join", linkUrl: "javascript:alert(1)" },
    { message: null, linkLabel: "Join", linkUrl: "http://example.com" },
    { message: null, linkLabel: null, linkUrl: "https://example.com" },
    { message: null, linkLabel: "Join", linkUrl: null },
    { message: "x".repeat(1001), linkLabel: null, linkUrl: null },
  ]) {
    const response = await saveCourseWelcome(course, welcome);
    assert.equal(response.status, 400, JSON.stringify(welcome));
  }
  // Empty text is no welcome at all.
  const cleared = await saveCourseWelcome(course, {
    message: "  ",
    linkLabel: "",
    linkUrl: "",
  });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  const stored = await flow.database
    .selectFrom("course_settings")
    .select(["welcome_message", "welcome_link_label", "welcome_link_url"])
    .where("course_id", "=", course.id)
    .executeTakeFirstOrThrow();
  assert.deepEqual(stored, {
    welcome_message: null,
    welcome_link_label: null,
    welcome_link_url: null,
  });
});

await test("a paid workshop's order page has its next session and its welcome", async () => {
  const start = new Date(Date.now() + 3 * DAY);
  const created = await admin.post<WorkshopAdmin>("/v1/workshops/admin", {
    title: "Order page workshop",
    summary: "A paid live session.",
    priceMinor: 19_900,
    currency: "INR",
    welcome: {
      message: "See you there, {first_name}.",
      linkLabel: null,
      linkUrl: null,
    },
    sessions: [
      {
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + HOUR).toISOString(),
        timeZone: "Asia/Kolkata",
        joinUrl: "https://meet.google.com/order-page-test",
      },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(
    created.body.data!.welcome.message,
    "See you there, {first_name}.",
  );
  const published = await admin.post<WorkshopAdmin>(
    `/v1/workshops/admin/${created.body.data!.id}/publish`,
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));

  const buyer = await signedUpLearner(flow);
  const orderId = await buy(buyer.client, [
    { itemType: "workshop", workshopId: created.body.data!.id },
  ]);

  const item = (await confirmation(buyer.client, orderId)).body.data!.items[0]!;
  assert.equal(item.next.kind, "workshop");
  if (item.next.kind !== "workshop") return;
  assert.equal(item.next.workshopSlug, published.body.data!.slug);
  assert.equal(item.next.nextSession?.startsAt, start.toISOString());
  assert.equal(item.next.nextSession?.timeZone, "Asia/Kolkata");
  assert.match(item.welcome?.message ?? "", /^See you there, /);
});

// ---------------------------------------------------------------------------
// The purchase email

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  fatal() {},
  debug() {},
  trace() {},
  silent() {},
  child() {
    return silentLogger;
  },
} as unknown as FastifyBaseLogger;

class CapturedEmail implements EmailService {
  readonly sent: { to: string; content: EmailContent }[] = [];
  async send(to: string, content: EmailContent, _options?: EmailSendOptions) {
    this.sent.push({ to: to.toLowerCase(), content });
    return { status: "sent" as const, messageId: crypto.randomUUID() };
  }
  async verify() {
    return true;
  }
  async close() {}
}

function worker(email: CapturedEmail) {
  const auth = createAuthService({ database: flow.database });
  const confirmations = createOrderConfirmationService({
    database: flow.database,
  });
  return createNotificationProcessor({
    database: flow.database,
    email,
    logger: silentLogger,
    config: { ...config, NOTIFICATION_BULK_PER_CYCLE: 1000 },
    handlers: {
      listActiveCourseRecipientUserIds: async () => [],
      getPurchaseConfirmation: (userId, orderId) =>
        confirmations.getForEmail(userId, orderId),
    },
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

await test("the purchase email says what to open next and carries the welcome", async () => {
  const course = await createCourse(flow, {
    pricing: "paid",
    title: "Email Course",
  });
  await saveCourseWelcome(course, {
    message: "Welcome, {first_name}!",
    linkLabel: "Join the group",
    linkUrl: "https://t.me/flow-test",
  });
  const buyer = await signedUpLearner(flow);
  await flow.database
    .updateTable("users")
    .set({ display_name: "Ravi Kumar" })
    .where("id", "=", buyer.userId)
    .execute();
  const orderId = await buy(buyer.client, [
    { itemType: "course", courseId: course.id },
  ]);

  const email = new CapturedEmail();
  const processor = worker(email);
  let mine: (typeof email.sent)[number] | undefined;
  for (let cycle = 0; cycle < 20 && !mine; cycle += 1) {
    await processor.process();
    mine = email.sent.find(
      (sent) =>
        sent.to === buyer.learner.email.toLowerCase() &&
        sent.content.subject.includes("Email Course"),
    );
  }
  assert.ok(mine, "the buyer got the purchase email");
  const { subject, text, html } = mine.content;
  assert.equal(subject, "You're in: Email Course");
  assert.match(text, /Ravi, you're in!/);
  assert.match(text, /Welcome, Ravi!/);
  assert.match(text, new RegExp(`Start learning: .*/learn/${course.slug}`));
  assert.match(text, /Join the group: https:\/\/t\.me\/flow-test/);
  assert.match(text, new RegExp(`/purchase-history/${orderId}`));
  assert.match(html, /Start learning/);
  assert.doesNotMatch(html, /\{first_name\}/);
});

await flow.close();
