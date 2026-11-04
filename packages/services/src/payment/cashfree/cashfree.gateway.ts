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
  GatewayWebhookHeaders,
  NormalizedPaymentEvent,
  PaymentStatus,
  RefundStatus,
} from "@veolms/contracts";
import { AppError } from "@veolms/api-core";
import { secureCompare } from "../../utils/secure-compare.ts";

export type CashfreeEnvironment = "sandbox" | "production";

export interface CashfreeGatewayConfig {
  appId: string;
  secretKey: string;
  environment: CashfreeEnvironment;
  /** Where the checkout sends the buyer after a payment it redirected for. */
  returnUrl: string;
}

/** Upper bound for any single Cashfree API call. */
const REQUEST_TIMEOUT_MS = 10_000;
/** The API version every request is made against. */
const API_VERSION = "2025-01-01";
/**
 * How long a Cashfree order stays payable: our order's hour, and the grace
 * a payment begun just before it ends is given to finish (see verify).
 */
const ORDER_LIFETIME_MS = 75 * 60 * 1000;
/**
 * Joins a Cashfree order id to the id of a payment or refund made in it.
 * Cashfree finds both only under their order, so the ids we keep for them
 * carry it: `<order id>:<payment id>`, `<order id>:<refund id>`.
 */
const ID_SEPARATOR = ":";
/** Stands in for a buyer who has given us no phone number. */
const NO_PHONE = "9999999999";

interface CashfreeOrder {
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: string;
  payment_session_id?: string;
}

interface CashfreePayment {
  cf_payment_id: number | string;
  order_id?: string;
  payment_status?: string | null;
  payment_amount?: number | null;
  payment_currency?: string | null;
  payment_group?: string | null;
  payment_message?: string | null;
  payment_method?: Record<string, Record<string, unknown> | null> | null;
  error_details?: {
    error_code?: string | null;
    error_description?: string | null;
    error_reason?: string | null;
    error_source?: string | null;
  } | null;
}

interface CashfreeRefund {
  cf_payment_id?: number | string;
  refund_id: string;
  order_id: string;
  refund_amount?: number | null;
  refund_currency?: string | null;
  refund_status?: string | null;
}

/**
 * Cashfree Payments. A plain gateway: we are the seller, and Cashfree pays
 * out what was paid less its fee, with no tax of the buyer's added.
 *
 * Its gateway order is a Cashfree order with an id of ours. The buyer pays
 * in Cashfree's window, opened over our page with the order's payment
 * session, which `keyId` carries as `<environment>:<session id>` so that
 * the page knows which of Cashfree's two scripts to start it with. Amounts
 * go to Cashfree in major units (699.00) and are ours in minor ones.
 */
export class CashfreePaymentGateway implements PaymentGateway {
  readonly providerName = "cashfree" as const;
  private readonly appId: string;
  private readonly secretKey: string;
  private readonly environment: CashfreeEnvironment;
  private readonly baseUrl: string;
  private readonly returnUrl: string;

  constructor(config: CashfreeGatewayConfig) {
    this.appId = config.appId;
    this.secretKey = config.secretKey;
    this.environment = config.environment;
    this.baseUrl =
      config.environment === "production"
        ? "https://api.cashfree.com/pg"
        : "https://sandbox.cashfree.com/pg";
    this.returnUrl = config.returnUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          "x-client-id": this.appId,
          "x-client-secret": this.secretKey,
          "x-api-version": API_VERSION,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...options.headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // As for the other gateways: a timeout or a network failure leaves
      // the outcome unknown, so both are 5xx and never a definite refusal.
      if ((err as Error)?.name === "TimeoutError") {
        throw new AppError(
          504,
          "PAYMENT_GATEWAY_ERROR",
          "Payment gateway request timed out",
        );
      }
      const unreachable = new AppError(
        502,
        "PAYMENT_GATEWAY_ERROR",
        "Payment gateway could not be reached",
      );
      unreachable.cause = err;
      throw unreachable;
    }

    if (!response.ok) {
      let message = response.statusText || "Cashfree API error";
      try {
        const body = (await response.json()) as { message?: string };
        message = body.message || message;
      } catch {
        // The status text stands.
      }
      throw new AppError(response.status, "PAYMENT_GATEWAY_ERROR", message);
    }

