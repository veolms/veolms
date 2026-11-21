import crypto from "node:crypto";

import {
  AFFILIATE_PAYOUT_CURRENCY,
  type AffiliateApplyRequest,
  type AffiliateCommissionsQuery,
  type AffiliateCommissionsResponse,
  type AffiliateMeResponse,
  type AffiliatePayout,
  type AffiliatePayoutDetailsRequest,
  type AffiliateStatsQuery,
  type AffiliateStatsResponse,
  type UpdateAffiliateMeRequest,
} from "@veolms/contracts";
import { siteSettings } from "@veolms/config";
import type { Database, DatabaseExecutor } from "@veolms/database";
import type { Kysely, Transaction } from "kysely";

import { config } from "../../config.ts";
import { createOutboxService } from "../../events/outbox.service.ts";
import { AppError } from "../../lib/errors.ts";
import { findAccountContacts } from "../auth/shared/account-facts.ts";
import {
  couponCodeExists,
  createAffiliateCoupon,
} from "../commerce/coupons/affiliate-coupons.ts";
import { listOrderLineLabels } from "../commerce/orders/order-commission-facts.ts";
import type { PlatformSettingsService } from "../platform/index.ts";
import * as account from "./affiliate-account.repository.ts";
import {
  affiliatePayoutEncryptionReady,
  encryptPayoutSecret,
} from "./affiliate-payout-crypto.ts";
import { dayString } from "./affiliate-tds.ts";
import { findProgramDefaultRule } from "./affiliates.repository.ts";

/**
 * The affiliate's own side (PRD FR-1, FR-9 to FR-11): joining, the
 * dashboard, the history, payout details and payout requests. Every
 * function takes the signed-in user and works on their record only.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** A rejected applicant may apply again after this long. */
export const REAPPLY_AFTER_DAYS = 30;

export interface AffiliateUser {
  id: string;
  email: string | null;
  displayName: string | null;
}

const money = (amountMinor: number, currency = AFFILIATE_PAYOUT_CURRENCY) => ({
  amountMinor,
  currency,
});

/** "Asha (a••••@gmail.com)": a first name and a masked email, never more. */
export function maskBuyer(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const first = displayName?.trim().split(/\s+/u)[0] ?? "";
  const [local, domain] = (email ?? "").split("@");
  const masked = local && domain ? `${local.slice(0, 1)}••••@${domain}` : "";
  if (first && masked) return `${first} (${masked})`;
  return first || masked || null;
}

/** "UPI r••••@okhdfc" or "A/c ••••1234". */
export function payoutHint(details: AffiliatePayoutDetailsRequest): string {
  if (details.method === "upi") {
    const [handle, bank] = details.upiId.split("@");
    return `UPI ${handle!.slice(0, 1)}••••@${bank}`;
  }
  return `A/c ••••${details.accountNumber.slice(-4)}`;
}

/** Codes from a name: letters and digits, 3 to 12 long, lower case. */
export function codeFromName(name: string | null | undefined): string {
  const base = (name ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]/gu, "")
    .toLowerCase()
    .slice(0, 12);
  return base.length >= 3 ? base : `${base}aff`.slice(0, 12).padEnd(3, "x");
}

