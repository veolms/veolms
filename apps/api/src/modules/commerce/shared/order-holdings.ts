import * as quizPricingRepo from "../../quizzes/shared/quiz-pricing.repository.ts";
import * as workshopOrders from "../../workshops/workshop-orders.ts";
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
  order: { id: string; user_id: string; created_at?: Date },
  now: Date,
): Promise<string[]> {
  const [items, ownedCourseIds, ownedWhenOrdered] = await Promise.all([
    orderRepo.listOrderItems(executor, order.id),
    enrollmentRepo.listUserEnrolledCourseIds(executor, order.user_id),
    order.created_at
      ? enrollmentRepo.listUserCourseIdsEnrolledBefore(
          executor,
          order.user_id,
          order.created_at,
        )
      : Promise.resolve([] as string[]),
  ]);
  const owned = new Set(ownedCourseIds);
  // A bundle bought by someone who owned part of it was priced for the rest
  // only, so a course they had when ordering does not make it "held"; one
  // they got since (the same order paid twice) still does.
  const ownedBefore = new Set(ownedWhenOrdered);

  const bundleIds = items.flatMap((item) =>
    item.item_type === "bundle" && item.bundle_id ? [item.bundle_id] : [],
  );
  const bundleCourses =
    owned.size === 0
      ? []
      : (
          await bundleRepo.listBundleCoursesForBundleIds(executor, bundleIds)
        ).filter((row) => !ownedBefore.has(row.course_id));

  const heldWorkshopIds = new Set<string>();
  for (const item of items) {
    if (item.item_type !== "workshop" || !item.workshop_id) continue;
    if (
      await workshopOrders.findActiveRegistration(
        executor,
        item.workshop_id,
        order.user_id,
      )
    ) {
      heldWorkshopIds.add(item.workshop_id);
    }
  }
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
    heldWorkshopIds,
  });
}
