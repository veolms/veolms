import { cacheTags, createCache, invalidateCache } from "@veolms/api-core";

import type { Executor } from "../shared/repository.types.ts";
import * as academyRepository from "./setup.repository.ts";

type AcademyRow = NonNullable<
  Awaited<ReturnType<typeof academyRepository.findAcademy>>
>;

/**
 * The academy row: one per installation, made at setup, its id fixed from
 * then on. Orders, analytics, discussions, quizzes and invoices read it on
 * many requests. Setup and the brand settings clear it in every process
 * after they write (`forgetAcademy`); before setup there is no row, and
 * that answer is not kept.
 */
const academy = createCache<AcademyRow | undefined>({
  name: "auth.academy",
  ttlMs: 10 * 60_000,
  maxBytes: 64 * 1024,
});

export async function getAcademyRow(
  database: Executor,
): Promise<AcademyRow | undefined> {
  return await academy.fetch(
    "row",
    () => academyRepository.findAcademy(database),
    {
      tags: [cacheTags.academy],
      keepIf: (row) => row !== undefined,
    },
  );
}

/** The academy's id, or null before setup. */
export async function getAcademyId(database: Executor): Promise<string | null> {
  return (await getAcademyRow(database))?.id ?? null;
}

/** After a write to the academy row has committed. */
export function forgetAcademy(): void {
  invalidateCache([cacheTags.academy]);
}
