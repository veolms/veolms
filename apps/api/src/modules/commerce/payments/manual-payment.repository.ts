import type { DatabaseExecutor as Executor } from "@veolms/database";
import type { ManualPaymentStatus } from "@veolms/database";

export async function findManualPaymentRequestById(
  database: Executor,
  requestId: string,
) {
  return await database
    .selectFrom("manual_payment_requests")
    .selectAll()
    .where("id", "=", requestId)
    .executeTakeFirst();
}

export async function findManualPaymentRequestByOrderId(
  database: Executor,
  orderId: string,
) {
  return await database
    .selectFrom("manual_payment_requests")
    .selectAll()
    .where("order_id", "=", orderId)
    .executeTakeFirst();
}

export async function listManualPaymentRequestsByUser(
  database: Executor,
  userId: string,
) {
  return await database
    .selectFrom("manual_payment_requests")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();
}

export async function listAllManualPaymentRequests(
  database: Executor,
  status?: ManualPaymentStatus,
) {
  let query = database.selectFrom("manual_payment_requests").selectAll();
  if (status) {
    query = query.where("status", "=", status);
  }
  return await query.orderBy("created_at", "desc").execute();
}

export async function insertManualPaymentRequest(
  database: Executor,
  values: {
    id: string;
    order_id: string;
    user_id: string;
    payment_method: string;
    transaction_reference: string;
    proof_media_id?: string | null;
    status?: ManualPaymentStatus;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("manual_payment_requests")
    .values({
      ...values,
      status: values.status ?? "pending",
      created_at: values.created_at ?? new Date(),
      updated_at: values.updated_at ?? new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateManualPaymentRequestStatus(
  database: Executor,
  requestId: string,
  values: {
    status: ManualPaymentStatus;
    admin_notes?: string | null;
    verified_by?: string | null;
    verified_at?: Date | null;
    updated_at?: Date;
  },
  expectedStatus?: ManualPaymentStatus,
) {
  let query = database
    .updateTable("manual_payment_requests")
    .set({
      ...values,
      updated_at: values.updated_at ?? new Date(),
    })
    .where("id", "=", requestId);

  if (expectedStatus) {
    query = query.where("status", "=", expectedStatus);
  }

  return await query.returningAll().executeTakeFirst();
}
