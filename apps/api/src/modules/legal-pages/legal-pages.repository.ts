import type { LegalPageContent, LegalPageSlug } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import { sql, type Kysely } from "kysely";

export interface SavedLegalPage {
  slug: LegalPageSlug;
  content: LegalPageContent;
  updatedAt: Date;
}

/** PostgreSQL "undefined_table": the legal pages migration has not run yet. */
const UNDEFINED_TABLE = "42P01";

export function isMissingLegalPagesTable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === UNDEFINED_TABLE
  );
}

type Row = {
  slug: string;
  title: string;
  description: string;
  heading: string;
  effective: string | null;
  markdown: string;
  updated_at: Date;
};

function toSaved(row: Row): SavedLegalPage {
  return {
    slug: row.slug as LegalPageSlug,
    content: {
      title: row.title,
      description: row.description,
      heading: row.heading,
      effective: row.effective,
      markdown: row.markdown,
    },
    updatedAt: row.updated_at,
  };
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

export async function findLegalPage(
  database: Kysely<Database>,
  slug: LegalPageSlug,
): Promise<SavedLegalPage | null> {
  const row = await database
    .selectFrom("legal_pages")
    .select(COLUMNS)
    .where("slug", "=", slug)
    .executeTakeFirst();
  return row ? toSaved(row) : null;
}

export async function listLegalPages(
  database: Kysely<Database>,
): Promise<SavedLegalPage[]> {
  const rows = await database
    .selectFrom("legal_pages")
    .select(COLUMNS)
    .execute();
  return rows.map(toSaved);
}

export async function saveLegalPage(
  database: Kysely<Database>,
  input: {
    slug: LegalPageSlug;
    content: LegalPageContent;
    updatedBy: string | null;
  },
): Promise<SavedLegalPage> {
  const { content } = input;
  const row = await database
    .insertInto("legal_pages")
    .values({
      slug: input.slug,
      title: content.title,
      description: content.description,
      heading: content.heading,
      effective: content.effective,
      markdown: content.markdown,
      updated_by: input.updatedBy,
    })
    // By primary key name, not column: see platform-settings.repository.ts.
    .onConflict((conflict) =>
      conflict.constraint("legal_pages_pkey").doUpdateSet({
        title: content.title,
        description: content.description,
        heading: content.heading,
        effective: content.effective,
        markdown: content.markdown,
        updated_by: input.updatedBy,
        updated_at: sql`current_timestamp`,
      }),
    )
    .returning(COLUMNS)
    .executeTakeFirstOrThrow();
  return toSaved(row);
}

export async function deleteLegalPage(
  database: Kysely<Database>,
  slug: LegalPageSlug,
): Promise<void> {
  await database.deleteFrom("legal_pages").where("slug", "=", slug).execute();
}
