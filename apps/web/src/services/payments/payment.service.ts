import type { CheckoutPreviewRequest, CheckoutPreviewResponse, CreateCheckoutOrderRequest, CreateCheckoutOrderResponse, VerifyPaymentRequest, VerifyPaymentResponse } from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const paymentService = {
  preview: (input: CheckoutPreviewRequest) => api.post<CheckoutPreviewResponse>("/checkout/preview", input),
  createOrder: (input: CreateCheckoutOrderRequest) => api.post<CreateCheckoutOrderResponse>("/checkout/orders", input),
  verify: (input: VerifyPaymentRequest) => api.post<VerifyPaymentResponse>("/payments/verify", input),
};
