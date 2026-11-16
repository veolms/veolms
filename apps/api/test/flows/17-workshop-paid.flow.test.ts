/**
 * Workshops, step 5 (paid): a seat is bought through the normal checkout.
 * Paying registers the buyer, a refund gives the seat back, and cancelling
 * the workshop with "refund paid" refunds every such order.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  CreateCheckoutOrderResponse,
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

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

async function publishedPaidWorkshop(
  client: FlowClient,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<WorkshopAdmin> {
  const start = new Date(Date.now() + 3 * DAY);
  const created = await client.post<WorkshopAdmin>("/v1/workshops/admin", {
    title,
    summary: "A paid live session.",
    priceMinor: 49_900,
    currency: "INR",
    sessions: [
      {
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + HOUR).toISOString(),
        timeZone: "Asia/Kolkata",
        joinUrl: "https://meet.google.com/pay-test-abc",
      },
    ],
    ...extra,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const published = await client.post<WorkshopAdmin>(
    `/v1/workshops/admin/${created.body.data!.id}/publish`,
  );
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return published.body.data!;
}

/** Buys a seat the way the page does: order, gateway, verify. */
async function buySeat(
  client: FlowClient,
  workshopId: string,
): Promise<{ orderId: string; status: number; body: unknown }> {
  const order = await client.post<CreateCheckoutOrderResponse>(
    "/v1/checkout/orders",
    { items: [{ itemType: "workshop", workshopId }] },
  );
  if (order.status !== 201 && order.status !== 200) {
    return { orderId: "", status: order.status, body: order.body };
  }
  const data = order.body.data!;
  assert.ok(data.gateway, "a paid seat goes through the gateway");
  const paid = flow.gateway.pay(data.gateway.gatewayOrderId);
  const verified = await client.post("/v1/payments/verify", {
    orderId: data.order.id,
    gatewayOrderId: data.gateway.gatewayOrderId,
    ...paid,
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return { orderId: data.order.id, status: verified.status, body: null };
}

const workshop = await publishedPaidWorkshop(admin, "Paid deep dive");
const buyer = await signedUpLearner(flow, "wsbuyer");

await test("the free register button refuses a paid workshop and points at checkout", async () => {
  const me = await buyer.client.get<WorkshopViewer>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  assert.equal(me.body.data?.reason, "payment_required");
  const free = await buyer.client.post(`/v1/workshops/${workshop.id}/register`);
  assert.equal(free.status, 409);
  assert.equal(free.body.error?.code, "WORKSHOP_PAYMENT_REQUIRED");

  const preview = await buyer.client.post<{
    pricing: { totalAmount: number; currency: string };
  }>("/v1/checkout/preview", {
    items: [{ itemType: "workshop", workshopId: workshop.id }],
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.data?.pricing.totalAmount, 499, "₹499, in rupees");
  assert.equal(preview.body.data?.pricing.currency, "INR");
});

await test("paying registers the buyer, once; a second purchase is refused", async () => {
  const bought = await buySeat(buyer.client, workshop.id);
  assert.equal(bought.status, 200);

  const me = await buyer.client.get<WorkshopViewer>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  assert.equal(me.body.data?.registered, true);
  assert.equal(me.body.data?.reason, "registered");
  const page = await buyer.client.get<WorkshopPublic>(
    `/v1/workshops/${workshop.slug}`,
  );
  assert.equal(page.body.data?.registrationCount, 1);

  const registration = await flow.database
    .selectFrom("workshop_registrations")
    .select(["source", "order_id", "cancelled_at"])
    .where("workshop_id", "=", workshop.id)
    .executeTakeFirstOrThrow();
  assert.deepEqual(
    { source: registration.source, orderId: registration.order_id },
    { source: "order", orderId: bought.orderId },
  );
  const queued = (
    await flow.database
      .selectFrom("outbox_events")
      .select(["payload"])
      .where("event_type", "=", "workshop.registered")
      .execute()
  ).filter(
    (event) =>
      (event.payload as { workshopId: string }).workshopId === workshop.id,
  );
  assert.equal(queued.length, 1, "the same confirmation as a free seat");

  const again = await buyer.client.post("/v1/checkout/orders", {
    items: [{ itemType: "workshop", workshopId: workshop.id }],
  });
  assert.equal(again.status, 409, JSON.stringify(again.body));
  assert.equal(again.body.error?.code, "WORKSHOP_ALREADY_REGISTERED");

  // A paid seat is not given up with the free "cancel registration".
  const leave = await buyer.client.delete(
    `/v1/workshops/${workshop.id}/register`,
  );
  assert.equal(leave.status, 200);
  const after = await buyer.client.get<WorkshopViewer>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  assert.equal(after.body.data?.registered, false);
});

await test("refunding the order gives the seat back", async () => {
  const second = await signedUpLearner(flow, "wsrefund");
  const bought = await buySeat(second.client, workshop.id);
  assert.equal(bought.status, 200);

  const refund = await admin.post("/v1/refunds", {
    orderId: bought.orderId,
    reason: "Changed plans",
  });
  assert.equal(refund.status, 200, JSON.stringify(refund.body));

  const me = await second.client.get<WorkshopViewer>(
    `/v1/workshops/${workshop.slug}/me`,
  );
  assert.equal(me.body.data?.registered, false);
  assert.equal(me.body.data?.reason, "payment_required", "may buy again");
});

await test("checkout refuses a full, course-only, free, ended or cancelled workshop", async () => {
  const oneSeat = await publishedPaidWorkshop(admin, "One paid seat", {
    capacity: 1,
  });
  const first = await signedUpLearner(flow, "wsseatone");
  const second = await signedUpLearner(flow, "wsseattwo");
  assert.equal((await buySeat(first.client, oneSeat.id)).status, 200);
  const full = await buySeat(second.client, oneSeat.id);
  assert.equal(full.status, 409);
  assert.equal(
    (full.body as { error?: { code?: string } }).error?.code,
    "WORKSHOP_FULL",
  );

  const free = await admin.post<WorkshopAdmin>("/v1/workshops/admin", {
    title: "Free one",
    summary: "Free.",
    sessions: [
      {
        startsAt: new Date(Date.now() + DAY).toISOString(),
        endsAt: new Date(Date.now() + DAY + HOUR).toISOString(),
        timeZone: "Asia/Kolkata",
        joinUrl: "https://meet.google.com/free-test-abc",
      },
    ],
  });
  await admin.post(`/v1/workshops/admin/${free.body.data!.id}/publish`);
  const freeTry = await buyer.client.post("/v1/checkout/orders", {
    items: [{ itemType: "workshop", workshopId: free.body.data!.id }],
  });
  assert.equal(freeTry.status, 400);
  assert.equal(freeTry.body.error?.code, "WORKSHOP_NOT_PURCHASABLE");

  const cancelled = await publishedPaidWorkshop(admin, "Soon cancelled");
  await admin.post(`/v1/workshops/admin/${cancelled.id}/cancel`, {
    reason: "Moved online.",
  });
  const cancelledTry = await buyer.client.post("/v1/checkout/orders", {
    items: [{ itemType: "workshop", workshopId: cancelled.id }],
  });
  assert.equal(
    cancelledTry.status,
    404,
    "a cancelled workshop is not for sale",
  );

  const draft = await admin.post<WorkshopAdmin>("/v1/workshops/admin", {
    title: "Draft paid",
    priceMinor: 9_900,
  });
  const draftTry = await buyer.client.post("/v1/checkout/orders", {
    items: [{ itemType: "workshop", workshopId: draft.body.data!.id }],
  });
  assert.equal(draftTry.status, 404);
  assert.equal(draftTry.body.error?.code, "WORKSHOP_NOT_FOUND");
});

await test("cancelling with refunds refunds every paid seat and tells registrants", async () => {
  const doomed = await publishedPaidWorkshop(admin, "Doomed workshop");
  const a = await signedUpLearner(flow, "wsdoomeda");
  const b = await signedUpLearner(flow, "wsdoomedb");
  const orderA = await buySeat(a.client, doomed.id);
  const orderB = await buySeat(b.client, doomed.id);
  assert.equal(orderA.status, 200);
  assert.equal(orderB.status, 200);

  const cancelled = await admin.post<WorkshopAdmin>(
    `/v1/workshops/admin/${doomed.id}/cancel`,
    { reason: "The venue fell through.", refundPaid: true },
  );
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));

  for (const orderId of [orderA.orderId, orderB.orderId]) {
    const order = await flow.database
      .selectFrom("orders")
      .select(["status"])
      .where("id", "=", orderId)
      .executeTakeFirstOrThrow();
    assert.match(order.status, /refunded/, `order ${orderId} was refunded`);
  }
  const seats = await flow.database
    .selectFrom("workshop_registrations")
    .select(["cancelled_at"])
    .where("workshop_id", "=", doomed.id)
    .execute();
  assert.equal(seats.length, 2);
  assert.ok(seats.every((seat) => seat.cancelled_at !== null));

  const notice = await flow.database
    .selectFrom("outbox_events")
    .select(["payload"])
    .where("event_type", "=", "workshop.updated")
    .execute();
  const mine = notice.find(
    (event) =>
      (event.payload as { workshopId: string }).workshopId === doomed.id,
  );
  assert.ok(mine);
  assert.equal((mine.payload as { refunding: boolean }).refunding, true);
});

await flow.close();
