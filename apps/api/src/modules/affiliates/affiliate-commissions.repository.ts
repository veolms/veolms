import type {
  AffiliateCommissionFlag,
  AffiliateCommissionStatus,
  AffiliateRateType,
  AffiliateRuleTargetType,
} from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";

import type { CommissionRule } from "./affiliate-commission.ts";

/**
 * Database access for the commission ledger (`affiliate_commissions`) and
 * the rules it is worked out from. Every write is safe to repeat: sales are
 * unique per order item, reversals per refund and sale.
 */

export interface OrderAttributionRow {
  affiliate_id: string;
  click_id: string | null;
  affiliate_user_id: string | null;
  affiliate_status: string;
  notify_on_commission: boolean;
}

export async function findOrderAttribution(
  executor: DatabaseExecutor,
  orderId: string,
): Promise<OrderAttributionRow | undefined> {
  return await executor
    .selectFrom("affiliate_order_attributions as t")
    .innerJoin("affiliates as a", "a.id", "t.affiliate_id")
    .select([
      "t.affiliate_id",
      "t.click_id",
      "a.user_id as affiliate_user_id",
      "a.status as affiliate_status",
      "a.notify_on_commission",
    ])
    .where("t.order_id", "=", orderId)
    .executeTakeFirst();
}

export async function findClickIpHash(
  executor: DatabaseExecutor,
  clickId: string,
): Promise<{ ip_hash: string; created_at: Date } | undefined> {
  return await executor
    .selectFrom("affiliate_clicks")
    .select(["ip_hash", "created_at"])
    .where("id", "=", clickId)
    .executeTakeFirst();
}

/** The live rules that could apply to an affiliate's sales. */
export async function listLiveRulesFor(
  executor: DatabaseExecutor,
  affiliateId: string,
): Promise<CommissionRule[]> {
  const rows = await executor
    .selectFrom("affiliate_commission_rules")
    .select([
      "id",
      "affiliate_id",
      "target_type",
      "target_id",
      "rate_type",
      "rate_value",
      "currency",
    ])
    .where("archived_at", "is", null)
    .where((eb) =>
      eb.or([
        eb("affiliate_id", "is", null),
        eb("affiliate_id", "=", affiliateId),
      ]),
    )
    .execute();
  return rows.map((row) => ({
    id: row.id,
    affiliateId: row.affiliate_id,
    targetType: row.target_type,
    targetId: row.target_id,
    rateType: row.rate_type,
    rateValue: row.rate_value,
    currency: row.currency,
  }));
}

export interface NewSaleCommission {
  affiliateId: string;
  orderId: string;
  orderItemId: string;
  currency: string;
  baseAmount: number;
  ruleId: string;
  rateType: AffiliateRateType;
  rateValue: number;
  amount: number;
  payoutCurrency: string;
  payoutAmount: number | null;
  availableAt: Date;
  flags: AffiliateCommissionFlag[];
}

