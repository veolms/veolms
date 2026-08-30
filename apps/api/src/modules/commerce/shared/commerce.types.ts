/**
 * Commonly-used Commerce domain types, re-exported under the module's own
 * path — same shape as courses/course/course.types.ts. Source of truth
 * stays @veolms/contracts; this just gives commerce a dedicated types file
 * to match the rest of the codebase's module shape (courses/, auth/) rather
 * than every feature file importing straight from @veolms/contracts with no
 * single place to look for "what types does this module deal in."
 */
export type {
  Order,
  OrderItemSnapshot,
  Payment,
  Refund,
  CartResponse,
  CartItem,
  PricingCalculation,
  CouponValidationResult,
  CourseBundle,
} from "@veolms/contracts";
