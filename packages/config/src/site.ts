/**
 * The settings that name and address the site: its name in emails and on
 * passkeys, the address its links point to, the sender of its emails, and
 * the passkey domain.
 *
 * Read them through `siteSettings(config)` rather than from the config
 * directly. By default they are the configured values (ACADEMY_NAME,
 * WEB_URL, EMAIL_FROM, RP_ID, WEBAUTHN_RP_IDS, WEBAUTHN_ORIGINS). A
 * deployment that serves the same code under several names sets a provider
 * with `setSiteSettingsProvider`, read at the moment a setting is needed
 * (for example from an AsyncLocalStorage set per request); what it leaves
 * out keeps the configured value.
 */

export interface SiteSettings {
  /** Shown in emails, on authenticator apps and on passkeys. */
  name: string;
  /** The website's origin, which links in emails and redirects point to. */
  webUrl: string;
  /** The From address of emails. */
  emailFrom: string;
  /** The passkey (WebAuthn) relying party. */
  passkeys: {
    /** The default relying party id. */
    rpId: string;
    /** Every relying party id a passkey may belong to. */
    rpIds: readonly string[];
    /** Every origin a passkey ceremony may come from. */
    origins: readonly string[];
  };
}

/** The configured values a site's settings default to. */
export interface SiteSettingsSource {
  ACADEMY_NAME: string;
  WEB_URL: string;
  EMAIL_FROM: string;
  RP_ID: string;
  WEBAUTHN_RP_IDS: readonly string[];
  WEBAUTHN_ORIGINS: readonly string[];
}

export type SiteSettingsOverride = Partial<Omit<SiteSettings, "passkeys">> & {
  passkeys?: Partial<SiteSettings["passkeys"]>;
};

let provider: (() => SiteSettingsOverride | undefined) | null = null;

/** Sets (or with null removes) the provider of per-use site settings. */
export function setSiteSettingsProvider(
  next: (() => SiteSettingsOverride | undefined) | null,
): void {
  provider = next;
}

/** The site settings in effect right now. */
export function siteSettings(config: SiteSettingsSource): SiteSettings {
  const override = provider?.() ?? {};
  return {
    name: override.name || config.ACADEMY_NAME,
    webUrl: override.webUrl || config.WEB_URL,
    emailFrom: override.emailFrom || config.EMAIL_FROM,
    passkeys: {
      rpId: override.passkeys?.rpId || config.RP_ID,
      rpIds: override.passkeys?.rpIds ?? config.WEBAUTHN_RP_IDS,
      origins: override.passkeys?.origins ?? config.WEBAUTHN_ORIGINS,
    },
  };
}
