/**
 * Signing a person in who has already proved who they are on another site.
 *
 * A deployment that runs many sites from one server (each academy on its own
 * address) may have someone prove their email or mobile on one site, then
 * send them to another, where the session cookie of the first does not
 * reach. That deployment sets a provider with `setSignInHandoffProvider`:
 * given the one-time token the person arrives with, it answers who they are
 * (once; a token is spent by reading it), or null. The site then signs them
 * in as it would after a code: the account is found by that email or mobile,
 * or made if the site has none yet.
 *
 * With no provider (a single site, as a self-hosted install is), the
 * hand-over route answers that it does not exist.
 */

export interface HandedOverPerson {
  /** A verified email, or null when the person proved a mobile number. */
  email: string | null;
  /** A verified mobile number in international form (`+919876543210`). */
  phoneNo: string | null;
  /** The name a new account starts with. */
  displayName: string;
}

export type SignInHandoffProvider = (
  token: string,
) => Promise<HandedOverPerson | null>;

let provider: SignInHandoffProvider | null = null;

/** Sets (or with null removes) who answers hand-over tokens. */
export function setSignInHandoffProvider(
  next: SignInHandoffProvider | null,
): void {
  provider = next;
}

/** Who answers hand-over tokens, or null when the site takes none. */
export function signInHandoffProvider(): SignInHandoffProvider | null {
  return provider;
}
