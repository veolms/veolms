import crypto from "node:crypto";

/**
 * Constant-time string comparison — defends against timing side-channel attacks
 * when comparing signatures, HMACs, or tokens.
 */
export function secureCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf-8");
  const bBuf = Buffer.from(b, "utf-8");

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}
