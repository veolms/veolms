import {
  AFFILIATE_PAYOUT_CURRENCY,
  type AffiliateRuleTargetType,
} from "@veolms/contracts";
import { runBackgroundItem } from "@veolms/api-core";
import type {
  Database,
  DatabaseExecutor,
  OrderItemType,
} from "@veolms/database";
import { sql, type Kysely, type Transaction } from "kysely";
import type { FastifyBaseLogger } from "fastify";

import { config } from "../../config.ts";
import { createOutboxService } from "../../events/outbox.service.ts";
import {
  findAccountContacts,
  listSignInAddressesSince,
} from "../auth/shared/account-facts.ts";
import {
  findOrderForCommission,
  findRefundForReversal,
  listProcessedRefundsSince,
} from "../commerce/orders/order-commission-facts.ts";
import { createPlatformSettingsService } from "../platform/index.ts";
import {
  calculateCommission,
  calculateReversal,
  commissionAvailableAt,
  commissionBase,
  convertToPayoutCurrency,
  mulDivRound,
  resolveCommissionRule,
} from "./affiliate-commission.ts";
import {
  hasHighRefundRate,
  IP_MATCH_WINDOW_MS,
  REFUND_RATE_SALES,
  saleFraudFlags,
} from "./affiliate-fraud.ts";
import { CLICK_RETENTION_MONTHS, hashAddress } from "./affiliate-tracking.ts";
import { listOverduePayouts } from "./affiliate-admin.repository.ts";
import * as repository from "./affiliate-commissions.repository.ts";

/**
 * The commission ledger's workflows (PRD sections 9, 11.7 and 14):
 * a sale's commissions are written in the transaction that marks the order
 * paid, a refund's reversals in the one that settles the refund, and jobs
 * approve them after the hold period and repair anything a failure missed.
 * Everything here is safe to run twice.
 */

type Logger = Pick<FastifyBaseLogger, "error" | "warn" | "info">;

const PAID_STATUSES = new Set(["paid", "partially_refunded", "refunded"]);
const TARGET_TYPES: Record<OrderItemType, AffiliateRuleTargetType> = {
  course: "course",
  bundle: "bundle",
  workshop: "workshop",
  quiz: "quiz",
};

/**
 * Writes the commissions of a paid order: one pending row per item that
 * earns, by the most specific rule, held for the program's hold period.
 * Nothing when the order has no affiliate credit. Returns how many rows
 * were written (zero when they already exist).
 */
export async function recordSaleCommissions(
  executor: DatabaseExecutor,
  input: { orderId: string; paidAt: Date },
): Promise<number> {
  const attribution = await repository.findOrderAttribution(
    executor,
    input.orderId,
  );
  if (!attribution) return 0;
  const facts = await findOrderForCommission(executor, input.orderId);
  if (!facts || facts.items.length === 0) return 0;
  const { order, items } = facts;

  const settings = await createPlatformSettingsService({
    database: executor as Kysely<Database>,
  }).getAffiliateProgramSettings();
  const rules = await repository.listLiveRulesFor(
    executor,
    attribution.affiliate_id,
  );

  const userIds = [order.userId, attribution.affiliate_user_id].filter(
    (id): id is string => Boolean(id),
  );
  const contacts = await findAccountContacts(executor, userIds);
  const buyer = contacts.find((contact) => contact.id === order.userId);
  const affiliateUser = contacts.find(
    (contact) => contact.id === attribution.affiliate_user_id,
  );
  let clickIpHash: string | null = null;
  let signInHashes: string[] = [];
  if (attribution.click_id && attribution.affiliate_user_id) {
    const click = await repository.findClickIpHash(
      executor,
      attribution.click_id,
    );
    if (click) {
      clickIpHash = click.ip_hash;
      const addresses = await listSignInAddressesSince(
        executor,
        attribution.affiliate_user_id,
        new Date(click.created_at.getTime() - IP_MATCH_WINDOW_MS),
      );
      signInHashes = addresses.map((address) =>
        hashAddress(address, config.SESSION_SECRET),
      );
    }
  }
  const flags = saleFraudFlags({
    buyer: { email: buyer?.email ?? null, phone: buyer?.phone ?? null },
    affiliate: {
      email: affiliateUser?.email ?? null,
      phone: affiliateUser?.phone ?? null,
      suspended: attribution.affiliate_status !== "approved",
    },
    clickIpHash,
    affiliateSignInHashes: signInHashes,
  });

  const availableAt = commissionAvailableAt(input.paidAt, settings.holdDays);
  const rows: repository.NewSaleCommission[] = [];
  for (const item of items) {
    if (!item.productId) continue;
    const rule = resolveCommissionRule(rules, {
      affiliateId: attribution.affiliate_id,
      targetType: TARGET_TYPES[item.itemType],
      targetId: item.productId,
      currency: order.currency,
    });
    if (!rule) continue;
    const baseAmount = commissionBase(item);
    const amount = calculateCommission(baseAmount, rule);
    if (amount <= 0) continue;
    rows.push({
      affiliateId: attribution.affiliate_id,
      orderId: order.id,
      orderItemId: item.id,
      currency: order.currency,
      baseAmount,
      ruleId: rule.id,
      rateType: rule.rateType,
      rateValue: rule.rateValue,
      amount,
      payoutCurrency: AFFILIATE_PAYOUT_CURRENCY,
      payoutAmount:
        order.currency === AFFILIATE_PAYOUT_CURRENCY ? amount : null,
      availableAt,
      flags,
    });
  }
  const written = await repository.insertSaleCommissions(executor, rows);
  // One email per order, not per item, and only when the affiliate wants it.
  if (
    written > 0 &&
    attribution.notify_on_commission &&
    attribution.affiliate_user_id
  ) {
    await createOutboxService().publish(executor as Transaction<Database>, {
      type: "affiliate.commission_earned",
      version: 1,
      dedupeKey: `affiliate.commission_earned:${order.id}`,
      occurredAt: input.paidAt,
      payload: {
        affiliateId: attribution.affiliate_id,
        recipientUserId: attribution.affiliate_user_id,
        orderId: order.id,
        amount: rows.reduce((sum, row) => sum + row.amount, 0),
        currency: order.currency,
        holdDays: settings.holdDays,
      },
    });
  }
  return written;
}

