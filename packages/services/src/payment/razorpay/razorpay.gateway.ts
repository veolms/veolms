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
  GatewayWebhookHeaders,
} from "@veolms/contracts";
import { AppError } from "@veolms/api-core";
import { secureCompare } from "../../utils/secure-compare.ts";

export interface RazorpayGatewayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  baseUrl?: string;
}

/** Upper bound for any single Razorpay API call. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * What a payment in another currency settles for. Razorpay settles in
 * rupees and names the amount (`base_amount`, in paise) only on a payment
 * whose currency is not INR.
 */
function settlementOf(payment: {
  currency?: string;
  base_amount?: number | null;
  base_currency?: string | null;
}): { settlementAmount: number | null; settlementCurrency: string | null } {
  if (
    typeof payment.base_amount !== "number" ||
    !payment.base_currency ||
    payment.base_currency.toUpperCase() === payment.currency?.toUpperCase()
  ) {
    return { settlementAmount: null, settlementCurrency: null };
  }
  return {
    settlementAmount: payment.base_amount,
    settlementCurrency: payment.base_currency.toUpperCase(),
  };
}

/** The same, with the keys left out when there is nothing to name. */
function optionalSettlement(settlement: ReturnType<typeof settlementOf>) {
  return settlement.settlementAmount === null ||
    settlement.settlementCurrency === null
    ? {}
    : {
        settlementAmount: settlement.settlementAmount,
        settlementCurrency: settlement.settlementCurrency,
      };
}

