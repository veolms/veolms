import crypto from "node:crypto";
import type {
  PaymentGateway,
  CreateGatewayOrderInput,
  GatewayOrderOutput,
  VerifyGatewayPaymentInput,
  GatewayPaymentDetails,
  CreateGatewayRefundInput,
  GatewayRefundOutput,
  NormalizedPaymentEvent,
} from "@veolms/contracts";
import { AppError } from "../../../../../lib/errors.ts";

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
      let errorBody: any;
      try {
        errorBody = await response.json();
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

    const expectedBuf = Buffer.from(expectedSignature, "utf-8");
    const signatureBuf = Buffer.from(gatewaySignature, "utf-8");

    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
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
      method: string;
      bank?: string | null;
      wallet?: string | null;
      vpa?: string | null;
      card?: { last4?: string; network?: string } | null;
      error_code?: string | null;
      error_description?: string | null;
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
      method: payment.method,
      bank: payment.bank,
      wallet: payment.wallet,
      vpa: payment.vpa,
      cardLast4: payment.card?.last4,
      cardNetwork: payment.card?.network,
      errorCode: payment.error_code,
      errorDescription: payment.error_description,
    };
  }

  /**
   * Initiates a refund in Razorpay (POST /v1/payments/:id/refund)
   */
  async refundPayment(input: CreateGatewayRefundInput): Promise<GatewayRefundOutput> {
    const payload = {
      amount: input.amount,
      notes: {
        reason: input.reason ?? "Customer refund",
        ...input.notes,
      },
    };

    const response = await this.request<{
      id: string;
      amount: number;
      currency: string;
      status: string;
    }>(`/payments/${input.gatewayPaymentId}/refund`, {
      method: "POST",
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
   * Verifies Razorpay webhook header signature:
   * HMAC_SHA256(raw_body, webhook_secret) == x-razorpay-signature
   */
  verifyWebhookSignature(rawBody: string | Uint8Array, signature: string): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    const payloadBuffer = typeof rawBody === "string" ? Buffer.from(rawBody, "utf-8") : Buffer.from(rawBody);

    const expectedSignature = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(payloadBuffer)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSignature, "utf-8");
    const signatureBuf = Buffer.from(signature, "utf-8");

    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  }

  /**
   * Normalizes Razorpay webhook event into domain event
   */
  normalizeWebhookEvent(rawPayload: any): NormalizedPaymentEvent {
    const event = rawPayload?.event as string;
    const paymentEntity = rawPayload?.payload?.payment?.entity;
    const refundEntity = rawPayload?.payload?.refund?.entity;

    let eventType: NormalizedPaymentEvent["eventType"] = "payment.succeeded";
    if (event === "payment.failed") {
      eventType = "payment.failed";
    } else if (event === "refund.processed") {
      eventType = "refund.succeeded";
    } else if (event === "refund.failed") {
      eventType = "refund.failed";
    }

    return {
      eventId: rawPayload?.id ?? crypto.randomUUID(),
      eventType,
      provider: this.providerName,
      gatewayOrderId: paymentEntity?.order_id,
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
      occurredAt: new Date(rawPayload?.created_at ? rawPayload.created_at * 1000 : Date.now()),
    };
  }
}
