import type { DatabaseExecutor as Executor } from "@veolms/database";
import type { RefundRequestStatus } from "@veolms/database";

export async function findRefundRequestById(
  database: Executor,
  requestId: string,
) {
  return await database
    .selectFrom("refund_requests")
    .selectAll()
    .where("id", "=", requestId)
    .executeTakeFirst();
}

export async function findRefundRequestByOrderId(
  database: Executor,
  orderId: string,
) {
  return await database
    .selectFrom("refund_requests")
    .selectAll()
    .where("order_id", "=", orderId)
    .executeTakeFirst();
}

export async function listRefundRequestsByUser(
  database: Executor,
  userId: string,
) {
  return await database
    .selectFrom("refund_requests")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();
}

export async function listAllRefundRequests(
  database: Executor,
  status?: RefundRequestStatus,
) {
  let query = database.selectFrom("refund_requests").selectAll();
  if (status) {
    query = query.where("status", "=", status);
  }
  return await query.orderBy("created_at", "desc").execute();
}

export async function insertRefundRequest(
  database: Executor,
  values: {
    id: string;
    order_id: string;
    user_id: string;
    reason: string;
    status?: RefundRequestStatus;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("refund_requests")
    .values({
      ...values,
      status: values.status ?? "pending",
      created_at: values.created_at ?? new Date(),
      updated_at: values.updated_at ?? new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateRefundRequestStatus(
  database: Executor,
  requestId: string,
  values: {
    status: RefundRequestStatus;
    admin_notes?: string | null;
    resolved_at?: Date | null;
    updated_at?: Date;
  },
) {
  return await database
    .updateTable("refund_requests")
    .set({
      ...values,
      updated_at: values.updated_at ?? new Date(),
    })
    .where("id", "=", requestId)
    .returningAll()
    .executeTakeFirst();
}
