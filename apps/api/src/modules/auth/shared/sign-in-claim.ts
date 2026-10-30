import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

/**
 * Something another module grants on sign-in, keyed by a verified email
 * (team access added by email before the person had an account). Auth
 * knows only this signature; the team module registers the function when
 * its routes load. Returns how many grants were claimed, so the session can
 * reload its roles when anything changed. Must not throw.
 */
export type SignInClaim = (
  database: Kysely<Database>,
  user: { id: string; email: string },
) => Promise<number>;

let claim: SignInClaim | null = null;

export function setSignInClaim(next: SignInClaim | null): void {
  claim = next;
}

export async function runSignInClaim(
  database: Kysely<Database>,
  user: { id: string; email: string | null; email_verified_at: Date | null },
): Promise<number> {
  // Only a verified address may claim what was set aside for it.
  if (!claim || !user.email || !user.email_verified_at) return 0;
  return await claim(database, { id: user.id, email: user.email });
}
