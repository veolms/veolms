import type { DatabaseExecutor } from "@veolms/database";

export interface CertificateAcademySettingsRow {
  threshold_percent: number;
  auto_issue: boolean;
  signature_key: string | null;
  signature_content_type: "image/png" | "image/jpeg" | null;
  updated_at: Date;
}

/** The academy's settings row, if it has been saved once. */
export async function findAcademySettings(
  database: DatabaseExecutor,
): Promise<CertificateAcademySettingsRow | undefined> {
  return (await database
    .selectFrom("certificate_academy_settings")
    .select([
      "threshold_percent",
      "auto_issue",
      "signature_key",
      "signature_content_type",
      "updated_at",
    ])
    .where("id", "=", true)
    .executeTakeFirst()) as CertificateAcademySettingsRow | undefined;
}

/** Saves the given settings; the others keep their value (or default). */
export async function saveAcademySettings(
  database: DatabaseExecutor,
  values: {
    thresholdPercent?: number | undefined;
    autoIssue?: boolean | undefined;
    signature?:
      | { key: string; contentType: "image/png" | "image/jpeg" }
      | null
      | undefined;
    updatedBy: string;
  },
): Promise<void> {
  const changes = {
    ...(values.thresholdPercent !== undefined
      ? { threshold_percent: values.thresholdPercent }
      : {}),
    ...(values.autoIssue !== undefined ? { auto_issue: values.autoIssue } : {}),
    ...(values.signature !== undefined
      ? {
          signature_key: values.signature?.key ?? null,
          signature_content_type: values.signature?.contentType ?? null,
        }
      : {}),
    updated_by: values.updatedBy,
    updated_at: new Date(),
  };
  await database
    .insertInto("certificate_academy_settings")
    .values({ id: true, ...changes })
    .onConflict((conflict) => conflict.column("id").doUpdateSet(changes))
    .execute();
}
