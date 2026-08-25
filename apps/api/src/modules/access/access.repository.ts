import type { Database } from "@veolms/database";
import type { Kysely, Transaction } from "kysely";

export type Executor = Kysely<Database> | Transaction<Database>;

export async function findAccessGrant(
  database: Executor,
  userId: string,
  courseId: string,
) {
  return await database
    .selectFrom("access_grants")
    .selectAll()
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function listUserAccessGrants(
  database: Executor,
  userId: string,
) {
  return await database
    .selectFrom("access_grants")
    .selectAll()
    .where("user_id", "=", userId)
    .execute();
}

export async function insertAccessGrant(
  database: Executor,
  values: {
    id: string;
    user_id: string;
    course_id: string;
    order_id?: string | null;
    status: "active" | "suspended" | "revoked" | "expired";
    source: "purchase" | "bundle_purchase" | "free_grant" | "admin_grant";
    valid_from?: Date;
    valid_until?: Date | null;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("access_grants")
    .values(values)
    .onConflict((oc) =>
      oc.columns(["user_id", "course_id"]).doUpdateSet({
        status: values.status,
        valid_until: values.valid_until,
        updated_at: new Date(),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateAccessGrantStatus(
  database: Executor,
  grantId: string,
  status: "active" | "suspended" | "revoked" | "expired",
) {
  return await database
    .updateTable("access_grants")
    .set({
      status,
      updated_at: new Date(),
    })
    .where("id", "=", grantId)
    .returningAll()
    .executeTakeFirst();
}

export async function revokeAccessGrantsByOrderId(
  database: Executor,
  orderId: string,
) {
  return await database
    .updateTable("access_grants")
    .set({
      status: "revoked",
      updated_at: new Date(),
    })
    .where("order_id", "=", orderId)
    .returningAll()
    .execute();
}
