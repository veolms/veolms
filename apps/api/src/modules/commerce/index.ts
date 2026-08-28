/**
 * Public Commerce module surface. Repositories, mappers, workers, and other
 * feature internals stay private; other modules may depend on the service
 * contracts exposed here — same convention as auth/index.ts.
 *
 * Not yet consumed anywhere (every current cross-module reference reaches
 * commerce via a direct deep import instead, e.g.
 * `../../commerce/payments/payment.repository.ts`), added for structural
 * parity with courses/ and auth/ rather than an immediate caller.
 */
export {
  createCheckoutService,
  type CheckoutService,
  type CheckoutServiceOptions,
} from "./checkout/checkout.service.ts";
export { createCartService, type CartService } from "./cart/cart.service.ts";
export { createPricingService, type PricingService } from "./pricing/pricing.service.ts";
export { createCouponService, type CouponService } from "./coupons/coupon.service.ts";
export { createBundleService, type BundleService } from "./bundles/bundle.service.ts";
export { createOrderService, type OrderService } from "./orders/order.service.ts";
export {
  createPaymentService,
  type PaymentService,
  type PaymentServiceOptions,
} from "./payments/payment.service.ts";
export {
  createPaymentReconciliationService,
  type PaymentReconciliationService,
} from "./payments/payment-reconciliation.service.ts";
export { createRefundService, type RefundService } from "./refunds/refund.service.ts";
export {
  createRefundRequestService,
  type RefundRequestService,
} from "./refunds/refund-request.service.ts";
export {
  createCreatorGatewayService,
  type CreatorGatewayService,
} from "./payments/gateways/creator-gateway.service.ts";
export {
  createManualPaymentService,
  type ManualPaymentService,
} from "./payments/manual-payment.service.ts";
export { createWebhookService, type WebhookService } from "./webhooks/webhook.service.ts";
export { createInvoiceService, type InvoiceService } from "./invoices/invoice.service.ts";

export * from "./shared/commerce.types.ts";
export { CommerceErrors } from "./shared/commerce.errors.ts";
