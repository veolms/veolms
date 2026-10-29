import crypto from "node:crypto";

import type {
  CreateGatewayRefundInput,
  GatewayOrderStatus,
  GatewayPaymentDetails,
  GatewayRefundDetails,
  GatewayRefundOutput,
  NormalizedPaymentEvent,
  PaymentGateway,
  PaymentGateways,
} from "@veolms/contracts";

interface FakeOrder {
  gatewayOrderId: string;
  amount: number;
  currency: string;
  payments: GatewayPaymentDetails[];
}

/**
 * Stands in for Razorpay. It keeps the orders the API creates in memory and
 * lets a test play the buyer: `pay` is the buyer completing the gateway's
 * window, and it returns what the widget hands back to the web app
 * (payment id and signature). The signature is a real HMAC, so a forged one
 * is refused exactly as Razorpay's would be.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly providerName = "razorpay" as const;
  readonly #secret = crypto.randomBytes(16).toString("hex");
  readonly #orders = new Map<string, FakeOrder>();
  readonly #payments = new Map<string, GatewayPaymentDetails>();
  readonly #refunds = new Map<string, GatewayRefundDetails>();
  #next = 0;
  // Gateway ids are unique for good, as real ones are, not only within a run.
  readonly #run = crypto.randomBytes(4).toString("hex");

  /** Every order the API asked the gateway to create, oldest first. */
  get orders(): readonly FakeOrder[] {
    return [...this.#orders.values()];
  }

  sign(gatewayOrderId: string, gatewayPaymentId: string): string {
    return crypto
      .createHmac("sha256", this.#secret)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest("hex");
  }

  /** The buyer pays a gateway order, in full, successfully. */
  pay(gatewayOrderId: string): {
    gatewayPaymentId: string;
    gatewaySignature: string;
  } {
    const order = this.#order(gatewayOrderId);
    const payment: GatewayPaymentDetails = {
      gatewayPaymentId: `pay_flow_${this.#run}_${++this.#next}`,
      gatewayOrderId,
      amount: order.amount,
      currency: order.currency,
      status: "captured",
      captured: true,
      method: "upi",
    };
    order.payments.push(payment);
    this.#payments.set(payment.gatewayPaymentId, payment);
    return {
      gatewayPaymentId: payment.gatewayPaymentId,
      gatewaySignature: this.sign(gatewayOrderId, payment.gatewayPaymentId),
    };
  }

  /** The buyer's payment is declined by their bank. */
  decline(gatewayOrderId: string): { gatewayPaymentId: string } {
    const order = this.#order(gatewayOrderId);
    const payment: GatewayPaymentDetails = {
      gatewayPaymentId: `pay_flow_${this.#run}_${++this.#next}`,
      gatewayOrderId,
      amount: order.amount,
      currency: order.currency,
      status: "failed",
      captured: false,
      method: "card",
      errorCode: "BAD_REQUEST_ERROR",
      errorDescription: "Payment declined by the bank",
    };
    order.payments.push(payment);
    this.#payments.set(payment.gatewayPaymentId, payment);
    return { gatewayPaymentId: payment.gatewayPaymentId };
  }

  #order(gatewayOrderId: string): FakeOrder {
    const order = this.#orders.get(gatewayOrderId);
    if (!order) throw new Error(`No fake gateway order ${gatewayOrderId}`);
    return order;
  }

  async createOrder(input: { amount: number; currency: string }) {
    const gatewayOrderId = `order_flow_${this.#run}_${++this.#next}`;
    this.#orders.set(gatewayOrderId, {
      gatewayOrderId,
      amount: input.amount,
      currency: input.currency,
      payments: [],
    });
    return {
      provider: this.providerName,
      gatewayOrderId,
      amount: input.amount,
      currency: input.currency,
      keyId: "rzp_test_flow",
    };
  }

  checkoutUrl(): undefined {
    return undefined;
  }

  async fetchOrder(gatewayOrderId: string): Promise<GatewayOrderStatus> {
    const order = this.#order(gatewayOrderId);
    const paid = order.payments.some((p) => p.status === "captured");
    return {
      gatewayOrderId,
      amount: order.amount,
      currency: order.currency,
      status: paid ? "paid" : order.payments.length ? "attempted" : "created",
    };
  }

  async fetchOrderPayments(gatewayOrderId: string) {
    return [...this.#order(gatewayOrderId).payments];
  }

  verifyPaymentSignature(input: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    gatewaySignature?: string;
  }): boolean {
    if (!input.gatewaySignature) return false;
    const expected = this.sign(input.gatewayOrderId, input.gatewayPaymentId);
    return (
      expected.length === input.gatewaySignature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(input.gatewaySignature),
      )
    );
  }

  async getPayment(gatewayPaymentId: string) {
    const payment = this.#payments.get(gatewayPaymentId);
    if (!payment)
      throw new Error(`No fake gateway payment ${gatewayPaymentId}`);
    return { ...payment };
  }

  /**
   * Refunds settle at once, as Razorpay's usually do. The gateway refuses
   * more than is left of the payment, as Razorpay's does.
   */
  async refundPayment(
    input: CreateGatewayRefundInput,
  ): Promise<GatewayRefundOutput> {
    const payment = this.#payments.get(input.gatewayPaymentId);
    if (!payment || !payment.captured) {
      throw new Error(`No captured payment ${input.gatewayPaymentId}`);
    }
    const refunded = this.refundsOf(input.gatewayPaymentId).reduce(
      (sum, refund) => sum + refund.amount,
      0,
    );
    if (input.amount > payment.amount - refunded) {
      throw new Error(
        `Refund of ${input.amount} exceeds what is left of ${input.gatewayPaymentId}`,
      );
    }
    const refund: GatewayRefundDetails = {
      gatewayRefundId: `rfnd_flow_${this.#run}_${++this.#next}`,
      gatewayPaymentId: input.gatewayPaymentId,
      amount: input.amount,
      currency: input.currency,
      status: "processed",
    };
    this.#refunds.set(refund.gatewayRefundId, refund);
    return {
      gatewayRefundId: refund.gatewayRefundId,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
    };
  }

  async fetchRefund(gatewayRefundId: string): Promise<GatewayRefundDetails> {
    const refund = this.#refunds.get(gatewayRefundId);
    if (!refund) throw new Error(`No fake gateway refund ${gatewayRefundId}`);
    return { ...refund };
  }

  /** The refunds the API made of a payment, oldest first. */
  refundsOf(gatewayPaymentId: string): GatewayRefundDetails[] {
    return [...this.#refunds.values()].filter(
      (refund) => refund.gatewayPaymentId === gatewayPaymentId,
    );
  }

  /** A webhook delivery is "signed" when it carries this run's secret. */
  webhookSignatureFor(rawBody: string): string {
    return crypto
      .createHmac("sha256", this.#secret)
      .update(rawBody)
      .digest("hex");
  }

  verifyWebhookSignature(
    rawBody: string | Uint8Array,
    headers: Record<string, string | undefined>,
  ): boolean {
    const body =
      typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString();
    return headers["x-razorpay-signature"] === this.webhookSignatureFor(body);
  }

  webhookEventId(headers: Record<string, string | undefined>) {
    return headers["x-razorpay-event-id"];
  }

  /** Payloads are `{ event: "payment.captured", gatewayPaymentId }`. */
  normalizeWebhookEvent(
    rawPayload: unknown,
    eventId?: string,
  ): NormalizedPaymentEvent {
    const payload = rawPayload as { event: string; gatewayPaymentId: string };
    const payment = this.#payments.get(payload.gatewayPaymentId);
    const eventType =
      payload.event === "payment.captured"
        ? "payment.succeeded"
        : payload.event === "payment.failed"
          ? "payment.failed"
          : "ignored";
    return {
      eventId: eventId ?? `evt_flow_${this.#run}_${++this.#next}`,
      eventType,
      provider: this.providerName,
      gatewayOrderId: payment?.gatewayOrderId,
      gatewayPaymentId: payload.gatewayPaymentId,
      amount: payment?.amount,
      currency: payment?.currency,
      rawPayload,
      occurredAt: new Date().toISOString(),
    };
  }
}

export function fakePaymentGateways(
  gateway: FakePaymentGateway,
): PaymentGateways {
  return {
    primary: gateway,
    all: [gateway],
    get: (provider) =>
      provider === gateway.providerName ? gateway : undefined,
    forCountry: () => gateway,
  };
}