/** Inserts sale rows; an item that already has a live sale row is skipped. */
export async function insertSaleCommissions(
  executor: DatabaseExecutor,
  rows: readonly NewSaleCommission[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await executor
    .insertInto("affiliate_commissions")
    .values(
      rows.map((row) => ({
        affiliate_id: row.affiliateId,
        kind: "sale" as const,
        status: "pending" as const,
        order_id: row.orderId,
        order_item_id: row.orderItemId,
        currency: row.currency,
        base_amount: row.baseAmount,
        rule_id: row.ruleId,
        rate_type: row.rateType,
        rate_value: row.rateValue,
        amount: row.amount,
        payout_currency: row.payoutCurrency,
        payout_amount: row.payoutAmount,
        available_at: row.availableAt,
        flags: row.flags,
      })),
    )
    .onConflict((conflict) =>
      conflict
        .column("order_item_id")
        .where("kind", "=", "sale")
        .where("status", "<>", "rejected")
        .doNothing(),
    )
    .returning("id")
    .execute();
  return inserted.length;
}

export interface SaleCommissionRow {
  id: string;
  affiliate_id: string;
  order_item_id: string;
  status: AffiliateCommissionStatus;
  currency: string;
  amount: number;
  payout_currency: string;
  payout_amount: number | null;
  available_at: Date;
  reversed: number;
}

/** An order's live sale rows, with how much of each is already reversed. */
export async function listSalesWithReversals(
  executor: DatabaseExecutor,
  orderId: string,
): Promise<SaleCommissionRow[]> {
  const rows = await executor
    .selectFrom("affiliate_commissions as s")
    .select([
      "s.id",
      "s.affiliate_id",
      "s.order_item_id",
      "s.status",
      "s.currency",
      "s.amount",
      "s.payout_currency",
      "s.payout_amount",
      "s.available_at",
      sql<string>`coalesce((
        select sum(r.amount) from affiliate_commissions r
        where r.parent_id = s.id and r.kind = 'reversal'
      ), 0)`.as("reversed"),
    ])
    .where("s.order_id", "=", orderId)
    .where("s.kind", "=", "sale")
    .execute();
  return rows.map((row) => ({
    ...row,
    order_item_id: row.order_item_id!,
    reversed: Number(row.reversed),
  }));
}

export interface NewReversal {
  affiliateId: string;
  orderId: string;
  orderItemId: string;
  refundId: string;
  parentId: string;
  currency: string;
  amount: number;
  payoutCurrency: string;
  payoutAmount: number | null;
  status: AffiliateCommissionStatus;
  availableAt: Date;
  approvedAt: Date | null;
}

/** Inserts reversal rows; one already written for a refund and sale is skipped. */
export async function insertReversals(
  executor: DatabaseExecutor,
  rows: readonly NewReversal[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await executor
    .insertInto("affiliate_commissions")
    .values(
      rows.map((row) => ({
        affiliate_id: row.affiliateId,
        kind: "reversal" as const,
        status: row.status,
        order_id: row.orderId,
        order_item_id: row.orderItemId,
        refund_id: row.refundId,
        parent_id: row.parentId,
        currency: row.currency,
        amount: row.amount,
        payout_currency: row.payoutCurrency,
        payout_amount: row.payoutAmount,
        available_at: row.availableAt,
        approved_at: row.approvedAt,
      })),
    )
    .onConflict((conflict) =>
      conflict
        .columns(["refund_id", "parent_id"])
        .where("kind", "=", "reversal")
        .doNothing(),
    )
    .returning("id")
    .execute();
  return inserted.length;
}

export interface DueCommissionRow {
  id: string;
  kind: string;
  order_id: string | null;
  currency: string;
  amount: number;
  payout_currency: string;
  payout_amount: number | null;
  parent_status: AffiliateCommissionStatus | null;
  parent_amount: number | null;
  parent_payout_amount: number | null;
}

/** Pending, unflagged rows whose hold period is over, oldest first. */
export async function listDueCommissions(
  executor: DatabaseExecutor,
  now: Date,
  limit: number,
): Promise<DueCommissionRow[]> {
  return await executor
    .selectFrom("affiliate_commissions as c")
    .leftJoin("affiliate_commissions as p", "p.id", "c.parent_id")
    .select([
      "c.id",
      "c.kind",
      "c.order_id",
      "c.currency",
      "c.amount",
      "c.payout_currency",
      "c.payout_amount",
      "p.status as parent_status",
      "p.amount as parent_amount",
      "p.payout_amount as parent_payout_amount",
    ])
    .where("c.status", "=", "pending")
    .where("c.available_at", "<=", now)
    .where(sql<boolean>`cardinality(c.flags) = 0`)
    // A reversal follows its sale: it is approved once the sale is.
    .where((eb) =>
      eb.or([eb("c.kind", "<>", "reversal"), eb("p.status", "=", "approved")]),
    )
    .orderBy("c.available_at")
    .limit(limit)
    .execute();
}

/** Approves a still-pending, unflagged row; false when something else moved it. */
export async function approveCommission(
  executor: DatabaseExecutor,
  id: string,
  payoutAmount: number,
  now: Date,
): Promise<boolean> {
  const updated = await executor
    .updateTable("affiliate_commissions")
    .set({
      status: "approved",
      approved_at: now,
      payout_amount: sql<number>`coalesce(payout_amount, ${payoutAmount})`,
    })
    .where("id", "=", id)
    .where("status", "=", "pending")
    .where(sql<boolean>`cardinality(flags) = 0`)
    .executeTakeFirst();
  return Number(updated.numUpdatedRows) > 0;
}

/** Adds a flag to pending rows (adding it twice changes nothing). */
export async function addFlag(
  executor: DatabaseExecutor,
  where: { id?: string; affiliateId?: string },
  flag: AffiliateCommissionFlag,
): Promise<number> {
  let query = executor
    .updateTable("affiliate_commissions")
    .set({ flags: sql`array_append(flags, ${flag})` })
    .where("status", "=", "pending")
    .where(sql<boolean>`not (${flag} = any(flags))`);
  if (where.id) query = query.where("id", "=", where.id);
  if (where.affiliateId) {
    query = query.where("affiliate_id", "=", where.affiliateId);
  }
  const updated = await query.executeTakeFirst();
  return Number(updated.numUpdatedRows);
}

/** Attributed orders made since a moment that have no sale row yet. */
export async function listAttributedOrdersWithoutSales(
  executor: DatabaseExecutor,
  since: Date,
  limit: number,
): Promise<string[]> {
  const rows = await executor
    .selectFrom("affiliate_order_attributions as t")
    .select("t.order_id")
    .where("t.created_at", ">=", since)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("affiliate_commissions as c")
            .select(sql`1`.as("one"))
            .whereRef("c.order_id", "=", "t.order_id")
            .where("c.kind", "=", "sale"),
        ),
      ),
    )
    .orderBy("t.created_at")
    .limit(limit)
    .execute();
  return rows.map((row) => row.order_id);
}

