import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  UpdateCourseAccessRuleRequest,
  UpdateCoursePricingRequest,
  UpdateCourseSettingsRequest,
} from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
import { hasDiscountBadgeColumn } from "../shared/discount-badge-column.ts";
import * as configRepo from "./configuration.repository.ts";
import { getCourseAndVerifyOwner as verifyCourseOwner } from "../shared/courses.utils.ts";

export interface ConfigurationServiceOptions {
  database: Kysely<Database>;
}

export function createConfigurationService({
  database,
}: ConfigurationServiceOptions) {
  function getCourseAndVerifyOwner(
    courseId: string,
    creatorId: string,
    userRoles?: readonly string[],
  ) {
    return verifyCourseOwner(database, courseId, creatorId, userRoles);
  }

  async function upsertCourseAccessRules(
    courseId: string,
    creatorId: string,
    updates: UpdateCourseAccessRuleRequest,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId, userRoles);

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

    return {
      id,
      courseId,
      accessType: updates.accessType,
      durationType,
      durationDays,
    };
  }

  async function upsertCoursePricing(
    courseId: string,
    creatorId: string,
    updates: UpdateCoursePricingRequest,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId, userRoles);

    const now = new Date();

    // A course has one price, optionally with the price it is marked down
    // from. Selling it for zero is what makes it free, so the pricing type is
    // derived here and whatever the client sent for it is ignored.
    const price = updates.price;
    const currency = updates.currency ?? "INR";
    const salePrice = updates.salePrice ?? null;
    const pricingType: "free" | "paid" =
      (salePrice ?? price) === 0 ? "free" : "paid";

    // A badge needs a discount to announce.
    const showDiscountBadge =
      salePrice !== null && updates.showDiscountBadge === true;
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

    return {
      id,
      courseId,
      pricingType,
      price,
      currency,
      salePrice,
      showDiscountBadge,
    };
  }

  async function upsertCourseSettings(
    courseId: string,
    creatorId: string,
    updates: UpdateCourseSettingsRequest,
    userRoles?: readonly string[],
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId, userRoles);

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

    return {
      id,
      courseId,
      allowQa,
      allowComments,
      allowDownloads,
      allowNotes,
      certificateEnabled,
      showInstructorName,
      language,
      estimatedDuration,
    };
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
    getAccessRuleByCourseId: findAccessRuleByCourseId,
    findPricingByCourseId,
    getPricingByCourseId: findPricingByCourseId,
    findSettingsByCourseId,
    getSettingsByCourseId: findSettingsByCourseId,
  };
}

export type ConfigurationService = ReturnType<
  typeof createConfigurationService
>;
