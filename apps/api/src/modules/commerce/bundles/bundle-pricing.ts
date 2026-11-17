/**
 * What a bundle costs one buyer, from today's prices of its courses
 * (creator-features/bundles-in-checkout). The course page's price card and
 * checkout both use this, so the price offered is the price charged.
 *
 * - `apart`: the courses' prices added up.
 * - Each course the buyer already owns takes away its share of the bundle
 *   price: its price ÷ `apart` × the bundle price. So someone who owns
 *   part of a bundle pays for the rest at the bundle's own discount.
 * - `saving`: what the courses they don't own cost apart, less `charge`.
 *   Never below nothing.
 *
 * All amounts are whole rupees.
 */
export interface BundleCourseAtPrice {
  courseId: string;
  price: number;
}

export interface BundleCharge {
  apart: number;
  charge: number;
  saving: number;
  /** The bundle price less `charge`: what the courses already owned take off. */
  ownedShare: number;
  ownsAll: boolean;
}

export function bundleCharge(input: {
  bundlePrice: number;
  courses: readonly BundleCourseAtPrice[];
  ownedCourseIds: ReadonlySet<string>;
}): BundleCharge {
  const apart = input.courses.reduce((sum, course) => sum + course.price, 0);
  const owned = input.courses.filter((course) =>
    input.ownedCourseIds.has(course.courseId),
  );
  const ownsAll =
    input.courses.length > 0 && owned.length === input.courses.length;
  const ownedApart = owned.reduce((sum, course) => sum + course.price, 0);
  const ownedShare =
    apart > 0 ? Math.round((ownedApart / apart) * input.bundlePrice) : 0;
  const charge = Math.max(0, input.bundlePrice - ownedShare);
  const restApart = apart - ownedApart;
  return {
    apart,
    charge,
    saving: Math.max(0, restApart - charge),
    ownedShare: input.bundlePrice - charge,
    ownsAll,
  };
}

/** Whether a bundle saves money at today's prices: it is offered only then. */
export function bundleSaves(input: {
  bundlePrice: number;
  courses: readonly BundleCourseAtPrice[];
}): boolean {
  const apart = input.courses.reduce((sum, course) => sum + course.price, 0);
  return input.courses.length >= 2 && input.bundlePrice < apart;
}
