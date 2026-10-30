import {
  DEFAULT_MAX_DEVICES_PER_STUDENT,
  DEFAULT_PLATFORM_APPEARANCE_SETTINGS,
  DEFAULT_PLATFORM_INVOICE_SETTINGS,
  platformAppearanceSettingsSchema,
  platformInvoiceSettingsSchema,
  platformSecuritySettingsSchema,
  type PlatformInvoiceSettings,
  type PlatformSettings,
  type PlatformSettingsResponse,
  type PublicPlatformSettings,
  type UpdatePlatformSettingsRequest,
} from "@veolms/contracts";
import { cacheTags, createCache, invalidateCache } from "@veolms/api-core";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { config } from "../../config.ts";
import { httpError } from "../../lib/errors.ts";
import {
  findPlatformSettings,
  isMissingPlatformSettingsTable,
  savePlatformSettings,
} from "./platform-settings.repository.ts";

/**
 * The settings are read by public pages, sign-in, checkout and every
 * invoice, so they are kept in memory. A save replaces them in this process
 * and clears them in every other (`site`); this TTL only bounds a missed
 * message.
 */
const SETTINGS_CACHE_MS = 5 * 60_000;
const SETTINGS_KEY = "settings";
/**
 * Accounts opened before this are not asked to verify a mobile number to
 * enrol (Platform > Security): the requirement is for new learners, and
 * learners who were already here keep enrolling as they did.
 */
export const PHONE_VERIFICATION_NEW_ACCOUNTS_FROM = new Date(
  "2026-10-28T00:00:00Z",
);

type StoredDocument = Record<string, Record<string, unknown>>;

interface StoredSettings {
  /** Only what an admin has set; anything missing follows its default. */
  document: StoredDocument;
  settings: PlatformSettings;
  updatedAt: Date | null;
}

// One copy for every service instance: the auth module builds its own
// instance for each route plugin, and all of them must see a save at once.
const cachedSettings = createCache<StoredSettings>({
  name: "platform.settings",
  ttlMs: SETTINGS_CACHE_MS,
  maxBytes: 1024 * 1024,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDocument(value: unknown): StoredDocument {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]),
    ),
  );
}

/** Each invoice detail as saved, or its default when it does not read. */
function resolveInvoiceSettings(
  saved: Record<string, unknown>,
): PlatformInvoiceSettings {
  const fields = platformInvoiceSettingsSchema.shape;
  const read = <K extends keyof PlatformInvoiceSettings>(
    key: K,
  ): PlatformInvoiceSettings[K] => {
    const parsed = fields[key].safeParse(saved[key]);
    return parsed.success
      ? (parsed.data as PlatformInvoiceSettings[K])
      : DEFAULT_PLATFORM_INVOICE_SETTINGS[key];
  };
  return {
    companyName: read("companyName"),
    address: read("address"),
    gstin: read("gstin"),
    email: read("email"),
    phone: read("phone"),
    numberPrefix: read("numberPrefix"),
    signatoryLabel: read("signatoryLabel"),
    footerNote: read("footerNote"),
    showLogo: read("showLogo"),
  };
}

/**
 * The settings in force: each one saved by an admin, or its default. A
 * document written by another version of the contract keeps what still
 * reads correctly, setting by setting, rather than failing the page.
 */
function resolveSettings(document: StoredDocument): PlatformSettings {
  const appearance = platformAppearanceSettingsSchema.safeParse(
    document.appearance ?? {},
  );
  const security = document.security ?? {};
  return {
    appearance: appearance.success
      ? appearance.data
      : DEFAULT_PLATFORM_APPEARANCE_SETTINGS,
    security: {
      // Until an admin decides, the server's configuration does.
      requireVerifiedPhoneForEnrollment:
        typeof security.requireVerifiedPhoneForEnrollment === "boolean"
          ? security.requireVerifiedPhoneForEnrollment
          : config.REQUIRE_VERIFIED_PHONE_FOR_ENROLLMENT,
      // Null is "no limit", saved by an admin; anything else that does not
      // read as a limit is the default.
      maxDevicesPerStudent:
        security.maxDevicesPerStudent === null
          ? null
          : (platformSecuritySettingsSchema.shape.maxDevicesPerStudent.safeParse(
              security.maxDevicesPerStudent,
            ).data ?? DEFAULT_MAX_DEVICES_PER_STUDENT),
    },
    invoice: resolveInvoiceSettings(document.invoice ?? {}),
  };
}

/** What every visitor is sent: everything but the invoice details. */
function toPublicSettings(settings: PlatformSettings): PublicPlatformSettings {
  return { appearance: settings.appearance, security: settings.security };
}

function toResponse(stored: StoredSettings): PlatformSettingsResponse {
  return {
    settings: stored.settings,
    updatedAt: stored.updatedAt?.toISOString() ?? null,
  };
}

