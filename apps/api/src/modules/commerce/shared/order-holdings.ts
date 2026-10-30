import * as quizPricingRepo from "../../quizzes/shared/quiz-pricing.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import * as enrollmentRepo from "../enrollments/enrollment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import { heldItemTitles } from "../payments/extra-payment.ts";
import type { Executor } from "./repository.types.ts";

/**
 * What the buyer of an order already has of what the order sells, as the
 * titles of those order lines: a course they have access to (bought, free
 * or given by staff: one active enrolment either way), a bundle holding
 * such a course, a quiz pass they hold. Empty when paying the order would
 * give them only things they do not have yet.
 *
 * The same notion of "has it" checkout refuses a new or continued order
 * with. Read with `executor`, so inside the caller's transaction when the
 * answer has to hold until that transaction ends.
 */
export async function listHeldItemTitles(
  executor: Executor,
  order: { id: string; user_id: string },
  now: Date,
): Promise<string[]> {
  const [items, ownedCourseIds] = await Promise.all([
    orderRepo.listOrderItems(executor, order.id),
    enrollmentRepo.listUserEnrolledCourseIds(executor, order.user_id),
  ]);
  const owned = new Set(ownedCourseIds);

  const bundleIds = items.flatMap((item) =>
    item.item_type === "bundle" && item.bundle_id ? [item.bundle_id] : [],
  );
  const bundleCourses =
    owned.size === 0
      ? []
      : await bundleRepo.listBundleCoursesForBundleIds(executor, bundleIds);

  const heldQuizPricingIds = new Set<string>();
  for (const item of items) {
    if (item.item_type !== "quiz" || !item.quiz_pricing_id) continue;
    const offering = await quizPricingRepo.findPricingById(
      executor,
      item.quiz_pricing_id,
    );
    if (
      offering &&
      (await quizPricingRepo.findActiveGrant(executor, {
        userId: order.user_id,
        courseId: offering.course_id,
        now,
      }))
    ) {
      heldQuizPricingIds.add(item.quiz_pricing_id);
    }
  }

  return heldItemTitles(items, {
    ownedCourseIds: owned,
    bundleCourses,
    heldQuizPricingIds,
  });
}
