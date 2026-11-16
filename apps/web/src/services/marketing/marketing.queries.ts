import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  MarketingAudience,
  MarketingAudienceCountResponse,
  MarketingAudienceOptionsResponse,
  MarketingAutomationListResponse,
  MarketingEmail,
  MarketingEmailListResponse,
  MarketingRecipientFilter,
  MarketingRecipientsResponse,
  MarketingReport,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { marketingKeys } from "./marketing.keys";
import { marketingService } from "./marketing.service";

/** While an email is sending, its numbers refresh on their own. */
const SENDING_REFRESH_MS = 5_000;

export function useMarketingEmails(options?: { enabled?: boolean }) {
  return useQuery<MarketingEmailListResponse, ApiError>({
    queryKey: marketingKeys.list(),
    queryFn: () => marketingService.list(),
    enabled: options?.enabled ?? true,
    refetchInterval: (query) =>
      query.state.data?.emails.some((email) => email.status === "sending")
        ? SENDING_REFRESH_MS
        : false,
  });
}

export function useMarketingEmail(
  id: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<MarketingEmail, ApiError>({
    queryKey: marketingKeys.email(id ?? ""),
    queryFn: () => marketingService.get(id!),
    enabled: Boolean(id) && (options?.enabled ?? true),
    refetchInterval: (query) => {
      const email = query.state.data;
      if (email?.status === "sending") return SENDING_REFRESH_MS;
      // A scheduled email about to start: notice when it does.
      if (
        email?.status === "scheduled" &&
        email.scheduledAt &&
        new Date(email.scheduledAt).getTime() - Date.now() < 60_000
      ) {
        return SENDING_REFRESH_MS;
      }
      return false;
    },
  });
}

export function useMarketingReport(
  id: string | null,
  options?: { enabled?: boolean; live?: boolean },
) {
  return useQuery<MarketingReport, ApiError>({
    queryKey: marketingKeys.report(id ?? ""),
    queryFn: () => marketingService.report(id!),
    enabled: Boolean(id) && (options?.enabled ?? true),
    refetchInterval: options?.live ? SENDING_REFRESH_MS : false,
  });
}

export function useMarketingRecipients(
  id: string | null,
  filter: MarketingRecipientFilter,
  page: number,
  options?: { enabled?: boolean; live?: boolean },
) {
  return useQuery<MarketingRecipientsResponse, ApiError>({
    queryKey: marketingKeys.recipients(id ?? "", filter, page),
    queryFn: () => marketingService.recipients(id!, filter, page),
    enabled: Boolean(id) && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    refetchInterval: options?.live ? SENDING_REFRESH_MS : false,
  });
}

/** How many people an audience reaches now (pass it debounced). */
export function useMarketingAudienceCount(
  audience: MarketingAudience | null,
  options?: { enabled?: boolean },
) {
  return useQuery<MarketingAudienceCountResponse, ApiError>({
    queryKey: marketingKeys.audienceCount(audience),
    queryFn: () => marketingService.countAudience(audience!),
    enabled: Boolean(audience) && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useMarketingAudienceOptions(options?: { enabled?: boolean }) {
  return useQuery<MarketingAudienceOptionsResponse, ApiError>({
    queryKey: marketingKeys.audienceOptions(),
    queryFn: () => marketingService.audienceOptions(),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useMarketingAutomations(options?: { enabled?: boolean }) {
  return useQuery<MarketingAutomationListResponse, ApiError>({
    queryKey: marketingKeys.automations(),
    queryFn: () => marketingService.automations(),
    enabled: options?.enabled ?? true,
  });
}
