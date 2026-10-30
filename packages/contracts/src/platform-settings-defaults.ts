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
}

/** What a student's device limit is until an admin changes it. */
export const DEFAULT_MAX_DEVICES_PER_STUDENT = 3;
/** The device limits an admin may set. */
export const MIN_MAX_DEVICES_PER_STUDENT = 1;
export const MAX_MAX_DEVICES_PER_STUDENT = 20;

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
}

export interface PlatformSettings {
  appearance: PlatformAppearanceSettings;
  security: PlatformSecuritySettings;
  invoice: PlatformInvoiceSettings;
}

/**
 * What every visitor's browser is sent. The invoice details are left out:
 * no page needs them, and only the invoices themselves print them.
 */
export type PublicPlatformSettings = Omit<PlatformSettings, "invoice">;

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
};

export const DEFAULT_PLATFORM_APPEARANCE_SETTINGS: PlatformAppearanceSettings =
  {
    defaultDisplayMode: "dark",
    defaultColorTheme: "ocean",
  };
