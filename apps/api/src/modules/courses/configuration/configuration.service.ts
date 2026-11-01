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

    const durationType = updates.durationType;
    const durationDays =
      updates.durationType === "fixed_duration"
        ? (updates.durationDays ?? null)
        : null;

    const id = await configRepo.upsertAccessRule(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      access_type: updates.accessType,
      duration_type: durationType,
      duration_days: durationDays,
      created_at: now,
      updated_at: now,
    });

    return presentAccessRule({
      id,
      access_type: updates.accessType,
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

    // A course has both prices: what is paid, and the marked price it is
    // struck through from (the same when there is no discount). Selling it
    // for zero is what makes it free, so the pricing type is derived here
    // and whatever the client sent for it is ignored.
    const price = updates.price;
    const currency = updates.currency ?? "INR";
    const salePrice = updates.salePrice;
    const pricingType: "free" | "paid" = salePrice === 0 ? "free" : "paid";

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

    const id = await configRepo.upsertPricing(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      pricing_type: pricingType,
      price,
      currency,
      sale_price: salePrice,
      ...(canStoreBadge ? { show_discount_badge: showDiscountBadge } : {}),
      created_at: now,
      updated_at: now,
    });

    return presentPricing({
      id,
      pricing_type: pricingType,
      price,
      currency,
      sale_price: salePrice,
      show_discount_badge: showDiscountBadge,
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
