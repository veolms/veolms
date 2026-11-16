import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcademyPaymentGateway,
  AcademyPaymentGatewaysResponse,
  ConnectPaymentGatewayResponse,
  ConnectRazorpayRequest,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { paymentGatewayService } from "./payment-gateway.service";

export const paymentGatewayKeys = {
  all: ["payment-gateway"] as const,
  status: () => [...paymentGatewayKeys.all, "status"] as const,
};

export function usePaymentGatewayStatus(options?: { enabled?: boolean }) {
  return useQuery<AcademyPaymentGatewaysResponse, ApiError>({
    queryKey: paymentGatewayKeys.status(),
    queryFn: () => paymentGatewayService.status(),
    enabled: options?.enabled ?? true,
  });
}

function useStoreGateway() {
  const queryClient = useQueryClient();
  return (gateway: AcademyPaymentGateway) =>
    queryClient.setQueryData<AcademyPaymentGatewaysResponse>(
      paymentGatewayKeys.status(),
      (current) => ({
        gateways: [
          gateway,
          ...(current?.gateways ?? []).filter(
            (other) => other.provider !== gateway.provider,
          ),
        ],
      }),
    );
}

export function useConnectRazorpay() {
  const store = useStoreGateway();
  return useMutation<
    ConnectPaymentGatewayResponse,
    ApiError,
    ConnectRazorpayRequest
  >({
    mutationFn: (body) => paymentGatewayService.connectRazorpay(body),
    onSuccess: (result) => store(result.gateway),
  });
}

export function useRenewWebhookSecret() {
  const store = useStoreGateway();
  return useMutation<ConnectPaymentGatewayResponse, ApiError, void>({
    mutationFn: () => paymentGatewayService.renewWebhookSecret(),
    onSuccess: (result) => store(result.gateway),
  });
}

export function useDisconnectRazorpay() {
  const store = useStoreGateway();
  return useMutation<AcademyPaymentGateway, ApiError, void>({
    mutationFn: () => paymentGatewayService.disconnectRazorpay(),
    onSuccess: store,
  });
}
