import type { Invoice, OrderScope } from "@veolms/contracts";
import type { S3StorageService } from "@veolms/storage";
import type { Executor } from "../shared/repository.types.ts";
import { config } from "../../../config.ts";
import { AppError } from "../../../lib/errors.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as orderRepo from "../orders/order.repository.ts";
import { orderItemInvoiceTitle } from "../orders/order.mapper.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import { getAcademyRow } from "../../auth/index.ts";
import {
  createPlatformSettingsService,
  type PlatformSettingsService,
} from "../../platform/platform-settings.service.ts";
import { amountInWords } from "./amount-in-words.ts";
import {
  assignInvoiceNumber,
  invoicePdfKey,
  listOrdersAwaitingInvoicePdf,
  saveInvoicePdfKey,
} from "./invoice.repository.ts";
import { LogoUnavailableError, loadInvoiceLogo } from "./invoice-logo.ts";
import { renderInvoicePdf } from "./invoice-pdf.ts";

/** How long a download link to a stored invoice works. */
const DOWNLOAD_LINK_SECONDS = 5 * 60;

type OrderRow = NonNullable<
  Awaited<ReturnType<typeof orderRepo.findOrderById>>
>;

/**
 * How a download is answered: a short-lived link to the stored PDF, or,
 * where invoices are not stored (no object storage set up), the PDF itself.
 */
export type InvoiceDownload =
  | { kind: "redirect"; url: string }
  | { kind: "file"; fileName: string; pdf: Buffer };

export interface InvoiceService {
  generateInvoiceData(scope: OrderScope, orderId: string): Promise<Invoice>;
  /** The paid order's invoice PDF, made and stored now if it is not yet. */
  getInvoiceDownload(
    scope: OrderScope,
    orderId: string,
  ): Promise<InvoiceDownload>;
  /**
   * Makes and stores the PDF of each recently paid order that has none.
   * Returns how many were made, and each order that failed and why.
   */
  /**
   * A paid order's invoice PDF as bytes, for sending by email: the stored
   * file, or one made (and stored) now. Throws when it cannot be had.
   */
  getOrderInvoicePdf(
    orderId: string,
  ): Promise<{ fileName: string; pdf: Buffer }>;
  issuePendingInvoicePdfs(options: {
    paidSince: Date;
    limit: number;
    /** Orders not to try this time (waiting after a failure). */
    excludeOrderIds?: string[];
  }): Promise<InvoicePdfRun>;
}

export interface InvoicePdfRun {
  issued: number;
  failures: { orderId: string; error: unknown }[];
}

/**
 * The object storage invoices are kept in, or undefined when none is set up
 * (local development without bucket credentials): each download then makes
 * the PDF afresh.
 */
export function invoiceStorage(
  storage: S3StorageService,
): S3StorageService | undefined {
  return config.STORAGE_ACCESS_KEY_ID && config.STORAGE_SECRET_ACCESS_KEY
    ? storage
    : undefined;
}

