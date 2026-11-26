import type { DatabaseExecutor } from "@veolms/database";
import type { CertificateImageKind } from "@veolms/contracts";

type ImageType = "image/png" | "image/jpeg";

export interface CertificateAcademySettingsRow {
  threshold_percent: number;
  auto_issue: boolean;
  signature_key: string | null;
  signature_content_type: ImageType | null;
  badge_key: string | null;
  badge_content_type: ImageType | null;
  background_key: string | null;
  background_content_type: ImageType | null;
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
      "badge_key",
      "badge_content_type",
      "background_key",
      "background_content_type",
      "updated_at",
    ])
    .where("id", "=", true)
    .executeTakeFirst()) as CertificateAcademySettingsRow | undefined;
}

/** The stored key and type of an uploaded image of `kind`, if any. */
export function imageOf(
  row: CertificateAcademySettingsRow | undefined,
  kind: CertificateImageKind,
): { key: string; contentType: ImageType } | null {
  const key = row?.[`${kind}_key`];
  const contentType = row?.[`${kind}_content_type`];
  return key && contentType ? { key, contentType } : null;
}

/** Saves the given settings; the others keep their value (or default). */
export async function saveAcademySettings(
  database: DatabaseExecutor,
  values: {
    thresholdPercent?: number | undefined;
    autoIssue?: boolean | undefined;
    image?: {
      kind: CertificateImageKind;
      value: { key: string; contentType: ImageType } | null;
    };
    updatedBy: string;
  },
): Promise<void> {
  const image = values.image;
  const changes = {
    ...(values.thresholdPercent !== undefined
      ? { threshold_percent: values.thresholdPercent }
      : {}),
    ...(values.autoIssue !== undefined ? { auto_issue: values.autoIssue } : {}),
    ...(image
      ? {
          [`${image.kind}_key`]: image.value?.key ?? null,
          [`${image.kind}_content_type`]: image.value?.contentType ?? null,
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
