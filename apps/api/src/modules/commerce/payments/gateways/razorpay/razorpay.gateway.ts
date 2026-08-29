import crypto from "node:crypto";
import type {
  PaymentGateway,
  CreateGatewayOrderInput,
  GatewayOrderOutput,
  GatewayOrderStatus,
  VerifyGatewayPaymentInput,
  GatewayPaymentDetails,
  CreateGatewayRefundInput,
  GatewayRefundOutput,
  GatewayRefundDetails,
  NormalizedPaymentEvent,
} from "@veolms/contracts";
import { AppError } from "../../../../../lib/errors.ts";
import { secureCompare } from "../../../../../lib/secure-compare.ts";

export interface RazorpayGatewayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  baseUrl?: string;
}

/**
 * Clean, lightweight Razorpay Gateway Adapter encapsulating the Razorpay REST API
 * and cryptographic signature verification without leaking Razorpay types outside.
 */
export class RazorpayPaymentGateway implements PaymentGateway {
  readonly providerName = "razorpay" as const;
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret?: string;
  private readonly baseUrl: string;

  constructor(config: RazorpayGatewayConfig) {
    this.keyId = config.keyId;
    this.keySecret = config.keySecret;
    this.webhookSecret = config.webhookSecret;
    this.baseUrl = config.baseUrl ?? "https://api.razorpay.com/v1";
  }

  private getBasicAuthHeader(): string {
    const credentials = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
    return `Basic ${credentials}`;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      Authorization: this.getBasicAuthHeader(),
      "Content-Type": "application/json",
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorBody: { error?: { description?: string }; description?: string } | undefined;
      try {
        errorBody = (await response.json()) as { error?: { description?: string }; description?: string };
      } catch {
        errorBody = { description: response.statusText };
      }
      const message = errorBody?.error?.description || errorBody?.description || "Razorpay API error";
      throw new AppError(response.status, "PAYMENT_GATEWAY_ERROR", message);
    }