export function createAffiliateAccountService({
  database,
  platformSettings,
}: {
  database: Kysely<Database>;
  platformSettings: Pick<
    PlatformSettingsService,
    "getAffiliateProgramSettings"
  >;
}) {
  const outbox = createOutboxService();

  async function codeTaken(
    executor: DatabaseExecutor,
    code: string,
    exceptAffiliateId?: string,
  ): Promise<boolean> {
    return (
      (await account.affiliateCodeExists(executor, code, exceptAffiliateId)) ||
      (await couponCodeExists(executor, code))
    );
  }

  /** Up to three free codes like the one asked for. */
  async function suggestCodes(base: string): Promise<string[]> {
    const stem = base.slice(0, 16);
    const suggestions: string[] = [];
    for (let attempt = 0; attempt < 12 && suggestions.length < 3; attempt++) {
      const candidate = `${stem}${crypto.randomInt(10, 1000)}`;
      if (!(await codeTaken(database, candidate))) suggestions.push(candidate);
    }
    return suggestions;
  }

  async function codeTakenError(code: string): Promise<AppError> {
    const suggestions = await suggestCodes(code);
    return new AppError(
      409,
      "CODE_TAKEN",
      suggestions.length
        ? `"${code.toUpperCase()}" is taken. Try ${suggestions
            .map((s) => s.toUpperCase())
            .join(", ")}.`
        : `"${code.toUpperCase()}" is taken. Try another.`,
    );
  }

  async function apply(
    user: AffiliateUser,
    request: AffiliateApplyRequest & { code?: string },
  ): Promise<AffiliateMeResponse> {
    const settings = await platformSettings.getAffiliateProgramSettings();
    if (!settings.enabled) {
      throw new AppError(
        403,
        "PROGRAM_CLOSED",
        "The affiliate program is not open.",
      );
    }
    const now = new Date();
    const note = request.applicationNote?.trim() || null;
    const existing = await account.findAffiliateByUserId(database, user.id);
    if (existing) {
      if (existing.status !== "rejected") return await getMe(user);
      const reapplyAt =
        (existing.decided_at ?? existing.updated_at).getTime() +
        REAPPLY_AFTER_DAYS * DAY_MS;
      if (now.getTime() < reapplyAt) {
        throw new AppError(
          409,
          "REAPPLY_TOO_SOON",
          `You can apply again from ${new Date(reapplyAt).toDateString()}.`,
        );
      }
      await database.transaction().execute(async (trx) => {
        await account.reapply(trx, existing.id, { applicationNote: note, now });
        await publishApplication(trx, existing.id, user, existing.code, now);
      });
      return await getMe(user);
    }

    const email = user.email?.trim().toLowerCase() ?? null;
    const invitation = email
      ? await account.findOpenInvitation(database, email)
      : undefined;
    if (invitation) {
      await database.transaction().execute(async (trx) => {
        const accepted = await account.acceptInvitation(trx, invitation.id, {
          userId: user.id,
          applicationNote: note,
          now,
        });
        await onApproved(trx, accepted, settings.buyerDiscountPercent, now);
      });
      return await getMe(user);
    }
    if (settings.joinMode === "invite_only") {
      throw new AppError(
        403,
        "PROGRAM_CLOSED",
        "The affiliate program is by invitation only.",
      );
    }

    const wanted = request.code ?? codeFromName(user.displayName ?? email);
    let finalCode = wanted;
    if (await codeTaken(database, wanted)) {
      // A code they chose is theirs to change; one we suggested is replaced.
      if (request.code) throw await codeTakenError(wanted);
      finalCode =
        (await suggestCodes(wanted))[0] ??
        `${wanted}${crypto.randomInt(1000, 10000)}`;
    }
    const autoApprove = settings.joinMode === "open_auto_approve";
    await database
      .transaction()
      .execute(async (trx) => {
        const created = await account.insertAffiliate(trx, {
          userId: user.id,
          code: finalCode,
          status: autoApprove ? "approved" : "pending",
          applicationNote: note,
          now,
        });
        if (autoApprove) {
          await onApproved(trx, created, settings.buyerDiscountPercent, now);
        } else {
          await publishApplication(trx, created.id, user, finalCode, now);
        }
      })
      .catch(async (error: unknown) => {
        const constraint = (error as { constraint?: string }).constraint;
        if (constraint === "affiliates_code_key")
          throw await codeTakenError(finalCode);
        if (constraint === "affiliates_user_id_key") return;
        throw error;
      });
    return await getMe(user);
  }

  async function publishApplication(
    executor: DatabaseExecutor,
    affiliateId: string,
    user: AffiliateUser,
    code: string,
    now: Date,
  ) {
    await outbox.publish(executor as Transaction<Database>, {
      type: "affiliate.application_received",
      version: 1,
      dedupeKey: `affiliate.application_received:${affiliateId}:${now.getTime()}`,
      occurredAt: now,
      payload: {
        affiliateId,
        applicantName: user.displayName?.trim() || user.email || "Someone",
        code: code.toUpperCase(),
      },
    });
  }

  /**
   * What approval brings with it: the personal coupon when the program gives
   * buyers a discount, and the email. Shared by auto-approval, accepting an
   * invitation and (later) the admin's approval.
   */
  async function onApproved(
    executor: DatabaseExecutor,
    affiliate: account.AffiliateRow,
    buyerDiscountPercent: number,
    now: Date,
  ) {
    if (buyerDiscountPercent > 0 && !affiliate.coupon_id) {
      if (!(await couponCodeExists(executor, affiliate.code))) {
        const couponId = await createAffiliateCoupon(executor, {
          code: affiliate.code,
          percentOff: buyerDiscountPercent,
          createdBy: null,
        });
        await account.updateAffiliate(executor, affiliate.id, {
          coupon_id: couponId,
        });
      }
    }
    if (affiliate.user_id) {
      await outbox.publish(executor as Transaction<Database>, {
        type: "affiliate.status_changed",
        version: 1,
        dedupeKey: `affiliate.status_changed:${affiliate.id}:approved:${now.getTime()}`,
        occurredAt: now,
        payload: {
          affiliateId: affiliate.id,
          recipientUserId: affiliate.user_id,
          status: "approved",
          code: affiliate.code.toUpperCase(),
          reason: null,
        },
      });
    }
  }

  async function requireAffiliate(
    userId: string,
  ): Promise<account.AffiliateRow> {
    const affiliate = await account.findAffiliateByUserId(database, userId);
    if (!affiliate) {
      throw new AppError(
        404,
        "NOT_AN_AFFILIATE",
        "You have not joined the affiliate program.",
      );
    }
    return affiliate;
  }

  async function getMe(user: AffiliateUser): Promise<AffiliateMeResponse> {
    const affiliate = await requireAffiliate(user.id);
    const [settings, rule, balances, payoutOpen] = await Promise.all([
      platformSettings.getAffiliateProgramSettings(),
      findProgramDefaultRule(database),
      account.sumBalances(database, affiliate.id),
      account.hasOpenPayout(database, affiliate.id),
    ]);
    const code = affiliate.code.toUpperCase();
    const link = new URL(
      `/?ref=${code}`,
      siteSettings(config).webUrl,
    ).toString();
    const detailsComplete = Boolean(
      affiliate.payout_method && affiliate.payout_details_encrypted,
    );
    const payoutBlockedReason =
      affiliate.status !== "approved"
        ? ("not_approved" as const)
        : payoutOpen
          ? ("payout_open" as const)
          : !detailsComplete
            ? ("details_missing" as const)
            : balances.available < Math.max(1, settings.minPayoutMinor)
              ? ("below_minimum" as const)
              : null;
    const reapplyAfter =
      affiliate.status === "rejected"
        ? new Date(
            (affiliate.decided_at ?? affiliate.updated_at).getTime() +
              REAPPLY_AFTER_DAYS * DAY_MS,
          ).toISOString()
        : null;
    return {
      status: affiliate.status,
      code,
      link,
      statusReason: affiliate.status_reason,
      reapplyAfter,
      notifyOnCommission: affiliate.notify_on_commission,
      program: {
        joinMode: settings.joinMode,
        defaultRate: rule
          ? {
              rateType: rule.rate_type,
              rateValue: rule.rate_value,
              currency: rule.currency,
            }
          : null,
        attributionWindowDays: settings.attributionWindowDays,
        holdDays: settings.holdDays,
        minPayout: money(settings.minPayoutMinor),
        buyerDiscountPercent: settings.buyerDiscountPercent,
        termsText: settings.termsText,
      },
      balances: {
        pending: money(balances.pending),
        available: money(balances.available),
        inPayout: money(balances.inPayout),
        paid: money(balances.paid),
      },
      payoutDetails:
        affiliate.payout_method && affiliate.payout_details_hint
          ? {
              method: affiliate.payout_method,
              hint: affiliate.payout_details_hint,
              panLast4: affiliate.pan_last4,
            }
          : null,
      canRequestPayout: payoutBlockedReason === null,
      payoutBlockedReason,
    };
  }

  async function updateMe(
    user: AffiliateUser,
    changes: UpdateAffiliateMeRequest & { code?: string },
  ): Promise<AffiliateMeResponse> {
    const affiliate = await requireAffiliate(user.id);
    if (changes.code !== undefined && changes.code !== affiliate.code) {
      if (affiliate.status !== "pending") {
        throw new AppError(
          409,
          "CODE_LOCKED",
          "Your code can't change once you're approved, so links you've shared keep working.",
        );
      }
      if (await codeTaken(database, changes.code, affiliate.id)) {
        throw await codeTakenError(changes.code);
      }
    }
    await account.updateAffiliate(database, affiliate.id, {
      ...(changes.code !== undefined ? { code: changes.code } : {}),
      ...(changes.notifyOnCommission !== undefined
        ? { notify_on_commission: changes.notifyOnCommission }
        : {}),
    });
    return await getMe(user);
  }

  async function setPayoutDetails(
    user: AffiliateUser,
    details: AffiliatePayoutDetailsRequest,
  ): Promise<AffiliateMeResponse> {
    const affiliate = await requireAffiliate(user.id);
    if (!affiliatePayoutEncryptionReady()) {
      throw new AppError(
        503,
        "PAYOUT_DETAILS_UNAVAILABLE",
        "Payout details can't be saved on this server yet.",
      );
    }
    const secret =
      details.method === "upi"
        ? { upiId: details.upiId }
        : {
            holderName: details.holderName,
            accountNumber: details.accountNumber,
            ifsc: details.ifsc,
          };
    await account.updateAffiliate(database, affiliate.id, {
      payout_method: details.method,
      payout_details_encrypted: encryptPayoutSecret(JSON.stringify(secret)),
      payout_details_hint: payoutHint(details),
      pan_encrypted: details.pan ? encryptPayoutSecret(details.pan) : null,
      pan_last4: details.pan ? details.pan.slice(-4) : null,
    });
    return await getMe(user);
  }

  /** The affiliate removes their details; not while a payout is open. */
  async function deletePayoutDetails(
    user: AffiliateUser,
  ): Promise<AffiliateMeResponse> {
    const affiliate = await requireAffiliate(user.id);
    if (await account.hasOpenPayout(database, affiliate.id)) {
      throw new AppError(
        409,
        "PAYOUT_ALREADY_OPEN",
        "Your payout details are in use by an open payout.",
      );
    }
    await account.updateAffiliate(database, affiliate.id, {
      payout_method: null,
      payout_details_encrypted: null,
      payout_details_hint: null,
      pan_encrypted: null,
      pan_last4: null,
    });
    return await getMe(user);
  }

  async function getStats(
    user: AffiliateUser,
    query: AffiliateStatsQuery,
  ): Promise<AffiliateStatsResponse> {
    const affiliate = await requireAffiliate(user.id);
    const to = query.to
      ? new Date(`${query.to}T23:59:59.999+05:30`)
      : new Date();
    const from = query.from
      ? new Date(`${query.from}T00:00:00+05:30`)
      : new Date(to.getTime() - 30 * DAY_MS);
    const { clicks, sales } = await account.statsBetween(
      database,
      affiliate.id,
      from,
      to,
    );
    const labels = await listOrderLineLabels(
      database,
      sales.map((sale) => sale.order_item_id!).filter(Boolean),
    );
    const earnedOf = (sale: (typeof sales)[number]) =>
      sale.payout_amount ??
      (sale.currency === sale.payout_currency ? sale.amount : 0);
    const days = new Map<
      string,
      { clicks: number; orders: Set<string>; earned: number }
    >();
    const day = (key: string) => {
      let entry = days.get(key);
      if (!entry) {
        entry = { clicks: 0, orders: new Set(), earned: 0 };
        days.set(key, entry);
      }
      return entry;
    };
    for (const row of clicks) day(row.day).clicks += row.clicks;
    const products = new Map<string, { sales: number; earned: number }>();
    for (const sale of sales) {
      const entry = day(sale.day);
      if (sale.order_id) entry.orders.add(sale.order_id);
      entry.earned += earnedOf(sale);
      const title = labels.get(sale.order_item_id ?? "")?.title ?? "Unknown";
      const product = products.get(title) ?? { sales: 0, earned: 0 };
      product.sales += 1;
      product.earned += earnedOf(sale);
      products.set(title, product);
    }
    const totalClicks = clicks.reduce((sum, row) => sum + row.clicks, 0);
    const totalSales = new Set(sales.map((sale) => sale.order_id)).size;
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      clicks: totalClicks,
      sales: totalSales,
      conversionRate: totalClicks > 0 ? totalSales / totalClicks : null,
      earned: money(sales.reduce((sum, sale) => sum + earnedOf(sale), 0)),
      byDay: [...days.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, entry]) => ({
          date,
          clicks: entry.clicks,
          sales: entry.orders.size,
          earnedMinor: entry.earned,
        })),
      byProduct: [...products.entries()]
        .map(([title, entry]) => ({
          title,
          sales: entry.sales,
          earnedMinor: entry.earned,
        }))
        .sort((a, b) => b.earnedMinor - a.earnedMinor),
    };
  }

  async function listCommissions(
    user: AffiliateUser,
    query: AffiliateCommissionsQuery & { limit: number },
  ): Promise<AffiliateCommissionsResponse> {
    const affiliate = await requireAffiliate(user.id);
    const before = decodeCursor(query.cursor);
    const rows = await account.listCommissionHistory(database, affiliate.id, {
      status: query.status,
      before,
      limit: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const labels = await listOrderLineLabels(
      database,
      page
        .map((row) => row.order_item_id)
        .filter((id): id is string => Boolean(id)),
    );
    const buyers = await findAccountContacts(database, [
      ...new Set([...labels.values()].map((label) => label.buyerUserId)),
    ]);
    const buyerById = new Map(buyers.map((buyer) => [buyer.id, buyer]));
    const last = page.at(-1);
    return {
      items: page.map((row) => {
        const label = row.order_item_id
          ? labels.get(row.order_item_id)
          : undefined;
        const buyer = label ? buyerById.get(label.buyerUserId) : undefined;
        return {
          id: row.id,
          createdAt: row.created_at.toISOString(),
          kind: row.kind,
          status: row.status,
          inPayout: row.payout_id !== null && row.paid_at === null,
          paid: row.paid_at !== null,
          product: label?.title ?? null,
          orderNumber: label?.orderNumber ?? null,
          buyer: buyer ? maskBuyer(buyer.displayName, buyer.email) : null,
          source: row.source,
          base:
            row.kind === "sale" ? money(row.base_amount, row.currency) : null,
          rateType: row.rate_type,
          rateValue: row.rate_value,
          amount: money(row.amount, row.currency),
          payoutAmount:
            row.payout_amount === null
              ? null
              : money(row.payout_amount, row.payout_currency),
          availableAt: row.available_at.toISOString(),
          note: row.note,
        };
      }),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor(last.created_at, last.id)
          : null,
    };
  }

  function toPayout(row: account.PayoutRow): AffiliatePayout {
    return {
      id: row.id,
      status: row.status,
      gross: money(row.gross_amount, row.currency),
      tds: money(row.tds_amount, row.currency),
      net: money(row.net_amount, row.currency),
      method: row.payout_method,
      hint: row.payout_details_hint,
      reference: row.reference,
      paidOn: dayString(row.paid_on as string | Date | null),
      reason: row.reason,
      createdAt: row.created_at.toISOString(),
    };
  }

  async function listPayouts(user: AffiliateUser) {
    const affiliate = await requireAffiliate(user.id);
    return {
      items: (await account.listPayouts(database, affiliate.id)).map(toPayout),
    };
  }

  /**
   * Requests a payout of the whole available balance (PRD FR-11). The
   * included rows are tied to the payout in the same transaction, so they
   * can never be paid twice; one payout may be open at a time; a repeated
   * request with the same Idempotency-Key returns the same payout.
   */
  async function requestPayout(
    user: AffiliateUser,
    idempotencyKey: string,
  ): Promise<{ payout: AffiliatePayout; created: boolean }> {
    const affiliate = await requireAffiliate(user.id);
    const replay = await account.findPayoutByIdempotencyKey(
      database,
      affiliate.id,
      idempotencyKey,
    );
    if (replay) return { payout: toPayout(replay), created: false };
    const settings = await platformSettings.getAffiliateProgramSettings();
    const now = new Date();

    let created = false;
    const payout = await database
      .transaction()
      .execute(async (trx) => {
        const locked = await account.lockAffiliate(trx, affiliate.id);
        if (!locked || locked.status !== "approved") {
          throw new AppError(
            403,
            "NOT_APPROVED",
            "Only approved affiliates can be paid.",
          );
        }
        const again = await account.findPayoutByIdempotencyKey(
          trx,
          affiliate.id,
          idempotencyKey,
        );
        if (again) return again;
        if (await account.hasOpenPayout(trx, affiliate.id)) {
          throw new AppError(
            409,
            "PAYOUT_ALREADY_OPEN",
            "You already have a payout waiting to be paid.",
          );
        }
        if (!locked.payout_method || !locked.payout_details_encrypted) {
          throw new AppError(
            422,
            "PAYOUT_DETAILS_MISSING",
            "Add your UPI or bank details first.",
          );
        }
        const rows = await account.lockAvailableRows(trx, affiliate.id);
        const gross = rows.reduce(
          (sum, row) => sum + (row.payout_amount ?? 0),
          0,
        );
        if (gross <= 0 || gross < settings.minPayoutMinor) {
          throw new AppError(
            422,
            "BELOW_MINIMUM_PAYOUT",
            `Payouts start at ₹${(settings.minPayoutMinor / 100).toLocaleString("en-IN")}.`,
          );
        }
        const inserted = await account.insertPayout(trx, {
          affiliateId: affiliate.id,
          currency: AFFILIATE_PAYOUT_CURRENCY,
          gross,
          method: locked.payout_method,
          detailsEncrypted: locked.payout_details_encrypted,
          hint: locked.payout_details_hint,
          requestedBy: "affiliate",
          idempotencyKey,
          now,
        });
        await account.tieRowsToPayout(
          trx,
          rows.map((row) => row.id),
          inserted.id,
        );
        await outbox.publish(trx, {
          type: "affiliate.payout_requested",
          version: 1,
          dedupeKey: `affiliate.payout_requested:${inserted.id}`,
          occurredAt: now,
          payload: {
            payoutId: inserted.id,
            affiliateId: affiliate.id,
            affiliateCode: affiliate.code.toUpperCase(),
            amount: gross,
            currency: AFFILIATE_PAYOUT_CURRENCY,
          },
        });
        created = true;
        return inserted;
      })
      .catch((error: unknown) => {
        const constraint = (error as { constraint?: string }).constraint;
        if (constraint === "affiliate_payouts_one_open_key") {
          throw new AppError(
            409,
            "PAYOUT_ALREADY_OPEN",
            "You already have a payout waiting to be paid.",
          );
        }
        throw error;
      });
    return { payout: toPayout(payout), created };
  }

  return {
    apply,
    getMe,
    updateMe,
    setPayoutDetails,
    deletePayoutDetails,
    getStats,
    listCommissions,
    listPayouts,
    requestPayout,
    onApproved,
  };
}

export type AffiliateAccountService = ReturnType<
  typeof createAffiliateAccountService
>;

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(
  cursor: string | undefined,
): { createdAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  const [iso, id] = Buffer.from(cursor, "base64url")
    .toString("utf8")
    .split("|");
  const createdAt = new Date(iso ?? "");
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw new AppError(
      400,
      "INVALID_CURSOR",
      "That page link is no longer valid.",
    );
  }
  return { createdAt, id };
}
