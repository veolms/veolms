import type { Permission } from "@veolms/contracts";
import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, DatabaseExecutor } from "@veolms/database";
import type {
  UpdateCourseAccessRuleRequest,
  UpdateCoursePricingRequest,
  UpdateCourseSettingsRequest,
} from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
import { hasDiscountBadgeColumn } from "../shared/discount-badge-column.ts";
import {
  automaticInternationalPrice,
  exchangeRates,
} from "../../commerce/pricing/automatic-international-price.ts";
import * as configRepo from "./configuration.repository.ts";
import { getCourseAndVerifyOwner as verifyCourseOwner } from "../shared/courses.utils.ts";
import {
  presentAccessRule,
  presentPricing,
  presentSettings,
} from "../shared/courses.presenters.ts";

/**
 * A course's settings row, for another module that reads it with its own
 * executor (inside its own transaction, for one).
 */
export async function findCourseSettings(
  database: DatabaseExecutor,
  courseId: string,
) {
  return await configRepo.findSettingsByCourseId(database, courseId);
}

export interface ConfigurationServiceOptions {
  database: Kysely<Database>;
}

export function createConfigurationService({
  database,
}: ConfigurationServiceOptions) {
  function getCourseAndVerifyOwner(
    courseId: string,
    creatorId: string,
    userRoles: readonly string[] | undefined,
    permission: Permission,
  ) {
    return verifyCourseOwner(
      database,
      courseId,
      creatorId,
      userRoles,
      permission,
    );
  }

  async function upsertCourseAccessRules(
    courseId: string,
    creatorId: string,
    updates: UpdateCourseAccessRuleRequest,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.details.update",
    );

    const now = new Date();

    // A linked-only course stays restricted (see upsertCoursePricing).
    const pricing = await configRepo.findPricingByCourseId(database, courseId);
    const accessType =
      pricing?.linked_only === true ? "restricted" : updates.accessType;

    const durationType = updates.durationType;
    const durationDays =
      updates.durationType === "fixed_duration"
        ? (updates.durationDays ?? null)
        : null;

    const id = await configRepo.upsertAccessRule(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      access_type: accessType,
      duration_type: durationType,
      duration_days: durationDays,
      created_at: now,
      updated_at: now,
    });

    return presentAccessRule({
      id,
      access_type: accessType,
      duration_type: durationType,
      duration_days: durationDays,
    });
  }

  async function upsertCoursePricing(
    courseId: string,
    creatorId: string,
    updates: UpdateCoursePricingRequest,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.pricing.update",
    );

    const now = new Date();

    const existing = await configRepo.findPricingByCourseId(database, courseId);
    const wasLinkedOnly = existing?.linked_only === true;
    // A linked-only course is had only through another course's link: it
    // has no price, whatever was sent. A client that does not send the flag
    // keeps what is stored.
    const linkedOnly = updates.linkedOnly ?? wasLinkedOnly;

    // A course has both prices: what is paid, and the marked price it is
    // struck through from (the same when there is no discount). Selling it
    // for zero is what makes it free, so the pricing type is derived here
    // and whatever the client sent for it is ignored.
    const price = linkedOnly ? 0 : updates.price;
    const currency = updates.currency ?? "INR";
    const salePrice = linkedOnly ? 0 : updates.salePrice;
    const pricingType: "free" | "paid" = salePrice === 0 ? "free" : "paid";

    // The price for buyers outside India. It is the automatic one (the
    // rupee prices at the day's rate, rounded up to .99) until staff type a
    // price or remove it, which turns that off; a course priced for the
    // first time gets it. While automatic it is worked out again when the
    // rupee prices change, not on every save, so the rate moving does not
    // change a price nobody touched. Only a course that is sold has one: a
    // free or linked-only course loses it.
    const stored = existing?.international_currency
      ? {
          currency: existing.international_currency,
          priceMinor: Number(existing.international_price_minor),
          salePriceMinor: Number(existing.international_sale_price_minor),
        }
      : null;
    const internationalAuto =
      updates.internationalAuto ??
      (updates.international !== undefined
        ? false
        : (existing?.international_price_auto ?? true));
    let international: typeof stored = null;
    if (pricingType === "paid") {
      if (!internationalAuto) {
        international =
          updates.international === undefined ? stored : updates.international;
      } else if (currency !== "INR") {
        // The automatic price is worked out from rupees: a course priced in
        // another currency has none.
        international = null;
      } else if (
        !stored ||
        updates.internationalAuto === true ||
        existing?.currency !== currency ||
        existing?.price !== price ||
        existing?.sale_price !== salePrice
      ) {
        const inrPerUsd = await exchangeRates.inrPerUsd();
        // With no rate to be had, the price it had stands (none for a
        // course priced for the first time: rupees until the next save).
        international = inrPerUsd
          ? automaticInternationalPrice({ salePrice, price, inrPerUsd })
          : stored;
      } else {
        international = stored;
      }
    }

    // A badge needs a discount to announce.
    const showDiscountBadge =
      price > salePrice && updates.showDiscountBadge === true;
    const canStoreBadge = await hasDiscountBadgeColumn(database);
    if (showDiscountBadge && !canStoreBadge) {
      throw httpError(
        503,
        "DISCOUNT_BADGE_UNAVAILABLE",
        "The discount badge cannot be turned on until the database migration that adds it has been run.",
      );
    }

    const id = await database.transaction().execute(async (trx) => {
      const pricingId = await configRepo.upsertPricing(trx, {
        id: crypto.randomUUID(),
        course_id: courseId,
        pricing_type: pricingType,
        price,
        currency,
        sale_price: salePrice,
        ...(canStoreBadge ? { show_discount_badge: showDiscountBadge } : {}),
        linked_only: linkedOnly,
        international_currency: international?.currency ?? null,
        international_price_minor: international?.priceMinor ?? null,
        international_sale_price_minor: international?.salePriceMinor ?? null,
        international_price_auto: internationalAuto,
        created_at: now,
        updated_at: now,
      });

      // Restricted is what keeps a course with no price from being taken
      // by anyone: checkout refuses it and nobody can enrol themselves, so
      // only grants (a link's among them) let a learner in. Turning
      // linked-only off opens the course to everyone again.
      if (linkedOnly || wasLinkedOnly) {
        const rule = await configRepo.findAccessRuleByCourseId(trx, courseId);
        const accessType = linkedOnly ? "restricted" : "everyone";
        if (rule?.access_type !== accessType) {
          await configRepo.upsertAccessRule(trx, {
            id: crypto.randomUUID(),
            course_id: courseId,
            access_type: accessType,
            duration_type: rule?.duration_type ?? "lifetime",
            duration_days: rule?.duration_days ?? null,
            created_at: now,
            updated_at: now,
          });
        }
      }
      return pricingId;
    });

    return presentPricing({
      id,
      pricing_type: pricingType,
      price,
      currency,
      sale_price: salePrice,
      show_discount_badge: showDiscountBadge,
      linked_only: linkedOnly,
      international_currency: international?.currency ?? null,
      international_price_minor: international?.priceMinor ?? null,
      international_sale_price_minor: international?.salePriceMinor ?? null,
      international_price_auto: internationalAuto,
    });
  }

  async function upsertCourseSettings(
    courseId: string,
    creatorId: string,
    updates: UpdateCourseSettingsRequest,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.details.update",
    );

    const now = new Date();

    const existing = await configRepo.findSettingsByCourseId(
      database,
      courseId,
    );

    const allowQa =
      updates.allowQa !== undefined
        ? updates.allowQa
        : (existing?.allow_qa ?? true);
    const allowComments =
      updates.allowComments !== undefined
        ? updates.allowComments
        : (existing?.allow_comments ?? true);
    const allowDownloads =
      updates.allowDownloads !== undefined
        ? updates.allowDownloads
        : (existing?.allow_downloads ?? false);
    const allowNotes =
      updates.allowNotes !== undefined
        ? updates.allowNotes
        : (existing?.allow_notes ?? true);
    const certificateEnabled =
      updates.certificateEnabled !== undefined
        ? updates.certificateEnabled
        : (existing?.certificate_enabled ?? false);
    const showInstructorName =
      updates.showInstructorName !== undefined
        ? updates.showInstructorName
        : (existing?.show_instructor_name ?? true);
    const language =
      updates.language !== undefined
        ? updates.language
        : (existing?.language ?? "en");
    const estimatedDuration =
      updates.estimatedDuration !== undefined
        ? updates.estimatedDuration
        : (existing?.estimated_duration ?? null);

    const id = await configRepo.upsertSettings(database, {
      id: existing?.id ?? crypto.randomUUID(),
      course_id: courseId,
      allow_qa: allowQa,
      allow_comments: allowComments,
      allow_downloads: allowDownloads,
      allow_notes: allowNotes,
      certificate_enabled: certificateEnabled,
      show_instructor_name: showInstructorName,
      language,
      estimated_duration: estimatedDuration,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });

    return presentSettings({
      id,
      allow_qa: allowQa,
      allow_comments: allowComments,
      allow_downloads: allowDownloads,
      allow_notes: allowNotes,
      certificate_enabled: certificateEnabled,
      show_instructor_name: showInstructorName,
      language,
      estimated_duration: estimatedDuration,
    });
  }

  async function findAccessRuleByCourseId(courseId: string) {
    return await configRepo.findAccessRuleByCourseId(database, courseId);
  }

  async function findPricingByCourseId(courseId: string) {
    return await configRepo.findPricingByCourseId(database, courseId);
  }

  async function findSettingsByCourseId(courseId: string) {
    return await configRepo.findSettingsByCourseId(database, courseId);
  }

  return {
    upsertCourseAccessRules,
    upsertCoursePricing,
    upsertCourseSettings,
    findAccessRuleByCourseId,
    findPricingByCourseId,
    findSettingsByCourseId,
  };
}

export type ConfigurationService = ReturnType<
  typeof createConfigurationService
>;