/**
 * Writes the reversals of a settled refund: for each of the order's live
 * sales the refund touches, `-round(commission × refunded ÷ item)`, never
 * more than is left. A reversal of a pending sale waits with it (they net
 * out); of an approved or paid one it counts at once, and may take the
 * affiliate's balance below zero. A rejected sale is never reversed.
 */
export async function recordRefundReversals(
  executor: DatabaseExecutor,
  input: { refundId: string; now: Date },
): Promise<number> {
  const refund = await findRefundForReversal(executor, input.refundId);
  if (!refund || refund.status !== "processed") return 0;
  const sales = await repository.listSalesWithReversals(
    executor,
    refund.orderId,
  );
  if (sales.length === 0) return 0;
  const facts = await findOrderForCommission(executor, refund.orderId);
  if (!facts || facts.order.totalAmount <= 0) return 0;
  const itemsById = new Map(facts.items.map((item) => [item.id, item]));

  const rows: repository.NewReversal[] = [];
  for (const sale of sales) {
    if (sale.status === "rejected") continue;
    if (refund.orderItemId && refund.orderItemId !== sale.order_item_id) {
      continue;
    }
    const item = itemsById.get(sale.order_item_id);
    if (!item || item.finalAmount <= 0) continue;
    // A refund of one item is that item's; a refund of the order is shared
    // by its items in proportion to what each cost.
    const refundedForItem = refund.orderItemId
      ? refund.amount
      : mulDivRound(refund.amount, item.finalAmount, facts.order.totalAmount);
    const amount = calculateReversal({
      sale: { amount: sale.amount, status: sale.status },
      refundedAmount: refundedForItem,
      itemAmount: item.finalAmount,
      alreadyReversed: sale.reversed,
    });
    if (amount >= 0) continue;
    const payoutAmount =
      sale.payout_amount !== null
        ? mulDivRound(sale.payout_amount, amount, sale.amount)
        : sale.currency === sale.payout_currency
          ? amount
          : null;
    const waits = sale.status === "pending";
    rows.push({
      affiliateId: sale.affiliate_id,
      orderId: refund.orderId,
      orderItemId: sale.order_item_id,
      refundId: refund.id,
      parentId: sale.id,
      currency: sale.currency,
      amount,
      payoutCurrency: sale.payout_currency,
      payoutAmount,
      status: waits ? "pending" : "approved",
      availableAt: waits ? sale.available_at : input.now,
      approvedAt: waits ? null : input.now,
    });
  }
  const written = await repository.insertReversals(executor, rows);
  if (written > 0 && rows[0]) {
    const affiliate = await repository.findAffiliateUser(
      executor,
      rows[0].affiliateId,
    );
    if (affiliate?.user_id) {
      await createOutboxService().publish(executor as Transaction<Database>, {
        type: "affiliate.commission_reversed",
        version: 1,
        dedupeKey: `affiliate.commission_reversed:${refund.id}`,
        occurredAt: input.now,
        payload: {
          affiliateId: rows[0].affiliateId,
          recipientUserId: affiliate.user_id,
          refundId: refund.id,
          amount: -rows.reduce((sum, row) => sum + row.amount, 0),
          currency: rows[0].currency,
        },
      });
    }
  }
  return written;
}

