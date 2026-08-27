import { type Kysely } from "kysely";
import type {
  Database,
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

export async function insertAccessRule(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    access_type: AccessType;
    duration_type: AccessDurationType;
    duration_days: number | null;
    starts_at: Date | null;
    expires_at: Date | null;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("course_access_rules").values(values).execute();
}

export async function upsertAccessRule(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    access_type: AccessType;
    duration_type: AccessDurationType;
    duration_days: number | null;
    starts_at: Date | null;
    expires_at: Date | null;
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
        starts_at: values.starts_at,
        expires_at: values.expires_at,
        updated_at: values.updated_at,
      }),
    )
    .returning("id")
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function updateAccessRule(
  database: Kysely<Database>,
  accessRuleId: string,
  values: {
    access_type: AccessType;
    duration_type: AccessDurationType;
    duration_days: number | null;
    starts_at: Date | null;
    expires_at: Date | null;
    updated_at: Date;
  },
) {
  await database
    .updateTable("course_access_rules")
    .set(values)
    .where("id", "=", accessRuleId)
    .execute();
}

// --- Pricing ---

export async function findPricingByCourseId(
  database: Kysely<Database>,
  courseId: string,
) {
  return await database
    .selectFrom("course_pricing")
    .selectAll()
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function insertPricing(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    pricing_type: PricingType;
    price: number;
    currency: string;
    sale_price: number | null;
    sale_starts_at: Date | null;
    sale_ends_at: Date | null;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("course_pricing").values(values).execute();
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
    sale_starts_at: Date | null;
    sale_ends_at: Date | null;
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
        sale_starts_at: values.sale_starts_at,
        sale_ends_at: values.sale_ends_at,
        updated_at: values.updated_at,
      }),
    )
    .returning("id")
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function updatePricing(
  database: Kysely<Database>,
  pricingId: string,
  values: {
    pricing_type: PricingType;
    price: number;
    currency: string;
    sale_price: number | null;
    sale_starts_at: Date | null;
    sale_ends_at: Date | null;
    updated_at: Date;
  },
) {
  await database
    .updateTable("course_pricing")
    .set(values)
    .where("id", "=", pricingId)
    .execute();
}

// --- Settings ---

export async function findSettingsByCourseId(
  database: Kysely<Database>,
  courseId: string,
) {
  return await database
    .selectFrom("course_settings")
    .selectAll()
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function insertSettings(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    allow_qa: boolean;
    allow_comments: boolean;
    allow_reviews: boolean;
    allow_downloads: boolean;
    certificate_enabled: boolean;
    show_instructor_name: boolean;
    language: string;
    estimated_duration: number | null;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("course_settings").values(values).execute();
}

export async function upsertSettings(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    allow_qa: boolean;
    allow_comments: boolean;
    allow_reviews: boolean;
    allow_downloads: boolean;
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
        allow_reviews: values.allow_reviews,
        allow_downloads: values.allow_downloads,
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

export async function updateSettings(
  database: Kysely<Database>,
  settingsId: string,
  values: {
    allow_qa?: boolean;
    allow_comments?: boolean;
    allow_reviews?: boolean;
    allow_downloads?: boolean;
    certificate_enabled?: boolean;
    show_instructor_name?: boolean;
    language?: string;
    estimated_duration?: number | null;
    updated_at: Date;
  },
) {
  await database
    .updateTable("course_settings")
    .set(values)
    .where("id", "=", settingsId)
    .execute();
}
