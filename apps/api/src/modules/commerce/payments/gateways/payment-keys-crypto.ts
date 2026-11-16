import crypto from "node:crypto";

import { config } from "../../../../config.ts";

/**
 * Encryption for an academy's payment gateway secrets (Razorpay Key ID, Key
 * Secret, webhook secret) and nothing else.
 *
 * - AES-256-GCM, a fresh random 12-byte IV per value, a 16-byte auth tag:
 *   any change to a stored value is detected and decryption fails.
 * - The key comes only from `PAYMENT_KEYS_ENCRYPTION_KEY` in the server's
 *   environment: never the database, never shared with another use (MFA
 *   secrets and workshop join links have their own key). Unset, nothing is
 *   stored and nothing is read: there is no fallback.
 * - Stored as `v1:<iv>:<tag>:<data>` (hex). The version says which scheme
 *   and key generation wrote it, for rotation (`encryption-key:rotate
 *   --payment-keys`).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION = "v1";
/** Keeps this key's derived bytes apart from any other use of the same text. */
const CONTEXT = "veolms:payment-gateway-keys:v1";

export class PaymentKeysEncryptionUnavailable extends Error {
  constructor() {
    super("PAYMENT_KEYS_ENCRYPTION_KEY is not set");
    this.name = "PaymentKeysEncryptionUnavailable";
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

/** Whether this server can store and read payment keys. */
export function paymentKeysEncryptionReady(): boolean {
  return Boolean(config.PAYMENT_KEYS_ENCRYPTION_KEY);
}

function configuredKey(): string {
  const key = config.PAYMENT_KEYS_ENCRYPTION_KEY;
  if (!key) throw new PaymentKeysEncryptionUnavailable();
  return key;
}

/** With an explicit key: for the rotation command. */
export function encryptPaymentSecretWith(
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
export function decryptPaymentSecretWith(
  payload: string,
  keySource: string,
): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Not a payment secret in the v1 format");
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

export function encryptPaymentSecret(plainText: string): string {
  return encryptPaymentSecretWith(plainText, configuredKey());
}

export function decryptPaymentSecret(payload: string): string {
  return decryptPaymentSecretWith(payload, configuredKey());
}