/**
 * Lightweight Razorpay Gateway Adapter encapsulating the Razorpay REST API
 * and cryptographic signature verification.
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
    const credentials = Buffer.from(`${this.keyId}:${this.keySecret}`).toString(
      "base64",
    );
    return `Basic ${credentials}`;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    // Without credentials there is nothing to ask: the provider would only
    // answer "unauthorised", and this answers the same way, which callers
    // already treat as a definite refusal. Outside production the API
    // starts without them (with a warning), so this is where a paid checkout
    // stops, before any request leaves the machine.
    if (!this.keyId || !this.keySecret) {
      throw new AppError(
        401,
        "PAYMENT_GATEWAY_ERROR",
        "Payment gateway is not configured",
      );
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      Authorization: this.getBasicAuthHeader(),
      "Content-Type": "application/json",
      ...options.headers,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        // Without this, a hung gateway holds the request (and its pool
        // slot / event-loop continuation) for undici's ~300s defaults.
        // Checkout and verify call this synchronously in the request path.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if ((err as Error)?.name === "TimeoutError") {
        // 504 so callers treat the outcome as UNKNOWN (the gateway may
        // have processed it) — isDefinitiveGatewayRejection stays false.
        throw new AppError(
          504,
          "PAYMENT_GATEWAY_ERROR",
          "Payment gateway request timed out",
        );
      }
      // Anything else fetch rejects with is the network's doing: the name
      // did not resolve, the connection was refused or it dropped. Rethrown
      // as it was, it carried no gateway code, so checkout answered a plain
      // 500 and the buyer was not told that payments were unavailable. A
      // 5xx, like the timeout: the request may or may not have arrived, so
      // the outcome is unknown and isDefinitiveGatewayRejection stays false.
      const unreachable = new AppError(
        502,
        "PAYMENT_GATEWAY_ERROR",
        "Payment gateway could not be reached",
      );
      unreachable.cause = err;
      throw unreachable;
    }

    if (!response.ok) {
      let errorBody:
        { error?: { description?: string }; description?: string } | undefined;
      try {
        errorBody = (await response.json()) as {
          error?: { description?: string };
          description?: string;
        };
      } catch {
        errorBody = { description: response.statusText };
      }
      const message =
        errorBody?.error?.description ||
        errorBody?.description ||
        "Razorpay API error";
      throw new AppError(response.status, "PAYMENT_GATEWAY_ERROR", message);
    }

    return (await response.json()) as T;
  }

  async createOrder(
    input: CreateGatewayOrderInput,
  ): Promise<GatewayOrderOutput> {
    const payload = {
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
    };

    const response = await this.request<{
      id: string;
      amount: number;
      currency: string;
    }>("/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      provider: this.providerName,
      gatewayOrderId: response.id,
      amount: response.amount,
      currency: response.currency,
      keyId: this.keyId,
      notes: input.notes,
    };
  }

  /** Razorpay's widget is opened with the order's id: there is no page. */
  checkoutUrl(_gatewayOrderId: string): string | undefined {
    return undefined;
  }

  verifyPaymentSignature(input: VerifyGatewayPaymentInput): boolean {
    const { gatewayOrderId, gatewayPaymentId, gatewaySignature } = input;
    // Razorpay's widget always signs what it reports.
    if (!gatewaySignature) return false;
    const body = `${gatewayOrderId}|${gatewayPaymentId}`;

    const expectedSignature = crypto
      .createHmac("sha256", this.keySecret)
      .update(body)
      .digest("hex");

    return secureCompare(expectedSignature, gatewaySignature);
  }

  async getPayment(gatewayPaymentId: string): Promise<GatewayPaymentDetails> {
    const payment = await this.request<{
      id: string;
      order_id: string;
      amount: number;
      currency: string;
      base_amount?: number | null;
      base_currency?: string | null;
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
      ...settlementOf(payment),
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

  async refundPayment(
    input: CreateGatewayRefundInput,
  ): Promise<GatewayRefundOutput> {
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

  async fetchOrderPayments(
    gatewayOrderId: string,
  ): Promise<GatewayPaymentDetails[]> {
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

  verifyWebhookSignature(
    rawBody: string | Uint8Array,
    headers: GatewayWebhookHeaders,
  ): boolean {
    const signature = headers["x-razorpay-signature"];
    if (!this.webhookSecret || !rawBody || !signature) {
      return false;
    }

    const payloadBuffer =
      typeof rawBody === "string"
        ? Buffer.from(rawBody, "utf-8")
        : Buffer.from(rawBody);

    const expectedSignature = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(payloadBuffer)
      .digest("hex");

    return secureCompare(expectedSignature, signature);
  }

  webhookEventId(headers: GatewayWebhookHeaders): string | undefined {
    return headers["x-razorpay-event-id"];
  }

  normalizeWebhookEvent(
    rawPayload: unknown,
    eventId?: string,
  ): NormalizedPaymentEvent {
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
                base_amount?: number | null;
                base_currency?: string | null;
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
        eventType = "ignored";
        break;
    }

    // The provider's own event id (a request header) when there is one.
    // Without it the id is built from the event name and the entity it is
    // about. The bare entity id used to stand in, which made every event
    // about one payment look like a repeat of the first: an "authorized"
    // notice was stored, and the "captured" one that followed was dropped
    // as a duplicate. The same held for a refund's created and processed.
    const entityId = refundEntity?.id ?? paymentEntity?.id;
    const resolvedEventId =
      eventId ||
      payloadObj?.id ||
      (entityId ? `${event ?? "event"}:${entityId}` : undefined) ||
      crypto.randomUUID();

    // Razorpay refund webhooks carry BOTH the refund entity and the payment
    // entity. For refund events the meaningful amount is the refund's own
    // (partial) amount — preferring the payment entity here would report the
    // full payment amount and make downstream logic treat a partial refund
    // as a full one.
    const isRefundEvent =
      eventType === "refund.succeeded" ||
      eventType === "refund.pending" ||
      eventType === "refund.failed";
    const amount = isRefundEvent
      ? (refundEntity?.amount ?? paymentEntity?.amount)
      : (paymentEntity?.amount ?? refundEntity?.amount);
    const currency = isRefundEvent
      ? (refundEntity?.currency ?? paymentEntity?.currency)
      : (paymentEntity?.currency ?? refundEntity?.currency);

    return {
      eventId: resolvedEventId,
      eventType,
      provider: this.providerName,
      gatewayOrderId:
        paymentEntity?.order_id ?? payloadObj?.payload?.order?.entity?.id,
      gatewayPaymentId: paymentEntity?.id ?? refundEntity?.payment_id,
      gatewayRefundId: refundEntity?.id,
      amount,
      currency,
      ...(isRefundEvent || !paymentEntity
        ? {}
        : optionalSettlement(settlementOf(paymentEntity))),
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
      occurredAt: new Date(
        payloadObj?.created_at ? payloadObj.created_at * 1000 : Date.now(),
      ),
    };
  }
}
