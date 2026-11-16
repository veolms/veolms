/**
 * How the site signs people in with Google: which Google client it uses,
 * and where Google sends a visitor back to.
 *
 * Read them through `googleSignIn(config)`. By default they are the
 * configured client (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET), Google sends
 * the visitor straight back to the page that asked, and Google's own
 * prompts (One Tap, the silent check) run on the site's pages.
 *
 * A deployment that serves the same code under many addresses cannot
 * register each of them with Google, which takes no patterns. It sets a
 * provider with `setGoogleSignInProvider`, read at the moment sign-in is
 * set up or finished (for example from an AsyncLocalStorage set per
 * request), that names a relay: one address Google knows, which passes
 * Google's answer on to the page that asked. What the provider leaves out
 * keeps its default; an empty client id turns Google sign-in off.
 */

export interface GoogleSignInRelay {
  /** The relay's address, sent to Google as the return address. */
  redirectUri: string;
  /**
   * The `state` sent to Google: the sign-in's own state and the page to
   * return to, sealed so that only the relay can open it, and the relay
   * hands the page back the state it was given.
   */
  sealState(state: string, returnUri: string): string;
}

export interface GoogleSignInSettings {
  clientId: string;
  clientSecret: string;
  /** Google sends visitors to this relay instead of the asking page. */
  relay: GoogleSignInRelay | null;
  /**
   * Origins a sign-in may return to, besides those the API accepts
   * requests from (CORS): the site's own, when it is served under its
   * visitors' addresses.
   */
  returnOrigins: readonly string[];
  /**
   * Whether the site's pages may ask Google directly (One Tap, the silent
   * check before the sign-in window). Google answers them only on
   * addresses registered for the client.
   */
  promptsOnPage: boolean;
}

/** The configured values Google sign-in defaults to. */
export interface GoogleSignInSource {
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
}

export type GoogleSignInOverride = Partial<GoogleSignInSettings>;

let provider: (() => GoogleSignInOverride | undefined) | null = null;

/** Sets (or with null removes) the provider of per-use Google sign-in. */
export function setGoogleSignInProvider(
  next: (() => GoogleSignInOverride | undefined) | null,
): void {
  provider = next;
}

/** Google sign-in as it applies right now. */
export function googleSignIn(config: GoogleSignInSource): GoogleSignInSettings {
  const override = provider?.() ?? {};
  return {
    clientId: override.clientId ?? config.GOOGLE_CLIENT_ID ?? "",
    clientSecret: override.clientSecret ?? config.GOOGLE_CLIENT_SECRET ?? "",
    relay: override.relay ?? null,
    returnOrigins: override.returnOrigins ?? [],
    promptsOnPage: override.promptsOnPage ?? true,
  };
}
