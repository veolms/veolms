import type {
  CheckoutPreviewRequest,
  CheckoutPreviewResponse,
  CreateCheckoutOrderRequest,
  CreateCheckoutOrderResponse,
  ManualPaymentRequest,
  ReleaseCheckoutOrderResponse,
  VerifyManualPaymentRequest,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const paymentService = {
  preview: (input: CheckoutPreviewRequest) =>
    api.post<CheckoutPreviewResponse>("/checkout/preview", input),
  createOrder: (input: CreateCheckoutOrderRequest) =>
    api.post<CreateCheckoutOrderResponse>("/checkout/orders", input),
  /**
   * The buyer closed the payment window: the server cancels the order unless
   * a payment for it may still arrive, so paying again can start at once.
   */
  releaseOrder: (orderId: string) =>
    api.post<ReleaseCheckoutOrderResponse>(
      `/checkout/orders/${encodeURIComponent(orderId)}/release`,
    ),
  verify: (input: VerifyPaymentRequest) =>
    api.post<VerifyPaymentResponse>("/payments/verify", input),
  /**
   * Staff's answer to a transfer a buyer reported for an order (admins
   * only): `verify` marks the order paid by it, `reject` closes the request.
   */
  reviewManualPayment: (requestId: string, input: VerifyManualPaymentRequest) =>
    api.post<ManualPaymentRequest>(
      `/manual-payments/${encodeURIComponent(requestId)}/verify`,
      input,
    ),
};
