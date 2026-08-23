import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  UpdateCourseAccessRuleRequest,
  UpdateCoursePricingRequest,
  UpdateCourseSettingsRequest,
} from "@veolms/contracts";
import * as configRepo from "./configuration.repository.ts";
import { getCourseAndVerifyOwner as verifyCourseOwner } from "../shared/courses.utils.ts";

export interface ConfigurationServiceOptions {
  database: Kysely<Database>;
}

export function createConfigurationService({
  database,
}: ConfigurationServiceOptions) {
  function getCourseAndVerifyOwner(courseId: string, creatorId: string) {
    return verifyCourseOwner(database, courseId, creatorId);
  }

  async function upsertCourseAccessRules(
    courseId: string,
    creatorId: string,
    updates: UpdateCourseAccessRuleRequest,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

    const now = new Date();

    const durationType =
      updates.accessType === "everyone" ? "lifetime" : updates.durationType;
    const durationDays =
      updates.accessType === "everyone" ? null : updates.durationDays ?? null;
    const startsAt =
      updates.accessType === "everyone" || !updates.startsAt
        ? null
        : new Date(updates.startsAt);
    const expiresAt =
      updates.accessType === "everyone" || !updates.expiresAt
        ? null
        : new Date(updates.expiresAt);

    const id = await configRepo.upsertAccessRule(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      access_type: updates.accessType,
      duration_type: durationType,
      duration_days: durationDays,
      starts_at: startsAt,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    });

    return {
      id,
      courseId,
      accessType: updates.accessType,
      durationType,
      durationDays,
      startsAt: startsAt ? startsAt.toISOString() : null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };
  }

  async function upsertCoursePricing(
    courseId: string,
    creatorId: string,
    updates: UpdateCoursePricingRequest,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

    const now = new Date();

    const price = updates.pricingType === "free" ? 0 : updates.price;
    const salePrice =
      updates.pricingType === "free" ? null : updates.salePrice ?? null;
    const saleStartsAt =
      updates.pricingType === "free" || !updates.saleStartsAt
        ? null
        : new Date(updates.saleStartsAt);
    const saleEndsAt =
      updates.pricingType === "free" || !updates.saleEndsAt
        ? null
        : new Date(updates.saleEndsAt);

    const id = await configRepo.upsertPricing(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      pricing_type: updates.pricingType,
      price,
      currency: updates.currency,
      sale_price: salePrice,
      sale_starts_at: saleStartsAt,
      sale_ends_at: saleEndsAt,
      created_at: now,
      updated_at: now,
    });

    return {
      id,
      courseId,
      pricingType: updates.pricingType,
      price,
      currency: updates.currency,
      salePrice,
      saleStartsAt: saleStartsAt ? saleStartsAt.toISOString() : null,
      saleEndsAt: saleEndsAt ? saleEndsAt.toISOString() : null,
    };
  }

  async function upsertCourseSettings(
    courseId: string,
    creatorId: string,
    updates: UpdateCourseSettingsRequest,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

    const now = new Date();

    const allowQa = updates.allowQa ?? true;
    const allowComments = updates.allowComments ?? true;
    const allowReviews = updates.allowReviews ?? true;
    const allowDownloads = updates.allowDownloads ?? false;
    const certificateEnabled = updates.certificateEnabled ?? false;
    const language = updates.language ?? "en";
    const estimatedDuration = updates.estimatedDuration ?? null;

    const id = await configRepo.upsertSettings(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      allow_qa: allowQa,
      allow_comments: allowComments,
      allow_reviews: allowReviews,
      allow_downloads: allowDownloads,
      certificate_enabled: certificateEnabled,
      language,
      estimated_duration: estimatedDuration,
      created_at: now,
      updated_at: now,
    });

    return {
      id,
      courseId,
      allowQa,
      allowComments,
      allowReviews,
      allowDownloads,
      certificateEnabled,
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

export type ConfigurationService = ReturnType<typeof createConfigurationService>;