/**
 * Runs affiliate work inside the caller's payment or refund transaction
 * without ever failing it: a savepoint is taken first and, on any error,
 * rolled back to, so the sale or refund completes as if the affiliate
 * program were not there. The daily repair writes what was missed.
 */
async function insideSavepoint(
  executor: DatabaseExecutor,
  name: string,
  run: () => Promise<number>,
  onError: (error: unknown) => void,
): Promise<number> {
  await sql`savepoint ${sql.raw(name)}`.execute(executor);
  try {
    const written = await run();
    await sql`release savepoint ${sql.raw(name)}`.execute(executor);
    return written;
  } catch (error) {
    await sql`rollback to savepoint ${sql.raw(name)}`.execute(executor);
    onError(error);
    return 0;
  }
}

/** For the payment paths: writes a paid order's commissions, never failing the payment. */
export async function recordSaleCommissionsSafely(
  trx: DatabaseExecutor,
  input: { orderId: string; paidAt: Date },
  logger?: Pick<FastifyBaseLogger, "error">,
): Promise<number> {
  return await insideSavepoint(
    trx,
    "affiliate_sale_commissions",
    () => recordSaleCommissions(trx, input),
    (error) =>
      logger?.error(
        { err: error, orderId: input.orderId },
        "Affiliate commissions not written; the daily repair will write them",
      ),
  );
}

/** For the refund paths: writes a settled refund's reversals, never failing the refund. */
export async function recordRefundReversalsSafely(
  trx: DatabaseExecutor,
  input: { refundId: string; now: Date },
  logger?: Pick<FastifyBaseLogger, "error">,
): Promise<number> {
  return await insideSavepoint(
    trx,
    "affiliate_refund_reversals",
    () => recordRefundReversals(trx, input),
    (error) =>
      logger?.error(
        { err: error, refundId: input.refundId },
        "Affiliate reversals not written; the daily repair will write them",
      ),
  );
}

const APPROVAL_JOB = "affiliate-commission-approval";
const RECONCILE_JOB = "affiliate-reconcile";
const REFUND_RATE_JOB = "affiliate-refund-rate";
const DAY_MS = 24 * 60 * 60 * 1000;
const RECONCILE_DAYS = 7;

/**
 * Approves pending, unflagged commissions whose hold period is over (and
 * reversals whose sale is approved). A commission in another currency gets
 * its rupee amount from the order's settlement now; without one it is
 * flagged `no_settlement` and waits for the admin.
 */
export async function approveDueCommissions(
  database: Kysely<Database>,
  options: { now?: Date; limit?: number } = {},
): Promise<{ approved: number; flagged: number }> {
  const now = options.now ?? new Date();
  const due = await repository.listDueCommissions(
    database,
    now,
    options.limit ?? 500,
  );
  let approved = 0;
  let flagged = 0;
  for (const row of due) {
    await runBackgroundItem(
      APPROVAL_JOB,
      { table: "affiliate_commissions", id: row.id },
      async () => {
        let payoutAmount = row.payout_amount;
        if (payoutAmount === null && row.currency === row.payout_currency) {
          payoutAmount = row.amount;
        }
        if (payoutAmount === null && row.kind === "reversal") {
          payoutAmount =
            row.parent_payout_amount !== null && row.parent_amount
              ? mulDivRound(
                  row.parent_payout_amount,
                  row.amount,
                  row.parent_amount,
                )
              : null;
        }
        if (payoutAmount === null && row.order_id) {
          const facts = await findOrderForCommission(database, row.order_id);
          if (
            facts &&
            (facts.order.settlementCurrency ?? facts.order.currency) ===
              row.payout_currency
          ) {
            payoutAmount = convertToPayoutCurrency(row.amount, facts.order);
          }
        }
        if (payoutAmount === null) {
          flagged += await repository.addFlag(
            database,
            { id: row.id },
            "no_settlement",
          );
          return;
        }
        if (
          await repository.approveCommission(
            database,
            row.id,
            payoutAmount,
            now,
          )
        ) {
          approved += 1;
        }
      },
    );
  }
  return { approved, flagged };
}

/**
 * The daily repair (PRD section 14.2): paid orders of the last week that
 * have an affiliate but no commission get it, and settled refunds that have
 * no reversal get theirs. It should normally repair nothing; any repair is
 * logged as a warning.
 */
