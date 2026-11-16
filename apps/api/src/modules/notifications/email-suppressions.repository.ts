import type {
  DatabaseExecutor,
  EmailSuppressionReason,
} from "@veolms/database";

/** Addresses in `emails` that must not be mailed, lower-cased. */
export async function listSuppressedEmails(
  database: DatabaseExecutor,
  emails: readonly string[],
): Promise<Set<string>> {
  const wanted = [
    ...new Set(
      emails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0),
    ),
  ];
  const suppressed = new Set<string>();
  for (let i = 0; i < wanted.length; i += 1000) {
    const rows = await database
      .selectFrom("email_suppressions")
      .select("email")
      .where("email", "in", wanted.slice(i, i + 1000))
      .execute();
    for (const row of rows) suppressed.add(row.email);
  }
  return suppressed;
}

export async function addEmailSuppression(
  database: DatabaseExecutor,
  input: {
    email: string;
    reason: EmailSuppressionReason;
    /** What reported it: "smtp", "webhook:<provider>", "admin". */
    source: string;
    detail?: string | null;
  },
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email) return;
  await database
    .insertInto("email_suppressions")
    .values({
      email,
      reason: input.reason,
      source: input.source,
      detail: input.detail ?? null,
    })
    // By the key's name, not its column: a deployment may widen the key
    // (one list per site) under the same name.
    .onConflict((conflict) =>
      conflict.constraint("email_suppressions_pkey").doNothing(),
    )
    .execute();
}

export async function removeEmailSuppression(
  database: DatabaseExecutor,
  email: string,
): Promise<void> {
  await database
    .deleteFrom("email_suppressions")
    .where("email", "=", email.trim().toLowerCase())
    .execute();
}
