import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MarketingAutomationKey,
  MarketingEmail,
  MarketingTemplateKey,
  UpdateMarketingEmailRequest,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { marketingKeys } from "./marketing.keys";
import { marketingService } from "./marketing.service";

function useRefresh() {
  const queryClient = useQueryClient();
  return (email?: MarketingEmail) => {
    if (email) queryClient.setQueryData(marketingKeys.email(email.id), email);
    void queryClient.invalidateQueries({ queryKey: marketingKeys.list() });
    void queryClient.invalidateQueries({
      queryKey: marketingKeys.automations(),
    });
  };
}

export function useCreateMarketingEmail() {
  const refresh = useRefresh();
  return useMutation<MarketingEmail, ApiError, MarketingTemplateKey>({
    mutationFn: (template) => marketingService.create(template),
    onSuccess: refresh,
  });
}

export function useUpdateMarketingEmail() {
  const refresh = useRefresh();
  return useMutation<
    MarketingEmail,
    ApiError,
    { id: string; body: UpdateMarketingEmailRequest }
  >({
    mutationFn: ({ id, body }) => marketingService.update(id, body),
    onSuccess: refresh,
  });
}

export function useDuplicateMarketingEmail() {
  const refresh = useRefresh();
  return useMutation<MarketingEmail, ApiError, string>({
    mutationFn: (id) => marketingService.duplicate(id),
    onSuccess: refresh,
  });
}

export function useDeleteMarketingEmail() {
  const refresh = useRefresh();
  return useMutation<{ deleted: true }, ApiError, string>({
    mutationFn: (id) => marketingService.remove(id),
    onSuccess: () => refresh(),
  });
}

export function useScheduleMarketingEmail() {
  const refresh = useRefresh();
  return useMutation<
    MarketingEmail,
    ApiError,
    { id: string; sendAt: string | null }
  >({
    mutationFn: ({ id, sendAt }) => marketingService.schedule(id, sendAt),
    onSuccess: refresh,
  });
}

export function useCancelMarketingEmail() {
  const refresh = useRefresh();
  return useMutation<MarketingEmail, ApiError, string>({
    mutationFn: (id) => marketingService.cancel(id),
    onSuccess: refresh,
  });
}

export function useResendMarketingEmail() {
  const refresh = useRefresh();
  return useMutation<MarketingEmail, ApiError, { id: string; subject: string }>(
    {
      mutationFn: ({ id, subject }) => marketingService.resend(id, subject),
      onSuccess: refresh,
    },
  );
}

export function useSendMarketingTest() {
  return useMutation<{ sentTo: string }, ApiError, string>({
    mutationFn: (id) => marketingService.sendTest(id),
  });
}

export function useOpenMarketingAutomation() {
  const refresh = useRefresh();
  return useMutation<MarketingEmail, ApiError, MarketingAutomationKey>({
    mutationFn: (key) => marketingService.openAutomation(key),
    onSuccess: refresh,
  });
}

export function useSetMarketingAutomationActive() {
  const refresh = useRefresh();
  return useMutation<
    MarketingEmail,
    ApiError,
    { key: MarketingAutomationKey; active: boolean }
  >({
    mutationFn: ({ key, active }) =>
      marketingService.setAutomationActive(key, active),
    onSuccess: refresh,
  });
}
