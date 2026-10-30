/**
 * What the visitor has typed into the login form's email or mobile field,
 * kept when the login pop-up closes (a stray click on the page around it,
 * Escape, the close button) so that opening it again does not make them
 * type it again. It goes only when they clear the field themselves.
 *
 * Kept for this tab (sessionStorage), so it is gone when the tab is; held
 * in memory as well for a browser that refuses storage.
 */

export interface IdentifierDraft {
  email: string;
  mobile: string;
  /** The mobile number's country (its id in identifier.ts). */
  countryId?: string;
}

const IDENTIFIER_DRAFT_KEY = "veolms-login-identifier-draft";

let memoryDraft: IdentifierDraft = { email: "", mobile: "" };

export function readIdentifierDraft(): IdentifierDraft {
  if (typeof window === "undefined") return memoryDraft;
  try {
    const stored = window.sessionStorage.getItem(IDENTIFIER_DRAFT_KEY);
    if (!stored) return memoryDraft;
    const value = JSON.parse(stored) as Partial<IdentifierDraft>;
    return {
      email: typeof value.email === "string" ? value.email : "",
      mobile: typeof value.mobile === "string" ? value.mobile : "",
      ...(typeof value.countryId === "string"
        ? { countryId: value.countryId }
        : {}),
    };
  } catch {
    return memoryDraft;
  }
}

export function saveIdentifierDraft(update: Partial<IdentifierDraft>) {
  memoryDraft = { ...readIdentifierDraft(), ...update };
  try {
    if (!memoryDraft.email && !memoryDraft.mobile) {
      window.sessionStorage.removeItem(IDENTIFIER_DRAFT_KEY);
    } else {
      window.sessionStorage.setItem(
        IDENTIFIER_DRAFT_KEY,
        JSON.stringify(memoryDraft),
      );
    }
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}
