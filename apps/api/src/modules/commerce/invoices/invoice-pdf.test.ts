import assert from "node:assert/strict";
import { test } from "node:test";
import { crc32, deflateSync } from "node:zlib";

import {
  DEFAULT_PLATFORM_INVOICE_SETTINGS,
  type Invoice,
} from "@veolms/contracts";
import { isDrawablePng } from "./invoice-logo.ts";
import { pdfText, renderInvoicePdf } from "./invoice-pdf.ts";

/** A PNG built byte by byte; by default 2×1 RGB with valid rows. */
function tinyPng({
  width = 2,
  height = 1,
  colourType = 2,
  interlace = 0,
  pixels = Buffer.from([0, 0x6e, 0x7c, 0xff, 0x11, 0x18, 0x27]),
}: {
  width?: number;
  height?: number;
  colourType?: number;
  interlace?: number;
  /** The unpacked rows, each led by its filter byte. */
  pixels?: Buffer;
} = {}): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = colourType;
  header[12] = interlace;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const invoice: Invoice = {
  invoiceNumber: "2e50/2026/003647",
  orderNumber: "ORD-20261018-AB12CD",
  purchaseId: "7f0c2a4e-1d1b-4c55-9f7e-2a9b3c4d5e6f",
  buyer: {
    userId: "0b6d3a3c-58f3-4a8f-8d3e-3b0f6c1a2b3c",
    name: "Shakti prakash Dehuri",
    email: "shakti@example.com",
    phone: "9937042400",
  },
  seller: {
    name: "PROCODRR LABS LLP",
    logoUrl: null,
    address: "No 235, 2nd Floor, Indiranagar, Bengaluru 560038",
    gstin: null,
    email: null,
    phone: null,
  },
  currency: "INR",
  subtotalAmount: 79_900,
  discountAmount: 0,
  taxAmount: 0,
  totalAmount: 79_900,
  totalInWords: "Seven Hundred Ninety Nine INR Only",
  paymentReference: "pay_123",
  items: [
    {
      title: "The Complete JavaScript Course",
      quantity: 1,
      taxRatePercent: 0,
      unitPrice: 79_900,
      discountAmount: 0,
      finalAmount: 79_900,
    },
  ],
  paidAt: new Date("2026-10-18T06:30:00Z"),
  createdAt: new Date("2026-10-18T06:29:00Z"),
};

await test("an invoice renders as a PDF document", async () => {
  const pdf = await renderInvoicePdf(
    invoice,
    DEFAULT_PLATFORM_INVOICE_SETTINGS,
    null,
  );
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(pdf.subarray(-8).toString("latin1").includes("%%EOF"));
});

await test("an invoice with the academy logo renders", async () => {
  const pdf = await renderInvoicePdf(
    invoice,
    DEFAULT_PLATFORM_INVOICE_SETTINGS,
    tinyPng(),
  );
  assert.ok(pdf.toString("latin1").includes("/Subtype /Image"));
});

await test("a damaged PNG logo is refused before it reaches the PDF", () => {
  const png = tinyPng();
  assert.equal(isDrawablePng(png), true);
  // Damage the compressed image data (inside the IDAT chunk).
  const damaged = Buffer.from(png);
  const idat = damaged.indexOf("IDAT", 0, "latin1");
  damaged.fill(0xff, idat + 6, idat + 10);
  assert.equal(isDrawablePng(damaged), false);
  assert.equal(isDrawablePng(Buffer.from("GIF89a")), false);
});

await test("a PNG whose data unpacks but whose rows are invalid is refused", () => {
  // 2×2 RGBA, the second row with filter type 9: this unpacks cleanly but
  // made pdfkit throw where nothing could catch it, stopping the API.
  const row = (filter: number) =>
    Buffer.from([filter, 1, 2, 3, 255, 4, 5, 6, 255]);
  const valid = Buffer.concat([row(0), row(1)]);
  const invalid = Buffer.concat([row(0), row(9)]);
  const rgba = { width: 2, height: 2, colourType: 6 };
  assert.equal(isDrawablePng(tinyPng({ ...rgba, pixels: valid })), true);
  assert.equal(isDrawablePng(tinyPng({ ...rgba, pixels: invalid })), false);
  // Too little image data for the size it claims.
  assert.equal(
    isDrawablePng(tinyPng({ ...rgba, pixels: valid.subarray(0, 12) })),
    false,
  );
  // Interlaced images are not checked row by row, so they are refused.
  assert.equal(
    isDrawablePng(tinyPng({ ...rgba, pixels: valid, interlace: 1 })),
    false,
  );
});

await test("a long order runs onto more pages instead of off the page", async () => {
  const items = Array.from({ length: 60 }, (_, index) => ({
    ...invoice.items[0]!,
    title: `Course ${index + 1}`,
  }));
  const pdf = await renderInvoicePdf(
    { ...invoice, items },
    DEFAULT_PLATFORM_INVOICE_SETTINGS,
    null,
  );
  const pages = pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? [];
  assert.ok(pages.length >= 2, `expected 2+ pages, got ${pages.length}`);
});

await test("text the built-in font cannot draw is replaced, not garbled", () => {
  assert.equal(pdfText("Zoë — ₹799"), "Zoë — Rs.799");
  assert.equal(pdfText("राम"), "???");
});
