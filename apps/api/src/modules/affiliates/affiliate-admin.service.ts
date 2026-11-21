import {
  ADMIN_COMMISSION_STATES,
  AFFILIATE_PAYOUT_CURRENCY,
  type AdminCommissionState,
  type AdminAffiliateDetail,
  type AdminAffiliateRow,
  type AdminAffiliatesQuery,
  type AdminAffiliatesResponse,
  type AdminCommissionRow,
  type AdminCommissionsQuery,
  type AdminCommissionsResponse,
  type AdminPayoutDetailsResponse,
  type AffiliateAdjustmentRequest,
  type AffiliateAdminSettingsResponse,
  type AffiliateAuditEntry,
  type AffiliateCommissionRuleInput,
  type AffiliateExportQuery,
  type AffiliateProductOption,
  type AffiliateReportQuery,
  type AffiliateReportSummary,
  type AffiliateRule,
  type AffiliateStatusAction,
  type InviteAffiliateRequest,
  type SetOrderAttributionRequest,
  type SetOrderAttributionResponse,
  type UpdateAffiliateProgramSettingsRequest,
} from "@veolms/contracts";
import { siteSettings } from "@veolms/config";
import type { Database, DatabaseExecutor } from "@veolms/database";
import {
  affiliateInvitationEmail,
  type EmailService,
} from "@veolms/services/email";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely, Transaction } from "kysely";

import { config } from "../../config.ts";
import { createOutboxService } from "../../events/outbox.service.ts";
import { AppError } from "../../lib/errors.ts";
import { createAcademyBrandService } from "../academy/academy-brand.service.ts";
import {
  findAccountContacts,
  findAccountIdByEmail,
  searchAccountIds,
} from "../auth/shared/account-facts.ts";
import {
  couponCodeExists,
  createAffiliateCoupon,
  updateAffiliateCoupon,
} from "../commerce/coupons/affiliate-coupons.ts";
import {
  findOrderForCommission,
  listOrderLineLabels,
  listProductOptions,
  listProductTitles,
  sumPaidOrderRevenue,
} from "../commerce/orders/order-commission-facts.ts";
import { csvCell } from "../commerce/orders/orders-csv.ts";
import type { PlatformSettingsService } from "../platform/index.ts";
import * as account from "./affiliate-account.repository.ts";
import {
  codeFromName,
  createAffiliateAccountService,
  maskBuyer,
} from "./affiliate-account.service.ts";
import * as admin from "./affiliate-admin.repository.ts";
import { convertToPayoutCurrency } from "./affiliate-commission.ts";
import { recordSaleCommissions } from "./affiliate-commissions.service.ts";
import {
  dayBounds,
  pageCountOf,
  pageWindow,
  periodOf,
} from "./affiliate-cursor.ts";

/** What the older `status` parameter meant, in today's states. */
const LEGACY_STATUS_STATES: Record<
  "pending" | "approved" | "rejected",
  AdminCommissionState[]
> = {
  pending: ["held", "pending"],
  approved: ["owed", "in_payout", "paid"],
  rejected: ["rejected"],
};
import {
  affiliatePayoutEncryptionReady,
  decryptPayoutSecret,
} from "./affiliate-payout-crypto.ts";

/**
 * The academy admin's side of the program (PRD FR-2, FR-6, FR-7, FR-12,
 * FR-15 and section 13.3): the program's settings and rules, the
 * affiliates and their status, the commission ledger, an order's
 * attribution, reports and exports. Every change is written to the audit
 * log with who did it. Payouts are in affiliate-payouts-admin.service.ts.
 */

/** The rate a program starts with when it is first switched on (PRD D-8). */
export const DEFAULT_PROGRAM_RATE_BASIS_POINTS = 2000;

const money = (amountMinor: number, currency = AFFILIATE_PAYOUT_CURRENCY) => ({
  amountMinor,
  currency,
});

type Executor = DatabaseExecutor;

