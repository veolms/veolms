import crypto from "node:crypto";

import {
  CERTIFICATE_CODE_ALPHABET,
  CERTIFICATE_CODE_LENGTH,
} from "@veolms/contracts";

/**
 * A new certificate code: 16 Crockford base32 characters from 80 random
 * bits. Never derived from a row number, so codes cannot be guessed by
 * counting; at 80 bits, trying codes at the verify page's rate limit would
 * take longer than the age of the universe to hit one.
 */
export function generateCertificateCode(
  randomBytes: (size: number) => Buffer = crypto.randomBytes,
): string {
  const bytes = randomBytes((CERTIFICATE_CODE_LENGTH * 5) / 8);
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  let code = "";
  for (let index = 0; index < CERTIFICATE_CODE_LENGTH; index += 1) {
    code = CERTIFICATE_CODE_ALPHABET[Number(bits & 31n)]! + code;
    bits >>= 5n;
  }
  return code;
}

/** "2026-11-26": the calendar date of `at` in `timeZone`. */
export function calendarDateIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
