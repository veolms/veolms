import type {
  AffiliateCommissionStatus,
  AffiliatePayoutMethod,
} from "@veolms/contracts";
import type { AffiliateTable, DatabaseExecutor } from "@veolms/database";
import { sql, type Selectable } from "kysely";

/**
 * Database access for an affiliate's own record, balances, history and
 * payouts. Every function is scoped by the affiliate's id, which services
 * take from the signed-in user, never from a request.
 */

export type AffiliateRow = Selectable<AffiliateTable>;

export async function findAffiliateByUserId(
  executor: DatabaseExecutor,
  userId: string,
): Promise<AffiliateRow | undefined> {
  return await executor
    .selectFrom("affiliates")
    .selectAll()
    .where("user_id", "=", userId)
    .executeTakeFirst();
}

/** Locks the affiliate's row for a payout request (one at a time). */
export async function lockAffiliate(
  executor: DatabaseExecutor,
  affiliateId: string,
): Promise<AffiliateRow | undefined> {
  return await executor
    .selectFrom("affiliates")
    .selectAll()
    .where("id", "=", affiliateId)
    .forUpdate()
    .executeTakeFirst();
}

/** An invitation not yet accepted, for this email (lower case). */
export async function findOpenInvitation(
  executor: DatabaseExecutor,
  email: string,
): Promise<AffiliateRow | undefined> {
  return await executor
    .selectFrom("affiliates")
    .selectAll()
    .where("invited_email", "=", email)
    .where("user_id", "is", null)
    .executeTakeFirst();
}

export async function affiliateCodeExists(
  executor: DatabaseExecutor,
  code: string,
  exceptAffiliateId?: string,
): Promise<boolean> {
  let query = executor
    .selectFrom("affiliates")
    .select("id")
    .where("code", "=", code);
  if (exceptAffiliateId) query = query.where("id", "<>", exceptAffiliateId);
  return (await query.executeTakeFirst()) !== undefined;
}