/** "INV/2026/000042" → invoice-INV-2026-000042.pdf */
export function invoiceFileName(invoiceNumber: string): string {
  return `invoice-${invoiceNumber.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
}

export function createInvoiceService({
  database,
  storage,
  platformSettings = createPlatformSettingsService({ database }),
}: {
  database: Executor;
  /**
   * Where invoice PDFs are kept, and uploaded academy logos read from.
   * Without it, each download makes the PDF afresh and sends it.
   */
  storage?: S3StorageService;
  platformSettings?: Pick<PlatformSettingsService, "getInvoiceSettings">;
}): InvoiceService {
  /**
   * The order's invoice number. Every order paid since invoice numbers
   * began has one; one that somehow has none is given the next number now,
   * as it would have been when it was paid.
   */
  async function invoiceNumberFor(order: OrderRow): Promise<string> {
    if (order.invoice_number) return order.invoice_number;
    const issue = (trx: Executor) =>
      assignInvoiceNumber(trx, order.id, order.paid_at ?? order.created_at);
    const issued = database.isTransaction
      ? await issue(database)
      : await database.transaction().execute(issue);
    if (!issued) throw CommerceErrors.ORDER_NOT_FOUND(order.id);
    return issued;
  }

  /** The order, when `scope` may see it and it has been paid. */
  async function findPaidOrder(
    scope: OrderScope | null,
    orderId: string,
  ): Promise<OrderRow> {
    const order = await orderRepo.findOrderById(
      database,
      orderId,
      scope ?? undefined,
    );
    if (!order) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    if (scope?.type === "user" && order.user_id !== scope.id) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    if (!["paid", "partially_refunded", "refunded"].includes(order.status)) {
      throw new AppError(
        400,
        "ORDER_NOT_PAID",
        "Invoices are only available for paid orders.",
      );
    }
    return order;
  }

  /** The invoice as it reads today, from the order and current details. */
  async function buildInvoice(order: OrderRow): Promise<Invoice> {
    const [items, summaries, payment, user, academy, settings, invoiceNumber] =
      await Promise.all([
        orderRepo.listOrderItems(database, order.id),
        orderRepo.listOrderItemSummariesByOrderIds(database, [order.id]),
        paymentRepo.findPaymentReferenceByOrderId(database, order.id),
        orderRepo.findInvoiceBuyer(database, order.user_id),
        getAcademyRow(database),
        platformSettings.getInvoiceSettings(),
        invoiceNumberFor(order),
      ]);

    const paymentRef =
      payment?.gateway_payment_id ?? payment?.gateway_order_id ?? "N/A";
    const totalAmount = order.total_amount;

    return {
      invoiceNumber,
      orderNumber: order.order_number,
      purchaseId: order.id,
      buyer: {
        userId: order.user_id,
        name: user?.display_name || user?.username || "Student",
        email: user?.email,
        phone: user?.phone_no ?? null,
      },
      seller: {
        name: settings.companyName || academy?.name || "Academy",
        logoUrl: settings.showLogo ? (academy?.logo_url ?? null) : null,
        customDomain: academy?.custom_domain ?? null,
        address: settings.address || null,
        gstin: settings.gstin || null,
        email: settings.email || null,
        phone: settings.phone || null,
      },
      currency: order.currency,
      // Invoice amounts are minor units, like every order response.
      subtotalAmount: order.subtotal_amount,
      discountAmount: order.discount_amount,
      taxAmount: order.tax_amount,
      totalAmount,
      totalInWords: amountInWords(totalAmount, order.currency),
      paymentReference: paymentRef,
      items: items.map((it) => {
        // Named as purchase history names it: part of a course, or the
        // rest of it, by the course.
        const summary = summaries.find((row) => row.id === it.id);
        return {
          title: summary ? orderItemInvoiceTitle(summary) : it.title_snapshot,
          // An order sells each course, bundle or quiz once.
          quantity: 1,
          // A numeric column: the driver returns it as text.
          taxRatePercent: Number(it.tax_rate_percent) || 0,
          unitPrice: it.unit_price,
          discountAmount: it.discount_amount,
          finalAmount: it.final_amount,
        };
      }),
      paidAt: order.paid_at,
      createdAt: order.created_at,
    };
  }

  /**
   * The order's invoice as a PDF. With `logo: "required"`, a logo that could
   * not be read this time fails the render (a stored PDF is kept for good,
   * so it waits for the logo); with `"optional"` the PDF is drawn without it.
   */
  async function renderPdf(
    order: OrderRow,
    logoNeed: "required" | "optional",
  ): Promise<{ invoiceNumber: string; pdf: Buffer }> {
    const invoice = await buildInvoice(order);
    const [settings, logo] = await Promise.all([
      platformSettings.getInvoiceSettings(),
      loadInvoiceLogo(invoice.seller.logoUrl, storage).catch(
        (error: unknown) => {
          if (logoNeed === "optional" && error instanceof LogoUnavailableError)
            return null;
          throw error;
        },
      ),
    ]);
    return {
      invoiceNumber: invoice.invoiceNumber,
      pdf: await renderInvoicePdf(invoice, settings, logo),
    };
  }

  /**
   * Makes the order's PDF and stores it. Storing the same order twice (two
   * API instances, or the job and a download at once) writes the same file
   * to the same place, so it needs no lock.
   */
  async function storePdf(store: S3StorageService, order: OrderRow) {
    const { invoiceNumber, pdf } = await renderPdf(order, "required");
    const key = invoicePdfKey(order.id);
    await store.putObject(key, pdf, "application/pdf", pdf.length);
    await saveInvoicePdfKey(database, order.id, key);
    return { invoiceNumber, key, pdf };
  }

  /** The stored PDF's bytes, or null when the file is not there. */
  async function readStoredPdf(
    store: S3StorageService,
    key: string,
  ): Promise<Buffer | null> {
    const object = await store.getObject(key);
    if (!object) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async function getOrderInvoicePdf(
    orderId: string,
  ): Promise<{ fileName: string; pdf: Buffer }> {
    const order = await findPaidOrder(null, orderId);
    if (!storage) {
      const { invoiceNumber, pdf } = await renderPdf(order, "optional");
      return { fileName: invoiceFileName(invoiceNumber), pdf };
    }
    // The very file a download serves: the stored one, or one made and
    // stored now (the email can go out before the invoice job has run).
    const stored =
      order.invoice_pdf_key && order.invoice_number
        ? await readStoredPdf(storage, order.invoice_pdf_key)
        : null;
    if (stored) {
      return { fileName: invoiceFileName(order.invoice_number!), pdf: stored };
    }
    const { invoiceNumber, pdf } = await storePdf(storage, order);
    return { fileName: invoiceFileName(invoiceNumber), pdf };
  }

  async function sendWithoutStoring(order: OrderRow): Promise<InvoiceDownload> {
    const { invoiceNumber, pdf } = await renderPdf(order, "optional");
    return { kind: "file", fileName: invoiceFileName(invoiceNumber), pdf };
  }

  async function generateInvoiceData(
    scope: OrderScope,
    orderId: string,
  ): Promise<Invoice> {
    return await buildInvoice(await findPaidOrder(scope, orderId));
  }

  async function getInvoiceDownload(
    scope: OrderScope,
    orderId: string,
  ): Promise<InvoiceDownload> {
    const order = await findPaidOrder(scope, orderId);
    if (!storage) return await sendWithoutStoring(order);

    // Made shortly after payment. One paid moments ago, made before invoices
    // were stored, or whose file has gone missing, is made now.
    let key = order.invoice_pdf_key;
    let invoiceNumber = order.invoice_number;
    const stored = key ? await storage.headObject(key) : null;
    if (!key || !invoiceNumber || !stored) {
      try {
        ({ key, invoiceNumber } = await storePdf(storage, order));
      } catch {
        // Storage, or the logo, cannot be reached right now. The student
        // still gets their invoice; it is stored on a later try.
        return await sendWithoutStoring(order);
      }
    }
    const url = await storage.getPresignedGetUrl(key, DOWNLOAD_LINK_SECONDS, {
      responseContentDisposition: `attachment; filename="${invoiceFileName(invoiceNumber)}"`,
    });
    return { kind: "redirect", url };
  }

  async function issuePendingInvoicePdfs({
    paidSince,
    limit,
    excludeOrderIds = [],
  }: {
    paidSince: Date;
    limit: number;
    excludeOrderIds?: string[];
  }): Promise<InvoicePdfRun> {
    const run: InvoicePdfRun = { issued: 0, failures: [] };
    if (!storage) return run;
    const orderIds = await listOrdersAwaitingInvoicePdf(database, {
      paidSince,
      limit,
      excludeOrderIds,
    });
    for (const orderId of orderIds) {
      try {
        // An order paid without a number (by code from before invoice
        // numbers, during a deploy) is numbered here too.
        await storePdf(storage, await findPaidOrder(null, orderId));
        run.issued += 1;
      } catch (error) {
        // Left without a PDF: the next run tries again, and a download
        // makes it in the meantime.
        run.failures.push({ orderId, error });
      }
    }
    return run;
  }

  return {
    generateInvoiceData,
    getInvoiceDownload,
    getOrderInvoicePdf,
    issuePendingInvoicePdfs,
  };
}
