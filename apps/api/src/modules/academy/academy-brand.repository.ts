import type { DatabaseExecutor } from "@veolms/database";

/** The academy's name and logo: the one academy row, if setup made it. */
export function findAcademyBrand(database: DatabaseExecutor) {
  return database
    .selectFrom("academy")
    .select(["id", "name", "logo_url"])
    .executeTakeFirst();
}

export async function updateAcademyBrand(
  database: DatabaseExecutor,
  input: { id: string; name: string; logoUrl: string | null },
): Promise<void> {
  await database
    .updateTable("academy")
    .set({ name: input.name, logo_url: input.logoUrl, updated_at: new Date() })
    .where("id", "=", input.id)
    .execute();
}
