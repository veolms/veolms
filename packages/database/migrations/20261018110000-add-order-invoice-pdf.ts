import { sql, type Kysely } from "kysely";

/**
 * A paid order's invoice is made into a PDF once, shortly after payment,
 * and kept in object storage; downloads are served from there. This column
 * holds where that file is (`protected/invoices/{orderId}.pdf`). Null until
 * the PDF has been made: the invoice job, or the first download, makes it.
 *
 * Once made, the file is not made again, so a later change to the invoice
 * details on the Platform page, or to the buyer's name, leaves an issued
 * invoice as it was.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table orders add column if not exists invoice_pdf_key text
  `.execute(database);
  // The invoice job looks for recently paid orders still without a PDF.
  await sql`
    create index if not exists orders_awaiting_invoice_pdf_idx
      on orders (paid_at)
      where invoice_pdf_key is null and paid_at is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists orders_awaiting_invoice_pdf_idx`.execute(
    database,
  );
  await sql`alter table orders drop column if exists invoice_pdf_key`.execute(
    database,
  );
}
