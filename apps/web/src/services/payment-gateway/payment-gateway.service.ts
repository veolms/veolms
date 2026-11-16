import type {
  AcademyPaymentGateway,
  AcademyPaymentGatewaysResponse,
  ConnectPaymentGatewayResponse,
  ConnectRazorpayRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

/** Platform → Payments: the academy's own Razorpay account. */
export const paymentGatewayService = {
  status(): Promise<AcademyPaymentGatewaysResponse> {
    return api.get<AcademyPaymentGatewaysResponse>("/payments/gateway-config");
  },
  connectRazorpay(
    body: ConnectRazorpayRequest,
  ): Promise<ConnectPaymentGatewayResponse> {
    return api.put<ConnectPaymentGatewayResponse>(
      "/payments/gateway-config/razorpay",
      body,
    );
  },
  renewWebhookSecret(): Promise<ConnectPaymentGatewayResponse> {
    return api.post<ConnectPaymentGatewayResponse>(
      "/payments/gateway-config/razorpay/webhook-secret",
      {},
    );
  },
  disconnectRazorpay(): Promise<AcademyPaymentGateway> {
    return api.delete<AcademyPaymentGateway>(
      "/payments/gateway-config/razorpay",
    );
  },
};
