import {
  DEFAULT_PLATFORM_INVOICE_SETTINGS,
  platformInvoiceSettingsSchema,
} from "@veolms/contracts";
import { sql } from "kysely";
import { findPlatformSettings } from "../../platform/platform-settings.repository.ts";
import type { Executor } from "../shared/repository.types.ts";

/**
 * The academy sells in India: an invoice's date, and the year its number
 * counts in, are India time.
 */
export const INVOICE_TIME_ZONE = "Asia/Kolkata";

/** "<prefix>/<year>/<number>", the number padded to six digits. */
export function formatInvoiceNumber(
  prefix: string,
  year: number,
  number: number,
): string {
  return [prefix, String(year), String(number).padStart(6, "0")]
    .filter(Boolean)
    .join("/");
}

/** Where an order's invoice PDF is kept in object storage. */
export function invoicePdfKey(orderId: string): string {
  return `protected/invoices/${orderId}.pdf`;
}

/** Records that the order's invoice PDF has been made and stored. */
export async function saveInvoicePdfKey(
  database: Executor,
  orderId: string,
  key: string,
): Promise<void> {
  await database
    .updateTable("orders")
    .set({ invoice_pdf_key: key })
    .where("id", "=", orderId)
    .execute();
}

/**
 * Orders paid since `paidSince` whose invoice PDF has not been made yet,
 * newest first: one that keeps failing never holds up a new purchase.
 */
export async function listOrdersAwaitingInvoicePdf(
  database: Executor,
  {
    paidSince,
    limit,
    excludeOrderIds = [],
  }: { paidSince: Date; limit: number; excludeOrderIds?: string[] },
): Promise<string[]> {
  let query = database
    .selectFrom("orders")
    .select("id")
    .where("invoice_pdf_key", "is", null)
    .where("paid_at", ">=", paidSince)
    .where("status", "in", ["paid", "partially_refunded", "refunded"]);
  if (excludeOrderIds.length > 0) {
    query = query.where("id", "not in", excludeOrderIds);
  }
  const rows = await query.orderBy("paid_at", "desc").limit(limit).execute();
  return rows.map((row) => row.id);
}

/** The calendar year, India time, an invoice paid at `paidAt` counts in. */
export function invoiceYear(paidAt: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: INVOICE_TIME_ZONE,
      year: "numeric",
    }).format(paidAt),
  );
}

/** The prefix saved on the Platform page's Invoice tab, or the default. */
async function readNumberPrefix(database: Executor): Promise<string> {
  const row = await findPlatformSettings(database);
  const saved =
    typeof row?.settings === "object" && row.settings !== null
      ? (row.settings as { invoice?: { numberPrefix?: unknown } }).invoice
          ?.numberPrefix
      : undefined;
  const prefix =
    platformInvoiceSettingsSchema.shape.numberPrefix.safeParse(saved);
  return prefix.success
    ? prefix.data
    : DEFAULT_PLATFORM_INVOICE_SETTINGS.numberPrefix;
}

/**
 * Gives a paid order its invoice number, unless it has one: the next number
 * of the year it was paid in. Run inside the transaction that marks the
 * order paid, so a rolled-back payment takes its number back with it and
 * the numbers have no gaps. The order row is locked first, so two calls for
 * one order never use up two numbers.
 *
 * Returns the order's invoice number, or null when there is no such order.
 */
export async function assignInvoiceNumber(
  database: Executor,
  orderId: string,
  paidAt: Date,
): Promise<string | null> {
  const order = await database
    .selectFrom("orders")
    .select("invoice_number")
    .where("id", "=", orderId)
    .forUpdate()
    .executeTakeFirst();
  if (!order) return null;
  if (order.invoice_number) return order.invoice_number;

  const year = invoiceYear(paidAt);
  const prefix = await readNumberPrefix(database);
  const counter = await database
    .insertInto("invoice_number_counters")
    .values({ year, last_number: 1 })
    .onConflict((conflict) =>
      conflict.column("year").doUpdateSet({
        last_number: sql<number>`invoice_number_counters.last_number + 1`,
      }),
    )
    .returning("last_number")
    .executeTakeFirstOrThrow();

  let invoiceNumber = formatInvoiceNumber(prefix, year, counter.last_number);
  // Numbers can be written without the counter: invoices brought over from
  // another platform, or a prefix changed back to one used before. Taking
  // one of those would break the unique index and, with it, the payment
  // this runs inside; the counter moves past the highest one instead.
  if (await isInvoiceNumberTaken(database, invoiceNumber)) {
    const next = (await highestIssuedNumber(database, prefix, year)) + 1;
    await database
      .updateTable("invoice_number_counters")
      .set({ last_number: next })
      .where("year", "=", year)
      .execute();
    invoiceNumber = formatInvoiceNumber(prefix, year, next);
  }

  await database
    .updateTable("orders")
    .set({ invoice_number: invoiceNumber })
    .where("id", "=", orderId)
    .execute();
  return invoiceNumber;
}

async function isInvoiceNumberTaken(
  database: Executor,
  invoiceNumber: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("orders")
    .select("id")
    .where("invoice_number", "=", invoiceNumber)
    .executeTakeFirst();
  return Boolean(row);
}

/** The highest running number issued under `prefix` in `year`, or 0. */
async function highestIssuedNumber(
  database: Executor,
  prefix: string,
  year: number,
): Promise<number> {
  // The prefix is letters, digits and hyphens only, so it has no LIKE
  // wildcards to escape.
  const start = formatInvoiceNumber(prefix, year, 0).replace(/0+$/, "");
  const rows = await database
    .selectFrom("orders")
    .select("invoice_number")
    .where("invoice_number", "like", `${start}%`)
    .execute();
  return rows.reduce((highest, row) => {
    const number = Number(row.invoice_number?.slice(start.length));
    return Number.isSafeInteger(number) && number > highest ? number : highest;
  }, 0);
}
