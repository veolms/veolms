import {
  AFFILIATE_PAYOUT_CURRENCY,
  type AdminPayout,
  type AdminPayoutsQuery,
  type AdminPayoutsResponse,
  type AffiliatePayoutExportQuery,
  type CreateAdminPayoutsRequest,
  type CreateAdminPayoutsResponse,
  type MarkPayoutPaidRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely, Transaction } from "kysely";

import { createOutboxService } from "../../events/outbox.service.ts";
import { AppError } from "../../lib/errors.ts";
import {
  findAccountContacts,
  searchAccountIds,
} from "../auth/shared/account-facts.ts";
import { csvCell } from "../commerce/orders/orders-csv.ts";
import type { PlatformSettingsService } from "../platform/index.ts";
import * as account from "./affiliate-account.repository.ts";
import * as admin from "./affiliate-admin.repository.ts";
import { dayBounds, pageCountOf, pageWindow } from "./affiliate-cursor.ts";
import {
  affiliatePayoutEncryptionReady,
  decryptPayoutSecret,
} from "./affiliate-payout-crypto.ts";
import {
  dayString,
  financialYearOf,
  indiaToday,
  suggestTds,
} from "./affiliate-tds.ts";

/**
 * Payouts on the admin's side (PRD FR-11 and section 10): the list with a
 * suggested TDS, payouts created by the admin, marking one paid, rejected
 * or failed, and the CSV the person paying works from. Status changes are
 * `update … where status = 'requested'`, so of two admins acting at once
 * one wins and the other gets PAYOUT_NOT_OPEN.
 */

const money = (amountMinor: number, currency = AFFILIATE_PAYOUT_CURRENCY) => ({
  amountMinor,
  currency,
});

const notOpen = () =>
  new AppError(
    409,
    "PAYOUT_NOT_OPEN",
    "This payout was already paid, rejected or marked failed. Reload to see it.",
  );

