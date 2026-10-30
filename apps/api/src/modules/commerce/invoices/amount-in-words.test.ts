import assert from "node:assert/strict";
import { test } from "node:test";

import { amountInWords, integerInWords } from "./amount-in-words.ts";
import {
  formatInvoiceNumber,
  invoicePdfKey,
  invoiceYear,
} from "./invoice.repository.ts";
import { invoiceFileName } from "./invoice.service.ts";

await test("an invoice total reads as the academy's paper invoice does", () => {
  assert.equal(
    amountInWords(79_900, "INR"),
    "Seven Hundred Ninety Nine INR Only",
  );
  assert.equal(amountInWords(0, "INR"), "Zero INR Only");
  assert.equal(
    amountInWords(9_950, "INR"),
    "Ninety Nine INR and Fifty Paise Only",
  );
});

await test("rupees are grouped in thousands, lakhs and crores", () => {
  assert.equal(
    integerInWords(1_499, true),
    "One Thousand Four Hundred Ninety Nine",
  );
  assert.equal(integerInWords(250_000, true), "Two Lakh Fifty Thousand");
  assert.equal(integerInWords(12_00_00_000, true), "Twelve Crore");
  assert.equal(integerInWords(1_00_000, false), "One Hundred Thousand");
});

await test("other currencies are grouped in thousands and millions", () => {
  assert.equal(
    amountInWords(2_500_000_00, "USD"),
    "Two Million Five Hundred Thousand USD Only",
  );
  assert.equal(amountInWords(1_005, "USD"), "Ten USD and 05/100 Only");
  assert.equal(
    amountInWords(1_500, "JPY"),
    "One Thousand Five Hundred JPY Only",
  );
});

await test("an invoice's stored file and download name follow its number", () => {
  assert.equal(
    invoicePdfKey("7f0c2a4e-1d1b-4c55-9f7e-2a9b3c4d5e6f"),
    "protected/invoices/7f0c2a4e-1d1b-4c55-9f7e-2a9b3c4d5e6f.pdf",
  );
  assert.equal(
    invoiceFileName("2e50/2026/003647"),
    "invoice-2e50-2026-003647.pdf",
  );
});

await test("invoice numbers read prefix / year / six-digit running number", () => {
  assert.equal(formatInvoiceNumber("2e50", 2026, 3647), "2e50/2026/003647");
  assert.equal(formatInvoiceNumber("", 2026, 1), "2026/000001");
});

await test("the year an invoice counts in is India's, not UTC's", () => {
  // 31 Dec 2025, 20:00 UTC is already 1 Jan 2026 in India.
  assert.equal(invoiceYear(new Date("2025-12-31T20:00:00Z")), 2026);
  assert.equal(invoiceYear(new Date("2025-12-31T18:00:00Z")), 2025);
});
