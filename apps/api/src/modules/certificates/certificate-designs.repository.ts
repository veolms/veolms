import type { DatabaseExecutor, Json } from "@veolms/database";

export interface CertificateDesignRow {
  id: string;
  name: string;
  storage_key: string;
  content_type: "application/pdf" | "image/png" | "image/jpeg";
  file_size: number;
  page_width: string;
  page_height: string;
  layout: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const columns = [
  "id",
  "name",
  "storage_key",
  "content_type",
  "file_size",
  "page_width",
  "page_height",
  "layout",
  "is_active",
  "created_at",
  "updated_at",
] as const;

/** Every design not deleted, the newest first. */
export async function listDesigns(
  database: DatabaseExecutor,
): Promise<CertificateDesignRow[]> {
  return (await database
    .selectFrom("certificate_designs")
    .select(columns)
    .where("deleted_at", "is", null)
    .orderBy("created_at", "desc")
    .execute()) as CertificateDesignRow[];
}

export async function findDesign(
  database: DatabaseExecutor,
  id: string,
): Promise<CertificateDesignRow | undefined> {
  return (await database
    .selectFrom("certificate_designs")
    .select(columns)
    .where("id", "=", id)
    .where("deleted_at", "is", null)
    .executeTakeFirst()) as CertificateDesignRow | undefined;
}

/** The finalised design, if any (none: the built-in design is used). */
export async function findActiveDesign(
  database: DatabaseExecutor,
): Promise<CertificateDesignRow | undefined> {
  return (await database
    .selectFrom("certificate_designs")
    .select(columns)
    .where("is_active", "=", true)
    .where("deleted_at", "is", null)
    .executeTakeFirst()) as CertificateDesignRow | undefined;
}

export async function insertDesign(
  database: DatabaseExecutor,
  values: {
    id: string;
    name: string;
    storageKey: string;
    contentType: CertificateDesignRow["content_type"];
    fileSize: number;
    pageWidth: number;
    pageHeight: number;
    layout: Json;
    createdBy: string;
  },
): Promise<void> {
  await database
    .insertInto("certificate_designs")
    .values({
      id: values.id,
      name: values.name,
      storage_key: values.storageKey,
      content_type: values.contentType,
      file_size: values.fileSize,
      page_width: values.pageWidth,
      page_height: values.pageHeight,
      layout: JSON.stringify(values.layout),
      created_by: values.createdBy,
      deleted_at: null,
    })
    .execute();
}

export async function updateDesign(
  database: DatabaseExecutor,
  id: string,
  values: { name?: string | undefined; layout?: Json | undefined },
): Promise<boolean> {
  const result = await database
    .updateTable("certificate_designs")
    .set({
      ...(values.name !== undefined ? { name: values.name } : {}),
      ...(values.layout !== undefined
        ? { layout: JSON.stringify(values.layout) }
        : {}),
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/** No design is finalised: the built-in one is used. */
export async function deactivateAll(database: DatabaseExecutor): Promise<void> {
  await database
    .updateTable("certificate_designs")
    .set({ is_active: false, updated_at: new Date() })
    .where("is_active", "=", true)
    .execute();
}

export async function activateDesign(
  database: DatabaseExecutor,
  id: string,
): Promise<boolean> {
  const result = await database
    .updateTable("certificate_designs")
    .set({ is_active: true, updated_at: new Date() })
    .where("id", "=", id)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function softDeleteDesign(
  database: DatabaseExecutor,
  id: string,
): Promise<void> {
  await database
    .updateTable("certificate_designs")
    .set({ deleted_at: new Date(), is_active: false, updated_at: new Date() })
    .where("id", "=", id)
    .execute();
}
