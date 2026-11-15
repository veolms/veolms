/**
 * The academy-wide settings an administrator manages on the Platform page,
 * and what applies before anything is saved. Kept free of dependencies (no
 * zod) so the web app's startup code can read the defaults without loading
 * the schemas; `platform-settings.ts` validates the same shapes.
 */

export const PLATFORM_DISPLAY_MODES = ["light", "dark", "device"] as const;
export type PlatformDisplayMode = (typeof PLATFORM_DISPLAY_MODES)[number];

export interface PlatformAppearanceSettings {
  /**
   * What everyone sees until they pick their own in Settings: light, dark,
   * or whatever their device is set to.
   */
  defaultDisplayMode: PlatformDisplayMode;
  /**
   * The colour theme everyone sees until they pick their own. One of the web
   * app's theme ids; an id it does not know falls back to its first theme.
   */
  defaultColorTheme: string;
  /**
   * The video player theme everyone sees until they pick their own in the
   * player's settings. A player theme id; an id the web app does not have
   * (a plugin theme that is not installed) plays as YouTube.
   */
  defaultVideoPlayerTheme: string;
}

export interface PlatformSecuritySettings {
  /** Enrolling in a course, free or paid, needs a verified mobile number. */
  requireVerifiedPhoneForEnrollment: boolean;
  /**
   * How many devices a student may be signed in on at once; null for no
   * limit. Signing in on one more asks them to sign one of the others out
   * first. Staff are not limited.
   */
  maxDevicesPerStudent: number | null;
  /**
   * How many devices a student may play video on at once; null for no limit.
   * The most recent play wins; the others pause within one sync interval (~1 minute) and show a
   * notice. Staff are never limited.
   */
  maxSimultaneousStreams: number | null;
}

/** What a student's device limit is until an admin changes it. */
export const DEFAULT_MAX_DEVICES_PER_STUDENT = 3;
/** The device limits an admin may set. */
export const MIN_MAX_DEVICES_PER_STUDENT = 1;
export const MAX_MAX_DEVICES_PER_STUDENT = 20;

/** How many simultaneous streams a student may have until an admin changes it. */
export const DEFAULT_MAX_SIMULTANEOUS_STREAMS = 1;
/** The stream limits an admin may set. */
export const MIN_MAX_SIMULTANEOUS_STREAMS = 1;
export const MAX_MAX_SIMULTANEOUS_STREAMS = 5;

/**
 * What the academy prints on the invoices its students download. Empty text
 * leaves that line off the invoice; an empty company name prints the
 * academy's name.
 */
export interface PlatformInvoiceSettings {
  /** The seller's legal name, e.g. "PROCODRR LABS LLP". */
  companyName: string;
  /** The registered address, as it should read on the invoice. */
  address: string;
  /** The GST registration number, when the seller has one. */
  gstin: string;
  email: string;
  phone: string;
  /**
   * Starts every invoice number: "<prefix>/<year>/<running number>". A
   * change applies to invoices issued from then on; issued numbers keep the
   * prefix they were given.
   */
  numberPrefix: string;
  /** Under "For <company name>" at the foot of the invoice. */
  signatoryLabel: string;
  /** The last line of the invoice. */
  footerNote: string;
  /** Print the academy's logo (General tab) above the company name. */
  showLogo: boolean;
  /**
   * A logo for the invoice only, printed instead of the General tab's one.
   * The emails are dark and the invoice is white, so a logo with light text
   * for the emails needs a dark-text version here. Null prints the General
   * tab's logo. Set by its own upload, never by a settings save.
   */
  logoUrl: string | null;
}

/**
 * Who the academy is in its legal pages (Terms, Privacy, Contact, ...). An
 * empty detail falls back to the invoice details, then the academy's name.
 */
export interface PlatformLegalSettings {
  /** The legal name the pages name, e.g. "Example Labs LLP". */
  companyName: string;
  /** The postal address, as the Contact page shows it, one line per line. */
  postalAddress: string;
  /** Where learners write about support, privacy or grievances. */
  contactEmail: string;
  /** The Grievance Officer the Contact and Privacy pages name. */
  grievanceOfficer: string;
}

/**
 * The academy's own artwork for its website (Platform > General). Each is
 * an uploaded PNG or JPEG; without one the site shows the build's own
 * artwork, or the academy's name where the build has none.
 */
export interface PlatformBrandingSettings {
  /** The wide logo on light pages: the sidebar, sign-in, the legal pages. */
  logoLightUrl: string | null;
  /** The same logo for dark pages; without one, the light pages' logo. */
  logoDarkUrl: string | null;
  /** A square icon: the browser tab, the compact sidebar, loading screens. */
  iconUrl: string | null;
}

/** The website's artwork, as its upload addresses name each one. */
export const PLATFORM_BRAND_ASSETS = [
  "logo-light",
  "logo-dark",
  "icon",
] as const;
export type PlatformBrandAsset = (typeof PLATFORM_BRAND_ASSETS)[number];

/** Which setting each upload sets. */
export const PLATFORM_BRAND_ASSET_FIELDS: Record<
  PlatformBrandAsset,
  keyof PlatformBrandingSettings
> = {
  "logo-light": "logoLightUrl",
  "logo-dark": "logoDarkUrl",
  icon: "iconUrl",
};

/** The smallest icon accepted: sharp in a browser tab and on a phone. */
export const PLATFORM_ICON_MIN_SIDE = 96;

export interface PlatformSettings {
  appearance: PlatformAppearanceSettings;
  security: PlatformSecuritySettings;
  branding: PlatformBrandingSettings;
  invoice: PlatformInvoiceSettings;
  legal: PlatformLegalSettings;
}

/**
 * What every visitor's browser is sent. The invoice details are left out:
 * no page needs them, and only the invoices themselves print them.
 */
export type PublicPlatformSettings = Omit<
  PlatformSettings,
  "invoice" | "legal"
>;

export const DEFAULT_PLATFORM_BRANDING_SETTINGS: PlatformBrandingSettings = {
  logoLightUrl: null,
  logoDarkUrl: null,
  iconUrl: null,
};

export const DEFAULT_PLATFORM_LEGAL_SETTINGS: PlatformLegalSettings = {
  companyName: "",
  postalAddress: "",
  contactEmail: "",
  grievanceOfficer: "",
};

export const DEFAULT_PLATFORM_INVOICE_SETTINGS: PlatformInvoiceSettings = {
  companyName: "",
  address: "",
  gstin: "",
  email: "",
  phone: "",
  numberPrefix: "INV",
  signatoryLabel: "Authorised signatory",
  footerNote:
    "This is computer generated receipt and does not require physical signature",
  showLogo: true,
  logoUrl: null,
};

export const DEFAULT_PLATFORM_APPEARANCE_SETTINGS: PlatformAppearanceSettings =
  {
    defaultDisplayMode: "dark",
    defaultColorTheme: "ocean",
    defaultVideoPlayerTheme: "youtube",
  };
