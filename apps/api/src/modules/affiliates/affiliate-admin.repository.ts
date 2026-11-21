import type {
  AffiliateCommissionFlag,
  AffiliateCommissionKind,
  AffiliateCommissionStatus,
  AffiliatePayoutStatus,
  AffiliateRateType,
  AffiliateRuleTargetType,
  AffiliateStatus,
} from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";

import type { AffiliateRow } from "./affiliate-account.repository.ts";

/**
 * Database access for the academy admin's side of the program. In the
 * cloud every query runs under the academy's row-level security, so an id
 * from another academy finds nothing (a 404), as in core's single academy.
 */

// ------------------------------------------------------------ audit

export async function insertAudit(
  executor: DatabaseExecutor,
  entry: {
    actorUserId: string | null;
    action: string;
    subjectType:
      "affiliate" | "commission" | "payout" | "rule" | "order" | "program";
    subjectId: string;
    /** Never PAN, bank or UPI details. */
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await executor
    .insertInto("affiliate_audit_log")
    .values({
      actor_user_id: entry.actorUserId,
      action: entry.action,
      subject_type: entry.subjectType,
      subject_id: entry.subjectId,
      data: JSON.stringify(entry.data ?? {}),
    })
    .execute();
}

export async function listAudit(
  executor: DatabaseExecutor,
  options: { subjectId?: string; limit: number },
) {
  let query = executor
    .selectFrom("affiliate_audit_log")
    .select([
      "id",
      "actor_user_id",
      "action",
      "subject_type",
      "subject_id",
      "data",
      "created_at",
    ]);
  if (options.subjectId) {
    query = query.where("subject_id", "=", options.subjectId);
  }
  return await query
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(options.limit)
    .execute();
}

// ------------------------------------------------------------ affiliates

export async function findAffiliateById(
  executor: DatabaseExecutor,
  id: string,
): Promise<AffiliateRow | undefined> {
  return await executor
    .selectFrom("affiliates")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

/** Moves an affiliate between statuses; undefined when it was not in `from`. */
export async function changeStatus(
  executor: DatabaseExecutor,
  id: string,
  change: {
    from: readonly AffiliateStatus[];
    to: AffiliateStatus;
    reason: string | null;
    decidedBy: string;
    now: Date;
  },
): Promise<AffiliateRow | undefined> {
  return await executor
    .updateTable("affiliates")
    .set({
      status: change.to,
      status_reason: change.reason,
      decided_by: change.decidedBy,
      decided_at: change.now,
      updated_at: change.now,
    })
    .where("id", "=", id)
    .where("status", "in", [...change.from])
    .returningAll()
    .executeTakeFirst();
}

export async function insertInvitation(
  executor: DatabaseExecutor,
  values: { email: string; code: string; invitedBy: string; now: Date },
): Promise<AffiliateRow> {
  return await executor
    .insertInto("affiliates")
    .values({
      user_id: null,
      invited_email: values.email,
      code: values.code,
      status: "pending",
      decided_by: values.invitedBy,
      created_at: values.now,
      updated_at: values.now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findAffiliateByInvitedEmail(
  executor: DatabaseExecutor,
  email: string,
): Promise<AffiliateRow | undefined> {
  return await executor
    .selectFrom("affiliates")
    .selectAll()
    .where("invited_email", "=", email)
    .executeTakeFirst();
}

export interface AffiliateListRow extends AffiliateRow {
  clicks: number;
  sales: number;
  earned: number;
  available: number;
  flagged: number;
}

const totals = {
  clicks: sql<string>`(select count(*) from affiliate_clicks k where k.affiliate_id = a.id)`,
  sales: sql<string>`(select count(distinct c.order_id) from affiliate_commissions c
    where c.affiliate_id = a.id and c.kind = 'sale' and c.status <> 'rejected')`,
  earned: sql<string>`(select coalesce(sum(c.payout_amount), 0) from affiliate_commissions c
    where c.affiliate_id = a.id and c.status <> 'rejected')`,
  available: sql<string>`(select coalesce(sum(c.payout_amount), 0) from affiliate_commissions c
    where c.affiliate_id = a.id and c.status = 'approved' and c.payout_id is null)`,
  flagged: sql<string>`(select count(*) from affiliate_commissions c
    where c.affiliate_id = a.id and c.status = 'pending' and cardinality(c.flags) > 0)`,
};

function toListRow(
  row: AffiliateRow & Record<keyof typeof totals, string>,
): AffiliateListRow {
  return {
    ...row,
    clicks: Number(row.clicks),
    sales: Number(row.sales),
    earned: Number(row.earned),
    available: Number(row.available),
    flagged: Number(row.flagged),
  };
}

export async function findAffiliateWithTotals(
  executor: DatabaseExecutor,
  id: string,
): Promise<AffiliateListRow | undefined> {
  const row = await executor
    .selectFrom("affiliates as a")
    .selectAll("a")
    .select([
      totals.clicks.as("clicks"),
      totals.sales.as("sales"),
      totals.earned.as("earned"),
      totals.available.as("available"),
      totals.flagged.as("flagged"),
    ])
    .where("a.id", "=", id)
    .executeTakeFirst();
  return row ? toListRow(row as never) : undefined;
}

/** Approved affiliates (for coupons when the buyer discount changes). */
export async function listApprovedAffiliates(
  executor: DatabaseExecutor,
): Promise<AffiliateRow[]> {
  return await executor
    .selectFrom("affiliates")
    .selectAll()
    .where("status", "=", "approved")
    .execute();
}

export async function listAffiliateCouponIds(
  executor: DatabaseExecutor,
): Promise<string[]> {
  const rows = await executor
    .selectFrom("affiliates")
    .select("coupon_id")
    .where("coupon_id", "is not", null)
    .execute();
  return rows.map((row) => row.coupon_id!);
}

export async function findCoupon(
  executor: DatabaseExecutor,
  couponId: string,
): Promise<{ code: string; is_active: boolean } | undefined> {
  return await executor
    .selectFrom("coupons")
    .select(["code", "is_active"])
    .where("id", "=", couponId)
    .executeTakeFirst();
}

/** Holds an affiliate's pending commissions for review (suspension). */
export async function flagPendingRows(
  executor: DatabaseExecutor,
  affiliateId: string,
  flag: AffiliateCommissionFlag,
): Promise<number> {
  const updated = await executor
    .updateTable("affiliate_commissions")
    .set({ flags: sql`array_append(flags, ${flag})` })
    .where("affiliate_id", "=", affiliateId)
    .where("status", "=", "pending")
    .where(sql<boolean>`not (${flag} = any(flags))`)
    .executeTakeFirst();
  return Number(updated.numUpdatedRows);
}

/** Lifts one flag from an affiliate's pending rows (reinstatement). */
export async function unflagPendingRows(
  executor: DatabaseExecutor,
  affiliateId: string,
  flag: AffiliateCommissionFlag,
): Promise<number> {
  const updated = await executor
    .updateTable("affiliate_commissions")
    .set({ flags: sql`array_remove(flags, ${flag})` })
    .where("affiliate_id", "=", affiliateId)
    .where("status", "=", "pending")
    .where(sql<boolean>`${flag} = any(flags)`)
    .executeTakeFirst();
  return Number(updated.numUpdatedRows);
}

// ------------------------------------------------------------ rules

export interface RuleRow {
  id: string;
  affiliate_id: string | null;
  affiliate_code: string | null;
  target_type: AffiliateRuleTargetType | null;
  target_id: string | null;
  rate_type: AffiliateRateType;
  rate_value: number;
  currency: string | null;
  created_at: Date;
}

function rulesQuery(executor: DatabaseExecutor) {
  return executor
    .selectFrom("affiliate_commission_rules as r")
    .leftJoin("affiliates as a", "a.id", "r.affiliate_id")
    .select([
      "r.id",
      "r.affiliate_id",
      "a.code as affiliate_code",
      "r.target_type",
      "r.target_id",
      "r.rate_type",
      "r.rate_value",
      "r.currency",
      "r.created_at",
    ])
    .where("r.archived_at", "is", null);
}

export async function listLiveRules(
  executor: DatabaseExecutor,
): Promise<RuleRow[]> {
  return await rulesQuery(executor)
    .orderBy(sql`r.affiliate_id is not null`)
    .orderBy(sql`r.target_type is not null`)
    .orderBy("r.created_at", "desc")
    .execute();
}

export async function findLiveRuleById(
  executor: DatabaseExecutor,
  id: string,
): Promise<RuleRow | undefined> {
  return await rulesQuery(executor).where("r.id", "=", id).executeTakeFirst();
}

/** Archives the live rule for exactly this scope, if there is one. */
export async function archiveRuleForScope(
  executor: DatabaseExecutor,
  scope: {
    affiliateId: string | null;
    targetType: AffiliateRuleTargetType | null;
    targetId: string | null;
  },
  now: Date,
): Promise<string | undefined> {
  const archived = await executor
    .updateTable("affiliate_commission_rules")
    .set({ archived_at: now })
    .where("archived_at", "is", null)
    .where(
      "affiliate_id",
      scope.affiliateId === null ? "is" : "=",
      scope.affiliateId,
    )
    .where(
      "target_type",
      scope.targetType === null ? "is" : "=",
      scope.targetType,
    )
    .where("target_id", scope.targetId === null ? "is" : "=", scope.targetId)
    .returning("id")
    .executeTakeFirst();
  return archived?.id;
}

export async function archiveRule(
  executor: DatabaseExecutor,
  id: string,
  now: Date,
): Promise<boolean> {
  const updated = await executor
    .updateTable("affiliate_commission_rules")
    .set({ archived_at: now })
    .where("id", "=", id)
    .where("archived_at", "is", null)
    .executeTakeFirst();
  return Number(updated.numUpdatedRows) > 0;
}

export async function insertRule(
  executor: DatabaseExecutor,
  rule: {
    affiliateId: string | null;
    targetType: AffiliateRuleTargetType | null;
    targetId: string | null;
    rateType: AffiliateRateType;
    rateValue: number;
    currency: string | null;
    createdBy: string | null;
    now: Date;
  },
): Promise<string> {
  const row = await executor
    .insertInto("affiliate_commission_rules")
    .values({
      affiliate_id: rule.affiliateId,
      target_type: rule.targetType,
      target_id: rule.targetId,
      rate_type: rule.rateType,
      rate_value: rule.rateValue,
      currency: rule.currency,
      created_by: rule.createdBy,
      created_at: rule.now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

// ------------------------------------------------------------ commissions

export interface AdminCommissionRow {
  id: string;
  affiliate_id: string;
  affiliate_code: string;
  affiliate_user_id: string | null;
  kind: AffiliateCommissionKind;
  status: AffiliateCommissionStatus;
  flags: AffiliateCommissionFlag[];
  order_id: string | null;
  order_item_id: string | null;
  parent_id: string | null;
  currency: string;
  base_amount: number;
  rate_type: AffiliateRateType | null;
  rate_value: number | null;
  amount: number;
  payout_currency: string;
  payout_amount: number | null;
  payout_id: string | null;
  paid_at: Date | null;
  available_at: Date;
  note: string | null;
  created_at: Date;
}

function commissionsQuery(executor: DatabaseExecutor) {
  return executor
    .selectFrom("affiliate_commissions as c")
    .innerJoin("affiliates as a", "a.id", "c.affiliate_id")
    .select([
      "c.id",
      "c.affiliate_id",
      "a.code as affiliate_code",
      "a.user_id as affiliate_user_id",
      "c.kind",
      "c.status",
      "c.flags",
      "c.order_id",
      "c.order_item_id",
      "c.parent_id",
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
      "c.created_at",
    ]);
}

export async function findCommission(
  executor: DatabaseExecutor,
  id: string,
  options: { lock?: boolean } = {},
): Promise<AdminCommissionRow | undefined> {
  let query = commissionsQuery(executor).where("c.id", "=", id);
  if (options.lock) query = query.forUpdate("c");
  return (await query.executeTakeFirst()) as AdminCommissionRow | undefined;
}

/** The admin approves a pending row early, flags or not. */
export async function approveCommissionEarly(
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
    .executeTakeFirst();
  return Number(updated.numUpdatedRows) > 0;
}

/** Rejects pending rows not in any payout; returns the ids it rejected. */
export async function rejectPendingRows(
  executor: DatabaseExecutor,
  where: { ids?: readonly string[]; parentIds?: readonly string[] },
  note: string,
): Promise<string[]> {
  if (!where.ids?.length && !where.parentIds?.length) return [];
  const rows = await executor
    .updateTable("affiliate_commissions")
    .set({ status: "rejected", note })
    .where("status", "=", "pending")
    .where("payout_id", "is", null)
    .where((eb) =>
      eb.or([
        ...(where.ids?.length ? [eb("id", "in", [...where.ids])] : []),
        ...(where.parentIds?.length
          ? [eb("parent_id", "in", [...where.parentIds])]
          : []),
      ]),
    )
    .returning("id")
    .execute();
  return rows.map((row) => row.id);
}

export async function insertAdjustment(
  executor: DatabaseExecutor,
  values: {
    affiliateId: string;
    currency: string;
    amount: number;
    note: string;
    createdBy: string;
    now: Date;
  },
): Promise<string> {
  const row = await executor
    .insertInto("affiliate_commissions")
    .values({
      affiliate_id: values.affiliateId,
      kind: "adjustment",
      status: "approved",
      currency: values.currency,
      amount: values.amount,
      payout_currency: values.currency,
      payout_amount: values.amount,
      available_at: values.now,
      approved_at: values.now,
      note: values.note,
      created_by: values.createdBy,
      created_at: values.now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

// ------------------------------------------------------------ attribution

export async function findAttribution(
  executor: DatabaseExecutor,
  orderId: string,
) {
  return await executor
    .selectFrom("affiliate_order_attributions")
    .selectAll()
    .where("order_id", "=", orderId)
    .forUpdate()
    .executeTakeFirst();
}

/** The order's live commissions (sales and their reversals). */
export async function listOrderCommissions(
  executor: DatabaseExecutor,
  orderId: string,
) {
  return await executor
    .selectFrom("affiliate_commissions")
    .select(["id", "kind", "status", "payout_id", "affiliate_id"])
    .where("order_id", "=", orderId)
    .where("status", "<>", "rejected")
    .forUpdate()
    .execute();
}

export async function deleteAttribution(
  executor: DatabaseExecutor,
  orderId: string,
): Promise<void> {
  await executor
    .deleteFrom("affiliate_order_attributions")
    .where("order_id", "=", orderId)
    .execute();
}

export async function setManualAttribution(
  executor: DatabaseExecutor,
  values: {
    orderId: string;
    affiliateId: string;
    changedBy: string;
    now: Date;
  },
): Promise<void> {
  await executor
    .insertInto("affiliate_order_attributions")
    .values({
      order_id: values.orderId,
      affiliate_id: values.affiliateId,
      source: "manual",
      click_id: null,
      coupon_id: null,
      created_at: values.now,
      changed_by: values.changedBy,
      changed_at: values.now,
    })
    .onConflict((conflict) =>
      conflict.column("order_id").doUpdateSet({
        affiliate_id: values.affiliateId,
        source: "manual",
        click_id: null,
        coupon_id: null,
        changed_by: values.changedBy,
        changed_at: values.now,
      }),
    )
    .execute();
}

// ------------------------------------------------------------ payouts

export interface AdminPayoutRow {
  id: string;
  affiliate_id: string;
  affiliate_code: string;
  affiliate_user_id: string | null;
  affiliate_pan_last4: string | null;
  status: AffiliatePayoutStatus;
  currency: string;
  gross_amount: number;
  tds_amount: number;
  net_amount: number;
  payout_method: "upi" | "bank";
  payout_details_encrypted: string;
  payout_details_hint: string | null;
  requested_by: "affiliate" | "admin";
  reference: string | null;
  paid_on: string | null;
  reason: string | null;
  note: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  created_at: Date;
}

function payoutsQuery(executor: DatabaseExecutor) {
  return executor
    .selectFrom("affiliate_payouts as p")
    .innerJoin("affiliates as a", "a.id", "p.affiliate_id")
    .select([
      "p.id",
      "p.affiliate_id",
      "a.code as affiliate_code",
      "a.user_id as affiliate_user_id",
      "a.pan_last4 as affiliate_pan_last4",
      "p.status",
      "p.currency",
      "p.gross_amount",
      "p.tds_amount",
      "p.net_amount",
      "p.payout_method",
      "p.payout_details_encrypted",
      "p.payout_details_hint",
      "p.requested_by",
      "p.reference",
      "p.paid_on",
      "p.reason",
      "p.note",
      "p.decided_by",
      "p.decided_at",
      "p.created_at",
    ]);
}

export async function findPayout(
  executor: DatabaseExecutor,
  id: string,
  options: { lock?: boolean } = {},
): Promise<AdminPayoutRow | undefined> {
  let query = payoutsQuery(executor).where("p.id", "=", id);
  if (options.lock) query = query.forUpdate("p");
  return (await query.executeTakeFirst()) as AdminPayoutRow | undefined;
}

/** Marks an open payout paid; false when it was not open any more. */
export async function markPayoutPaid(
  executor: DatabaseExecutor,
  id: string,
  values: {
    reference: string;
    paidOn: string;
    tds: number;
    net: number;
    note: string | null;
    decidedBy: string;
    now: Date;
  },
): Promise<boolean> {
  const updated = await executor
    .updateTable("affiliate_payouts")
    .set({
      status: "paid",
      reference: values.reference,
      paid_on: values.paidOn,
      tds_amount: values.tds,
      net_amount: values.net,
      note: values.note,
      decided_by: values.decidedBy,
      decided_at: values.now,
    })
    .where("id", "=", id)
    .where("status", "=", "requested")
    .executeTakeFirst();
  return Number(updated.numUpdatedRows) > 0;
}

export async function closePayout(
  executor: DatabaseExecutor,
  id: string,
  values: {
    status: "rejected" | "failed";
    reason: string;
    decidedBy: string;
    now: Date;
  },
): Promise<boolean> {
  const updated = await executor
    .updateTable("affiliate_payouts")
    .set({
      status: values.status,
      reason: values.reason,
      decided_by: values.decidedBy,
      decided_at: values.now,
    })
    .where("id", "=", id)
    .where("status", "=", "requested")
    .executeTakeFirst();
  return Number(updated.numUpdatedRows) > 0;
}

export async function markPayoutRowsPaid(
  executor: DatabaseExecutor,
  payoutId: string,
  paidAt: Date,
): Promise<void> {
  await executor
    .updateTable("affiliate_commissions")
    .set({ paid_at: paidAt })
    .where("payout_id", "=", payoutId)
    .where("paid_at", "is", null)
    .execute();
}

/** Rejected and failed payouts give their rows back to the available balance. */
export async function releasePayoutRows(
  executor: DatabaseExecutor,
  payoutId: string,
): Promise<void> {
  await executor
    .updateTable("affiliate_commissions")
    .set({ payout_id: null })
    .where("payout_id", "=", payoutId)
    .where("paid_at", "is", null)
    .execute();
}

/** Gross paid to an affiliate between two days (a financial year). */
export async function sumPaidGrossBetween(
  executor: DatabaseExecutor,
  affiliateIds: readonly string[],
  from: string,
  to: string,
): Promise<Map<string, number>> {
  if (affiliateIds.length === 0) return new Map();
  const rows = await executor
    .selectFrom("affiliate_payouts")
    .select([
      "affiliate_id",
      sql<string>`coalesce(sum(gross_amount), 0)`.as("gross"),
    ])
    .where("affiliate_id", "in", [...affiliateIds])
    .where("status", "=", "paid")
    .where("paid_on", ">=", from)
    .where("paid_on", "<=", to)
    .groupBy("affiliate_id")
    .execute();
  return new Map(rows.map((row) => [row.affiliate_id, Number(row.gross)]));
}

/** Payouts requested more than `days` ago and still open. */
export async function listOverduePayouts(
  executor: DatabaseExecutor,
  before: Date,
) {
  return await executor
    .selectFrom("affiliate_payouts as p")
    .innerJoin("affiliates as a", "a.id", "p.affiliate_id")
    .select(["p.id", "p.gross_amount", "p.currency", "p.created_at", "a.code"])
    .where("p.status", "=", "requested")
    .where("p.created_at", "<", before)
    .orderBy("p.created_at")
    .limit(200)
    .execute();
}

// ------------------------------------------------------------ reports

export async function reportTotals(
  executor: DatabaseExecutor,
  from: Date,
  to: Date,
) {
  const commissions = await executor
    .selectFrom("affiliate_commissions")
    .select([
      sql<string>`coalesce(sum(payout_amount) filter (where kind in ('sale', 'reversal') and status <> 'rejected' and created_at >= ${from} and created_at < ${to}), 0)`.as(
        "earned",
      ),
      sql<string>`coalesce(sum(payout_amount) filter (where status = 'approved' and payout_id is null), 0)`.as(
        "owed",
      ),
      sql<string>`coalesce(sum(coalesce(payout_amount, 0)) filter (where status = 'pending'), 0)`.as(
        "pending",
      ),
      sql<string>`count(*) filter (where status = 'pending' and cardinality(flags) > 0 and not ('no_settlement' = any(flags)))`.as(
        "held",
      ),
      sql<string>`count(*) filter (where status = 'pending' and 'no_settlement' = any(flags))`.as(
        "no_settlement",
      ),
    ])
    .executeTakeFirstOrThrow();
  const clicks = await executor
    .selectFrom("affiliate_clicks")
    .select([
      sql<string>`count(*)`.as("clicks"),
      sql<string>`count(distinct affiliate_id)`.as("active"),
    ])
    .where("created_at", ">=", from)
    .where("created_at", "<", to)
    .executeTakeFirstOrThrow();
  const payouts = await executor
    .selectFrom("affiliate_payouts")
    .select([
      sql<string>`coalesce(sum(gross_amount) filter (where status = 'paid' and decided_at >= ${from} and decided_at < ${to}), 0)`.as(
        "paid",
      ),
      sql<string>`count(*) filter (where status = 'requested' and created_at < now() - interval '7 days')`.as(
        "overdue",
      ),
    ])
    .executeTakeFirstOrThrow();
  const applications = await executor
    .selectFrom("affiliates")
    .select(sql<string>`count(*)`.as("pending"))
    .where("status", "=", "pending")
    .where("user_id", "is not", null)
    .executeTakeFirstOrThrow();
  return {
    earned: Number(commissions.earned),
    owed: Number(commissions.owed),
    pending: Number(commissions.pending),
    held: Number(commissions.held),
    noSettlement: Number(commissions.no_settlement),
    clicks: Number(clicks.clicks),
    activeAffiliates: Number(clicks.active),
    paidOut: Number(payouts.paid),
    overduePayouts: Number(payouts.overdue),
    pendingApplications: Number(applications.pending),
  };
}

export async function topAffiliates(
  executor: DatabaseExecutor,
  from: Date,
  to: Date,
  limit = 5,
) {
  const rows = await executor
    .selectFrom("affiliate_commissions as c")
    .innerJoin("affiliates as a", "a.id", "c.affiliate_id")
    .select([
      "a.id",
      "a.code",
      "a.user_id",
      sql<string>`count(distinct c.order_id) filter (where c.kind = 'sale')`.as(
        "orders",
      ),
      sql<string>`coalesce(sum(c.payout_amount), 0)`.as("earned"),
    ])
    .where("c.kind", "in", ["sale", "reversal"])
    .where("c.status", "<>", "rejected")
    .where("c.created_at", ">=", from)
    .where("c.created_at", "<", to)
    .groupBy(["a.id", "a.code", "a.user_id"])
    .orderBy(sql`coalesce(sum(c.payout_amount), 0)`, "desc")
    .limit(limit)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    userId: row.user_id,
    orders: Number(row.orders),
    earned: Number(row.earned),
  }));
}

// ------------------------------------------------------------ retention

const NO_PAYOUT_DETAILS = {
  payout_method: null,
  payout_details_encrypted: null,
  payout_details_hint: null,
  pan_encrypted: null,
  pan_last4: null,
} as const;

/** Forgets an affiliate's payout details and PAN (not while a payout is open). */
export async function clearPayoutDetails(
  executor: DatabaseExecutor,
  affiliateId: string,
): Promise<boolean> {
  const updated = await executor
    .updateTable("affiliates")
    .set({ ...NO_PAYOUT_DETAILS, updated_at: new Date() })
    .where("id", "=", affiliateId)
    .where("payout_details_encrypted", "is not", null)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("affiliate_payouts as p")
            .select("p.id")
            .whereRef("p.affiliate_id", "=", "affiliates.id")
            .where("p.status", "=", "requested"),
        ),
      ),
    )
    .executeTakeFirst();
  return Number(updated.numUpdatedRows) > 0;
}

/**
 * Payout details kept past their use (PRD section 15.4): a rejected
 * applicant's, and those of an affiliate with no payout and no commission
 * for 24 months. Never while a payout is open. Returns how many.
 */
export async function purgeStalePayoutDetails(
  executor: DatabaseExecutor,
  before: Date,
): Promise<number> {
  const updated = await executor
    .updateTable("affiliates as a")
    .set({ ...NO_PAYOUT_DETAILS, updated_at: new Date() })
    .where("a.payout_details_encrypted", "is not", null)
    .where(
      sql<boolean>`not exists (select 1 from affiliate_payouts p
        where p.affiliate_id = a.id and p.status = 'requested')`,
    )
    .where((eb) =>
      eb.or([
        eb("a.status", "=", "rejected"),
        eb.and([
          eb("a.created_at", "<", before),
          sql<boolean>`not exists (select 1 from affiliate_payouts p
            where p.affiliate_id = a.id
              and coalesce(p.decided_at, p.created_at) >= ${before})`,
          sql<boolean>`not exists (select 1 from affiliate_commissions c
            where c.affiliate_id = a.id and c.created_at >= ${before})`,
        ]),
      ]),
    )
    .executeTakeFirst();
  return Number(updated.numUpdatedRows);
}

/** Approved or pending affiliates with an account, for the closed-account check. */
export async function listActiveAffiliateAccounts(
  executor: DatabaseExecutor,
): Promise<{ id: string; user_id: string; coupon_id: string | null }[]> {
  const rows = await executor
    .selectFrom("affiliates")
    .select(["id", "user_id", "coupon_id"])
    .where("status", "in", ["approved", "pending"])
    .where("user_id", "is not", null)
    .execute();
  return rows as { id: string; user_id: string; coupon_id: string | null }[];
}

/** Suspends an affiliate whose account was closed; false if it moved first. */
export async function suspendForClosedAccount(
  executor: DatabaseExecutor,
  affiliateId: string,
  now: Date,
): Promise<{ coupon_id: string | null } | undefined> {
  return await executor
    .updateTable("affiliates")
    .set({
      status: "suspended",
      status_reason: "The affiliate's account was closed.",
      decided_by: null,
      decided_at: now,
      updated_at: now,
    })
    .where("id", "=", affiliateId)
    .where("status", "in", ["approved", "pending"])
    .returning("coupon_id")
    .executeTakeFirst();
}

export interface AffiliateHealth {
  clicksLastHour: number;
  attributionsLastHour: Record<string, number>;
  salesLastHour: number;
  reversalsLastHour: number;
  /** Minutes the oldest due, unflagged pending commission has waited. */
  approvalLagMinutes: number;
}

/** The numbers the health log line carries (PRD section 16, Observability). */
export async function readHealth(
  executor: DatabaseExecutor,
  now: Date,
): Promise<AffiliateHealth> {
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const [clicks, attributions, ledger] = await Promise.all([
    executor
      .selectFrom("affiliate_clicks")
      .select(sql<string>`count(*)`.as("n"))
      .where("created_at", ">=", hourAgo)
      .executeTakeFirstOrThrow(),
    executor
      .selectFrom("affiliate_order_attributions")
      .select(["source", sql<string>`count(*)`.as("n")])
      .where("created_at", ">=", hourAgo)
      .groupBy("source")
      .execute(),
    executor
      .selectFrom("affiliate_commissions")
      .select([
        sql<string>`count(*) filter (where kind = 'sale' and created_at >= ${hourAgo})`.as(
          "sales",
        ),
        sql<string>`count(*) filter (where kind = 'reversal' and created_at >= ${hourAgo})`.as(
          "reversals",
        ),
        sql<Date | null>`min(available_at) filter (where status = 'pending' and cardinality(flags) = 0 and available_at <= ${now})`.as(
          "oldest_due",
        ),
      ])
      .executeTakeFirstOrThrow(),
  ]);
  const oldest = ledger.oldest_due ? new Date(ledger.oldest_due) : null;
  return {
    clicksLastHour: Number(clicks.n),
    attributionsLastHour: Object.fromEntries(
      attributions.map((row) => [row.source, Number(row.n)]),
    ),
    salesLastHour: Number(ledger.sales),
    reversalsLastHour: Number(ledger.reversals),
    approvalLagMinutes: oldest
      ? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 60_000))
      : 0,
  };
}

// ------------------------------------------------------------ paged lists
//
// The admin's tables: page numbers with a total, several statuses at once,
// a date range and a search, and the figures for the same filters.

const escapeLike = (text: string) =>
  `%${text.toLowerCase().replace(/[\\%_]/gu, (c) => `\\${c}`)}%`;

export interface AffiliatePageFilters {
  statuses?: readonly AffiliateStatus[];
  text?: string;
  userIds?: readonly string[];
  owed?: boolean;
  flagged?: boolean;
  from?: Date;
  to?: Date;
}

export type AffiliatePageSort =
  "newest" | "oldest" | "earned" | "owed" | "sales" | "clicks";

function affiliateFilters(
  filters: AffiliatePageFilters,
  options: { withStatus: boolean },
) {
  const parts: ReturnType<typeof sql<boolean>>[] = [];
  if (options.withStatus && filters.statuses?.length) {
    parts.push(sql<boolean>`a.status in (${sql.join(filters.statuses)})`);
  }
  if (filters.text) {
    const pattern = escapeLike(filters.text);
    const byUser = filters.userIds?.length
      ? sql` or a.user_id in (${sql.join(filters.userIds)})`
      : sql``;
    parts.push(
      sql<boolean>`(a.code like ${pattern} or a.invited_email like ${pattern}${byUser})`,
    );
  }
  if (filters.owed) {
    parts.push(sql<boolean>`exists (select 1 from affiliate_commissions c
      where c.affiliate_id = a.id and c.status = 'approved' and c.payout_id is null)`);
  }
  if (filters.flagged) {
    parts.push(sql<boolean>`exists (select 1 from affiliate_commissions c
      where c.affiliate_id = a.id and c.status = 'pending' and cardinality(c.flags) > 0)`);
  }
  if (filters.from) parts.push(sql<boolean>`a.created_at >= ${filters.from}`);
  if (filters.to) parts.push(sql<boolean>`a.created_at < ${filters.to}`);
  return parts.length
    ? sql<boolean>`${sql.join(parts, sql` and `)}`
    : sql<boolean>`true`;
}

const AFFILIATE_SORT_SQL: Record<AffiliatePageSort, ReturnType<typeof sql>> = {
  newest: sql`a.created_at desc, a.id desc`,
  oldest: sql`a.created_at asc, a.id asc`,
  earned: sql`earned desc, a.created_at desc`,
  owed: sql`available desc, a.created_at desc`,
  sales: sql`sales desc, a.created_at desc`,
  clicks: sql`clicks desc, a.created_at desc`,
};

/** A page of affiliates with their totals, the total, and the status counts. */
export async function pageAffiliates(
  executor: DatabaseExecutor,
  filters: AffiliatePageFilters,
  sort: AffiliatePageSort,
  page: { offset: number; limit: number },
): Promise<{
  rows: AffiliateListRow[];
  total: number;
  counts: Record<AffiliateStatus, number>;
}> {
  const where = affiliateFilters(filters, { withStatus: true });
  const [rows, total, counts] = await Promise.all([
    executor
      .selectFrom("affiliates as a")
      .selectAll("a")
      .select([
        totals.clicks.as("clicks"),
        totals.sales.as("sales"),
        totals.earned.as("earned"),
        totals.available.as("available"),
        totals.flagged.as("flagged"),
      ])
      .where(where)
      .orderBy(AFFILIATE_SORT_SQL[sort])
      .offset(page.offset)
      .limit(page.limit)
      .execute(),
    executor
      .selectFrom("affiliates as a")
      .select(sql<string>`count(*)`.as("n"))
      .where(where)
      .executeTakeFirstOrThrow(),
    executor
      .selectFrom("affiliates as a")
      .select(["a.status", sql<string>`count(*)`.as("n")])
      .where(affiliateFilters(filters, { withStatus: false }))
      .groupBy("a.status")
      .execute(),
  ]);
  const byStatus = { pending: 0, approved: 0, suspended: 0, rejected: 0 };
  for (const row of counts) byStatus[row.status] = Number(row.n);
  return {
    rows: rows.map((row) => toListRow(row as never)),
    total: Number(total.n),
    counts: byStatus,
  };
}

export type CommissionState =
  "held" | "pending" | "owed" | "in_payout" | "paid" | "rejected";

const COMMISSION_STATE_SQL: Record<
  CommissionState,
  ReturnType<typeof sql<boolean>>
> = {
  held: sql<boolean>`(c.status = 'pending' and cardinality(c.flags) > 0)`,
  pending: sql<boolean>`(c.status = 'pending' and cardinality(c.flags) = 0)`,
  owed: sql<boolean>`(c.status = 'approved' and c.payout_id is null)`,
  in_payout: sql<boolean>`(c.payout_id is not null and c.paid_at is null)`,
  paid: sql<boolean>`(c.paid_at is not null)`,
  rejected: sql<boolean>`(c.status = 'rejected')`,
};

export interface CommissionPageFilters {
  states?: readonly CommissionState[];
  kinds?: readonly AffiliateCommissionKind[];
  affiliateIds?: readonly string[];
  from?: Date;
  to?: Date;
  text?: string;
}

function commissionFilters(
  filters: CommissionPageFilters,
  options: { withState: boolean },
) {
  const parts: ReturnType<typeof sql<boolean>>[] = [];
  if (options.withState && filters.states?.length) {
    parts.push(
      sql<boolean>`(${sql.join(
        filters.states.map((state) => COMMISSION_STATE_SQL[state]),
        sql` or `,
      )})`,
    );
  }
  if (filters.kinds?.length) {
    parts.push(sql<boolean>`c.kind in (${sql.join(filters.kinds)})`);
  }
  if (filters.affiliateIds?.length) {
    parts.push(
      sql<boolean>`c.affiliate_id in (${sql.join(filters.affiliateIds)})`,
    );
  }
  if (filters.from) parts.push(sql<boolean>`c.created_at >= ${filters.from}`);
  if (filters.to) parts.push(sql<boolean>`c.created_at < ${filters.to}`);
  if (filters.text) {
    const pattern = escapeLike(filters.text);
    parts.push(sql<boolean>`(
      a.code like ${pattern}
      or exists (select 1 from orders o where o.id = c.order_id
        and lower(o.order_number) like ${pattern})
      or exists (select 1 from orders o join users u on u.id = o.user_id
        where o.id = c.order_id and lower(u.email) like ${pattern})
    )`);
  }
  return parts.length
    ? sql<boolean>`${sql.join(parts, sql` and `)}`
    : sql<boolean>`true`;
}

/** In rupees: the settled amount, or the amount itself when it was rupees. */
const RUPEES = sql`coalesce(c.payout_amount, case when c.currency = 'INR' then c.amount else 0 end)`;

export async function pageCommissions(
  executor: DatabaseExecutor,
  filters: CommissionPageFilters,
  page: { offset: number; limit: number },
): Promise<{
  rows: AdminCommissionRow[];
  total: number;
  summary: Record<CommissionState, { count: number; amount: number }>;
}> {
  const where = commissionFilters(filters, { withState: true });
  const states = Object.keys(COMMISSION_STATE_SQL) as CommissionState[];
  const [rows, total, summary] = await Promise.all([
    commissionsQuery(executor)
      .where(where)
      .orderBy("c.created_at", "desc")
      .orderBy("c.id", "desc")
      .offset(page.offset)
      .limit(page.limit)
      .execute(),
    executor
      .selectFrom("affiliate_commissions as c")
      .innerJoin("affiliates as a", "a.id", "c.affiliate_id")
      .select(sql<string>`count(*)`.as("n"))
      .where(where)
      .executeTakeFirstOrThrow(),
    executor
      .selectFrom("affiliate_commissions as c")
      .innerJoin("affiliates as a", "a.id", "c.affiliate_id")
      .select(
        states.flatMap((state) => [
          sql<string>`count(*) filter (where ${COMMISSION_STATE_SQL[state]})`.as(
            `${state}_n`,
          ),
          sql<string>`coalesce(sum(${RUPEES}) filter (where ${COMMISSION_STATE_SQL[state]}), 0)`.as(
            `${state}_amount`,
          ),
        ]),
      )
      .where(commissionFilters(filters, { withState: false }))
      .executeTakeFirstOrThrow(),
  ]);
  const raw = summary as Record<string, string>;
  return {
    rows: rows as AdminCommissionRow[],
    total: Number(total.n),
    summary: Object.fromEntries(
      states.map((state) => [
        state,
        {
          count: Number(raw[`${state}_n`] ?? 0),
          amount: Number(raw[`${state}_amount`] ?? 0),
        },
      ]),
    ) as Record<CommissionState, { count: number; amount: number }>,
  };
}

export interface PayoutPageFilters {
  statuses?: readonly AffiliatePayoutStatus[];
  methods?: readonly ("upi" | "bank")[];
  affiliateIds?: readonly string[];
  from?: Date;
  to?: Date;
  text?: string;
  userIds?: readonly string[];
}

function payoutFilters(
  filters: PayoutPageFilters,
  options: { withStatus: boolean },
) {
  const parts: ReturnType<typeof sql<boolean>>[] = [];
  if (options.withStatus && filters.statuses?.length) {
    parts.push(sql<boolean>`p.status in (${sql.join(filters.statuses)})`);
  }
  if (filters.methods?.length) {
    parts.push(sql<boolean>`p.payout_method in (${sql.join(filters.methods)})`);
  }
  if (filters.affiliateIds?.length) {
    parts.push(
      sql<boolean>`p.affiliate_id in (${sql.join(filters.affiliateIds)})`,
    );
  }
  if (filters.from) parts.push(sql<boolean>`p.created_at >= ${filters.from}`);
  if (filters.to) parts.push(sql<boolean>`p.created_at < ${filters.to}`);
  if (filters.text) {
    const pattern = escapeLike(filters.text);
    const byUser = filters.userIds?.length
      ? sql` or a.user_id in (${sql.join(filters.userIds)})`
      : sql``;
    parts.push(
      sql<boolean>`(a.code like ${pattern} or lower(coalesce(p.reference, '')) like ${pattern}${byUser})`,
    );
  }
  return parts.length
    ? sql<boolean>`${sql.join(parts, sql` and `)}`
    : sql<boolean>`true`;
}

export async function pagePayouts(
  executor: DatabaseExecutor,
  filters: PayoutPageFilters,
  page: { offset: number; limit: number },
): Promise<{
  rows: AdminPayoutRow[];
  total: number;
  summary: {
    toPay: { count: number; amount: number };
    paid: { count: number; amount: number };
    tds: number;
    closed: number;
  };
}> {
  const where = payoutFilters(filters, { withStatus: true });
  const [rows, total, summary] = await Promise.all([
    payoutsQuery(executor)
      .where(where)
      .orderBy(sql`p.status = 'requested'`, "desc")
      .orderBy("p.created_at", "desc")
      .orderBy("p.id", "desc")
      .offset(page.offset)
      .limit(page.limit)
      .execute(),
    executor
      .selectFrom("affiliate_payouts as p")
      .innerJoin("affiliates as a", "a.id", "p.affiliate_id")
      .select(sql<string>`count(*)`.as("n"))
      .where(where)
      .executeTakeFirstOrThrow(),
    executor
      .selectFrom("affiliate_payouts as p")
      .innerJoin("affiliates as a", "a.id", "p.affiliate_id")
      .select([
        sql<string>`count(*) filter (where p.status = 'requested')`.as(
          "to_pay_n",
        ),
        sql<string>`coalesce(sum(p.gross_amount) filter (where p.status = 'requested'), 0)`.as(
          "to_pay_amount",
        ),
        sql<string>`count(*) filter (where p.status = 'paid')`.as("paid_n"),
        sql<string>`coalesce(sum(p.net_amount) filter (where p.status = 'paid'), 0)`.as(
          "paid_amount",
        ),
        sql<string>`coalesce(sum(p.tds_amount) filter (where p.status = 'paid'), 0)`.as(
          "tds",
        ),
        sql<string>`count(*) filter (where p.status in ('rejected', 'failed'))`.as(
          "closed",
        ),
      ])
      .where(payoutFilters(filters, { withStatus: false }))
      .executeTakeFirstOrThrow(),
  ]);
  return {
    rows: rows as AdminPayoutRow[],
    total: Number(total.n),
    summary: {
      toPay: {
        count: Number(summary.to_pay_n),
        amount: Number(summary.to_pay_amount),
      },
      paid: {
        count: Number(summary.paid_n),
        amount: Number(summary.paid_amount),
      },
      tds: Number(summary.tds),
      closed: Number(summary.closed),
    },
  };
}

/** Attributed orders in a period that followed a click (for conversion). */
export async function countClickOrders(
  executor: DatabaseExecutor,
  from: Date,
  to: Date,
): Promise<number> {
  const row = await executor
    .selectFrom("affiliate_order_attributions as t")
    .innerJoin("orders as o", "o.id", "t.order_id")
    .select(sql<string>`count(*)`.as("n"))
    .where("t.click_id", "is not", null)
    .where("o.status", "in", ["paid", "partially_refunded"])
    .where("o.paid_at", ">=", from)
    .where("o.paid_at", "<", to)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}
