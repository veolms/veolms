import type { Database } from "@veolms/database";
import type { LegalPageContent, LegalPageSlug } from "@veolms/contracts";
import { sql, type Kysely } from "kysely";

export interface LegalPageRow extends LegalPageContent {
  slug: string;
  updatedAt: Date;
}

const COLUMNS = [
  "slug",
  "title",
  "description",
  "heading",
  "effective",
  "markdown",
  "updated_at",
] as const;

function toRow(row: {
  slug: string;
  title: string;
  description: string;
  heading: string;
  effective: string;
  markdown: string;
  updated_at: Date;
}): LegalPageRow {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    heading: row.heading,
    effective: row.effective,
    markdown: row.markdown,
    updatedAt: row.updated_at,
  };
}

export async function findLegalPage(
  database: Kysely<Database>,
  slug: LegalPageSlug,
): Promise<LegalPageRow | null> {
  const row = await database
    .selectFrom("legal_pages")
    .select(COLUMNS)
    .where("slug", "=", slug)
    .executeTakeFirst();
  return row ? toRow(row) : null;
}

export async function listLegalPages(
  database: Kysely<Database>,
): Promise<LegalPageRow[]> {
  const rows = await database
    .selectFrom("legal_pages")
    .select(COLUMNS)
    .orderBy("slug")
    .execute();
  return rows.map(toRow);
}

export async function saveLegalPage(
  database: Kysely<Database>,
  input: LegalPageContent & { slug: LegalPageSlug; updatedBy: string | null },
): Promise<LegalPageRow> {
  const values = {
    title: input.title,
    description: input.description,
    heading: input.heading,
    effective: input.effective,
    markdown: input.markdown,
    updated_by: input.updatedBy,
  };
  const row = await database
    .insertInto("legal_pages")
    .values({ slug: input.slug, ...values })
    // By constraint name, not column: the cloud's per-academy tables
    // replace the key under the same name.
    .onConflict((conflict) =>
      conflict
        .constraint("legal_pages_pkey")
        .doUpdateSet({ ...values, updated_at: sql`current_timestamp` }),
    )
    .returning(COLUMNS)
    .executeTakeFirstOrThrow();
  return toRow(row);
}

/** True when the page had saved text to remove. */
export async function deleteLegalPage(
  database: Kysely<Database>,
  slug: LegalPageSlug,
): Promise<boolean> {
  const result = await database
    .deleteFrom("legal_pages")
    .where("slug", "=", slug)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}
