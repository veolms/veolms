import type {
  NeedsRefundEntry,
  NeedsRefundListQuery,
  NeedsRefundListResponse,
} from "@veolms/contracts";
import { decodeOrderCursor, encodeOrderCursor } from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import type { Executor } from "../shared/repository.types.ts";
import {
  compareNewestFirst,
  isCourseDuplicateStillOwed,
  isDuplicateStillOwed,
  toCursorTime,
  toDuplicateBundlePurchaseEntry,
  toDuplicatePurchaseEntry,
  toStuckManualTransferEntry,
  toSurplusPaymentEntry,
  withoutCoursesOfDuplicateBundles,
} from "./needs-refund.mapper.ts";
import * as needsRefundRepo from "./needs-refund.repository.ts";

export interface NeedsRefundService {
  /**
   * Money staff have to return by hand, newest first: surplus payments
   * still to be returned, courses and bundles paid for twice, and
   * transfers reported for an order that was then paid another way,
   * cancelled or failed. Read-only; nothing is refunded and no access
   * changes because something is on this list.
   */
  listNeedsRefund(
    query: NeedsRefundListQuery,
  ): Promise<NeedsRefundListResponse>;
}

export function createNeedsRefundService({
  database,
}: {
  database: Executor;
}): NeedsRefundService {
  async function listNeedsRefund({
    cursor,
    limit,
  }: NeedsRefundListQuery): Promise<NeedsRefundListResponse> {
    // The orders list's cursor (a time and an id, validated before either
    // reaches SQL) is reused: its `createdAt` carries this list's `paidAt`.
    let decoded: needsRefundRepo.NeedsRefundCursor | undefined;
    if (cursor) {
      try {
        const payload = decodeOrderCursor(cursor, "desc");
        decoded = { paidAt: toCursorTime(payload.createdAt), id: payload.id };
      } catch {
        // The same code the orders list answers with. Its message is not
        // passed on: for a value that is not a cursor at all it is the JSON
        // parser's complaint, quoting the bytes it choked on.
        throw new AppError(
          400,
          "INVALID_CURSOR",
          "The pagination cursor is invalid.",
        );
      }
    }

    // One more than a page of each kind. Whatever the mix, the newest
    // `limit` of them all together are then in hand, and anything beyond
    // them means there is another page.
    const [surplusRows, duplicates, transferRows] = await Promise.all([
      needsRefundRepo.listSurplusPaymentsToReturn(database, {
        cursor: decoded,
        limit: limit + 1,
      }),
      needsRefundRepo.listDuplicatePurchases(database),
      needsRefundRepo.listStuckManualTransfers(database, {
        cursor: decoded,
        limit: limit + 1,
      }),
    ]);
    const after = decoded && {
      paid_at_cursor: decoded.paidAt,
      id: decoded.id,
    };
    const onThisPage = <Row extends { paid_at_cursor: string; id: string }>(
      rows: Row[],
    ) =>
      rows
        .filter((row) => !after || compareNewestFirst(row, after) > 0)
        .slice(0, limit + 1);
    // The same bundle in both orders is one entry, not one per course.
    const duplicateRows = onThisPage(
      withoutCoursesOfDuplicateBundles(
        duplicates.courses,
        duplicates.bundles,
      ).filter(isCourseDuplicateStillOwed),
    );
    const duplicateBundleRows = onThisPage(
      duplicates.bundles.filter(isDuplicateStillOwed),
    );

    const merged = [
      ...surplusRows.map((row) => ({ kind: "surplus" as const, row })),
      ...duplicateRows.map((row) => ({ kind: "duplicate" as const, row })),
      ...duplicateBundleRows.map((row) => ({ kind: "bundle" as const, row })),
      ...transferRows.map((row) => ({ kind: "transfer" as const, row })),
    ].sort((a, b) => compareNewestFirst(a.row, b.row));
    const pageRows = merged.slice(0, limit);
    if (pageRows.length === 0) {
      return { entries: [], nextCursor: null };
    }

    const buyers = await needsRefundRepo.listBuyersByIds(database, [
      ...new Set(pageRows.map((entry) => entry.row.user_id)),
    ]);
    const buyersById = new Map(buyers.map((buyer) => [buyer.id, buyer]));

    const entries: NeedsRefundEntry[] = pageRows.map((entry) => {
      const buyer = buyersById.get(entry.row.user_id);
      if (entry.kind === "surplus") {
        return toSurplusPaymentEntry(entry.row, buyer);
      }
      if (entry.kind === "duplicate") {
        return toDuplicatePurchaseEntry(entry.row, buyer);
      }
      if (entry.kind === "bundle") {
        return toDuplicateBundlePurchaseEntry(entry.row, buyer);
      }
      return toStuckManualTransferEntry(entry.row, buyer);
    });

    const last = pageRows[pageRows.length - 1]!.row;
    return {
      entries,
      nextCursor:
        merged.length > limit
          ? encodeOrderCursor({
              id: last.id,
              createdAt: last.paid_at_cursor,
              sortOrder: "desc",
            })
          : null,
    };
  }

  return { listNeedsRefund };
}
