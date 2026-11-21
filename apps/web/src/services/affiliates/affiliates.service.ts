import type {
  AffiliateApplyRequest,
  AffiliateCommissionsQuery,
  AffiliateCommissionsResponse,
  AffiliateMeResponse,
  AffiliatePayout,
  AffiliatePayoutDetailsRequest,
  AffiliatePayoutsQueryInput,
  AffiliatePayoutsResponse,
  AffiliateStatsQuery,
  AffiliateStatsResponse,
  AffiliateTrackingAck,
  UpdateAffiliateMeRequest,
  PublicAffiliateProgramResponse,
  RecordAffiliateClickRequest,
} from "@veolms/contracts";

import { api } from "../../lib/api-client";

/** A list's filters as query values, the empty ones left out. */
function withoutEmpty<T extends object>(params: T): T {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  ) as T;
}

export const affiliatesService = {
  /** The join page's facts. */
  getProgram: (): Promise<PublicAffiliateProgramResponse> =>
    api.get<PublicAffiliateProgramResponse>("/affiliate/program"),

  /** Tells the API about a visit through an affiliate's link (?ref=). */
  recordClick: (
    payload: RecordAffiliateClickRequest,
  ): Promise<AffiliateTrackingAck> =>
    api.post<AffiliateTrackingAck>("/affiliate/clicks", payload),

  /** Ties this browser's affiliate click to the signed-in account. */
  claimReferral: (): Promise<AffiliateTrackingAck> =>
    api.post<AffiliateTrackingAck>("/affiliate/referrals/claim", {}),

  apply: (payload: AffiliateApplyRequest): Promise<AffiliateMeResponse> =>
    api.post<AffiliateMeResponse>("/affiliate/apply", payload),

  getMe: (): Promise<AffiliateMeResponse> =>
    api.get<AffiliateMeResponse>("/affiliate/me"),

  updateMe: (payload: UpdateAffiliateMeRequest): Promise<AffiliateMeResponse> =>
    api.patch<AffiliateMeResponse>("/affiliate/me", payload),

  setPayoutDetails: (
    payload: AffiliatePayoutDetailsRequest,
  ): Promise<AffiliateMeResponse> =>
    api.put<AffiliateMeResponse>("/affiliate/me/payout-details", payload),

  deletePayoutDetails: (): Promise<AffiliateMeResponse> =>
    api.delete<AffiliateMeResponse>("/affiliate/me/payout-details"),

  getStats: (query: AffiliateStatsQuery): Promise<AffiliateStatsResponse> =>
    api.get<AffiliateStatsResponse>("/affiliate/me/stats", { params: query }),

  listCommissions: (
    query: AffiliateCommissionsQuery,
  ): Promise<AffiliateCommissionsResponse> =>
    api.get<AffiliateCommissionsResponse>("/affiliate/me/commissions", {
      params: withoutEmpty(query),
    }),

  listPayouts: (
    query: AffiliatePayoutsQueryInput = {},
  ): Promise<AffiliatePayoutsResponse> =>
    api.get<AffiliatePayoutsResponse>("/affiliate/me/payouts", {
      params: withoutEmpty(query),
    }),

  /** The key makes a double tap or a retry return the same payout. */
  requestPayout: (idempotencyKey: string): Promise<AffiliatePayout> =>
    api.post<AffiliatePayout>("/affiliate/me/payouts", undefined, {
      headers: { "Idempotency-Key": idempotencyKey },
    }),
};