export function createAffiliateAdminService({
  database,
  platformSettings,
  email,
  log,
}: {
  database: Kysely<Database>;
  platformSettings: Pick<
    PlatformSettingsService,
    "getAffiliateProgramSettings" | "updateAffiliateProgramSettings"
  >;
  email?: EmailService;
  log?: Pick<FastifyBaseLogger, "warn">;
}) {
  const outbox = createOutboxService();
  const accountService = createAffiliateAccountService({
    database,
    platformSettings,
  });

  function notFound(what = "affiliate"): AppError {
    return new AppError(404, "NOT_FOUND", `That ${what} doesn't exist.`);
  }

  async function names(userIds: readonly (string | null)[]) {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    const contacts = await findAccountContacts(database, ids);
    return new Map(contacts.map((contact) => [contact.id, contact]));
  }

  // ---------------------------------------------------------- settings, rules

  async function toRules(rows: admin.RuleRow[]): Promise<AffiliateRule[]> {
    const titles = await listProductTitles(
      database,
      rows
        .filter((row) => row.target_type && row.target_id)
        .map((row) => ({ type: row.target_type!, id: row.target_id! })),
    );
    return rows.map((row) => ({
      id: row.id,
      affiliateId: row.affiliate_id,
      affiliateCode: row.affiliate_code?.toUpperCase() ?? null,
      targetType: row.target_type,
      targetId: row.target_id,
      targetTitle:
        row.target_type && row.target_id
          ? (titles.get(`${row.target_type}:${row.target_id}`) ?? null)
          : null,
      rateType: row.rate_type,
      rateValue: row.rate_value,
      currency: row.currency,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async function listRules() {
    return { items: await toRules(await admin.listLiveRules(database)) };
  }

  async function getSettings(): Promise<AffiliateAdminSettingsResponse> {
    const [settings, rules] = await Promise.all([
      platformSettings.getAffiliateProgramSettings(),
      listRules(),
    ]);
    return {
      settings,
      defaultRule:
        rules.items.find(
          (rule) => rule.affiliateId === null && rule.targetType === null,
        ) ?? null,
    };
  }

  /**
   * Changes the program. Switching it on for the first time adds the 20%
   * default rule; changing the buyer discount changes every affiliate's
   * coupon (makes them, changes them, or switches them off at zero).
   */
  async function updateSettings(
    actorUserId: string,
    changes: UpdateAffiliateProgramSettingsRequest,
  ): Promise<AffiliateAdminSettingsResponse> {
    const before = await platformSettings.getAffiliateProgramSettings();
    const after = await platformSettings.updateAffiliateProgramSettings(
      changes,
      actorUserId,
    );
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      if (after.enabled && !(await admin.listLiveRules(trx)).some(isDefault)) {
        await admin.insertRule(trx, {
          affiliateId: null,
          targetType: null,
          targetId: null,
          rateType: "percent",
          rateValue: DEFAULT_PROGRAM_RATE_BASIS_POINTS,
          currency: null,
          createdBy: actorUserId,
          now,
        });
      }
      if (after.buyerDiscountPercent !== before.buyerDiscountPercent) {
        await syncCoupons(trx, after.buyerDiscountPercent, actorUserId);
      }
      const changed: Record<string, unknown> = Object.fromEntries(
        Object.keys(changes)
          .filter((key) => key !== "termsText")
          .map((key) => [
            key,
            {
              from: before[key as keyof typeof before],
              to: after[key as keyof typeof after],
            },
          ]),
      );
      if ("termsText" in changes) changed.termsText = { changed: true };
      await admin.insertAudit(trx, {
        actorUserId,
        action: "program.settings_changed",
        subjectType: "program",
        subjectId: "00000000-0000-0000-0000-000000000000",
        data: changed,
      });
    });
    return await getSettings();
  }

  function isDefault(rule: admin.RuleRow): boolean {
    return rule.affiliate_id === null && rule.target_type === null;
  }

  async function syncCoupons(
    executor: Executor,
    percentOff: number,
    actorUserId: string,
  ) {
    if (percentOff === 0) {
      for (const couponId of await admin.listAffiliateCouponIds(executor)) {
        await updateAffiliateCoupon(executor, couponId, { active: false });
      }
      return;
    }
    for (const affiliate of await admin.listApprovedAffiliates(executor)) {
      if (affiliate.coupon_id) {
        await updateAffiliateCoupon(executor, affiliate.coupon_id, {
          active: true,
          percentOff,
        });
      } else if (!(await couponCodeExists(executor, affiliate.code))) {
        const couponId = await createAffiliateCoupon(executor, {
          code: affiliate.code,
          percentOff,
          createdBy: actorUserId,
        });
        await account.updateAffiliate(executor, affiliate.id, {
          coupon_id: couponId,
        });
      }
    }
  }

  async function listProducts(): Promise<{ items: AffiliateProductOption[] }> {
    return {
      items: (await listProductOptions(database)).map((option) => ({
        targetType: option.type,
        targetId: option.id,
        title: option.title,
      })),
    };
  }

  /** Sets the rule for one scope: the old one is archived, never edited. */
  async function setRule(
    actorUserId: string,
    input: AffiliateCommissionRuleInput,
  ): Promise<AffiliateRule> {
    if (input.affiliateId) {
      const affiliate = await admin.findAffiliateById(
        database,
        input.affiliateId,
      );
      if (!affiliate) throw notFound();
    }
    if (input.targetType && input.targetId) {
      const titles = await listProductTitles(database, [
        { type: input.targetType, id: input.targetId },
      ]);
      if (!titles.size) throw notFound("product");
    }
    const now = new Date();
    const id = await database.transaction().execute(async (trx) => {
      const archivedId = await admin.archiveRuleForScope(trx, input, now);
      const ruleId = await admin.insertRule(trx, {
        ...input,
        currency: input.rateType === "fixed" ? input.currency : null,
        createdBy: actorUserId,
        now,
      });
      await admin.insertAudit(trx, {
        actorUserId,
        action: "rule.set",
        subjectType: "rule",
        subjectId: ruleId,
        data: { replaced: archivedId ?? null, ...input },
      });
      return ruleId;
    });
    const row = await admin.findLiveRuleById(database, id);
    return (await toRules([row!]))[0]!;
  }

  async function deleteRule(actorUserId: string, id: string): Promise<void> {
    const rule = await admin.findLiveRuleById(database, id);
    if (!rule) throw notFound("rule");
    if (isDefault(rule)) {
      throw new AppError(
        409,
        "DEFAULT_RULE",
        "The program's default rate can be changed but not removed.",
      );
    }
    await database.transaction().execute(async (trx) => {
      await admin.archiveRule(trx, id, new Date());
      await admin.insertAudit(trx, {
        actorUserId,
        action: "rule.archived",
        subjectType: "rule",
        subjectId: id,
      });
    });
  }

  // ---------------------------------------------------------- affiliates

  async function toRows(
    rows: admin.AffiliateListRow[],
  ): Promise<AdminAffiliateRow[]> {
    const people = await names(rows.map((row) => row.user_id));
    return rows.map((row) => {
      const person = row.user_id ? people.get(row.user_id) : undefined;
      return {
        id: row.id,
        code: row.code.toUpperCase(),
        status: row.status,
        name: person?.displayName ?? null,
        email: person?.email ?? null,
        invitedEmail: row.user_id ? null : row.invited_email,
        createdAt: row.created_at.toISOString(),
        clicks: row.clicks,
        sales: row.sales,
        earned: money(row.earned),
        available: money(row.available),
        flagged: row.flagged,
      };
    });
  }

  async function listAffiliates(
    query: AdminAffiliatesQuery,
  ): Promise<AdminAffiliatesResponse> {
    const text = query.q?.trim() || undefined;
    const statuses = query.statuses?.length
      ? query.statuses
      : query.status
        ? [query.status]
        : undefined;
    const result = await admin.pageAffiliates(
      database,
      {
        statuses,
        text,
        userIds: text ? await searchAccountIds(database, text) : undefined,
        owed: query.owed,
        flagged: query.flagged,
        ...dayBounds(query),
      },
      query.sort,
      pageWindow(query.page, query.pageSize),
    );
    return {
      items: await toRows(result.rows),
      total: result.total,
      page: query.page,
      pageCount: pageCountOf(result.total, query.pageSize),
      counts: result.counts,
    };
  }

  async function getAffiliate(id: string): Promise<AdminAffiliateDetail> {
    const row = await admin.findAffiliateWithTotals(database, id);
    if (!row) throw notFound();
    const [[base], balances, coupon] = await Promise.all([
      toRows([row]),
      account.sumBalances(database, id),
      row.coupon_id
        ? admin.findCoupon(database, row.coupon_id)
        : Promise.resolve(undefined),
    ]);
    return {
      ...base!,
      applicationNote: row.application_note,
      statusReason: row.status_reason,
      decidedAt: row.decided_at?.toISOString() ?? null,
      termsAcceptedAt: row.terms_accepted_at?.toISOString() ?? null,
      coupon: coupon ? { code: coupon.code, active: coupon.is_active } : null,
      balances: {
        pending: money(balances.pending),
        available: money(balances.available),
        inPayout: money(balances.inPayout),
        paid: money(balances.paid),
      },
      payoutDetails:
        row.payout_method && row.payout_details_hint
          ? {
              method: row.payout_method,
              hint: row.payout_details_hint,
              panLast4: row.pan_last4,
            }
          : null,
      notifyOnCommission: row.notify_on_commission,
    };
  }

  /**
   * Invites by email: a pending record for that address, approved without a
   * second review when they sign in with it and accept the terms.
   */
  async function invite(
    actorUserId: string,
    input: InviteAffiliateRequest & { email: string },
  ): Promise<AdminAffiliateDetail> {
    const emailAddress = input.email.toLowerCase();
    const userId = await findAccountIdByEmail(database, emailAddress);
    if (userId && (await account.findAffiliateByUserId(database, userId))) {
      throw new AppError(
        409,
        "ALREADY_AFFILIATE",
        "That person is already in the affiliate program.",
      );
    }
    if (await admin.findAffiliateByInvitedEmail(database, emailAddress)) {
      throw new AppError(
        409,
        "ALREADY_INVITED",
        "That address has already been invited.",
      );
    }
    let code = input.code ?? codeFromName(emailAddress.split("@")[0]);
    if (
      (await account.affiliateCodeExists(database, code)) ||
      (await couponCodeExists(database, code))
    ) {
      if (input.code) {
        throw new AppError(
          409,
          "CODE_TAKEN",
          `"${code.toUpperCase()}" is taken.`,
        );
      }
      code = `${code.slice(0, 16)}${Math.floor(100 + Math.random() * 900)}`;
    }
    const now = new Date();
    const created = await database
      .transaction()
      .execute(async (trx) => {
        const row = await admin.insertInvitation(trx, {
          email: emailAddress,
          code,
          invitedBy: actorUserId,
          now,
        });
        await admin.insertAudit(trx, {
          actorUserId,
          action: "affiliate.invited",
          subjectType: "affiliate",
          subjectId: row.id,
          data: { code },
        });
        return row;
      })
      .catch((error: unknown) => {
        if (
          (error as { constraint?: string }).constraint ===
          "affiliates_code_key"
        ) {
          throw new AppError(
            409,
            "CODE_TAKEN",
            `"${code.toUpperCase()}" is taken.`,
          );
        }
        throw error;
      });
    await sendInvitation(emailAddress, code, actorUserId);
    return await getAffiliate(created.id);
  }

  /** After the commit; a failed send is logged and the invitation stands. */
  async function sendInvitation(to: string, code: string, inviterId: string) {
    if (!email) return;
    try {
      const [brand, inviter, settings] = await Promise.all([
        createAcademyBrandService({ database }).getBrand(),
        names([inviterId]),
        getSettings(),
      ]);
      const rule = settings.defaultRule;
      const rate = !rule
        ? null
        : rule.rateType === "percent"
          ? `${rule.rateValue / 100}%`
          : `${(rule.rateValue / 100).toLocaleString("en-IN")} ${rule.currency ?? ""}`.trim();
      await email.send(
        to,
        affiliateInvitationEmail({
          academyName: brand.name,
          logoUrl: brand.logoUrl,
          invitedByName: inviter.get(inviterId)?.displayName ?? null,
          code: code.toUpperCase(),
          rate,
          joinUrl: new URL(
            "/affiliates/join",
            siteSettings(config).webUrl,
          ).toString(),
          email: to,
        }),
      );
    } catch (error) {
      log?.warn({ err: error }, "Affiliate invitation email was not sent");
    }
  }

  const STATUS_MOVES: Record<
    AffiliateStatusAction,
    {
      from: readonly ("pending" | "approved" | "rejected" | "suspended")[];
      to: "approved" | "rejected" | "suspended";
      needsReason: boolean;
    }
  > = {
    approve: { from: ["pending"], to: "approved", needsReason: false },
    reject: { from: ["pending"], to: "rejected", needsReason: true },
    suspend: { from: ["approved"], to: "suspended", needsReason: true },
    reinstate: { from: ["suspended"], to: "approved", needsReason: false },
  };

  /**
   * Approve, reject, suspend or reinstate (PRD FR-2). Suspending stops new
   * credit at once (tracking only follows approved affiliates), switches
   * the coupon off and holds pending commissions for review; reinstating
   * undoes all three.
   */
  async function changeStatus(
    actorUserId: string,
    id: string,
    action: AffiliateStatusAction,
    reason: string | undefined,
  ): Promise<AdminAffiliateDetail> {
    const move = STATUS_MOVES[action];
    if (move.needsReason && !reason) {
      throw new AppError(
        422,
        "REASON_REQUIRED",
        "Give a reason; the affiliate sees it.",
      );
    }
    const settings = await platformSettings.getAffiliateProgramSettings();
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      const current = await account.lockAffiliate(trx, id);
      if (!current) throw notFound();
      if (action === "approve" && !current.user_id) {
        throw new AppError(
          409,
          "INVITATION_NOT_ACCEPTED",
          "An invitation is approved when its recipient accepts it.",
        );
      }
      const moved = await admin.changeStatus(trx, id, {
        from: move.from,
        to: move.to,
        reason: move.to === "approved" ? null : (reason ?? null),
        decidedBy: actorUserId,
        now,
      });
      if (!moved) {
        throw new AppError(
          409,
          "STATUS_CHANGED",
          `This affiliate is ${current.status}; reload to see the latest.`,
        );
      }
      if (move.to === "approved") {
        if (action === "reinstate") {
          await admin.unflagPendingRows(trx, id, "affiliate_suspended");
          if (moved.coupon_id && settings.buyerDiscountPercent > 0) {
            await updateAffiliateCoupon(trx, moved.coupon_id, { active: true });
          }
        }
        await accountService.onApproved(
          trx,
          moved,
          settings.buyerDiscountPercent,
          now,
        );
      } else {
        if (move.to === "rejected") {
          // A rejected applicant's payout details have no use (PRD 15.4).
          await admin.clearPayoutDetails(trx, id);
        }
        if (move.to === "suspended") {
          await admin.flagPendingRows(trx, id, "affiliate_suspended");
          if (moved.coupon_id) {
            await updateAffiliateCoupon(trx, moved.coupon_id, {
              active: false,
            });
          }
        }
        if (moved.user_id) {
          await outbox.publish(trx as Transaction<Database>, {
            type: "affiliate.status_changed",
            version: 1,
            dedupeKey: `affiliate.status_changed:${id}:${move.to}:${now.getTime()}`,
            occurredAt: now,
            payload: {
              affiliateId: id,
              recipientUserId: moved.user_id,
              status: move.to,
              code: moved.code.toUpperCase(),
              reason: reason ?? null,
            },
          });
        }
      }
      await admin.insertAudit(trx, {
        actorUserId,
        action: `affiliate.${move.to === "approved" && action === "reinstate" ? "reinstated" : move.to}`,
        subjectType: "affiliate",
        subjectId: id,
        data: { from: current.status, to: move.to, reason: reason ?? null },
      });
    });
    return await getAffiliate(id);
  }

  /** The full payout details, decrypted, for the person paying. Audited. */
  async function getPayoutDetails(
    actorUserId: string,
    id: string,
  ): Promise<AdminPayoutDetailsResponse> {
    const affiliate = await admin.findAffiliateById(database, id);
    if (!affiliate) throw notFound();
    if (!affiliate.payout_method || !affiliate.payout_details_encrypted) {
      throw new AppError(
        404,
        "PAYOUT_DETAILS_MISSING",
        "No payout details yet.",
      );
    }
    if (!affiliatePayoutEncryptionReady()) {
      throw new AppError(
        503,
        "PAYOUT_DETAILS_UNAVAILABLE",
        "Payout details can't be read on this server.",
      );
    }
    const secret = JSON.parse(
      decryptPayoutSecret(affiliate.payout_details_encrypted),
    ) as Record<string, string | undefined>;
    await admin.insertAudit(database, {
      actorUserId,
      action: "payout_details.viewed",
      subjectType: "affiliate",
      subjectId: id,
    });
    return {
      method: affiliate.payout_method,
      upiId: secret.upiId ?? null,
      holderName: secret.holderName ?? null,
      accountNumber: secret.accountNumber ?? null,
      ifsc: secret.ifsc ?? null,
      pan: affiliate.pan_encrypted
        ? decryptPayoutSecret(affiliate.pan_encrypted)
        : null,
    };
  }

  // ---------------------------------------------------------- commissions

  async function toCommissionRows(
    rows: admin.AdminCommissionRow[],
  ): Promise<AdminCommissionRow[]> {
    const labels = await listOrderLineLabels(
      database,
      rows
        .map((row) => row.order_item_id)
        .filter((id): id is string => Boolean(id)),
    );
    const people = await names([
      ...rows.map((row) => row.affiliate_user_id),
      ...[...labels.values()].map((label) => label.buyerUserId),
    ]);
    return rows.map((row) => {
      const label = row.order_item_id
        ? labels.get(row.order_item_id)
        : undefined;
      const buyer = label ? people.get(label.buyerUserId) : undefined;
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        flags: row.flags,
        inPayout: row.payout_id !== null && row.paid_at === null,
        paid: row.paid_at !== null,
        affiliate: {
          id: row.affiliate_id,
          name: row.affiliate_user_id
            ? (people.get(row.affiliate_user_id)?.displayName ?? null)
            : null,
          code: row.affiliate_code.toUpperCase(),
        },
        order:
          row.order_id && label
            ? {
                id: row.order_id,
                number: label.orderNumber,
                buyer: buyer ? maskBuyer(null, buyer.email) : null,
              }
            : null,
        item: label?.title ?? null,
        base: row.kind === "sale" ? money(row.base_amount, row.currency) : null,
        rate:
          row.rate_type && row.rate_value !== null
            ? { type: row.rate_type, value: row.rate_value }
            : null,
        amount: money(row.amount, row.currency),
        payoutAmount:
          row.payout_amount === null
            ? null
            : money(row.payout_amount, row.payout_currency),
        note: row.note,
        availableAt: row.available_at.toISOString(),
        createdAt: row.created_at.toISOString(),
      };
    });
  }

  /** The page filters a commissions query asks for, older parameters included. */
  function commissionPageFilters(query: {
    states?: AdminCommissionState[];
    kinds?: AdminCommissionsQuery["kinds"];
    affiliateIds?: string[];
    from?: string;
    to?: string;
    q?: string;
    status?: AdminCommissionsQuery["status"];
    kind?: AdminCommissionsQuery["kind"];
    affiliateId?: string;
    flagged?: boolean;
  }): admin.CommissionPageFilters {
    let states: AdminCommissionState[] | undefined = query.states?.length
      ? query.states
      : query.status
        ? LEGACY_STATUS_STATES[query.status]
        : undefined;
    if (query.flagged === true) states = ["held"];
    if (query.flagged === false) {
      states = (states ?? [...ADMIN_COMMISSION_STATES]).filter(
        (state) => state !== "held",
      );
    }
    const kinds = query.kinds?.length
      ? query.kinds
      : query.kind
        ? [query.kind]
        : undefined;
    const affiliateIds = query.affiliateIds?.length
      ? query.affiliateIds
      : query.affiliateId
        ? [query.affiliateId]
        : undefined;
    return {
      states,
      kinds,
      affiliateIds,
      text: query.q?.trim() || undefined,
      ...dayBounds(query),
    };
  }

  async function listCommissions(
    query: AdminCommissionsQuery,
  ): Promise<AdminCommissionsResponse> {
    const result = await admin.pageCommissions(
      database,
      commissionPageFilters(query),
      pageWindow(query.page, query.pageSize),
    );
    const tile = (state: admin.CommissionState) => ({
      count: result.summary[state].count,
      amount: money(result.summary[state].amount),
    });
    return {
      items: await toCommissionRows(result.rows),
      total: result.total,
      page: query.page,
      pageCount: pageCountOf(result.total, query.pageSize),
      summary: {
        held: tile("held"),
        pending: tile("pending"),
        owed: tile("owed"),
        inPayout: tile("in_payout"),
        paid: tile("paid"),
        rejected: tile("rejected"),
      },
    };
  }

  async function commissionView(id: string): Promise<AdminCommissionRow> {
    const row = await admin.findCommission(database, id);
    if (!row) throw notFound("commission");
    return (await toCommissionRows([row]))[0]!;
  }

  /** Approves a pending commission now, flagged or not (PRD FR-7). */
  async function approveCommission(
    actorUserId: string,
    id: string,
  ): Promise<AdminCommissionRow> {
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      const row = await admin.findCommission(trx, id, { lock: true });
      if (!row) throw notFound("commission");
      if (row.status !== "pending") {
        throw new AppError(
          409,
          "COMMISSION_NOT_PENDING",
          "Only a pending commission can be approved.",
        );
      }
      if (row.kind === "reversal" && row.parent_id) {
        const parent = await admin.findCommission(trx, row.parent_id);
        if (parent?.status === "pending") {
          throw new AppError(
            409,
            "SALE_STILL_PENDING",
            "Approve the sale this reversal belongs to first.",
          );
        }
      }
      let payoutAmount = row.payout_amount;
      if (payoutAmount === null && row.currency === row.payout_currency) {
        payoutAmount = row.amount;
      }
      if (payoutAmount === null && row.order_id) {
        const facts = await findOrderForCommission(trx, row.order_id);
        if (
          facts &&
          (facts.order.settlementCurrency ?? facts.order.currency) ===
            row.payout_currency
        ) {
          payoutAmount = convertToPayoutCurrency(row.amount, facts.order);
        }
      }
      if (payoutAmount === null) {
        throw new AppError(
          409,
          "NO_SETTLEMENT",
          "The order has no settled rupee amount yet; reject this row and add an adjustment, or wait.",
        );
      }
      await admin.approveCommissionEarly(trx, id, payoutAmount, now);
      await admin.insertAudit(trx, {
        actorUserId,
        action: "commission.approved",
        subjectType: "commission",
        subjectId: id,
        data: { flags: row.flags },
      });
    });
    return await commissionView(id);
  }

  /** Rejects a pending commission, and a sale's pending reversals with it. */
  async function rejectCommission(
    actorUserId: string,
    id: string,
    reason: string,
  ): Promise<AdminCommissionRow> {
    await database.transaction().execute(async (trx) => {
      const row = await admin.findCommission(trx, id, { lock: true });
      if (!row) throw notFound("commission");
      if (row.status !== "pending" || row.payout_id) {
        throw new AppError(
          409,
          "COMMISSION_NOT_PENDING",
          "Only a pending commission can be rejected.",
        );
      }
      const rejected = await admin.rejectPendingRows(
        trx,
        { ids: [id], parentIds: row.kind === "sale" ? [id] : [] },
        reason,
      );
      await admin.insertAudit(trx, {
        actorUserId,
        action: "commission.rejected",
        subjectType: "commission",
        subjectId: id,
        data: { reason, rows: rejected },
      });
    });
    return await commissionView(id);
  }

  /** A manual plus or minus row in rupees, owed at once (PRD section 9). */
  async function addAdjustment(
    actorUserId: string,
    input: AffiliateAdjustmentRequest,
  ): Promise<AdminCommissionRow> {
    const affiliate = await admin.findAffiliateById(
      database,
      input.affiliateId,
    );
    if (!affiliate) throw notFound();
    const id = await database.transaction().execute(async (trx) => {
      const rowId = await admin.insertAdjustment(trx, {
        affiliateId: input.affiliateId,
        currency: AFFILIATE_PAYOUT_CURRENCY,
        amount: input.amountMinor,
        note: input.note,
        createdBy: actorUserId,
        now: new Date(),
      });
      await admin.insertAudit(trx, {
        actorUserId,
        action: "commission.adjusted",
        subjectType: "commission",
        subjectId: rowId,
        data: {
          affiliateId: input.affiliateId,
          amountMinor: input.amountMinor,
          note: input.note,
        },
      });
      return rowId;
    });
    return await commissionView(id);
  }

  /**
   * Credits an order to another affiliate, or to none (PRD FR-5). Only while
   * its commissions are pending and not in a payout, and only for an order
   * with no refund (its reversals would no longer match). The old rows are
   * rejected, never edited; the new affiliate's are worked out afresh.
   */
  async function setOrderAttribution(
    actorUserId: string,
    orderId: string,
    input: SetOrderAttributionRequest,
  ): Promise<SetOrderAttributionResponse> {
    const now = new Date();
    return await database.transaction().execute(async (trx) => {
      const facts = await findOrderForCommission(trx, orderId);
      if (!facts) throw notFound("order");
      if (facts.order.status !== "paid" || !facts.order.paidAt) {
        throw new AppError(
          409,
          "ORDER_NOT_CREDITABLE",
          "Only a paid order with no refund can be credited to an affiliate.",
        );
      }
      const current = await admin.findAttribution(trx, orderId);
      if ((current?.affiliate_id ?? null) === input.affiliateId) {
        return { orderId, affiliateId: input.affiliateId, commissions: 0 };
      }
      const live = await admin.listOrderCommissions(trx, orderId);
      if (live.some((row) => row.status !== "pending" || row.payout_id)) {
        throw new AppError(
          409,
          "COMMISSIONS_LOCKED",
          "This order's commission is already approved; use an adjustment instead.",
        );
      }
      if (input.affiliateId) {
        const target = await admin.findAffiliateById(trx, input.affiliateId);
        if (!target) throw notFound();
        if (target.status !== "approved") {
          throw new AppError(
            422,
            "NOT_APPROVED",
            "Only an approved affiliate can be credited.",
          );
        }
        if (target.user_id && target.user_id === facts.order.userId) {
          throw new AppError(
            422,
            "SELF_REFERRAL",
            "An affiliate can't be credited for their own purchase.",
          );
        }
      }
      const note =
        input.note?.trim() || "Credited to another affiliate by the academy";
      await admin.rejectPendingRows(
        trx,
        { ids: live.map((row) => row.id) },
        note,
      );
      let written = 0;
      if (input.affiliateId) {
        await admin.setManualAttribution(trx, {
          orderId,
          affiliateId: input.affiliateId,
          changedBy: actorUserId,
          now,
        });
        written = await recordSaleCommissions(trx, {
          orderId,
          paidAt: facts.order.paidAt,
        });
      } else {
        await admin.deleteAttribution(trx, orderId);
      }
      await admin.insertAudit(trx, {
        actorUserId,
        action: "attribution.changed",
        subjectType: "order",
        subjectId: orderId,
        data: {
          from: current?.affiliate_id ?? null,
          to: input.affiliateId,
          rejected: live.map((row) => row.id),
          note: input.note ?? null,
        },
      });
      return { orderId, affiliateId: input.affiliateId, commissions: written };
    });
  }

  // ---------------------------------------------------------- reports, audit

  async function summary(
    query: AffiliateReportQuery,
  ): Promise<AffiliateReportSummary> {
    const { from, to } = periodOf(query);
    const [totals, attributed, all, top, clickOrders] = await Promise.all([
      admin.reportTotals(database, from, to),
      sumPaidOrderRevenue(database, {
        from,
        to,
        currency: AFFILIATE_PAYOUT_CURRENCY,
        attributedOnly: true,
      }),
      sumPaidOrderRevenue(database, {
        from,
        to,
        currency: AFFILIATE_PAYOUT_CURRENCY,
        attributedOnly: false,
      }),
      admin.topAffiliates(database, from, to),
      admin.countClickOrders(database, from, to),
    ]);
    const people = await names(top.map((row) => row.userId));
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      affiliateSales: money(attributed.net),
      shareOfRevenue: all.net > 0 ? attributed.net / all.net : null,
      orders: attributed.orders,
      clicks: totals.clicks,
      // Only orders that followed a click: those by code or account never
      // had one, and counting them gave rates over 100%.
      conversionRate:
        totals.clicks > 0 ? Math.min(1, clickOrders / totals.clicks) : null,
      clickOrders,
      commissionEarned: money(totals.earned),
      owedNow: money(totals.owed),
      pending: money(totals.pending),
      paidOut: money(totals.paidOut),
      activeAffiliates: totals.activeAffiliates,
      pendingApplications: totals.pendingApplications,
      topAffiliates: top.map((row) => ({
        id: row.id,
        code: row.code.toUpperCase(),
        name: row.userId ? (people.get(row.userId)?.displayName ?? null) : null,
        orders: row.orders,
        earned: money(row.earned),
      })),
      health: {
        heldByFlag: totals.held,
        waitingForSettlement: totals.noSettlement,
        payoutsOpenOverAWeek: totals.overduePayouts,
      },
    };
  }

  async function listAudit(query: {
    subjectId?: string;
    limit: number;
  }): Promise<{ items: AffiliateAuditEntry[] }> {
    const rows = await admin.listAudit(database, query);
    const people = await names(rows.map((row) => row.actor_user_id));
    return {
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        subjectType: row.subject_type,
        subjectId: row.subject_id,
        actorName: row.actor_user_id
          ? (people.get(row.actor_user_id)?.displayName ?? null)
          : null,
        data: row.data,
        createdAt: row.created_at.toISOString(),
      })),
    };
  }

  /** CSV lines, header first, read 500 rows at a time. */
  async function* exportCsv(
    query: AffiliateExportQuery,
  ): AsyncGenerator<string> {
    const line = (cells: (string | number | null | undefined)[]) =>
      cells.map(csvCell).join(",");
    const rupees = (minor: number | null | undefined) =>
      minor === null || minor === undefined ? "" : (minor / 100).toFixed(2);
    if (query.type === "affiliates") {
      yield line([
        "Code",
        "Name",
        "Email",
        "Status",
        "Joined",
        "Clicks",
        "Sales",
        "Earned (INR)",
        "Available (INR)",
      ]);
      const text = query.q?.trim() || undefined;
      // Joined in the range, like the list (from/to are its dates).
      const filters: admin.AffiliatePageFilters = {
        statuses: query.statuses,
        text,
        userIds: text ? await searchAccountIds(database, text) : undefined,
        owed: query.owed,
        flagged: query.flagged,
        ...dayBounds(query),
      };
      for (let offset = 0; ; offset += 500) {
        const { rows } = await admin.pageAffiliates(
          database,
          filters,
          query.sort,
          {
            offset,
            limit: 500,
          },
        );
        for (const row of await toRows(rows)) {
          yield line([
            row.code,
            row.name,
            row.email ?? row.invitedEmail,
            row.status,
            row.createdAt.slice(0, 10),
            row.clicks,
            row.sales,
            rupees(row.earned.amountMinor),
            rupees(row.available.amountMinor),
          ]);
        }
        if (rows.length < 500) return;
      }
    }
    // The list's own filters, so the file holds what the screen shows.
    const filters = commissionPageFilters(query);
    yield line([
      "Date",
      "Affiliate",
      "Kind",
      "Status",
      "Order",
      "Item",
      "Base",
      "Rate",
      "Amount",
      "Currency",
      "Payout amount (INR)",
      "Paid",
      "Flags",
      "Note",
    ]);
    for (let offset = 0; ; offset += 500) {
      const { rows } = await admin.pageCommissions(database, filters, {
        offset,
        limit: 500,
      });
      for (const row of await toCommissionRows(rows)) {
        yield line([
          row.createdAt.slice(0, 10),
          row.affiliate.code,
          row.kind,
          row.status,
          row.order?.number,
          row.item,
          row.base ? rupees(row.base.amountMinor) : "",
          row.rate
            ? row.rate.type === "percent"
              ? `${row.rate.value / 100}%`
              : rupees(row.rate.value)
            : "",
          rupees(row.amount.amountMinor),
          row.amount.currency,
          rupees(row.payoutAmount?.amountMinor),
          row.paid ? "yes" : "",
          row.flags.join(" "),
          row.note,
        ]);
      }
      if (rows.length < 500) return;
    }
  }

  return {
    getSettings,
    updateSettings,
    listRules,
    setRule,
    deleteRule,
    listProducts,
    listAffiliates,
    getAffiliate,
    invite,
    changeStatus,
    getPayoutDetails,
    listCommissions,
    approveCommission,
    rejectCommission,
    addAdjustment,
    setOrderAttribution,
    summary,
    listAudit,
    exportCsv,
  };
}

export type AffiliateAdminService = ReturnType<
  typeof createAffiliateAdminService
>;
