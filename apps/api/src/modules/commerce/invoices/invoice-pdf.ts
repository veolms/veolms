import type { Invoice, PlatformInvoiceSettings } from "@veolms/contracts";
import PDFDocument from "pdfkit";
import { isDrawableLogo } from "../../academy/academy-logo.ts";
import { minorUnitsPerMajor } from "../shared/currency.ts";
import { INVOICE_TIME_ZONE } from "./invoice.repository.ts";

type Doc = PDFKit.PDFDocument;

const PAGE_MARGIN = 40;
const CELL_PADDING = 6;
const BORDER = "#d1d5db";
const TEXT = "#111827";
const MUTED = "#6b7280";
const BAR = "#343a40";

/**
 * The item table's columns, in points: Sl No, Description, Qty, Gross,
 * GST Rate, Discount, Net. They fill an A4 page's width inside the margins,
 * in the proportions of the academy's paper invoice.
 */
const COLUMNS = [48, 137, 30, 100, 56, 54, 90.28];

/** Left edge of column `index`. */
function columnX(index: number): number {
  return PAGE_MARGIN + COLUMNS.slice(0, index).reduce((a, b) => a + b, 0);
}

/** Width of columns `from` to `to`, both included. */
function span(from: number, to: number): number {
  return COLUMNS.slice(from, to + 1).reduce((a, b) => a + b, 0);
}

// Characters outside Latin-1 that the PDF's built-in fonts (WinAnsi) can
// still draw.
const WIN_ANSI_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""));

/**
 * Text the built-in fonts can draw. They have no glyphs beyond Latin-1, so
 * the rupee sign is written "Rs." and anything else they cannot draw
 * becomes "?" instead of a wrong character.
 */
export function pdfText(value: string): string {
  return Array.from(value.replace(/₹/g, "Rs."))
    .map((char) => {
      const code = char.codePointAt(0)!;
      if (char === "\n") return char;
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
        return char;
      }
      return WIN_ANSI_EXTRAS.has(char) ? char : "?";
    })
    .join("");
}

/** An amount as the invoice prints it: "1,499" or "99.50", no symbol. */
function amount(amountMinor: number, currency: string): string {
  const value = amountMinor / minorUnitsPerMajor(currency);
  const decimals = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** 18/10/2026, India time. */
function invoiceDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: INVOICE_TIME_ZONE,
  }).format(new Date(value));
}

interface CellText {
  text: string;
  bold?: boolean;
  size?: number;
  color?: string;
}

interface CellOptions {
  align?: "left" | "center" | "right";
  fill?: string;
  /** Centre the text block vertically instead of starting at the top. */
  middle?: boolean;
}

