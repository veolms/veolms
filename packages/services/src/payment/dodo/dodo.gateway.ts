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

export interface DodoGatewayConfig {
  apiKey: string;
  webhookKey?: string;
  environment: "test_mode" | "live_mode";
  /** Where the checkout sends the buyer after a payment it redirected for. */
  returnUrl: string;
  /**
   * Whether the buyer's tax is inside our price (Dodo takes it out of what
   * is paid to us) or added on top of it at checkout (the buyer pays it).
   * Off unless set: on top.
   */
  taxInclusive?: boolean;
}

/** Upper bound for any single Dodo Payments API call. */
const REQUEST_TIMEOUT_MS = 10_000;
/** How far a webhook's timestamp may be from now (Standard Webhooks). */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
/** Dodo's tax category for courses. */
const TAX_CATEGORY = "edtech";

/**
 * What every checkout session carries in its metadata, which Dodo copies
 * onto the payment made in it: the order it is for, and its amount in the
 * order's own currency.
 */
const META_ORDER_ID = "veolms_order_id";
const META_AMOUNT = "veolms_amount";
const META_CURRENCY = "veolms_currency";
/** Names the product a price was made for (see `productFor`). */
const META_PRODUCT_KEY = "veolms_product_key";

interface DodoPayment {
  payment_id: string;
  checkout_session_id?: string | null;
  status?: string | null;
  total_amount: number;
  currency: string;
  tax?: number | null;
  payment_method?: string | null;
  payment_method_type?: string | null;
  card_last_four?: string | null;
  card_network?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  refund_status?: string | null;
  metadata?: Record<string, string> | null;
}

interface DodoRefund {
  refund_id: string;
  payment_id: string;
  amount?: number | null;
  currency?: string | null;
  is_partial?: boolean;
  status: string;
}

interface DodoProduct {
  product_id: string;
  metadata?: Record<string, string> | null;
}

/**
 * Dodo Payments, a merchant of record: it is the seller on each payment,
 * charges and pays the sales tax and VAT of the buyer's country, and takes
 * cards from anywhere. Used for buyers outside India.
 *
 * Its "gateway order" is a checkout session: the buyer pays in Dodo's hosted
 * checkout, opened over our page from the session's URL. A session sells
 * products from the Dodo catalogue, not an amount, so each order is sold as
 * a product priced at the order's total (tax included, in the order's
 * currency), made the first time that title and price are sold. Dodo may
 * charge the buyer in their own currency; the amounts here stay in the
 * order's currency.
 */
export class DodoPaymentGateway implements PaymentGateway {
  readonly providerName = "dodo" as const;
  private readonly apiKey: string;
  private readonly webhookKey?: string;
  private readonly baseUrl: string;
  private readonly checkoutBaseUrl: string;
  private readonly returnUrl: string;
  private readonly taxInclusive: boolean;
  /** Product ids by product key; filled from the catalogue on first use. */
  private products?: Promise<Map<string, string>>;

  constructor(config: DodoGatewayConfig) {
    this.apiKey = config.apiKey;
    this.webhookKey = config.webhookKey;
    this.baseUrl =
      config.environment === "live_mode"
        ? "https://live.dodopayments.com"
        : "https://test.dodopayments.com";
    this.checkoutBaseUrl =
      config.environment === "live_mode"
        ? "https://checkout.dodopayments.com"
        : "https://test.checkout.dodopayments.com";
    this.returnUrl = config.returnUrl;
    this.taxInclusive = config.taxInclusive ?? false;
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
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // As for Razorpay: a timeout or a network failure leaves the outcome
      // unknown, so both are 5xx and never read as a definite refusal.
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
      let message = response.statusText || "Dodo Payments API error";
      try {
        const body = (await response.json()) as {
          message?: string;
          error?: string;
        };
        message = body.message || body.error || message;
      } catch {
        // The status text stands.
      }
      throw new AppError(response.status, "PAYMENT_GATEWAY_ERROR", message);
    }

