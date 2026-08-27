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

    const durationType = updates.durationType;
    const durationDays =
      updates.durationType === "fixed_duration"
        ? updates.durationDays ?? null
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
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

    const now = new Date();

    const price = updates.pricingType === "free" ? 0 : updates.price;
    const currency = updates.currency ?? "INR";
    const salePrice =
      updates.pricingType === "free" ? null : updates.salePrice ?? null;

    const id = await configRepo.upsertPricing(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      pricing_type: updates.pricingType,
      price,
      currency,
      sale_price: salePrice,
      created_at: now,
      updated_at: now,
    });

    return {
      id,
      courseId,
      pricingType: updates.pricingType,
      price,
      currency,
      salePrice,
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
    const allowDownloads = updates.allowDownloads ?? false;
    const certificateEnabled = updates.certificateEnabled ?? false;
    const showInstructorName = updates.showInstructorName ?? true;
    const language = updates.language ?? "en";
    const estimatedDuration = updates.estimatedDuration ?? null;

    const id = await configRepo.upsertSettings(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      allow_qa: allowQa,
      allow_comments: allowComments,
      allow_downloads: allowDownloads,
      certificate_enabled: certificateEnabled,
      show_instructor_name: showInstructorName,
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
      allowDownloads,
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

export type ConfigurationService = ReturnType<typeof createConfigurationService>;