/** Whether an order has a live sale row a refund could reverse. */
export async function orderHasLiveSales(
  executor: DatabaseExecutor,
  orderId: string,
): Promise<boolean> {
  const row = await executor
    .selectFrom("affiliate_commissions")
    .select("id")
    .where("order_id", "=", orderId)
    .where("kind", "=", "sale")
    .where("status", "<>", "rejected")
    .executeTakeFirst();
  return row !== undefined;
}

/** Whether a refund already has its reversal rows. */
export async function refundHasReversals(
  executor: DatabaseExecutor,
  refundId: string,
): Promise<boolean> {
  const row = await executor
    .selectFrom("affiliate_commissions")
    .select("id")
    .where("refund_id", "=", refundId)
    .where("kind", "=", "reversal")
    .executeTakeFirst();
  return row !== undefined;
}

/** Affiliates with a pending row, to judge their refund rate. */
export async function listAffiliatesWithPendingRows(
  executor: DatabaseExecutor,
  limit: number,
): Promise<string[]> {
  const rows = await executor
    .selectFrom("affiliate_commissions")
    .select("affiliate_id")
    .distinct()
    .where("status", "=", "pending")
    .limit(limit)
    .execute();
  return rows.map((row) => row.affiliate_id);
}

/** An affiliate's latest sales, newest first, and whether each was refunded. */
export async function listLatestSales(
  executor: DatabaseExecutor,
  affiliateId: string,
  count: number,
): Promise<{ refunded: boolean }[]> {
  const rows = await executor
    .selectFrom("affiliate_commissions as s")
    .select(
      sql<boolean>`exists (
        select 1 from affiliate_commissions r
        where r.parent_id = s.id and r.kind = 'reversal'
      )`.as("refunded"),
    )
    .where("s.affiliate_id", "=", affiliateId)
    .where("s.kind", "=", "sale")
    .where("s.status", "<>", "rejected")
    .orderBy("s.created_at", "desc")
    .limit(count)
    .execute();
  return rows.map((row) => ({ refunded: Boolean(row.refunded) }));
}

/** Deletes clicks older than a moment, a batch at a time. */
export async function deleteClicksBefore(
  executor: DatabaseExecutor,
  before: Date,
  batch: number,
): Promise<number> {
  const result = await sql<{ count: string }>`
    with gone as (
      delete from affiliate_clicks
      where id in (
        select id from affiliate_clicks where created_at < ${before}
        order by created_at limit ${batch}
      )
      returning 1
    )
    select count(*)::text as count from gone
  `.execute(executor);
  return Number(result.rows[0]?.count ?? 0);
}

export interface AffiliateUserRow {
  user_id: string | null;
  status: string;
  notify_on_commission: boolean;
}

export async function findAffiliateUser(
  executor: DatabaseExecutor,
  affiliateId: string,
): Promise<AffiliateUserRow | undefined> {
  return await executor
    .selectFrom("affiliates")
    .select(["user_id", "status", "notify_on_commission"])
    .where("id", "=", affiliateId)
    .executeTakeFirst();
}

export type { AffiliateRuleTargetType };
