import type { PaymentProvider } from "@veolms/contracts";
import type { DatabaseExecutor as Executor } from "@veolms/database";

/**
 * The academy's own gateway account: one row per gateway for the whole
 * academy, whoever on the team connected it (`creator_id` says who). In a
 * multi-academy install each academy sees only its own rows.
 */

export async function findAcademyGatewayRow(
  database: Executor,
  provider: PaymentProvider,
) {
  return (
    (await database
      .selectFrom("creator_payment_configs")
      .selectAll()
      .where("provider", "=", provider)
      .where("is_active", "=", true)
      .orderBy("updated_at", "desc")
      .limit(1)
      .executeTakeFirst()) ?? null
  );
}

/** The row with the name of whoever connected it, for the settings page. */
export async function findAcademyGatewayStatus(
  database: Executor,
  provider: PaymentProvider,
) {
  return (
    (await database
      .selectFrom("creator_payment_configs as c")
      .leftJoin("users as u", "u.id", "c.creator_id")
      .select([
        "c.encrypted_key_id",
        "c.encrypted_webhook_secret",
        "c.created_at",
        "c.updated_at",
        "u.display_name as connected_by",
      ])
      .where("c.provider", "=", provider)
      .where("c.is_active", "=", true)
      .orderBy("c.updated_at", "desc")
      .limit(1)
      .executeTakeFirst()) ?? null
  );
}

/**
 * Stores the academy's keys for a gateway, replacing any earlier ones (one
 * row per gateway). Call inside a transaction.
 */
export async function saveAcademyGateway(
  trx: Executor,
  values: {
    provider: PaymentProvider;
    connectedBy: string;
    encryptedKeyId: string;
    encryptedKeySecret: string;
    encryptedWebhookSecret: string;
  },
) {
  await trx
    .deleteFrom("creator_payment_configs")
    .where("provider", "=", values.provider)
    .execute();
  return await trx
    .insertInto("creator_payment_configs")
    .values({
      id: crypto.randomUUID(),
      creator_id: values.connectedBy,
      provider: values.provider,
      encrypted_key_id: values.encryptedKeyId,
      encrypted_key_secret: values.encryptedKeySecret,
      encrypted_webhook_secret: values.encryptedWebhookSecret,
      is_active: true,
      updated_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function setAcademyWebhookSecret(
  database: Executor,
  provider: PaymentProvider,
  encryptedWebhookSecret: string,
): Promise<boolean> {
  const result = await database
    .updateTable("creator_payment_configs")
    .set({
      encrypted_webhook_secret: encryptedWebhookSecret,
      updated_at: new Date(),
    })
    .where("provider", "=", provider)
    .where("is_active", "=", true)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function deleteAcademyGateway(
  database: Executor,
  provider: PaymentProvider,
): Promise<boolean> {
  const result = await database
    .deleteFrom("creator_payment_configs")
    .where("provider", "=", provider)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}
