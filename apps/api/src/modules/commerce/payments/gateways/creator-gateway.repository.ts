import type { DatabaseExecutor as Executor } from "@veolms/database";
import type { PaymentProvider } from "@veolms/contracts";

export async function findCreatorPaymentConfig(
  database: Executor,
  creatorId: string,
  provider: PaymentProvider = "razorpay",
) {
  return await database
    .selectFrom("creator_payment_configs")
    .selectAll()
    .where("creator_id", "=", creatorId)
    .where("provider", "=", provider)
    .where("is_active", "=", true)
    .executeTakeFirst();
}

export async function upsertCreatorPaymentConfig(
  database: Executor,
  values: {
    id: string;
    creator_id: string;
    provider: string;
    encrypted_key_id: string;
    encrypted_key_secret: string;
    encrypted_webhook_secret?: string | null;
    is_active?: boolean;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("creator_payment_configs")
    .values({
      ...values,
      is_active: values.is_active ?? true,
      updated_at: values.updated_at ?? new Date(),
    })
    .onConflict((oc) =>
      oc.columns(["creator_id", "provider"]).doUpdateSet({
        encrypted_key_id: values.encrypted_key_id,
        encrypted_key_secret: values.encrypted_key_secret,
        encrypted_webhook_secret: values.encrypted_webhook_secret ?? null,
        is_active: values.is_active ?? true,
        updated_at: new Date(),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listCreatorPaymentConfigs(
  database: Executor,
  creatorId: string,
) {
  return await database
    .selectFrom("creator_payment_configs")
    .selectAll()
    .where("creator_id", "=", creatorId)
    .execute();
}
