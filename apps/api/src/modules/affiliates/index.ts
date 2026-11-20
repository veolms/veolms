/**
 * The affiliate program module's public entry point. Other modules use the
 * tracking service and these helpers, never the repository.
 */
export { readAffiliateClickId } from "./affiliate-click-cookie.ts";
export {
  createAffiliateTrackingService,
  isOwnAffiliateCoupon,
  type AffiliateTrackingService,
} from "./affiliate-tracking.service.ts";
export type { AttributionDecision } from "./affiliate-tracking.ts";
export {
  recordRefundReversalsSafely,
  recordSaleCommissionsSafely,
} from "./affiliate-commissions.service.ts";
export { AffiliateCommissionWorker } from "./affiliate-commission.worker.ts";