export function createAffiliatePayoutsAdminService({
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

  async function toPayouts(
    rows: admin.AdminPayoutRow[],
  ): Promise<AdminPayout[]> {
    const settings = await platformSettings.getAffiliateProgramSettings();
    const people = new Map(
      (
        await findAccountContacts(database, [
          ...new Set(
            rows
              .map((row) => row.affiliate_user_id)
              .filter((id): id is string => Boolean(id)),
          ),
        ])
      ).map((person) => [person.id, person]),
    );
    const year = financialYearOf(indiaToday());
    const open = rows.filter((row) => row.status === "requested");
    const yearPaid =
      settings.tdsEnabled && open.length
        ? await admin.sumPaidGrossBetween(
            database,
            open.map((row) => row.affiliate_id),
            year.from,
            year.to,
          )
        : new Map<string, number>();
    return rows.map((row) => {
      const paidThisYear = yearPaid.get(row.affiliate_id) ?? 0;
      const suggestion =
        settings.tdsEnabled && row.status === "requested"
          ? suggestTds({
              yearPaidMinor: paidThisYear,
              grossMinor: row.gross_amount,
              panOnFile: row.affiliate_pan_last4 !== null,
            })
          : null;
      return {
        id: row.id,
        status: row.status,
        affiliate: {
          id: row.affiliate_id,
          name: row.affiliate_user_id
            ? (people.get(row.affiliate_user_id)?.displayName ?? null)
            : null,
          code: row.affiliate_code.toUpperCase(),
        },
        gross: money(row.gross_amount, row.currency),
        tds: money(row.tds_amount, row.currency),
        net: money(row.net_amount, row.currency),
        method: row.payout_method,
        hint: row.payout_details_hint,
        requestedBy: row.requested_by,
        reference: row.reference,
        paidOn: dayString(row.paid_on as string | Date | null),
        reason: row.reason,
        note: row.note,
        createdAt: row.created_at.toISOString(),
        decidedAt: row.decided_at?.toISOString() ?? null,
        tdsSuggestion: suggestion
          ? {
              yearPaid: money(paidThisYear, row.currency),
              suggested: money(suggestion.suggested, row.currency),
              rate: suggestion.rate,
              panOnFile: row.affiliate_pan_last4 !== null,
              crossesThreshold: suggestion.crossesThreshold,
            }
          : null,
      };
    });
  }

  async function view(id: string): Promise<AdminPayout> {
    const row = await admin.findPayout(database, id);
    if (!row)
      throw new AppError(404, "NOT_FOUND", "That payout doesn't exist.");
    return (await toPayouts([row]))[0]!;
  }

  async function payoutPageFilters(query: {
    statuses?: AdminPayout["status"][];
    methods?: ("upi" | "bank")[];
    affiliateIds?: string[];
    from?: string;
    to?: string;
    q?: string;
    status?: AdminPayout["status"];
    affiliateId?: string;
  }): Promise<admin.PayoutPageFilters> {
    const text = query.q?.trim() || undefined;
    return {
      statuses: query.statuses?.length
        ? query.statuses
        : query.status
          ? [query.status]
          : undefined,
      methods: query.methods,
      affiliateIds: query.affiliateIds?.length
        ? query.affiliateIds
        : query.affiliateId
          ? [query.affiliateId]
          : undefined,
      text,
      userIds: text ? await searchAccountIds(database, text) : undefined,
      ...dayBounds(query),
    };
  }

  async function listPayouts(
    query: AdminPayoutsQuery,
  ): Promise<AdminPayoutsResponse> {
    const result = await admin.pagePayouts(
      database,
      await payoutPageFilters(query),
      pageWindow(query.page, query.pageSize),
    );
    return {
      items: await toPayouts(result.rows),
      total: result.total,
      page: query.page,
      pageCount: pageCountOf(result.total, query.pageSize),
      summary: {
        toPay: {
          count: result.summary.toPay.count,
          amount: money(result.summary.toPay.amount),
        },
        paid: {
          count: result.summary.paid.count,
          amount: money(result.summary.paid.amount),
        },
        tds: money(result.summary.tds),
        closed: result.summary.closed,
      },
    };
  }

  /**
   * Payouts the admin starts: for the affiliates chosen, or for every
   * approved one whose available balance reaches the minimum. Each is made
   * as the affiliate's own request would be; those that can't be paid are
   * listed with the reason.
   */
  async function createPayouts(
    actorUserId: string,
    input: CreateAdminPayoutsRequest,
  ): Promise<CreateAdminPayoutsResponse> {
    const settings = await platformSettings.getAffiliateProgramSettings();
    const candidates =
      "affiliateIds" in input
        ? (
            await Promise.all(
              [...new Set(input.affiliateIds)].map((id) =>
                admin.findAffiliateById(database, id),
              ),
            )
          ).filter((row) => row !== undefined)
        : await admin.listApprovedAffiliates(database);
    const createdIds: string[] = [];
    const skipped: CreateAdminPayoutsResponse["skipped"] = [];
    const now = new Date();
    for (const candidate of candidates) {
      const outcome = await database.transaction().execute(async (trx) => {
        const locked = await account.lockAffiliate(trx, candidate.id);
        if (!locked || locked.status !== "approved")
          return "not_approved" as const;
        if (await account.hasOpenPayout(trx, locked.id))
          return "payout_open" as const;
        if (!locked.payout_method || !locked.payout_details_encrypted) {
          return "details_missing" as const;
        }
        const rows = await account.lockAvailableRows(trx, locked.id);
        const gross = rows.reduce(
          (sum, row) => sum + (row.payout_amount ?? 0),
          0,
        );
        if (gross <= 0 || gross < settings.minPayoutMinor)
          return "below_minimum" as const;
        const payout = await account.insertPayout(trx, {
          affiliateId: locked.id,
          currency: AFFILIATE_PAYOUT_CURRENCY,
          gross,
          method: locked.payout_method,
          detailsEncrypted: locked.payout_details_encrypted,
          hint: locked.payout_details_hint,
          requestedBy: "admin",
          idempotencyKey: null,
          now,
        });
        await account.tieRowsToPayout(
          trx,
          rows.map((row) => row.id),
          payout.id,
        );
        await admin.insertAudit(trx, {
          actorUserId,
          action: "payout.created",
          subjectType: "payout",
          subjectId: payout.id,
          data: { affiliateId: locked.id, gross },
        });
        return payout.id;
      });
      if (
        outcome === "not_approved" ||
        outcome === "payout_open" ||
        outcome === "details_missing" ||
        outcome === "below_minimum"
      ) {
        // An affiliate picked by hand is always reported; "all" lists only
        // those with something owed, so the list stays readable.
        if ("affiliateIds" in input || outcome !== "below_minimum") {
          skipped.push({
            affiliateId: candidate.id,
            code: candidate.code.toUpperCase(),
            reason: outcome,
          });
        }
      } else {
        createdIds.push(outcome);
      }
    }
    const created = createdIds.length
      ? await toPayouts(
          (
            await Promise.all(
              createdIds.map((id) => admin.findPayout(database, id)),
            )
          ).filter((row) => row !== undefined),
        )
      : [];
    return { created, skipped };
  }

  /**
   * Marks an open payout paid with the transfer's reference and date. TDS
   * is the admin's figure, or the suggestion. A repeat of the same call
   * (same reference) returns the paid payout; anything else on a closed
   * payout is PAYOUT_NOT_OPEN. Paid is final: mistakes become adjustments.
   */
  async function markPaid(
    actorUserId: string,
    id: string,
    input: MarkPayoutPaidRequest,
  ): Promise<AdminPayout> {
    const settings = await platformSettings.getAffiliateProgramSettings();
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      const payout = await admin.findPayout(trx, id, { lock: true });
      if (!payout)
        throw new AppError(404, "NOT_FOUND", "That payout doesn't exist.");
      if (payout.status === "paid" && payout.reference === input.reference)
        return;
      if (payout.status !== "requested") throw notOpen();
      let tds = input.tdsMinor;
      if (tds === undefined) {
        if (settings.tdsEnabled) {
          const year = financialYearOf(input.paidOn);
          const paid = await admin.sumPaidGrossBetween(
            trx,
            [payout.affiliate_id],
            year.from,
            year.to,
          );
          tds = suggestTds({
            yearPaidMinor: paid.get(payout.affiliate_id) ?? 0,
            grossMinor: payout.gross_amount,
            panOnFile: payout.affiliate_pan_last4 !== null,
          }).suggested;
        } else {
          tds = 0;
        }
      }
      if (tds > payout.gross_amount) {
        throw new AppError(
          422,
          "TDS_TOO_HIGH",
          "TDS can't be more than the payout.",
        );
      }
      const net = payout.gross_amount - tds;
      if (
        !(await admin.markPayoutPaid(trx, id, {
          reference: input.reference,
          paidOn: input.paidOn,
          tds,
          net,
          note: input.note?.trim() || null,
          decidedBy: actorUserId,
          now,
        }))
      ) {
        throw notOpen();
      }
      await admin.markPayoutRowsPaid(trx, id, now);
      await admin.insertAudit(trx, {
        actorUserId,
        action: "payout.marked_paid",
        subjectType: "payout",
        subjectId: id,
        data: { reference: input.reference, paidOn: input.paidOn, tds, net },
      });
      if (payout.affiliate_user_id) {
        await outbox.publish(trx as Transaction<Database>, {
          type: "affiliate.payout_decided",
          version: 1,
          dedupeKey: `affiliate.payout_decided:${id}:paid`,
          occurredAt: now,
          payload: {
            payoutId: id,
            recipientUserId: payout.affiliate_user_id,
            status: "paid",
            amount: net > 0 ? net : payout.gross_amount,
            currency: payout.currency,
            reference: input.reference,
            reason: null,
          },
        });
      }
    });
    return await view(id);
  }

  /** Rejects or fails an open payout: the rows go back to the balance. */
  async function close(
    actorUserId: string,
    id: string,
    status: "rejected" | "failed",
    reason: string,
  ): Promise<AdminPayout> {
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      const payout = await admin.findPayout(trx, id, { lock: true });
      if (!payout)
        throw new AppError(404, "NOT_FOUND", "That payout doesn't exist.");
      if (payout.status === status && payout.reason === reason) return;
      if (
        payout.status !== "requested" ||
        !(await admin.closePayout(trx, id, {
          status,
          reason,
          decidedBy: actorUserId,
          now,
        }))
      ) {
        throw notOpen();
      }
      await admin.releasePayoutRows(trx, id);
      await admin.insertAudit(trx, {
        actorUserId,
        action: `payout.${status}`,
        subjectType: "payout",
        subjectId: id,
        data: { reason },
      });
      if (payout.affiliate_user_id) {
        await outbox.publish(trx as Transaction<Database>, {
          type: "affiliate.payout_decided",
          version: 1,
          dedupeKey: `affiliate.payout_decided:${id}:${status}`,
          occurredAt: now,
          payload: {
            payoutId: id,
            recipientUserId: payout.affiliate_user_id,
            status,
            amount: payout.gross_amount,
            currency: payout.currency,
            reference: null,
            reason,
          },
        });
      }
    });
    return await view(id);
  }

  /**
   * The payouts as a CSV for the person paying: who, how (UPI or account
   * and IFSC), PAN, gross, suggested TDS and net. Holds decrypted details,
   * so the export is audited and needs `affiliate.payout`.
   */
  async function* exportCsv(
    actorUserId: string,
    query: AffiliatePayoutExportQuery,
  ): AsyncGenerator<string> {
    if (!affiliatePayoutEncryptionReady()) {
      throw new AppError(
        503,
        "PAYOUT_DETAILS_UNAVAILABLE",
        "Payout details can't be read on this server.",
      );
    }
    // The list's filters when it sent them; open payouts otherwise.
    const filters = await payoutPageFilters({
      ...query,
      statuses: query.statuses?.length ? query.statuses : [query.status],
    });
    const rows = (
      await admin.pagePayouts(database, filters, { offset: 0, limit: 2000 })
    ).rows;
    const status = filters.statuses?.join(",") ?? query.status;
    const payouts = await toPayouts(rows);
    await admin.insertAudit(database, {
      actorUserId,
      action: "payouts.exported",
      subjectType: "program",
      subjectId: "00000000-0000-0000-0000-000000000000",
      data: { status, count: rows.length },
    });
    const line = (cells: (string | number | null | undefined)[]) =>
      cells.map(csvCell).join(",");
    const rupees = (minor: number) => (minor / 100).toFixed(2);
    yield line([
      "Code",
      "Name",
      "Method",
      "UPI id",
      "Account holder",
      "Account number",
      "IFSC",
      "PAN",
      "Gross",
      "TDS",
      "Net",
      "Requested",
      "Payout id",
    ]);
    for (const [index, row] of rows.entries()) {
      const payout = payouts[index]!;
      const secret = JSON.parse(
        decryptPayoutSecret(row.payout_details_encrypted),
      ) as Record<string, string | undefined>;
      const affiliate = await admin.findAffiliateById(
        database,
        row.affiliate_id,
      );
      const pan = affiliate?.pan_encrypted
        ? decryptPayoutSecret(affiliate.pan_encrypted)
        : null;
      const tds =
        row.status === "requested"
          ? (payout.tdsSuggestion?.suggested.amountMinor ?? 0)
          : row.tds_amount;
      yield line([
        payout.affiliate.code,
        payout.affiliate.name,
        row.payout_method,
        secret.upiId,
        secret.holderName,
        secret.accountNumber,
        secret.ifsc,
        pan,
        rupees(row.gross_amount),
        rupees(tds),
        rupees(row.gross_amount - tds),
        row.created_at.toISOString().slice(0, 10),
        row.id,
      ]);
    }
  }

  return { listPayouts, createPayouts, markPaid, close, exportCsv };
}

export type AffiliatePayoutsAdminService = ReturnType<
  typeof createAffiliatePayoutsAdminService
>;
