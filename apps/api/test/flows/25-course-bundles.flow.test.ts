/**
 * Bundles sold inside a course's price card
 * (creator-features/bundles-in-checkout): what staff may save, what a
 * course offers each visitor, and buying a bundle when you already own
 * part of it, which charges only for the rest.
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
import { courseAccess, createCourse, play } from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

interface Offer {
  id: string;
  title: string;
  price: number;
  apart: number;
  charge: number;
  saving: number;
  courses: { id: string; owned: boolean }[];
}

interface CheckoutOrder {
  order: { id: string; status: string };
  gateway: { gatewayOrderId: string; amount: number } | null;
}

function makeBundle(courses: FlowCourse[], price: number) {
  return admin.post<{ id: string }>("/v1/bundles", {
    slug: `flow-bundle-${crypto.randomUUID().slice(0, 8)}`,
    title: `Bundle of ${courses.length}`,
    status: "published",
    price,
    courseIds: courses.map((course) => course.id),
  });
}

async function offersFor(client: FlowClient, course: FlowCourse) {
  const response = await client.get<{ bundles: Offer[] }>(
    `/v1/bundles/for-course/${course.id}`,
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data!.bundles;
}

/** Checks out one item and pays for it with the fake gateway. */
async function buy(
  client: FlowClient,
  item: Record<string, string>,
): Promise<CheckoutOrder> {
  const response = await client.post<CheckoutOrder>("/v1/checkout/orders", {
    items: [item],
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const checkout = response.body.data!;
  const paid = flow.gateway.pay(checkout.gateway!.gatewayOrderId);
  const confirmed = await client.post<{ orderStatus: string }>(
    "/v1/payments/verify",
    {
      orderId: checkout.order.id,
      gatewayOrderId: checkout.gateway!.gatewayOrderId,
      ...paid,
    },
  );
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.data?.orderStatus, "paid");
  return checkout;
}

await test("a bundle must hold two courses and cost less than they do apart", async () => {
  const node = await createCourse(flow, { pricing: "paid", price: 8_999 });
  const design = await createCourse(flow, { pricing: "paid", price: 5_999 });

  const single = await makeBundle([node], 5_000);
  assert.equal(single.status, 400);
  assert.equal(single.body.error?.code, "BUNDLE_TOO_SMALL");

  const noSaving = await makeBundle([node, design], 14_998);
  assert.equal(noSaving.status, 400);
  assert.equal(noSaving.body.error?.code, "BUNDLE_NO_SAVING");
  assert.match(noSaving.body.error?.message ?? "", /₹14,998/u);

  const saved = await makeBundle([node, design], 11_999);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
});

await test("each course in a bundle offers it, with the saving at today's prices", async () => {
  const node = await createCourse(flow, { pricing: "paid", price: 8_999 });
  const design = await createCourse(flow, { pricing: "paid", price: 5_999 });
  const made = await makeBundle([node, design], 11_999);
  assert.equal(made.status, 200);

  for (const course of [node, design]) {
    const [offer] = await offersFor(flow.visitor(), course);
    assert.equal(offer?.id, made.body.data!.id);
    assert.equal(offer?.apart, 14_998);
    assert.equal(offer?.charge, 11_999);
    assert.equal(offer?.saving, 2_999);
  }
});

await test("a bundle that no longer saves anything is not offered", async () => {
  const node = await createCourse(flow, { pricing: "paid", price: 8_999 });
  const design = await createCourse(flow, { pricing: "paid", price: 5_999 });
  assert.equal((await makeBundle([node, design], 11_999)).status, 200);

  // The courses go on sale for less than the bundle costs.
  await flow.database
    .updateTable("course_pricing")
    .set({ sale_price: 4_000 })
    .where("course_id", "in", [node.id, design.id])
    .execute();

  assert.deepEqual(await offersFor(flow.visitor(), node), []);
});

await test("owning part of a bundle: it costs only the rest, and buying it opens the rest", async () => {
  const node = await createCourse(flow, { pricing: "paid", price: 8_999 });
  const design = await createCourse(flow, { pricing: "paid", price: 5_999 });
  const made = await makeBundle([node, design], 11_999);
  assert.equal(made.status, 200);
  const { client } = await signedUpLearner(flow);

  await buy(client, { itemType: "course", courseId: design.id });

  const [offer] = await offersFor(client, node);
  // System Design's share of the bundle price (4,799) comes off.
  assert.equal(offer?.charge, 7_200);
  assert.equal(offer?.saving, 8_999 - 7_200);
  assert.deepEqual(
    offer?.courses.map((course) => course.owned),
    [false, true],
  );

  const checkout = await buy(client, {
    itemType: "bundle",
    bundleId: made.body.data!.id,
  });
  assert.equal(checkout.gateway?.amount, 7_200 * 100);

  assert.equal((await courseAccess(client, node)).access?.access, "full");
  assert.equal((await play(client, node, 2)).status, 200);
  assert.equal((await courseAccess(client, design)).access?.enrolled, true);
  // Paid once, and kept: the payment was not taken back as "already owned".
  const order = await flow.database
    .selectFrom("orders")
    .select("status")
    .where("id", "=", checkout.order.id)
    .executeTakeFirstOrThrow();
  assert.equal(order.status, "paid");
});

await test("someone who owns every course in a bundle is not offered it", async () => {
  const node = await createCourse(flow, { pricing: "paid", price: 8_999 });
  const design = await createCourse(flow, { pricing: "paid", price: 5_999 });
  assert.equal((await makeBundle([node, design], 11_999)).status, 200);
  const { client } = await signedUpLearner(flow);

  await buy(client, { itemType: "course", courseId: node.id });
  await buy(client, { itemType: "course", courseId: design.id });

  assert.deepEqual(await offersFor(client, node), []);
});

await flow.close();