export async function reconcileCommissions(
  database: Kysely<Database>,
  options: { now?: Date; limit?: number; logger?: Logger } = {},
): Promise<{ salesRepaired: number; reversalsRepaired: number }> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - RECONCILE_DAYS * DAY_MS);
  const limit = options.limit ?? 1000;
  let salesRepaired = 0;
  let reversalsRepaired = 0;

  for (const orderId of await repository.listAttributedOrdersWithoutSales(
    database,
    since,
    limit,
  )) {
    await runBackgroundItem(
      RECONCILE_JOB,
      { table: "orders", id: orderId },
      async () => {
        const facts = await findOrderForCommission(database, orderId);
        if (!facts?.order.paidAt || !PAID_STATUSES.has(facts.order.status)) {
          return;
        }
        const written = await database.transaction().execute((trx) =>
          recordSaleCommissions(trx, {
            orderId,
            paidAt: facts.order.paidAt!,
          }),
        );
        if (written > 0) {
          salesRepaired += written;
          options.logger?.warn(
            { job: RECONCILE_JOB, orderId, written },
            "Repaired missing affiliate commissions",
          );
        }
      },
    );
  }

  for (const refund of await listProcessedRefundsSince(
    database,
    since,
    limit,
  )) {
    if (!(await repository.orderHasLiveSales(database, refund.orderId))) {
      continue;
    }
    if (await repository.refundHasReversals(database, refund.id)) continue;
    await runBackgroundItem(
      RECONCILE_JOB,
      { table: "refunds", id: refund.id },
      async () => {
        const written = await database
          .transaction()
          .execute((trx) =>
            recordRefundReversals(trx, { refundId: refund.id, now }),
          );
        if (written > 0) {
          reversalsRepaired += written;
          options.logger?.warn(
            { job: RECONCILE_JOB, refundId: refund.id, written },
            "Repaired missing affiliate reversals",
          );
        }
      },
    );
  }
  return { salesRepaired, reversalsRepaired };
}

/** Holds the pending commissions of affiliates whose sales are refunded too often. */
export async function flagHighRefundRates(
  database: Kysely<Database>,
  options: { limit?: number } = {},
): Promise<number> {
  let flagged = 0;
  for (const affiliateId of await repository.listAffiliatesWithPendingRows(
    database,
    options.limit ?? 1000,
  )) {
    await runBackgroundItem(
      REFUND_RATE_JOB,
      { table: "affiliates", id: affiliateId },
      async () => {
        const latest = await repository.listLatestSales(
          database,
          affiliateId,
          REFUND_RATE_SALES,
        );
        if (hasHighRefundRate(latest)) {
          flagged += await repository.addFlag(
            database,
            { affiliateId },
            "high_refund_rate",
          );
        }
      },
    );
  }
  return flagged;
}

/** Deletes raw clicks older than 13 months, in batches. */
export async function purgeOldClicks(
  database: Kysely<Database>,
  options: { now?: Date; batch?: number } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const before = new Date(now);
  before.setUTCMonth(before.getUTCMonth() - CLICK_RETENTION_MONTHS);
  const batch = options.batch ?? 10_000;
  let deleted = 0;
  for (;;) {
    const gone = await repository.deleteClicksBefore(database, before, batch);
    deleted += gone;
    if (gone < batch) return deleted;
  }
}

const OVERDUE_PAYOUT_DAYS = 7;

/** The ISO week a moment falls in, as "2026-W51". */
export function isoWeek(now: Date): string {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Nudges whoever pays about payouts open for more than a week (PRD section
 * 14.2). The dedupe key is the payout and the week, so at most one email a
 * week per payout however often this runs.
 */
export async function remindOverduePayouts(
  database: Kysely<Database>,
  options: { now?: Date } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const overdue = await listOverduePayouts(
    database,
    new Date(now.getTime() - OVERDUE_PAYOUT_DAYS * DAY_MS),
  );
  if (overdue.length === 0) return 0;
  const week = isoWeek(now);
  await database.transaction().execute(async (trx) => {
    const outbox = createOutboxService();
    for (const payout of overdue) {
      await outbox.publish(trx, {
        type: "affiliate.payout_overdue",
        version: 1,
        dedupeKey: `affiliate.payout_overdue:${payout.id}:${week}`,
        occurredAt: now,
        payload: {
          payoutId: payout.id,
          affiliateCode: payout.code.toUpperCase(),
          amount: Number(payout.gross_amount),
          currency: payout.currency,
          daysOpen: Math.floor(
            (now.getTime() - payout.created_at.getTime()) / DAY_MS,
          ),
        },
      });
    }
  });
  return overdue.length;
}