    return (await response.json()) as T;
  }

  async createOrder(
    input: CreateGatewayOrderInput,
  ): Promise<GatewayOrderOutput> {
    const currency = input.currency.toUpperCase();
    const order = await this.request<CashfreeOrder>("/orders", {
      method: "POST",
      body: JSON.stringify({
        // Ours, and new for every gateway order: an order of ours can be
        // offered for payment more than once.
        order_id: `veo_${crypto.randomUUID().replaceAll("-", "")}`,
        order_amount: toMajor(input.amount, currency),
        order_currency: currency,
        customer_details: {
          customer_id: input.customer.id.replace(/[^\w-]/gu, "_"),
          customer_name: input.customer.name || undefined,
          customer_email: input.customer.email || undefined,
          customer_phone: cashfreePhone(input.customer.phone),
        },
        order_meta: {
          return_url: this.returnUrl,
        },
        order_expiry_time: new Date(
          Date.now() + ORDER_LIFETIME_MS,
        ).toISOString(),
        order_note: (input.description || input.orderNumber).slice(0, 200),
        order_tags: { ...input.notes, veolms_order_id: input.orderId },
      }),
    });
    if (!order.payment_session_id) {
      throw new AppError(
        502,
        "PAYMENT_GATEWAY_ERROR",
        "Cashfree returned no payment session",
      );
    }

    return {
      provider: this.providerName,
      gatewayOrderId: order.order_id,
      amount: input.amount,
      currency,
      keyId: `${this.environment}:${order.payment_session_id}`,
      notes: input.notes,
    };
  }

  /** Cashfree's window opens with the order's payment session (keyId). */
  checkoutUrl(_gatewayOrderId: string): undefined {
    return undefined;
  }

  /**
   * Cashfree's window gives the page no signature of the payment, so there
   * is nothing to check here. The payment counts once it is fetched from
   * Cashfree with our key and found to belong to this order.
   */
  verifyPaymentSignature(_input: VerifyGatewayPaymentInput): boolean {
    return true;
  }

  async getPayment(gatewayPaymentId: string): Promise<GatewayPaymentDetails> {
    const [orderId, paymentId] = splitId(gatewayPaymentId);
    const payment = await this.request<CashfreePayment>(
      `/orders/${encodeURIComponent(orderId)}/payments/${encodeURIComponent(paymentId)}`,
      { method: "GET" },
    );
    return toPaymentDetails(orderId, payment);
  }

  async fetchOrder(gatewayOrderId: string): Promise<GatewayOrderStatus> {
    const order = await this.request<CashfreeOrder>(
      `/orders/${encodeURIComponent(gatewayOrderId)}`,
      { method: "GET" },
    );
    const currency = order.order_currency.toUpperCase();
    return {
      gatewayOrderId: order.order_id,
      amount: toMinor(order.order_amount, currency),
      currency,
      // An unpaid order does not say whether a payment was begun in it;
      // its payments are asked for whenever that matters.
      status: order.order_status === "PAID" ? "paid" : "attempted",
    };
  }

  /**
   * Terminates the order at Cashfree. With a payment pending in it,
   * Cashfree only notes the request, and the payment may still complete.
   */
  async cancelOrder(gatewayOrderId: string): Promise<void> {
    await this.request<CashfreeOrder>(
      `/orders/${encodeURIComponent(gatewayOrderId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ order_status: "TERMINATED" }),
      },
    );
  }

  async fetchOrderPayments(
    gatewayOrderId: string,
  ): Promise<GatewayPaymentDetails[]> {
    const payments = await this.request<CashfreePayment[]>(
      `/orders/${encodeURIComponent(gatewayOrderId)}/payments`,
      { method: "GET" },
    );
    return payments.map((payment) => toPaymentDetails(gatewayOrderId, payment));
  }

  async refundPayment(
    input: CreateGatewayRefundInput,
  ): Promise<GatewayRefundOutput> {
    const [orderId] = splitId(input.gatewayPaymentId);
    const currency = input.currency.toUpperCase();
    // Ours, from the caller's key when there is one: asking again with the
    // same key finds the refund made the first time instead of a second.
    const refundId = refundIdFor(input.idempotencyKey);
    let refund: CashfreeRefund;
    try {
      refund = await this.request<CashfreeRefund>(
        `/orders/${encodeURIComponent(orderId)}/refunds`,
        {
          method: "POST",
          body: JSON.stringify({
            refund_amount: toMajor(input.amount, currency),
            refund_id: refundId,
            refund_note: (input.reason ?? "Customer refund")
              .padEnd(3, ".")
              .slice(0, 100),
          }),
        },
      );
    } catch (err) {
      if (!(err instanceof AppError) || err.statusCode !== 409) throw err;
      refund = await this.fetchCashfreeRefund(orderId, refundId);
    }

    const status = toRefundStatus(refund.refund_status);
    return {
      gatewayRefundId: joinId(orderId, refund.refund_id),
      amount: input.amount,
      currency,
      status: status === "processed" ? "processed" : "pending",
    };
  }

  async fetchRefund(gatewayRefundId: string): Promise<GatewayRefundDetails> {
    const [orderId, refundId] = splitId(gatewayRefundId);
    const refund = await this.fetchCashfreeRefund(orderId, refundId);
    const currency = (refund.refund_currency ?? "INR").toUpperCase();
    return {
      gatewayRefundId,
      gatewayPaymentId: joinId(orderId, String(refund.cf_payment_id ?? "")),
      amount: toMinor(refund.refund_amount ?? 0, currency),
      currency,
      status: toRefundStatus(refund.refund_status),
    };
  }

  private fetchCashfreeRefund(orderId: string, refundId: string) {
    return this.request<CashfreeRefund>(
      `/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`,
      { method: "GET" },
    );
  }

  /**
   * Cashfree signs a delivery with our secret key: an HMAC-SHA256 of the
   * timestamp header followed by the raw body, base64. The timestamp is not
   * held to a window, as Cashfree's retries may carry the first one; a
   * delivery sent again is a duplicate of an event already recorded (see
   * the event ids in normalizeWebhookEvent).
   */
  verifyWebhookSignature(
    rawBody: string | Uint8Array,
    headers: GatewayWebhookHeaders,
  ): boolean {
    const signature = headers["x-webhook-signature"];
    const timestamp = headers["x-webhook-timestamp"];
    if (!rawBody || !signature || !timestamp) return false;

    const body =
      typeof rawBody === "string" ? Buffer.from(rawBody, "utf-8") : rawBody;
    const expected = crypto
      .createHmac("sha256", this.secretKey)
      .update(timestamp)
      .update(body)
      .digest("base64");
    return secureCompare(signature, expected);
  }

  /**
   * Cashfree gives a delivery no id of its own that stays the same when it
   * is sent again; the event's id is made from what it is about instead.
   */
  webhookEventId(_headers: GatewayWebhookHeaders): undefined {
    return undefined;
  }

  normalizeWebhookEvent(
    rawPayload: unknown,
    eventId?: string,
  ): NormalizedPaymentEvent {
    const event = rawPayload as
      | {
          type?: string;
          event_time?: string;
          data?: {
            order?: { order_id?: string };
            payment?: CashfreePayment;
            refund?: CashfreeRefund;
          };
        }
      | null
      | undefined;
    const type = event?.type;
    const orderId =
      event?.data?.order?.order_id ?? event?.data?.refund?.order_id;
    const payment = event?.data?.payment;
    const refund = event?.data?.refund;

    let eventType: NormalizedPaymentEvent["eventType"] = "ignored";
    switch (type) {
      case "PAYMENT_SUCCESS_WEBHOOK":
        eventType = "payment.succeeded";
        break;
      case "PAYMENT_FAILED_WEBHOOK":
      case "PAYMENT_USER_DROPPED_WEBHOOK":
        eventType = "payment.failed";
        break;
      case "REFUND_STATUS_WEBHOOK": {
        const status = toRefundStatus(refund?.refund_status);
        eventType =
          status === "processed"
            ? "refund.succeeded"
            : status === "failed"
              ? "refund.failed"
              : "refund.pending";
        break;
      }
    }

    const details =
      orderId && payment ? toPaymentDetails(orderId, payment) : undefined;
    const refundCurrency = (refund?.refund_currency ?? "INR").toUpperCase();
    const about = refund
      ? `${refund.order_id}${ID_SEPARATOR}${refund.refund_id}${ID_SEPARATOR}${refund.refund_status ?? ""}`
      : details?.gatewayPaymentId;

    const occurredAt = event?.event_time
      ? new Date(event.event_time)
      : new Date();
    return {
      eventId: eventId || `${type ?? "event"}:${about ?? crypto.randomUUID()}`,
      eventType,
      provider: this.providerName,
      gatewayOrderId: orderId,
      gatewayPaymentId: refund
        ? refund.cf_payment_id !== undefined
          ? joinId(refund.order_id, String(refund.cf_payment_id))
          : undefined
        : details?.gatewayPaymentId,
      gatewayRefundId: refund
        ? joinId(refund.order_id, refund.refund_id)
        : undefined,
      amount: refund
        ? toMinor(refund.refund_amount ?? 0, refundCurrency)
        : details?.amount,
      currency: refund ? refundCurrency : details?.currency,
      paymentMethod: details?.method
        ? {
            method: details.method,
            bank: details.bank,
            wallet: details.wallet,
            vpa: details.vpa,
            cardLast4: details.cardLast4,
            cardNetwork: details.cardNetwork,
          }
        : undefined,
      errorCode: details?.errorCode ?? undefined,
      errorDescription: details?.errorDescription ?? undefined,
      rawPayload,
      occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    };
  }
}

function joinId(orderId: string, id: string): string {
  return `${orderId}${ID_SEPARATOR}${id}`;
}

function splitId(id: string): [orderId: string, id: string] {
  const at = id.indexOf(ID_SEPARATOR);
  if (at <= 0 || at === id.length - 1) {
    throw new AppError(
      404,
      "PAYMENT_GATEWAY_ERROR",
      "Not a Cashfree payment or refund id",
    );
  }
  return [id.slice(0, at), id.slice(at + 1)];
}

/** 3 to 40 letters, digits, `-` or `_`, as Cashfree takes refund ids. */
function refundIdFor(idempotencyKey: string | undefined): string {
  const fromKey = idempotencyKey?.replace(/[^\w-]/gu, "").slice(0, 40);
  if (fromKey && fromKey.length >= 3) return fromKey;
  return `rf_${crypto.randomUUID().replaceAll("-", "")}`;
}

/** Digits after the point in a currency's major unit (2 for INR and USD). */
function currencyExponent(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

function toMajor(minor: number, currency: string): number {
  const exponent = currencyExponent(currency);
  return Number((minor / 10 ** exponent).toFixed(exponent));
}

function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyExponent(currency));
}

/**
 * The phone number Cashfree requires of every buyer: ten digits for an
 * Indian number, the full number with its country code for another.
 */
function cashfreePhone(phone: string | null | undefined): string {
  const digits = phone?.replace(/\D/gu, "") ?? "";
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return NO_PHONE;
}

/** A Cashfree payment in our terms; its id carries its order's. */
function toPaymentDetails(
  orderId: string,
  payment: CashfreePayment,
): GatewayPaymentDetails {
  const currency = (payment.payment_currency ?? "INR").toUpperCase();
  const method = payment.payment_method ?? {};
  const card = method.card ?? undefined;
  const upi = method.upi ?? undefined;
  const netbanking = method.netbanking ?? undefined;
  const app = method.app ?? undefined;
  const cardNumber =
    typeof card?.card_number === "string" ? card.card_number : "";
  const status = toPaymentStatus(payment.payment_status);
  return {
    gatewayPaymentId: joinId(orderId, String(payment.cf_payment_id)),
    gatewayOrderId: payment.order_id ?? orderId,
    amount: toMinor(payment.payment_amount ?? 0, currency),
    currency,
    status,
    captured: status === "captured",
    method: toMethod(payment.payment_group),
    bank:
      typeof netbanking?.netbanking_bank_name === "string"
        ? netbanking.netbanking_bank_name
        : null,
    wallet: typeof app?.provider === "string" ? app.provider : null,
    vpa: typeof upi?.upi_id === "string" ? upi.upi_id : null,
    cardLast4: cardNumber ? cardNumber.slice(-4) : null,
    cardNetwork:
      typeof card?.card_network === "string" ? card.card_network : null,
    errorCode: payment.error_details?.error_code ?? null,
    errorDescription: payment.error_details?.error_description ?? null,
    errorSource: payment.error_details?.error_source ?? null,
    errorReason: payment.error_details?.error_reason ?? null,
  };
}

function toMethod(group: string | null | undefined): string | undefined {
  if (!group) return undefined;
  if (group.includes("card")) return "card";
  if (group === "net_banking") return "netbanking";
  if (group === "wallet" || group === "app") return "wallet";
  return group;
}

/**
 * A payment not yet attempted is taken as still able to be paid, like one
 * pending: only one that ended without the money is failed.
 */
function toPaymentStatus(status: string | null | undefined): PaymentStatus {
  switch (status) {
    case "SUCCESS":
      return "captured";
    case "FAILED":
    case "USER_DROPPED":
    case "CANCELLED":
    case "VOID":
      return "failed";
    default:
      return "processing";
  }
}

function toRefundStatus(status: string | null | undefined): RefundStatus {
  if (status === "SUCCESS") return "processed";
  if (status === "CANCELLED") return "failed";
  return "pending";
}
