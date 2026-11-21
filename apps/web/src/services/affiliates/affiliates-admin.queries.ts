import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  AdminAffiliatesQueryInput,
  AdminAffiliatesResponse,
  AdminCommissionsQueryInput,
  AdminCommissionsResponse,
  AdminPayoutsQueryInput,
  AdminPayoutsResponse,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { affiliatesAdminKeys } from "./affiliates.keys";
import { affiliatesAdminService } from "./affiliates-admin.service";

export function useAffiliateAdminSettings() {
  return useQuery({
    queryKey: affiliatesAdminKeys.settings(),
    queryFn: affiliatesAdminService.getSettings,
    staleTime: 30_000,
  });
}

export function useAffiliateRules() {
  return useQuery({
    queryKey: affiliatesAdminKeys.rules(),
    queryFn: affiliatesAdminService.listRules,
    staleTime: 30_000,
  });
}

export function useAffiliateProductOptions(enabled = true) {
  return useQuery({
    queryKey: affiliatesAdminKeys.products(),
    queryFn: affiliatesAdminService.listProducts,
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** A page of affiliates for the filters given (kept while the next loads). */
export function useAdminAffiliates(
  query: AdminAffiliatesQueryInput,
  options: { enabled?: boolean } = {},
) {
  return useQuery<AdminAffiliatesResponse, ApiError>({
    queryKey: affiliatesAdminKeys.list(query),
    queryFn: () => affiliatesAdminService.listAffiliates(query),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    enabled: options.enabled ?? true,
  });
}

export function useAdminAffiliate(id: string | null) {
  return useQuery({
    queryKey: affiliatesAdminKeys.detail(id ?? ""),
    queryFn: () => affiliatesAdminService.getAffiliate(id!),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

export function useAdminCommissions(query: AdminCommissionsQueryInput) {
  return useQuery<AdminCommissionsResponse, ApiError>({
    queryKey: affiliatesAdminKeys.commissions(query),
    queryFn: () => affiliatesAdminService.listCommissions(query),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useAdminPayouts(query: AdminPayoutsQueryInput) {
  return useQuery<AdminPayoutsResponse, ApiError>({
    queryKey: affiliatesAdminKeys.payouts(query),
    queryFn: () => affiliatesAdminService.listPayouts(query),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useAffiliateSummary(
  range: { from?: string; to?: string } = {},
) {
  return useQuery({
    queryKey: affiliatesAdminKeys.summary(range.from, range.to),
    queryFn: () => affiliatesAdminService.getSummary(range),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useAffiliateAudit(subjectId?: string) {
  return useQuery({
    queryKey: affiliatesAdminKeys.audit(subjectId),
    queryFn: () => affiliatesAdminService.listAudit(subjectId),
    staleTime: 15_000,
  });
}
