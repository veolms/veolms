import type { Executor } from "../shared/repository.types.ts";

export function findAcademy(database: Executor) {
  return database.selectFrom("academy").selectAll().executeTakeFirst();
}

export async function upsertAcademy(
  database: Executor,
  input: {
    id: string;
    name: string;
    logoUrl: string | null;
    customDomain: string | null;
    exists: boolean;
  },
): Promise<void> {
  const values = {
    name: input.name,
    logo_url: input.logoUrl,
    custom_domain: input.customDomain,
    updated_at: new Date(),
  };

  if (input.exists) {
    await database
      .updateTable("academy")
      .set(values)
      .where("id", "=", input.id)
      .execute();
    return;
  }

  await database
    .insertInto("academy")
    .values({ id: input.id, ...values, setup_completed: false })
    .execute();
}

export async function markSetupCompleted(
  database: Executor,
  academyId: string,
): Promise<void> {
  await database
    .updateTable("academy")
    .set({ setup_completed: true, updated_at: new Date() })
    .where("id", "=", academyId)
    .execute();
}