export async function insertAffiliate(
  executor: DatabaseExecutor,
  values: {
    userId: string;
    code: string;
    status: "pending" | "approved";
    applicationNote: string | null;
    now: Date;
  },
): Promise<AffiliateRow> {
  return await executor
    .insertInto("affiliates")
    .values({
      user_id: values.userId,
      code: values.code,
      status: values.status,
      application_note: values.applicationNote,
      terms_accepted_at: values.now,
      decided_at: values.status === "approved" ? values.now : null,
      created_at: values.now,
      updated_at: values.now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Accepting an invitation: the account takes the invited record, approved. */
export async function acceptInvitation(
  executor: DatabaseExecutor,
  affiliateId: string,
  values: { userId: string; applicationNote: string | null; now: Date },
): Promise<AffiliateRow> {
  return await executor
    .updateTable("affiliates")
    .set({
      user_id: values.userId,
      status: "approved",
      application_note: values.applicationNote,
      terms_accepted_at: values.now,
      decided_at: values.now,
      updated_at: values.now,
    })
    .where("id", "=", affiliateId)
    .where("user_id", "is", null)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** A rejected applicant applies again: pending once more. */
export async function reapply(
  executor: DatabaseExecutor,
  affiliateId: string,
  values: { applicationNote: string | null; now: Date },
): Promise<AffiliateRow> {
  return await executor
    .updateTable("affiliates")
    .set({
      status: "pending",
      application_note: values.applicationNote,
      status_reason: null,
      decided_by: null,
      decided_at: null,
      terms_accepted_at: values.now,
      updated_at: values.now,
    })
    .where("id", "=", affiliateId)
    .where("status", "=", "rejected")
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateAffiliate(
  executor: DatabaseExecutor,
  affiliateId: string,
  changes: Partial<
    Pick<
      AffiliateRow,
      | "code"
      | "notify_on_commission"
      | "coupon_id"
      | "payout_method"
      | "payout_details_encrypted"
      | "payout_details_hint"
      | "pan_encrypted"
      | "pan_last4"
    >
  >,
): Promise<void> {
  await executor
    .updateTable("affiliates")
    .set({ ...changes, updated_at: new Date() })
    .where("id", "=", affiliateId)
    .execute();
}

export interface Balances {
  pending: number;
  available: number;
  inPayout: number;
  paid: number;
}

/** The four balances, summed from the ledger in the payout currency. */
export async function sumBalances(
  executor: DatabaseExecutor,
  affiliateId: string,
): Promise<Balances> {
  const row = await executor
    .selectFrom("affiliate_commissions")
    .select([
      sql<string>`coalesce(sum(payout_amount) filter (where status = 'pending'), 0)`.as(
        "pending",
      ),
      sql<string>`coalesce(sum(payout_amount) filter (where status = 'approved' and payout_id is null), 0)`.as(
        "available",
      ),
      sql<string>`coalesce(sum(payout_amount) filter (where status = 'approved' and payout_id is not null and paid_at is null), 0)`.as(
        "in_payout",
      ),
      sql<string>`coalesce(sum(payout_amount) filter (where paid_at is not null), 0)`.as(
        "paid",
      ),
    ])
    .where("affiliate_id", "=", affiliateId)
    .executeTakeFirstOrThrow();
  return {
    pending: Number(row.pending),
    available: Number(row.available),
    inPayout: Number(row.in_payout),
    paid: Number(row.paid),
  };
}

export async function hasOpenPayout(
  executor: DatabaseExecutor,
  affiliateId: string,
): Promise<boolean> {
  return (
    (await executor
      .selectFrom("affiliate_payouts")
      .select("id")
      .where("affiliate_id", "=", affiliateId)
      .where("status", "=", "requested")
      .executeTakeFirst()) !== undefined
  );
}

export interface CommissionHistoryRow {
  id: string;
  created_at: Date;
  kind: "sale" | "reversal" | "adjustment";
  status: AffiliateCommissionStatus;
  order_id: string | null;
  order_item_id: string | null;
  currency: string;
  base_amount: number;
  rate_type: "percent" | "fixed" | null;
  rate_value: number | null;
  amount: number;
  payout_currency: string;
  payout_amount: number | null;
  payout_id: string | null;
  paid_at: Date | null;
  available_at: Date;
  note: string | null;
  source: "code" | "link" | "account" | "manual" | null;
}

/** The ledger rows, newest first, after a (created_at, id) cursor. */
export async function listCommissionHistory(
  executor: DatabaseExecutor,
  affiliateId: string,
  options: {
    status?: AffiliateCommissionStatus;
    before?: { createdAt: Date; id: string };
    limit: number;
  },
): Promise<CommissionHistoryRow[]> {
  let query = executor
    .selectFrom("affiliate_commissions as c")
    .leftJoin("affiliate_order_attributions as t", "t.order_id", "c.order_id")
    .select([
      "c.id",
      "c.created_at",
      "c.kind",
      "c.status",
      "c.order_id",
      "c.order_item_id",
      "c.currency",
      "c.base_amount",
      "c.rate_type",
      "c.rate_value",
      "c.amount",
      "c.payout_currency",
      "c.payout_amount",
      "c.payout_id",
      "c.paid_at",
      "c.available_at",
      "c.note",
      "t.source",
    ])
    .where("c.affiliate_id", "=", affiliateId);
  if (options.status) query = query.where("c.status", "=", options.status);
  if (options.before) {
    const { createdAt, id } = options.before;
    query = query.where((eb) =>
      eb.or([
        eb("c.created_at", "<", createdAt),
        eb.and([eb("c.created_at", "=", createdAt), eb("c.id", "<", id)]),
      ]),
    );
  }
  return await query
    .orderBy("c.created_at", "desc")
    .orderBy("c.id", "desc")
    .limit(options.limit)
    .execute();
}

export async function listPayouts(
  executor: DatabaseExecutor,
  affiliateId: string,
) {
  return await executor
    .selectFrom("affiliate_payouts")
    .select([
      "id",
      "status",
      "currency",
      "gross_amount",
      "tds_amount",
      "net_amount",
      "payout_method",
      "payout_details_hint",
      "reference",
      "paid_on",
      "reason",
      "created_at",
      "idempotency_key",
    ])
    .where("affiliate_id", "=", affiliateId)
    .orderBy("created_at", "desc")
    .limit(200)
    .execute();
}

export type PayoutRow = Awaited<ReturnType<typeof listPayouts>>[number];

export async function findPayoutByIdempotencyKey(
  executor: DatabaseExecutor,
  affiliateId: string,
  key: string,
): Promise<PayoutRow | undefined> {
  return (await listPayouts(executor, affiliateId)).find(
    (payout) => payout.idempotency_key === key,
  );
}

/** The approved rows not yet in any payout, locked so they join one payout only. */
export async function lockAvailableRows(
  executor: DatabaseExecutor,
  affiliateId: string,
): Promise<{ id: string; payout_amount: number | null }[]> {
  return await executor
    .selectFrom("affiliate_commissions")
    .select(["id", "payout_amount"])
    .where("affiliate_id", "=", affiliateId)
    .where("status", "=", "approved")
    .where("payout_id", "is", null)
    .forUpdate()
    .execute();
}

export async function insertPayout(
  executor: DatabaseExecutor,
  values: {
    affiliateId: string;
    currency: string;
    gross: number;
    method: AffiliatePayoutMethod;
    detailsEncrypted: string;
    hint: string | null;
    requestedBy: "affiliate" | "admin";
    idempotencyKey: string | null;
    now: Date;
  },
): Promise<PayoutRow> {
  const inserted = await executor
    .insertInto("affiliate_payouts")
    .values({
      affiliate_id: values.affiliateId,
      status: "requested",
      currency: values.currency,
      gross_amount: values.gross,
      tds_amount: 0,
      net_amount: values.gross,
      payout_method: values.method,
      payout_details_encrypted: values.detailsEncrypted,
      payout_details_hint: values.hint,
      requested_by: values.requestedBy,
      idempotency_key: values.idempotencyKey,
      created_at: values.now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return (await listPayouts(executor, values.affiliateId)).find(
    (payout) => payout.id === inserted.id,
  )!;
}

export async function tieRowsToPayout(
  executor: DatabaseExecutor,
  rowIds: readonly string[],
  payoutId: string,
): Promise<void> {
  if (rowIds.length === 0) return;
  await executor
    .updateTable("affiliate_commissions")
    .set({ payout_id: payoutId })
    .where("id", "in", [...rowIds])
    .where("payout_id", "is", null)
    .execute();
}

/** Clicks and sales by day, and earnings by product, between two moments. */
export async function statsBetween(
  executor: DatabaseExecutor,
  affiliateId: string,
  from: Date,
  to: Date,
) {
  const clicks = await executor
    .selectFrom("affiliate_clicks")
    .select([
      sql<string>`to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`.as(
        "day",
      ),
      sql<string>`count(*)`.as("clicks"),
    ])
    .where("affiliate_id", "=", affiliateId)
    .where("created_at", ">=", from)
    .where("created_at", "<", to)
    .groupBy("day")
    .execute();
  const sales = await executor
    .selectFrom("affiliate_commissions")
    .select([
      "order_item_id",
      "order_id",
      "payout_amount",
      "amount",
      "currency",
      "payout_currency",
      sql<string>`to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`.as(
        "day",
      ),
    ])
    .where("affiliate_id", "=", affiliateId)
    .where("kind", "=", "sale")
    .where("status", "<>", "rejected")
    .where("created_at", ">=", from)
    .where("created_at", "<", to)
    .execute();
  return {
    clicks: clicks.map((row) => ({ day: row.day, clicks: Number(row.clicks) })),
    sales,
  };
}