function lineFont(doc: Doc, line: CellText): Doc {
  return doc
    .font(line.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(line.size ?? 9);
}

/** Height the lines take inside a cell `width` wide, padding included. */
function cellHeight(doc: Doc, lines: CellText[], width: number): number {
  const inner = width - CELL_PADDING * 2;
  const text = lines.reduce(
    (total, line) =>
      total +
      lineFont(doc, line).heightOfString(pdfText(line.text) || " ", {
        width: inner,
      }),
    0,
  );
  return text + CELL_PADDING * 2;
}

/** A bordered box with its lines of text. */
function cell(
  doc: Doc,
  box: { x: number; y: number; width: number; height: number },
  lines: CellText[],
  options: CellOptions = {},
): void {
  const { x, y, width, height } = box;
  if (options.fill) doc.rect(x, y, width, height).fill(options.fill);
  doc.lineWidth(0.6).strokeColor(BORDER).rect(x, y, width, height).stroke();

  const inner = width - CELL_PADDING * 2;
  let textY = y + CELL_PADDING;
  if (options.middle) {
    textY = y + (height - cellHeight(doc, lines, width)) / 2 + CELL_PADDING;
  }
  for (const line of lines) {
    const text = pdfText(line.text);
    lineFont(doc, line)
      .fillColor(line.color ?? TEXT)
      .text(text, x + CELL_PADDING, textY, {
        width: inner,
        align: options.align ?? "left",
        lineBreak: true,
      });
    textY += doc.heightOfString(text || " ", { width: inner });
  }
}

/** Logo, company name, address and contact lines, centred. */
function drawSellerHeader(
  doc: Doc,
  invoice: Invoice,
  logo: Buffer | null,
): number {
  const width = doc.page.width - PAGE_MARGIN * 2;
  let y = PAGE_MARGIN;

  // Checked again here, whoever passed it in: a PNG pdfkit cannot unpack
  // throws where nothing catches it and stops the API process.
  if (logo && isDrawableLogo(logo)) {
    try {
      doc.image(logo, PAGE_MARGIN, y, {
        fit: [width, 34],
        align: "center",
        valign: "center",
      });
      y += 40;
    } catch {
      // An image pdfkit cannot read: the invoice goes out without it.
    }
  }

  const line = (text: string, size: number, color: string, bold = false) => {
    const value = pdfText(text);
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(size)
      .fillColor(color)
      .text(value, PAGE_MARGIN, y, { width, align: "center" });
    y += doc.heightOfString(value, { width });
  };

  const seller = invoice.seller;
  line(seller.name, 10, MUTED);
  if (seller.address)
    line(seller.address.replace(/\s*\n\s*/g, ", "), 7.5, MUTED);
  const contact = [
    seller.gstin ? `GSTIN: ${seller.gstin}` : null,
    seller.email,
    seller.phone,
  ].filter(Boolean);
  if (contact.length > 0) line(contact.join("  |  "), 7.5, MUTED);

  return y + 10;
}

/** The dark bar, then who is billed and the invoice's number and date. */
function drawInvoiceDetails(doc: Doc, invoice: Invoice, top: number): number {
  const width = span(0, 6);
  let y = top;

  cell(
    doc,
    { x: PAGE_MARGIN, y, width, height: 18 },
    [{ text: "INVOICE", color: "#ffffff" }],
    { align: "center", fill: BAR, middle: true },
  );
  y += 18;

  const date = invoiceDate(invoice.paidAt ?? invoice.createdAt);
  const rightX = columnX(3);
  const labelWidth = span(3, 3);
  const valueX = columnX(4);
  const valueWidth = span(4, 6);

  const numberLines: CellText[] = [
    { text: "Invoice No", bold: true },
    { text: invoice.invoiceNumber },
  ];
  const dateLines: CellText[] = [
    { text: "Invoice Date", bold: true },
    { text: date },
  ];
  const firstHeight = Math.max(
    cellHeight(doc, numberLines, labelWidth),
    cellHeight(doc, dateLines, valueWidth),
  );
  const rows: [CellText[], CellText[], number][] = [
    [numberLines, dateLines, firstHeight],
    [
      [{ text: "Email", bold: true }],
      [{ text: invoice.buyer.email || "—" }],
      0,
    ],
    [
      [{ text: "Phone", bold: true }],
      [{ text: invoice.buyer.phone || "—" }],
      0,
    ],
  ];
  for (const row of rows) {
    if (row[2] === 0) {
      row[2] = Math.max(
        cellHeight(doc, row[0], labelWidth),
        cellHeight(doc, row[1], valueWidth),
      );
    }
  }
  const blockHeight = rows.reduce((total, row) => total + row[2], 0);

  cell(doc, { x: PAGE_MARGIN, y, width: span(0, 2), height: blockHeight }, [
    { text: "Bill To:", bold: true },
    { text: invoice.buyer.name },
  ]);
  let rowY = y;
  for (const [label, value, height] of rows) {
    cell(doc, { x: rightX, y: rowY, width: labelWidth, height }, label, {
      align: "center",
      middle: true,
    });
    cell(doc, { x: valueX, y: rowY, width: valueWidth, height }, value, {
      align: "center",
      middle: true,
    });
    rowY += height;
  }
  return y + blockHeight;
}

/** One row of the item table, its cells as tall as its tallest. */
function drawRow(
  doc: Doc,
  y: number,
  cells: {
    from: number;
    to: number;
    lines: CellText[];
    options?: CellOptions;
  }[],
): number {
  const height = Math.max(
    ...cells.map((c) => cellHeight(doc, c.lines, span(c.from, c.to))),
  );
  for (const c of cells) {
    cell(
      doc,
      { x: columnX(c.from), y, width: span(c.from, c.to), height },
      c.lines,
      { middle: true, ...c.options },
    );
  }
  return y + height;
}

function drawItemHeader(doc: Doc, y: number, currency: string): number {
  const labels = [
    "Sl No.",
    "Description",
    "Qty",
    `Gross Amount (${currency})`,
    "GST Rate",
    "Discount",
    `Net Amount (${currency})`,
  ];
  return drawRow(
    doc,
    y,
    labels.map((text, index) => ({
      from: index,
      to: index,
      lines: [{ text, bold: true }],
      options: { align: index === 0 ? "left" : "center" },
    })),
  );
}

/** Starts a new page when `height` more would run past the bottom margin. */
function ensureRoom(doc: Doc, y: number, height: number): number {
  if (y + height <= doc.page.height - PAGE_MARGIN) return y;
  doc.addPage();
  return PAGE_MARGIN;
}

function drawItems(doc: Doc, invoice: Invoice, top: number): number {
  const currency = invoice.currency.toUpperCase();
  const money = (value: number) => amount(value, currency);
  let y = drawItemHeader(doc, top, currency);

  let gross = 0;
  let discount = 0;
  let net = 0;
  invoice.items.forEach((item, index) => {
    const itemGross = item.unitPrice * item.quantity;
    gross += itemGross;
    discount += item.discountAmount;
    net += item.finalAmount;

    const rowHeight = cellHeight(doc, [{ text: item.title }], span(1, 1));
    const next = ensureRoom(doc, y, rowHeight);
    if (next !== y) y = drawItemHeader(doc, next, currency);
    y = drawRow(doc, y, [
      { from: 0, to: 0, lines: [{ text: String(index + 1) }] },
      { from: 1, to: 1, lines: [{ text: item.title }] },
      {
        from: 2,
        to: 2,
        lines: [{ text: String(item.quantity) }],
        options: { align: "center" },
      },
      { from: 3, to: 3, lines: [{ text: money(itemGross) }] },
      {
        from: 4,
        to: 4,
        lines: [
          {
            text:
              item.taxRatePercent > 0
                ? `${Number(item.taxRatePercent.toFixed(2))}%`
                : "—",
          },
        ],
        options: { align: "center" },
      },
      {
        from: 5,
        to: 5,
        lines: [{ text: money(item.discountAmount) }],
        options: { align: "center" },
      },
      {
        from: 6,
        to: 6,
        lines: [{ text: money(item.finalAmount) }],
        options: { align: "right" },
      },
    ]);
  });

  y = ensureRoom(doc, y, 30);
  const bold = (text: string): CellText[] => [{ text, bold: true }];
  return drawRow(doc, y, [
    { from: 0, to: 2, lines: bold("Total"), options: { align: "center" } },
    { from: 3, to: 3, lines: bold(money(gross)) },
    { from: 4, to: 4, lines: bold("—"), options: { align: "center" } },
    {
      from: 5,
      to: 5,
      lines: bold(money(discount)),
      options: { align: "center" },
    },
    { from: 6, to: 6, lines: bold(money(net)), options: { align: "right" } },
  ]);
}

/** Grand total in figures and words, the signatory, and the footer note. */
function drawFooter(
  doc: Doc,
  invoice: Invoice,
  settings: PlatformInvoiceSettings,
  top: number,
): void {
  const currency = invoice.currency.toUpperCase();
  let y = ensureRoom(doc, top, 120);

  y = drawRow(doc, y, [
    {
      from: 0,
      to: 0,
      lines: [{ text: "Grand Total(in words)", bold: true, size: 8 }],
      options: { middle: false },
    },
    {
      from: 1,
      to: 2,
      lines: [{ text: invoice.totalInWords }],
      options: { middle: false },
    },
    {
      from: 3,
      to: 4,
      lines: [{ text: "Grand Total", bold: true }],
      options: { align: "center", middle: false },
    },
    {
      from: 5,
      to: 6,
      lines: [{ text: amount(invoice.totalAmount, currency), bold: true }],
      options: { align: "right", middle: false },
    },
  ]);

  const signatory: CellText[] = [
    { text: `For ${invoice.seller.name}`, bold: true },
  ];
  if (settings.signatoryLabel) {
    signatory.push({ text: settings.signatoryLabel, size: 7 });
  }
  y = drawRow(doc, y, [
    { from: 0, to: 2, lines: [{ text: "" }] },
    { from: 3, to: 6, lines: signatory, options: { align: "center" } },
  ]);

  drawRow(doc, y, [
    {
      from: 0,
      to: 4,
      lines: [{ text: settings.footerNote, size: 7 }],
      options: { align: "center" },
    },
    { from: 5, to: 5, lines: [{ text: "" }] },
    {
      from: 6,
      to: 6,
      lines: [{ text: "E. & O.E", size: 7 }],
      options: { align: "right" },
    },
  ]);
}

/**
 * The invoice as an A4 PDF, laid out like the academy's paper invoice:
 * the seller at the top, then who is billed, the items, the total in
 * figures and words, and the signatory.
 */
export async function renderInvoicePdf(
  invoice: Invoice,
  settings: PlatformInvoiceSettings,
  logo: Buffer | null,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    info: {
      Title: pdfText(`Invoice ${invoice.invoiceNumber}`),
      Author: pdfText(invoice.seller.name),
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  let y = drawSellerHeader(doc, invoice, logo);
  y = drawInvoiceDetails(doc, invoice, y);
  y = drawItems(doc, invoice, y);
  drawFooter(doc, invoice, settings, y);

  doc.end();
  return await done;
}
