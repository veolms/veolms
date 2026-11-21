import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  AdminAffiliatesResponse,
  AdminCommissionsResponse,
  AdminPayoutsResponse,
  AffiliateCommissionStatus,
  AffiliatePayoutStatus,
  AffiliateStatus,
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

export function useAdminAffiliates(filters: {
  status?: AffiliateStatus;
  q?: string;
}) {
  return useInfiniteQuery<AdminAffiliatesResponse, ApiError>({
    queryKey: affiliatesAdminKeys.list(filters.status, filters.q),
    queryFn: ({ pageParam }) =>
      affiliatesAdminService.listAffiliates({
        status: filters.status,
        q: filters.q || undefined,
        cursor: pageParam as string | undefined,
        limit: 25,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
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

export function useAdminCommissions(filters: {
  status?: AffiliateCommissionStatus;
  flagged?: boolean;
  affiliateId?: string;
}) {
  const key = {
    status: filters.status,
    flagged: filters.flagged ? "true" : undefined,
    affiliateId: filters.affiliateId,
  };
  return useInfiniteQuery<AdminCommissionsResponse, ApiError>({
    queryKey: affiliatesAdminKeys.commissions(key),
    queryFn: ({ pageParam }) =>
      affiliatesAdminService.listCommissions({
        status: filters.status,
        flagged: filters.flagged ? "true" : undefined,
        affiliateId: filters.affiliateId,
        cursor: pageParam as string | undefined,
        limit: 25,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}

export function useAdminPayouts(status?: AffiliatePayoutStatus) {
  return useInfiniteQuery<AdminPayoutsResponse, ApiError>({
    queryKey: affiliatesAdminKeys.payouts(status),
    queryFn: ({ pageParam }) =>
      affiliatesAdminService.listPayouts({
        status,
        cursor: pageParam as string | undefined,
        limit: 25,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}

export function useAffiliateSummary(
  range: { from?: string; to?: string } = {},
) {
  return useQuery({
    queryKey: affiliatesAdminKeys.summary(range.from, range.to),
    queryFn: () => affiliatesAdminService.getSummary(range),
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
