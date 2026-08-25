import crypto from "node:crypto";
import { config } from "../../../config.ts";

import { AppError } from "../../../lib/errors.ts";
import type { IdentifierType } from "./auth.types.ts";

// 2. Token Hashing (SHA-256 for secure session storage and verification tokens)
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function resolveIdentifier(body: {
  email?: string | undefined;
  phoneNo?: string | undefined;
}): { identifier: string; identifierType: IdentifierType } {
  if (body.email) {
    return { identifier: body.email, identifierType: "email" };
  }

  if (body.phoneNo) {
    return { identifier: body.phoneNo, identifierType: "phone" };
  }

  throw new AppError(
    400,
    "INVALID_REQUEST",
    "Email or phone number is required.",
  );
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

// 3. Encrypted TOTP Secrets (AES-256-GCM)
export function encryptSecret(secret: string, key: string): string {
  const iv = crypto.randomBytes(12);
  const keyBuffer = crypto.createHash("sha256").update(key).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);
  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `v1:${iv.toString("hex")}:${tag}:${encrypted}`;
}

export function decryptSecret(encryptedSecret: string, key: string): string {
  const parts = encryptedSecret.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid or unsupported encrypted secret format");
  }
  const [, ivHex, tagHex, encryptedHex] = parts;
  if (!ivHex || !tagHex || !encryptedHex) {
    throw new Error("Invalid encrypted secret components");
  }
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const keyBuffer = crypto.createHash("sha256").update(key).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// 4. TOTP MFA support
function base32ToBuf(str: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char) {
      const val = alphabet.indexOf(char.toUpperCase());
      if (val !== -1) {
        bits += val.toString(2).padStart(5, "0");
      }
    }
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(
  email: string,
  academyName: string,
): { secret: string; uri: string } {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  for (let i = 0; i < 16; i++) {
    const idx = crypto.randomInt(0, 32);
    secret += alphabet[idx];
  }
  const label = encodeURIComponent(`${academyName}:${email}`);
  const issuer = encodeURIComponent(academyName);
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
  return { secret, uri };
}

export function verifyTotp(
  secret: string,
  code: string,
  options?: { backwardSteps?: number; forwardSteps?: number },
): { verified: boolean; step: bigint } | null {
  try {
    const secretBuf = base32ToBuf(secret);
    const stepDuration = config.TOTP_STEP_SECONDS;
    const now = Math.floor(Date.now() / 1000 / stepDuration);
    const backwardSteps = options?.backwardSteps ?? config.TOTP_BACKWARD_STEPS;
    const forwardSteps = options?.forwardSteps ?? config.TOTP_FORWARD_STEPS;

    for (let i = -backwardSteps; i <= forwardSteps; i++) {
      const counter = now + i;
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64BE(BigInt(counter));

      const hmac = crypto.createHmac("sha1", secretBuf);
      hmac.update(buf);
      const hmacResult = hmac.digest();

      const lastByte = hmacResult[hmacResult.length - 1];
      if (lastByte === undefined) continue;

      const offset = lastByte & 0xf;

      const byte0 = hmacResult[offset];
      const byte1 = hmacResult[offset + 1];
      const byte2 = hmacResult[offset + 2];
      const byte3 = hmacResult[offset + 3];

      if (
        byte0 === undefined ||
        byte1 === undefined ||
        byte2 === undefined ||
        byte3 === undefined
      ) {
        continue;
      }

      const binary =
        ((byte0 & 0x7f) << 24) |
        ((byte1 & 0xff) << 16) |
        ((byte2 & 0xff) << 8) |
        (byte3 & 0xff);

      const otp = (binary % 1000000).toString().padStart(6, "0");
      if (otp === code) {
        return { verified: true, step: BigInt(counter) };
      }
    }
  } catch {
    return null;
  }
  return null;
}
