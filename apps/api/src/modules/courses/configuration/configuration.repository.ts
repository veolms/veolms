import { type Kysely } from "kysely";
import type {
  Database,
  DatabaseExecutor,
  AccessType,
  AccessDurationType,
  PricingType,
} from "@veolms/database";

// --- Access Rules ---

export async function findAccessRuleByCourseId(
  database: Kysely<Database>,
  courseId: string,
) {
  return await database
    .selectFrom("course_access_rules")
    .selectAll()
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function upsertAccessRule(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    access_type: AccessType;
    duration_type: AccessDurationType;
    duration_days: number | null;
    created_at: Date;
    updated_at: Date;
  },
) {
  const result = await database
    .insertInto("course_access_rules")
    .values(values)
    .onConflict((oc) =>
      oc.column("course_id").doUpdateSet({
        access_type: values.access_type,
        duration_type: values.duration_type,
        duration_days: values.duration_days,
        updated_at: values.updated_at,
      }),
    )
    .returning("id")
    .executeTakeFirstOrThrow();
  return result.id;
}

// --- Pricing ---

export async function findPricingByCourseId(
  // Accepts a transaction too — see the comment on course.repository.ts's
  // findCourseById for why (same cross-module Executor mismatch).
  database: DatabaseExecutor,
  courseId: string,
) {
  return await database
    .selectFrom("course_pricing")
    .selectAll()
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

/**
 * Batched sibling of findPricingByCourseId — one `WHERE course_id IN (...)`
 * query instead of N sequential ones. Used by pricing.service.ts's
 * calculatePricing, which runs on every GET /cart, checkout preview, and
 * order-creation call.
 */
export async function findPricingByCourseIds(
  database: DatabaseExecutor,
  courseIds: string[],
) {
  if (courseIds.length === 0) return [];
  return await database
    .selectFrom("course_pricing")
    .selectAll()
    .where("course_id", "in", courseIds)
    .execute();
}

export async function upsertPricing(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    pricing_type: PricingType;
    price: number;
    currency: string;
    sale_price: number | null;
    /** Left out while the column does not exist yet (migration pending). */
    show_discount_badge?: boolean;
    created_at: Date;
    updated_at: Date;
  },
) {
  const result = await database
    .insertInto("course_pricing")
    .values(values)
    .onConflict((oc) =>
      oc.column("course_id").doUpdateSet({
        pricing_type: values.pricing_type,
        price: values.price,
        currency: values.currency,
        sale_price: values.sale_price,
        ...(values.show_discount_badge === undefined
          ? {}
          : { show_discount_badge: values.show_discount_badge }),
        updated_at: values.updated_at,
      }),
    )
    .returning("id")
    .executeTakeFirstOrThrow();
  return result.id;
}

// --- Settings ---

export async function findSettingsByCourseId(
  database: DatabaseExecutor,
  courseId: string,
) {
  return await database
    .selectFrom("course_settings")
    .selectAll()
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function upsertSettings(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    allow_qa: boolean;
    allow_comments: boolean;
    allow_downloads: boolean;
    allow_notes: boolean;
    certificate_enabled: boolean;
    show_instructor_name: boolean;
    language: string;
    estimated_duration: number | null;
    created_at: Date;
    updated_at: Date;
  },
) {
  const result = await database
    .insertInto("course_settings")
    .values(values)
    .onConflict((oc) =>
      oc.column("course_id").doUpdateSet({
        allow_qa: values.allow_qa,
        allow_comments: values.allow_comments,
        allow_downloads: values.allow_downloads,
        allow_notes: values.allow_notes,
        certificate_enabled: values.certificate_enabled,
        show_instructor_name: values.show_instructor_name,
        language: values.language,
        estimated_duration: values.estimated_duration,
        updated_at: values.updated_at,
      }),
    )
    .returning("id")
    .executeTakeFirstOrThrow();
  return result.id;
}
