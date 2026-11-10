/**
 * Changing the email address or mobile number on one's own account.
 *
 * A change goes in two steps, each proven with a code: first the current
 * value (the code goes to the address or number on the account now), then
 * the new one (the code goes there). Proving the current value keeps a
 * stolen session from moving the account to someone else's address or
 * number; a value never confirmed proves nothing, and needs no proof.
 * Someone who has lost the current value asks support, whose staff change
 * it for them.
 */

import { SUPPORTED_COUNTRIES } from "@veolms/contracts/auth/phone-countries";

export type ContactChannel = "email" | "phone";

/** How long a change stays open once started. */
export const CONTACT_CHANGE_TTL_MS = 15 * 60 * 1000;

export type ContactChangeStep =
  "prove_current" | "confirm_new" | "completed" | "expired";

export interface ContactChangeState {
  current_proven_at: Date | null;
  expires_at: Date;
  completed_at: Date | null;
}

/** Where a change stands: what it waits for, or that it is over. */
export function contactChangeStep(
  change: ContactChangeState,
  now: Date,
): ContactChangeStep {
  if (change.completed_at) return "completed";
  if (now.getTime() >= change.expires_at.getTime()) return "expired";
  return change.current_proven_at ? "confirm_new" : "prove_current";
}

/** "nilesh@getgtm.ai" → "n*****@getgtm.ai": enough to recognise, not to read. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  const name = email.slice(0, at);
  return `${name[0]}${"*".repeat(Math.max(name.length - 1, 1))}${email.slice(at)}`;
}

/** The calling codes a number can be entered with, longest first. */
const DIAL_CODES = [
  ...new Set(SUPPORTED_COUNTRIES.map((country) => country.dialCode)),
].sort((a, b) => b.length - a.length);

/**
 * "+919876543210" → "+91 •••••• 3210": the calling code, read from the
 * supported countries, and the number's last four digits. A calling code
 * not on that list is left out rather than guessed.
 */
export function maskPhone(phone: string): string {
  const last = phone.replace(/\D/g, "").slice(-4);
  const dialCode = DIAL_CODES.find((code) => phone.startsWith(code));
  return `${dialCode ? `${dialCode} ` : ""}•••••• ${last}`;
}
