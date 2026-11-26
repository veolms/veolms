import assert from "node:assert/strict";
import { test } from "node:test";

import {
  certificateNameProblem,
  formatCertificateCode,
  normalizeCertificateCode,
  normalizeCertificateName,
} from "@veolms/contracts";

import { calendarDateIn, generateCertificateCode } from "./certificate-code.ts";
import {
  canPrintName,
  renderCertificatePdf,
} from "./render/certificate-pdf.ts";

void test("a new code is 16 Crockford characters from 80 random bits", () => {
  const codes = new Set(
    Array.from({ length: 2000 }, () => generateCertificateCode()),
  );
  assert.equal(codes.size, 2000);
  for (const code of codes) assert.match(code, /^[0-9A-HJKMNP-TV-Z]{16}$/u);
  // All zero bits and all one bits give the alphabet's first and last letters.
  assert.equal(
    generateCertificateCode((size) => Buffer.alloc(size, 0)),
    "0000000000000000",
  );
  assert.equal(
    generateCertificateCode((size) => Buffer.alloc(size, 0xff)),
    "ZZZZZZZZZZZZZZZZ",
  );
});

void test("a typed or followed code is read as Crockford reads it", () => {
  assert.equal(
    normalizeCertificateCode(" 7p5s-1588-z9m0-4asg "),
    "7P5S1588Z9M04ASG",
  );
  // O is read as 0, I and L as 1.
  assert.equal(
    normalizeCertificateCode("OOOO-IIII-LLLL-0000"),
    "0000111111110000",
  );
  // U is not in the alphabet; too short or too long is no code.
  assert.equal(normalizeCertificateCode("UUUU-UUUU-UUUU-UUUU"), null);
  assert.equal(normalizeCertificateCode("ABCD"), null);
  assert.equal(normalizeCertificateCode("A".repeat(33)), null);
  assert.equal(normalizeCertificateCode("<script>alert(1)</script>"), null);
  // A legacy 24-hex id from the old platform is still a valid code shape.
  assert.equal(
    normalizeCertificateCode("66efb235e72b87fa5aebfa37"),
    "66EFB235E72B87FA5AEBFA37",
  );
  assert.equal(
    formatCertificateCode("7P5S1588Z9M04ASG"),
    "7P5S-1588-Z9M0-4ASG",
  );
});

void test("names: English letters, spaces and . ' - only", () => {
  assert.equal(normalizeCertificateName("  Aarav   Sharma "), "Aarav Sharma");
  for (const name of [
    "Aarav Sharma",
    "Zoë O'Neil-Ñandú",
    "Dr. A. P. J. Abdul Kalam",
  ]) {
    assert.equal(certificateNameProblem(name), null, name);
  }
  // Another alphabet is asked for in English letters.
  assert.equal(
    certificateNameProblem("प्रशांत तिवारी"),
    "Write your name in English letters.",
  );
  assert.equal(
    certificateNameProblem("முருகன்"),
    "Write your name in English letters.",
  );
  assert.ok(certificateNameProblem("A"));
  assert.ok(certificateNameProblem("x".repeat(81)));
  assert.ok(certificateNameProblem("Aarav 123"));
  assert.ok(certificateNameProblem("https://evil.example"));
  assert.ok(certificateNameProblem("Aarav 🎓"));
  assert.ok(certificateNameProblem("-Aarav"));
});

void test("only names the template has letters for can be printed", () => {
  assert.equal(canPrintName("Aarav Sharma"), true);
  assert.equal(canPrintName("Zoë Ñandú"), true);
  // No Hindi or Tamil font is bundled: never printed as empty boxes.
  assert.equal(canPrintName("प्रशांत तिवारी"), false);
  assert.equal(canPrintName("முருகன்"), false);
});

void test("the issue date is the academy's calendar date", () => {
  // 23:30 in India on 26 November is still 26 November there.
  const lateEvening = new Date("2026-11-26T18:00:00Z");
  assert.equal(calendarDateIn(lateEvening, "Asia/Kolkata"), "2026-11-26");
  assert.equal(
    calendarDateIn(new Date("2026-11-26T19:00:00Z"), "Asia/Kolkata"),
    "2026-11-27",
  );
});

void test("a certificate is drawn as a PDF, the same each time", async () => {
  const input = {
    recipientName: "Prashant Tiwari",
    courseTitle: "The Complete JavaScript Course",
    issuedOn: "2026-11-26",
    issuedAt: new Date("2026-11-26T10:00:00Z"),
    displayCode: "7P5S-1588-Z9M0-4ASG",
    verifyUrl: "https://veolms.org/certificate/7P5S1588Z9M04ASG",
    verifyUrlShort: "veolms.org/certificate/7P5S-1588-Z9M0-4ASG",
  };
  const first = await renderCertificatePdf(input);
  assert.equal(first.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(first.length > 50_000 && first.length < 600_000, `${first.length}`);
  const second = await renderCertificatePdf(input);
  assert.equal(second.length, first.length);
});