export interface PlatformSettingsService {
  getSettings(): Promise<PlatformSettingsResponse>;
  /** The settings every visitor follows: nothing in them is private. */
  getPublicSettings(): Promise<PublicPlatformSettings>;
  /** What the academy prints on its invoices. */
  getInvoiceSettings(): Promise<PlatformInvoiceSettings>;
  updateSettings(
    changes: UpdatePlatformSettingsRequest,
    updatedBy: string | null,
  ): Promise<PlatformSettingsResponse>;
  /**
   * Whether enrolling needs a verified mobile number: the academy's
   * setting, and, for a given learner, only when their account is new (see
   * `PHONE_VERIFICATION_NEW_ACCOUNTS_FROM`).
   */
  requiresVerifiedPhoneForEnrollment(userId?: string): Promise<boolean>;
  /** How many devices a student may be signed in on at once; null for any. */
  maxDevicesPerStudent(): Promise<number | null>;
}

export function createPlatformSettingsService({
  database,
  onSecuritySettingsChange,
}: {
  database: Kysely<Database>;
  /**
   * Called after a save that changed a security setting, so that signed-in
   * requests stop using answers worked out under the old rules.
   */
  onSecuritySettingsChange?: () => void;
}): PlatformSettingsService {
  async function loadSettings(): Promise<StoredSettings> {
    let row: Awaited<ReturnType<typeof findPlatformSettings>>;
    try {
      row = await findPlatformSettings(database);
    } catch (error) {
      // Until the settings migration has run there is nothing to read, and
      // every page and sign-in must keep working on the defaults.
      if (!isMissingPlatformSettingsTable(error)) throw error;
      row = null;
    }
    const document = readDocument(row?.settings);
    return {
      document,
      settings: resolveSettings(document),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  function readSettings(): Promise<StoredSettings> {
    // A failed read is not kept: the next request tries again.
    return cachedSettings.fetch(SETTINGS_KEY, loadSettings, {
      tags: [cacheTags.site],
    });
  }

  async function updateSettings(
    changes: UpdatePlatformSettingsRequest,
    updatedBy: string | null,
  ): Promise<PlatformSettingsResponse> {
    // Read fresh, so a change saved by another process is not written over.
    cachedSettings.delete(SETTINGS_KEY);
    const current = await readSettings();
    // Only the settings named in the request are written; the others keep
    // following their defaults (the phone rule follows the server's
    // configuration until an admin sets it here).
    const document: StoredDocument = {
      ...current.document,
      ...(changes.appearance
        ? {
            appearance: {
              ...current.document.appearance,
              ...changes.appearance,
            },
          }
        : {}),
      ...(changes.security
        ? { security: { ...current.document.security, ...changes.security } }
        : {}),
      ...(changes.invoice
        ? { invoice: { ...current.document.invoice, ...changes.invoice } }
        : {}),
    };

    let row: Awaited<ReturnType<typeof savePlatformSettings>>;
    try {
      row = await savePlatformSettings(database, {
        settings: document,
        updatedBy,
      });
    } catch (error) {
      if (!isMissingPlatformSettingsTable(error)) throw error;
      throw httpError(
        503,
        "PLATFORM_SETTINGS_UNAVAILABLE",
        "Platform settings cannot be saved until the database is updated.",
      );
    }

    const saved: StoredSettings = {
      document: readDocument(row.settings),
      settings: resolveSettings(readDocument(row.settings)),
      updatedAt: row.updatedAt,
    };
    // Every other process reads the saved settings again; this one keeps
    // what it just wrote.
    invalidateCache([cacheTags.site]);
    cachedSettings.set(SETTINGS_KEY, saved, { tags: [cacheTags.site] });
    if (
      JSON.stringify(saved.settings.security) !==
      JSON.stringify(current.settings.security)
    ) {
      onSecuritySettingsChange?.();
    }
    return toResponse(saved);
  }

  return {
    getSettings: async () => toResponse(await readSettings()),
    getPublicSettings: async () =>
      toPublicSettings((await readSettings()).settings),
    getInvoiceSettings: async () => (await readSettings()).settings.invoice,
    updateSettings,
    maxDevicesPerStudent: async () =>
      (await readSettings()).settings.security.maxDevicesPerStudent,
    requiresVerifiedPhoneForEnrollment: async (userId?: string) => {
      const required = (await readSettings()).settings.security
        .requireVerifiedPhoneForEnrollment;
      if (!required || !userId) return required;
      const account = await database
        .selectFrom("users")
        .select("created_at")
        .where("id", "=", userId)
        .executeTakeFirst();
      return (
        !account || account.created_at >= PHONE_VERIFICATION_NEW_ACCOUNTS_FROM
      );
    },
  };
}
