import crypto from "node:crypto";

import { config } from "../../config.ts";

/**
 * Encryption for affiliates' payout details (UPI id, bank account and IFSC,
 * as JSON) and PAN, and nothing else.
 *
 * - AES-256-GCM, a fresh random 12-byte IV per value, a 16-byte auth tag:
 *   any change to a stored value is detected and decryption fails.
 * - The key comes only from `AFFILIATE_PAYOUT_ENCRYPTION_KEY`: never the
 *   database, never shared with another use (the academy's payment keys,
 *   MFA secrets and workshop links each have their own). Unset, nothing is
 *   stored and nothing is read: there is no fallback.
 * - Stored as `v1:<iv>:<tag>:<data>` (hex), for rotation
 *   (`encryption-key:rotate --affiliate-payouts`).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION = "v1";
/** Keeps this key's derived bytes apart from any other use of the same text. */
const CONTEXT = "veolms:affiliate-payout-details:v1";

export class AffiliatePayoutEncryptionUnavailable extends Error {
  constructor() {
    super("AFFILIATE_PAYOUT_ENCRYPTION_KEY is not set");
    this.name = "AffiliatePayoutEncryptionUnavailable";
  }
}

function deriveKey(keySource: string): Buffer {
  return crypto
    .createHash("sha256")
    .update(CONTEXT)
    .update("\0")
    .update(keySource)
    .digest();
}

/** Whether this server can store and read payout details. */
export function affiliatePayoutEncryptionReady(): boolean {
  return Boolean(config.AFFILIATE_PAYOUT_ENCRYPTION_KEY);
}

function configuredKey(): string {
  const key = config.AFFILIATE_PAYOUT_ENCRYPTION_KEY;
  if (!key) throw new AffiliatePayoutEncryptionUnavailable();
  return key;
}

/** With an explicit key: for the rotation command. */
export function encryptPayoutSecretWith(
  plainText: string,
  keySource: string,
): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(keySource), iv);
  const data = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    data.toString("hex"),
  ].join(":");
}

/** With an explicit key: for the rotation command. Throws on any mismatch. */
export function decryptPayoutSecretWith(
  payload: string,
  keySource: string,
): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Not an affiliate payout secret in the v1 format");
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    deriveKey(keySource),
    Buffer.from(parts[1]!, "hex"),
  );
  decipher.setAuthTag(Buffer.from(parts[2]!, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3]!, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptPayoutSecret(plainText: string): string {
  return encryptPayoutSecretWith(plainText, configuredKey());
}

export function decryptPayoutSecret(payload: string): string {
  return decryptPayoutSecretWith(payload, configuredKey());
}