    return (await response.json()) as T;
  }

  /**
   * The product an order of this title and price is sold as. Made once per
   * title, price and way of taxing it, and found again by the key in its
   * metadata, from the catalogue (read once per process) or from products
   * made since.
   */
  private async productFor(
    title: string,
    amount: number,
    currency: string,
  ): Promise<string> {
    const key = `${currency}:${amount}:${this.taxInclusive ? "incl" : "excl"}:${crypto
      .createHash("sha256")
      .update(title)
      .digest("hex")
      .slice(0, 16)}`;
    this.products ??= this.loadProducts().catch((err: unknown) => {
      this.products = undefined;
      throw err;
    });
    const products = await this.products;
    const known = products.get(key);
    if (known) return known;

    const created = await this.request<DodoProduct>("/products", {
      method: "POST",
      body: JSON.stringify({
        name: title.slice(0, 200),
        tax_category: TAX_CATEGORY,
        price: {
          type: "one_time_price",
          currency,
          price: amount,
          discount: 0,
          purchasing_power_parity: false,
          // Off: the buyer's tax (GST, VAT, sales tax) is added on top of
          // the price at checkout, and the price is what reaches us before
          // Dodo's fee. On: it is taken out of the price.
          tax_inclusive: this.taxInclusive,
        },
        metadata: { [META_PRODUCT_KEY]: key },
      }),
    });
    products.set(key, created.product_id);
    return created.product_id;
  }

  private async loadProducts(): Promise<Map<string, string>> {
    const products = new Map<string, string>();
    const pageSize = 100;
    for (let page = 0; ; page++) {
      const { items } = await this.request<{ items: DodoProduct[] }>(
        `/products?page_size=${pageSize}&page_number=${page}`,
        { method: "GET" },
      );
      for (const product of items) {
        const key = product.metadata?.[META_PRODUCT_KEY];
        if (key) products.set(key, product.product_id);
      }
      if (items.length < pageSize) return products;
    }
  }

  async createOrder(
    input: CreateGatewayOrderInput,
  ): Promise<GatewayOrderOutput> {
    const currency = input.currency.toUpperCase();
    const productId = await this.productFor(
      input.description || input.orderNumber,
      input.amount,
      currency,
    );
    const session = await this.request<{
      session_id: string;
      checkout_url: string | null;
    }>("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        product_cart: [{ product_id: productId, quantity: 1 }],
        ...(input.customer.email
          ? {
              customer: {
                email: input.customer.email,
                name: input.customer.name,
              },
            }
          : {}),
        // Only the country, and a postal code where tax needs one.
        minimal_address: true,
        feature_flags: { allow_discount_code: false },
        return_url: this.returnUrl,
        metadata: {
          ...input.notes,
          [META_ORDER_ID]: input.orderId,
          [META_AMOUNT]: String(input.amount),
          [META_CURRENCY]: currency,
        },
      }),
    });
    if (!session.checkout_url) {
      throw new AppError(
        502,
        "PAYMENT_GATEWAY_ERROR",
        "Dodo Payments returned no checkout URL",
      );
    }

    return {
      provider: this.providerName,
      gatewayOrderId: session.session_id,
      amount: input.amount,
      currency,
      checkoutUrl: session.checkout_url,
      notes: input.notes,
    };
  }

  /** A session's hosted checkout, as Dodo gives it when it is made. */
  checkoutUrl(gatewayOrderId: string): string {
    return `${this.checkoutBaseUrl}/session/${encodeURIComponent(gatewayOrderId)}`;
  }

  /**
   * Dodo's checkout gives the page no signature of the payment, so there is
   * nothing to check here. The payment counts once it is fetched from Dodo
   * with our key and found to belong to this session (see verifyPayment).
   */
  verifyPaymentSignature(_input: VerifyGatewayPaymentInput): boolean {
    return true;
  }

  async getPayment(gatewayPaymentId: string): Promise<GatewayPaymentDetails> {
    const payment = await this.request<DodoPayment>(
      `/payments/${encodeURIComponent(gatewayPaymentId)}`,
      { method: "GET" },
    );
    return toPaymentDetails(payment);
  }

  async fetchOrder(gatewayOrderId: string): Promise<GatewayOrderStatus> {
    const session = await this.fetchSession(gatewayOrderId);
    let status: GatewayOrderStatus["status"] = "created";
    if (session.payment_status === "succeeded") status = "paid";
    else if (session.payment_id) status = "attempted";
    // A session has no amount of its own; the order's is what was sold.
    return { gatewayOrderId: session.id, amount: 0, currency: "", status };
  }

  async fetchOrderPayments(
    gatewayOrderId: string,
  ): Promise<GatewayPaymentDetails[]> {
    const session = await this.fetchSession(gatewayOrderId);
    if (!session.payment_id) return [];
    return [await this.getPayment(session.payment_id)];
  }

  private fetchSession(sessionId: string) {
    return this.request<{
      id: string;
      payment_id?: string | null;
      payment_status?: string | null;
    }>(`/checkouts/${encodeURIComponent(sessionId)}`, { method: "GET" });
  }

  /**
   * Refunds a payment in full. Dodo refunds part of a payment by product
   * and in the currency it settled in, which our amounts are not; a partial
   * refund is refused here (a definite refusal: nothing was sent) and is
   * made from the Dodo dashboard instead.
   */
  async refundPayment(
    input: CreateGatewayRefundInput,
  ): Promise<GatewayRefundOutput> {
    const payment = await this.getPayment(input.gatewayPaymentId);
    if (input.amount < payment.amount) {
      throw new AppError(
        422,
        "PAYMENT_GATEWAY_ERROR",
        "Payments made through Dodo Payments are refunded in full here. Refund part of one from the Dodo Payments dashboard.",
      );
    }

    const refund = await this.request<DodoRefund>("/refunds", {
      method: "POST",
      body: JSON.stringify({
        payment_id: input.gatewayPaymentId,
        reason: input.reason ?? "Customer refund",
        metadata: {
          ...input.notes,
          ...(input.idempotencyKey
            ? { idempotency_key: input.idempotencyKey }
            : {}),
        },
      }),
    });

    return {
      gatewayRefundId: refund.refund_id,
      amount: payment.amount,
      currency: payment.currency,
      status:
        toRefundStatus(refund.status) === "processed" ? "processed" : "pending",
    };
  }

  async fetchRefund(gatewayRefundId: string): Promise<GatewayRefundDetails> {
    const refund = await this.request<DodoRefund>(
      `/refunds/${encodeURIComponent(gatewayRefundId)}`,
      { method: "GET" },
    );
    const payment = await this.getPayment(refund.payment_id);
    return {
      gatewayRefundId: refund.refund_id,
      gatewayPaymentId: refund.payment_id,
      ...refundAmount(refund, payment),
      status: toRefundStatus(refund.status),
    };
  }

  /**
   * Standard Webhooks, which Dodo signs with: an HMAC-SHA256 of
   * `id.timestamp.body` under the endpoint's secret, base64, in a list of
   * `v1,<signature>` entries. A delivery older or newer than five minutes
   * is refused, so a captured one cannot be replayed later.
   */
  verifyWebhookSignature(
    rawBody: string | Uint8Array,
    headers: GatewayWebhookHeaders,
  ): boolean {
    const id = headers["webhook-id"];
    const timestamp = headers["webhook-timestamp"];
    const signatures = headers["webhook-signature"];
    if (!this.webhookKey || !rawBody || !id || !timestamp || !signatures) {
      return false;
    }

    const sentAt = Number(timestamp);
    if (
      !Number.isInteger(sentAt) ||
      Math.abs(Date.now() / 1000 - sentAt) > WEBHOOK_TOLERANCE_SECONDS
    ) {
      return false;
    }

    const secret = Buffer.from(
      this.webhookKey.startsWith("whsec_")
        ? this.webhookKey.slice("whsec_".length)
        : this.webhookKey,
      "base64",
    );
    const body =
      typeof rawBody === "string" ? Buffer.from(rawBody, "utf-8") : rawBody;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${id}.${timestamp}.`)
      .update(body)
      .digest("base64");

    return signatures
      .split(" ")
      .some(
        (entry) =>
          entry.startsWith("v1,") && secureCompare(entry.slice(3), expected),
      );
  }

  webhookEventId(headers: GatewayWebhookHeaders): string | undefined {
    return headers["webhook-id"];
  }

  normalizeWebhookEvent(
    rawPayload: unknown,
    eventId?: string,
  ): NormalizedPaymentEvent {
    const event = rawPayload as
      | { type?: string; timestamp?: string; data?: Record<string, unknown> }
      | null
      | undefined;
    const type = event?.type;
    const data = event?.data ?? {};

    let eventType: NormalizedPaymentEvent["eventType"] = "ignored";
    switch (type) {
      case "payment.succeeded":
        eventType = "payment.succeeded";
        break;
      case "payment.failed":
      case "payment.cancelled":
        eventType = "payment.failed";
        break;
      case "refund.succeeded":
        eventType = "refund.succeeded";
        break;
      case "refund.failed":
        eventType = "refund.failed";
        break;
    }

    const isRefund = type?.startsWith("refund.") ?? false;
    const payment = isRefund ? undefined : (data as unknown as DodoPayment);
    const refund = isRefund ? (data as unknown as DodoRefund) : undefined;
    const details = payment?.payment_id ? toPaymentDetails(payment) : undefined;
    // A full refund is reported without an amount: the payment's own is
    // used, in the order's currency. A partial one carries Dodo's, which is
    // in the currency the payment settled in.
    const partial = refund?.is_partial ? refund : undefined;

    const occurredAt = event?.timestamp
      ? new Date(event.timestamp)
      : new Date();
    return {
      eventId:
        eventId ||
        `${type ?? "event"}:${refund?.refund_id ?? payment?.payment_id ?? crypto.randomUUID()}`,
      eventType,
      provider: this.providerName,
      gatewayOrderId: payment?.checkout_session_id ?? undefined,
      gatewayPaymentId: refund?.payment_id ?? payment?.payment_id,
      gatewayRefundId: refund?.refund_id,
      amount: details?.amount ?? partial?.amount ?? undefined,
      currency: details?.currency ?? partial?.currency ?? undefined,
      paymentMethod: details?.method
        ? {
            method: details.method,
            cardLast4: details.cardLast4,
            cardNetwork: details.cardNetwork,
          }
        : undefined,
      errorCode: payment?.error_code ?? undefined,
      errorDescription: payment?.error_message ?? undefined,
      rawPayload,
      occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    };
  }
}

/**
 * A Dodo payment in our terms. When Dodo charged the buyer in another
 * currency than the order's, its own amount cannot be compared with the
 * order's: the amount reported is then the one the session was made for,
 * from the metadata the server put on it, which nobody else can write. The
 * price itself was fixed by the product in the session's cart.
 *
 * Tax added on top of the price (see `taxInclusive`) is the buyer's tax,
 * not the order's: the amount is then the one before it.
 */
function toPaymentDetails(payment: DodoPayment): GatewayPaymentDetails {
  const ours = sessionAmount(payment.metadata);
  const sameCurrency =
    !ours || ours.currency === payment.currency.toUpperCase();
  const beforeTax = payment.total_amount - (payment.tax ?? 0);
  const charged =
    ours && payment.tax && beforeTax === ours.amount
      ? beforeTax
      : payment.total_amount;
  return {
    gatewayPaymentId: payment.payment_id,
    gatewayOrderId: payment.checkout_session_id ?? "",
    amount: sameCurrency ? charged : ours.amount,
    currency: sameCurrency ? payment.currency.toUpperCase() : ours.currency,
    status: toPaymentStatus(payment),
    captured: payment.status === "succeeded",
    tax: sameCurrency ? (payment.tax ?? null) : null,
    method: payment.payment_method ?? undefined,
    cardLast4: payment.card_last_four ?? null,
    cardNetwork: payment.card_network ?? null,
    errorCode: payment.error_code ?? null,
    errorDescription: payment.error_message ?? null,
  };
}

function sessionAmount(
  metadata: Record<string, string> | null | undefined,
): { amount: number; currency: string } | undefined {
  const amount = Number(metadata?.[META_AMOUNT]);
  const currency = metadata?.[META_CURRENCY];
  if (!Number.isInteger(amount) || amount < 0 || !currency) return undefined;
  return { amount, currency: currency.toUpperCase() };
}

function toPaymentStatus(payment: DodoPayment): PaymentStatus {
  if (payment.refund_status === "full") return "refunded";
  switch (payment.status) {
    case "succeeded":
      return "captured";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return "processing";
  }
}

function toRefundStatus(status: string): RefundStatus {
  if (status === "succeeded") return "processed";
  if (status === "failed") return "failed";
  return "pending";
}

/** A refund's amount in the order's currency (see refundPayment). */
function refundAmount(
  refund: DodoRefund,
  payment: GatewayPaymentDetails,
): { amount: number; currency: string } {
  if (!refund.is_partial) {
    return { amount: payment.amount, currency: payment.currency };
  }
  return {
    amount: refund.amount ?? 0,
    currency: (refund.currency ?? payment.currency).toUpperCase(),
  };
}
