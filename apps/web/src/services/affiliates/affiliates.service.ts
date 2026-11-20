import type {
  AffiliateTrackingAck,
  PublicAffiliateProgramResponse,
  RecordAffiliateClickRequest,
} from "@veolms/contracts";

import { api } from "../../lib/api-client";

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
};
