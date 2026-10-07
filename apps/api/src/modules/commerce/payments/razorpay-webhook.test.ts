import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RazorpayPaymentGateway } from "@veolms/services";

// The gateway the API actually runs is the one exported by @veolms/services.
// A duplicate under commerce/payments once received the fixes this test
// guards while the live one did not, so the test imports the live export.
const gateway = new RazorpayPaymentGateway({
  keyId: "rzp_test_dummy",
  keySecret: "dummy",
  webhookSecret: "dummy",
});

// Razorpay refund webhooks carry BOTH the refund entity and the payment
// entity it belongs to.
function refundWebhook(event: string) {
  return {
    event,
    payload: {
      refund: {
        entity: {
          id: "rfnd_TEST",
          payment_id: "pay_TEST",
          amount: 10_000,
          currency: "INR",
          status: "processed",
        },
      },
      payment: {
        entity: {
          id: "pay_TEST",
          order_id: "order_TEST",
          amount: 49_900,
          currency: "INR",
          status: "captured",
          amount_refunded: 10_000,
        },
      },
    },
  };
}

void describe("Razorpay webhook normalization", () => {
  void it("reports the refund's own amount for a partial refund, not the payment amount", () => {
    const event = gateway.normalizeWebhookEvent(
      refundWebhook("refund.processed"),
      "evt_TEST",
    );

    assert.equal(event.eventType, "refund.succeeded");
    assert.equal(event.gatewayRefundId, "rfnd_TEST");
    assert.equal(event.gatewayPaymentId, "pay_TEST");
    // 10000 paise refunded out of a 49900 paise payment. Reporting 49900
    // here made the fulfillment worker treat every partial refund as a full
    // one and revoke the learner's access.
    assert.equal(event.amount, 10_000);
    assert.equal(event.currency, "INR");
  });

  void it("still reports the payment amount for payment events", () => {
    const event = gateway.normalizeWebhookEvent(
      {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_TEST",
              order_id: "order_TEST",
              amount: 49_900,
              currency: "INR",
              status: "captured",
            },
          },
        },
      },
      "evt_TEST_2",
    );

    assert.equal(event.eventType, "payment.succeeded");
    assert.equal(event.amount, 49_900);
  });
});
