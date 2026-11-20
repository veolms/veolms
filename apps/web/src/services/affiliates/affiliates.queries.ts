import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  AffiliateCommissionsResponse,
  AffiliateCommissionStatus,
  AffiliateMeResponse,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { affiliatesKeys } from "./affiliates.keys";
import { affiliatesService } from "./affiliates.service";

/** The affiliate program's public facts (the join page). */
export function useAffiliateProgram(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: affiliatesKeys.program(),
    queryFn: affiliatesService.getProgram,
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

/** The signed-in user's affiliate record; a 404 means they have not joined. */
export function useAffiliateMe(options?: { enabled?: boolean }) {
  return useQuery<AffiliateMeResponse, ApiError>({
    queryKey: affiliatesKeys.me(),
    queryFn: affiliatesService.getMe,
    staleTime: 30_000,
    retry: (count, error) => error.status !== 404 && count < 2,
    enabled: options?.enabled ?? true,
  });
}

export function useAffiliateStats(range: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: affiliatesKeys.stats(range.from, range.to),
    queryFn: () => affiliatesService.getStats(range),
    staleTime: 60_000,
  });
}

export function useAffiliateCommissions(status?: AffiliateCommissionStatus) {
  return useInfiniteQuery<AffiliateCommissionsResponse, ApiError>({
    queryKey: affiliatesKeys.commissions(status),
    queryFn: ({ pageParam }) =>
      affiliatesService.listCommissions({
        status,
        cursor: pageParam as string | undefined,
        limit: 25,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useAffiliatePayouts() {
  return useQuery({
    queryKey: affiliatesKeys.payouts(),
    queryFn: affiliatesService.listPayouts,
    staleTime: 30_000,
  });
}