    return (await response.json()) as T;
  }

  /**
   * Creates an upstream Razorpay order (POST /v1/orders)
   */
  async createOrder(input: CreateGatewayOrderInput): Promise<GatewayOrderOutput> {
    const payload = {
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
    };

    const response = await this.request<{ id: string; amount: number; currency: string }>(
      "/orders",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    return {
      provider: this.providerName,
      gatewayOrderId: response.id,
      amount: response.amount,
      currency: response.currency,
      keyId: this.keyId,
      notes: input.notes,
    };
  }

  /**
   * Verifies Razorpay checkout signature:
   * HMAC_SHA256(order_id + "|" + payment_id, key_secret) == signature
   */
  verifyPaymentSignature(input: VerifyGatewayPaymentInput): boolean {
    const { gatewayOrderId, gatewayPaymentId, gatewaySignature } = input;
    const body = `${gatewayOrderId}|${gatewayPaymentId}`;

    const expectedSignature = crypto
      .createHmac("sha256", this.keySecret)
      .update(body)
      .digest("hex");

    return secureCompare(expectedSignature, gatewaySignature);
  }

  /**
   * Fetches payment details from Razorpay (GET /v1/payments/:id)
   */
  async getPayment(gatewayPaymentId: string): Promise<GatewayPaymentDetails> {
    const payment = await this.request<{
      id: string;
      order_id: string;
      amount: number;
      currency: string;
      status: string;
      captured?: boolean;
      amount_refunded?: number;
      fee?: number | null;
      tax?: number | null;
      method: string;
      bank?: string | null;
      wallet?: string | null;
      vpa?: string | null;
      card?: { last4?: string; network?: string } | null;
      error_code?: string | null;
      error_description?: string | null;
      error_source?: string | null;
      error_step?: string | null;
      error_reason?: string | null;
    }>(`/payments/${gatewayPaymentId}`, {
      method: "GET",
    });

    let mappedStatus: GatewayPaymentDetails["status"] = "processing";
    if (payment.status === "captured") {
      mappedStatus = "captured";
    } else if (payment.status === "failed") {
      mappedStatus = "failed";
    } else if (payment.status === "refunded") {
      mappedStatus = "refunded";
    }

    return {
      gatewayPaymentId: payment.id,
      gatewayOrderId: payment.order_id,
      amount: payment.amount,
      currency: payment.currency,
      status: mappedStatus,
      captured: payment.captured,
      amountRefunded: payment.amount_refunded,
      fee: payment.fee,
      tax: payment.tax,
      method: payment.method,
      bank: payment.bank,
      wallet: payment.wallet,
      vpa: payment.vpa,
      cardLast4: payment.card?.last4,
      cardNetwork: payment.card?.network,
      errorCode: payment.error_code,
      errorDescription: payment.error_description,
      errorSource: payment.error_source,
      errorStep: payment.error_step,
      errorReason: payment.error_reason,
    };
  }

  /**
   * Initiates a refund in Razorpay (POST /v1/payments/:id/refund)
   * Passes X-Refund-Idempotency header if idempotencyKey is provided to prevent duplicate refunds.
   */
  async refundPayment(input: CreateGatewayRefundInput): Promise<GatewayRefundOutput> {
    const payload = {
      amount: input.amount,
      notes: {
        reason: input.reason ?? "Customer refund",
        ...input.notes,
      },
    };

    const headers: Record<string, string> = {};
    if (input.idempotencyKey) {
      headers["X-Refund-Idempotency"] = input.idempotencyKey;
    }

    const response = await this.request<{
      id: string;
      amount: number;
      currency: string;
      status: string;
    }>(`/payments/${input.gatewayPaymentId}/refund`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    return {
      gatewayRefundId: response.id,
      amount: response.amount,
      currency: response.currency,
      status: response.status === "processed" ? "processed" : "pending",
    };
  }

  /**
   * Fetches Razorpay order status (GET /v1/orders/:id)
   */
  async fetchOrder(gatewayOrderId: string): Promise<GatewayOrderStatus> {
    const order = await this.request<{
      id: string;
      amount: number;
      currency: string;
      status: string;
    }>(`/orders/${gatewayOrderId}`, { method: "GET" });

    let status: GatewayOrderStatus["status"] = "created";
    if (order.status === "paid") status = "paid";
    else if (order.status === "attempted") status = "attempted";

    return {
      gatewayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status,
    };
  }

  /**
   * Fetches payments associated with a Razorpay order (GET /v1/orders/:id/payments)
   */
  async fetchOrderPayments(gatewayOrderId: string): Promise<GatewayPaymentDetails[]> {
    const response = await this.request<{
      entity: string;
      count: number;
      items: Array<{
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
        captured?: boolean;
        amount_refunded?: number;
        fee?: number | null;
        tax?: number | null;
        method?: string;
        bank?: string | null;
        wallet?: string | null;
        vpa?: string | null;
        card?: { last4?: string; network?: string } | null;
        error_code?: string | null;
        error_description?: string | null;
      }>;
    }>(`/orders/${gatewayOrderId}/payments`, { method: "GET" });

    return (response.items || []).map((p) => {
      let mappedStatus: GatewayPaymentDetails["status"] = "processing";
      if (p.status === "captured") mappedStatus = "captured";
      else if (p.status === "failed") mappedStatus = "failed";
      else if (p.status === "refunded") mappedStatus = "refunded";

      return {
        gatewayPaymentId: p.id,
        gatewayOrderId: p.order_id,
        amount: p.amount,
        currency: p.currency,
        status: mappedStatus,
        captured: p.captured,
        amountRefunded: p.amount_refunded,
        fee: p.fee,
        tax: p.tax,
        method: p.method,
        bank: p.bank,
        wallet: p.wallet,
        vpa: p.vpa,
        cardLast4: p.card?.last4,
        cardNetwork: p.card?.network,
        errorCode: p.error_code,
        errorDescription: p.error_description,
      };
    });
  }

  /**
   * Fetches Razorpay refund status (GET /v1/refunds/:id)
   */
  async fetchRefund(gatewayRefundId: string): Promise<GatewayRefundDetails> {
    const refund = await this.request<{
      id: string;
      payment_id: string;
      amount: number;
      currency: string;
      status: string;
    }>(`/refunds/${gatewayRefundId}`, { method: "GET" });

    return {
      gatewayRefundId: refund.id,
      gatewayPaymentId: refund.payment_id,
      amount: refund.amount,
      currency: refund.currency,
      status:
        refund.status === "processed"
          ? "processed"
          : refund.status === "failed"
          ? "failed"
          : "pending",
    };
  }

  /**
   * Verifies Razorpay webhook header signature:
   * HMAC_SHA256(raw_body, webhook_secret) == x-razorpay-signature
   */
  verifyWebhookSignature(rawBody: string | Uint8Array, signature: string): boolean {
    if (!this.webhookSecret || !rawBody) {
      return false;
    }

    const payloadBuffer = typeof rawBody === "string" ? Buffer.from(rawBody, "utf-8") : Buffer.from(rawBody);

    const expectedSignature = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(payloadBuffer)
      .digest("hex");

    return secureCompare(expectedSignature, signature);
  }

  /**
   * Normalizes Razorpay webhook event into domain event.
   *
   * Uses an explicit switch mapping so only recognized event types can ever
   * trigger fulfillment — but an event type outside that switch (e.g.
   * subscription/dispute events, or any new Razorpay event type added after
   * this code was written) is normalized to "ignored" rather than rejected.
   * The webhook signature has already been verified by this point, so an
   * unrecognized-but-legitimate event is real Razorpay traffic, just not
   * anything this integration acts on; throwing here would surface as a
   * failing webhook and Razorpay would retry it forever. "ignored" events
   * flow through the normal store-and-enqueue path and land in
   * PaymentWorker's fallback branch (ack + mark processed, no fulfillment).
   */
  normalizeWebhookEvent(rawPayload: unknown, eventId?: string): NormalizedPaymentEvent {
    const payloadObj = rawPayload as
      | {
          id?: string;
          event?: string;
          created_at?: number;
          payload?: {
            payment?: {
              entity?: {
                id?: string;
                order_id?: string;
                amount?: number;
                currency?: string;
                method?: string;
                bank?: string;
                wallet?: string;
                vpa?: string;
                card?: { last4?: string; network?: string };
                error_code?: string;
                error_description?: string;
              };
            };
            order?: { entity?: { id?: string } };
            refund?: {
              entity?: {
                id?: string;
                payment_id?: string;
                amount?: number;
                currency?: string;
              };
            };
          };
        }
      | null
      | undefined;

    const event = payloadObj?.event;
    const paymentEntity = payloadObj?.payload?.payment?.entity;
    const refundEntity = payloadObj?.payload?.refund?.entity;

    let eventType: NormalizedPaymentEvent["eventType"];

    switch (event) {
      case "payment.captured":
      case "order.paid":
        eventType = "payment.succeeded";
        break;

      case "payment.failed":
        eventType = "payment.failed";
        break;

      case "refund.created":
        eventType = "refund.pending";
        break;

      case "refund.processed":
        eventType = "refund.succeeded";
        break;

      case "refund.failed":
        eventType = "refund.failed";
        break;

      default:
        // Not one of the event types this integration acts on. Acknowledge
        // it rather than 400 it — see the doc comment above.
        eventType = "ignored";
        break;
    }

    const resolvedEventId =
      eventId ||
      payloadObj?.id ||
      paymentEntity?.id ||
      refundEntity?.id ||
      crypto.randomUUID();

    return {
      eventId: resolvedEventId,
      eventType,
      provider: this.providerName,
      gatewayOrderId: paymentEntity?.order_id ?? payloadObj?.payload?.order?.entity?.id,
      gatewayPaymentId: paymentEntity?.id ?? refundEntity?.payment_id,
      gatewayRefundId: refundEntity?.id,
      amount: paymentEntity?.amount ?? refundEntity?.amount,
      currency: paymentEntity?.currency ?? refundEntity?.currency,
      paymentMethod: paymentEntity?.method
        ? {
            method: paymentEntity.method,
            bank: paymentEntity.bank,
            wallet: paymentEntity.wallet,
            vpa: paymentEntity.vpa,
            cardLast4: paymentEntity.card?.last4,
            cardNetwork: paymentEntity.card?.network,
          }
        : undefined,
      errorCode: paymentEntity?.error_code,
      errorDescription: paymentEntity?.error_description,
      rawPayload,
      occurredAt: new Date(payloadObj?.created_at ? payloadObj.created_at * 1000 : Date.now()),
    };
  }
}
