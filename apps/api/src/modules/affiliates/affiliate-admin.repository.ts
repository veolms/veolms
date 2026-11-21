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

export interface Cursor {
  createdAt: Date;
  id: string;
}

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

/** Affiliates, newest first, with their totals. */
export async function listAffiliates(
  executor: DatabaseExecutor,
  options: {
    status?: AffiliateStatus;
    /** Matches the code or the invited email. */
    text?: string;
    /** Accounts whose name or email matched the search. */
    userIds?: readonly string[];
    before?: Cursor;
    limit: number;
  },
): Promise<AffiliateListRow[]> {
  let query = executor
    .selectFrom("affiliates as a")
    .selectAll("a")
    .select([
      totals.clicks.as("clicks"),
      totals.sales.as("sales"),
      totals.earned.as("earned"),
      totals.available.as("available"),
      totals.flagged.as("flagged"),
    ]);
  if (options.status) query = query.where("a.status", "=", options.status);
  if (options.text) {
    const pattern = `%${options.text.toLowerCase().replace(/[\\%_]/gu, (c) => `\\${c}`)}%`;
    const userIds = options.userIds ?? [];
    query = query.where((eb) =>
      eb.or([
        eb("a.code", "like", pattern),
        eb("a.invited_email", "like", pattern),
        ...(userIds.length ? [eb("a.user_id", "in", [...userIds])] : []),
      ]),
    );
  }
  if (options.before) {
    const { createdAt, id } = options.before;
    query = query.where((eb) =>
      eb.or([
        eb("a.created_at", "<", createdAt),
        eb.and([eb("a.created_at", "=", createdAt), eb("a.id", "<", id)]),
      ]),
    );
  }
  const rows = await query
    .orderBy("a.created_at", "desc")
    .orderBy("a.id", "desc")
    .limit(options.limit)
    .execute();
  return rows.map((row) => toListRow(row as never));
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

export async function listCommissions(
  executor: DatabaseExecutor,
  options: {
    status?: AffiliateCommissionStatus;
    kind?: AffiliateCommissionKind;
    affiliateId?: string;
    flagged?: boolean;
    from?: Date;
    to?: Date;
    before?: Cursor;
    limit: number;
  },
): Promise<AdminCommissionRow[]> {
  let query = commissionsQuery(executor);
  if (options.status) query = query.where("c.status", "=", options.status);
  if (options.kind) query = query.where("c.kind", "=", options.kind);
  if (options.affiliateId) {
    query = query.where("c.affiliate_id", "=", options.affiliateId);
  }
  if (options.flagged !== undefined) {
    query = query.where(
      options.flagged
        ? sql<boolean>`cardinality(c.flags) > 0`
        : sql<boolean>`cardinality(c.flags) = 0`,
    );
  }
  if (options.from) query = query.where("c.created_at", ">=", options.from);
  if (options.to) query = query.where("c.created_at", "<", options.to);
  if (options.before) {
    const { createdAt, id } = options.before;
    query = query.where((eb) =>
      eb.or([
        eb("c.created_at", "<", createdAt),
        eb.and([eb("c.created_at", "=", createdAt), eb("c.id", "<", id)]),
      ]),
    );
  }
  return (await query
    .orderBy("c.created_at", "desc")
    .orderBy("c.id", "desc")
    .limit(options.limit)
    .execute()) as AdminCommissionRow[];
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

export async function listPayouts(
  executor: DatabaseExecutor,
  options: {
    status?: AffiliatePayoutStatus;
    affiliateId?: string;
    before?: Cursor;
    limit: number;
  },
): Promise<AdminPayoutRow[]> {
  let query = payoutsQuery(executor);
  if (options.status) query = query.where("p.status", "=", options.status);
  if (options.affiliateId) {
    query = query.where("p.affiliate_id", "=", options.affiliateId);
  }
  if (options.before) {
    const { createdAt, id } = options.before;
    query = query.where((eb) =>
      eb.or([
        eb("p.created_at", "<", createdAt),
        eb.and([eb("p.created_at", "=", createdAt), eb("p.id", "<", id)]),
      ]),
    );
  }
  return (await query
    .orderBy("p.created_at", "desc")
    .orderBy("p.id", "desc")
    .limit(options.limit)
    .execute()) as AdminPayoutRow[];
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
