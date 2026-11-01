import assert from "node:assert/strict";
import { test } from "node:test";

import { clearAllCaches } from "@veolms/api-core";
import { DEFAULT_PLATFORM_INVOICE_SETTINGS } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely, RawBuilder } from "kysely";

import { config } from "../../config.ts";
import {
  createPlatformSettingsService,
  PHONE_VERIFICATION_NEW_ACCOUNTS_FROM,
} from "./platform-settings.service.ts";

/**
 * Stands in for the database the repository talks to: the single settings
 * row, read whole and written whole. A write's JSON document is taken from
 * the parameter of the `::jsonb` cast the repository sends.
 */
function fakeDatabase(stored?: unknown) {
  // Settings are cached per process; each case starts from its own row.
  clearAllCaches();
  let row: { settings: unknown; updated_at: Date } | null =
    stored === undefined
      ? null
      : { settings: stored, updated_at: new Date("2026-10-01T00:00:00Z") };
  const writes: unknown[] = [];
  const database = {
    selectFrom: () => ({
      select: () => ({
        where: () => ({ executeTakeFirst: async () => row ?? undefined }),
      }),
    }),
    insertInto: () => ({
      values: (values: { settings: RawBuilder<unknown> }) => ({
        onConflict: () => ({
          returning: () => ({
            executeTakeFirstOrThrow: async () => {
              const node = values.settings.toOperationNode() as unknown as {
                parameters: { value: string }[];
              };
              const settings: unknown = JSON.parse(node.parameters[0]!.value);
              writes.push(settings);
              row = { settings, updated_at: new Date("2026-10-17T00:00:00Z") };
              return row;
            },
          }),
        }),
      }),
    }),
  } as unknown as Kysely<Database>;
  return { database, writes };
}

await test("before anything is saved, the defaults apply and the phone rule follows the server's configuration", async () => {
  const { database } = fakeDatabase();
  const service = createPlatformSettingsService({ database });

  assert.deepEqual(await service.getSettings(), {
    settings: {
      appearance: { defaultDisplayMode: "dark", defaultColorTheme: "ocean" },
      security: {
        requireVerifiedPhoneForEnrollment:
          config.REQUIRE_VERIFIED_PHONE_FOR_ENROLLMENT,
        maxDevicesPerStudent: 3,
        maxSimultaneousStreams: 1,
      },
      invoice: DEFAULT_PLATFORM_INVOICE_SETTINGS,
    },
    updatedAt: null,
  });
});

await test("a saved document fills in what it lacks, setting by setting", async () => {
  const { database } = fakeDatabase({
    appearance: { defaultDisplayMode: "light" },
    security: { studentTwoFactorEnabled: false, somethingRetired: 1 },
  });
  const service = createPlatformSettingsService({ database });

  const { settings } = await service.getSettings();
  assert.deepEqual(settings.appearance, {
    defaultDisplayMode: "light",
    defaultColorTheme: "ocean",
  });
  // The retired student two-factor switch is not read back.
  assert.deepEqual(settings.security, {
    requireVerifiedPhoneForEnrollment:
      config.REQUIRE_VERIFIED_PHONE_FOR_ENROLLMENT,
    maxDevicesPerStudent: 3,
    maxSimultaneousStreams: 1,
  });
});

await test("an appearance the contract no longer accepts falls back to the default look, not a broken page", async () => {
  const { database } = fakeDatabase({
    appearance: { defaultDisplayMode: "sepia", defaultColorTheme: "ocean" },
  });
  const service = createPlatformSettingsService({ database });

  assert.deepEqual((await service.getPublicSettings()).appearance, {
    defaultDisplayMode: "dark",
    defaultColorTheme: "ocean",
  });
});

await test("a save writes only what was set, so the phone rule keeps following the configuration", async () => {
  const { database, writes } = fakeDatabase({
    appearance: { defaultColorTheme: "grove" },
  });
  const service = createPlatformSettingsService({ database });

  const saved = await service.updateSettings(
    { appearance: { defaultDisplayMode: "light" } },
    null,
  );

  assert.deepEqual(writes, [
    { appearance: { defaultColorTheme: "grove", defaultDisplayMode: "light" } },
  ]);
  assert.equal(saved.settings.appearance.defaultColorTheme, "grove");
  assert.equal(
    saved.settings.security.requireVerifiedPhoneForEnrollment,
    config.REQUIRE_VERIFIED_PHONE_FOR_ENROLLMENT,
  );
  assert.equal(saved.updatedAt, "2026-10-17T00:00:00.000Z");
  // Every instance on the same database sees the save at once.
  const other = createPlatformSettingsService({ database });
  assert.equal(
    (await other.getSettings()).settings.appearance.defaultDisplayMode,
    "light",
  );
});

await test("invoice details are saved field by field, and a field that no longer reads falls back alone", async () => {
  const { database, writes } = fakeDatabase({
    invoice: { companyName: "PROCODRR LABS LLP", gstin: "not a gstin" },
  });
  const service = createPlatformSettingsService({ database });

  const before = await service.getInvoiceSettings();
  assert.equal(before.companyName, "PROCODRR LABS LLP");
  assert.equal(before.gstin, "", "an unreadable GSTIN is left off");
  assert.equal(before.numberPrefix, "INV");

  const saved = await service.updateSettings(
    { invoice: { numberPrefix: "2e50", showLogo: false } },
    null,
  );
  assert.deepEqual(writes, [
    {
      invoice: {
        companyName: "PROCODRR LABS LLP",
        gstin: "not a gstin",
        numberPrefix: "2e50",
        showLogo: false,
      },
    },
  ]);
  assert.equal(saved.settings.invoice.numberPrefix, "2e50");
  assert.equal(saved.settings.invoice.showLogo, false);
});

await test("visitors are not sent the invoice details", async () => {
  const { database } = fakeDatabase({
    invoice: { address: "No 235, Indiranagar, Bengaluru" },
  });
  const service = createPlatformSettingsService({ database });

  const publicSettings = await service.getPublicSettings();
  assert.deepEqual(Object.keys(publicSettings).sort(), [
    "appearance",
    "security",
  ]);
});

await test("only a change to a security setting drops the cached sign-in answers", async () => {
  const { database } = fakeDatabase();
  let dropped = 0;
  const service = createPlatformSettingsService({
    database,
    onSecuritySettingsChange: () => {
      dropped += 1;
    },
  });

  await service.updateSettings(
    { appearance: { defaultDisplayMode: "light" } },
    null,
  );
  assert.equal(dropped, 0);
  await service.updateSettings(
    {
      security: {
        requireVerifiedPhoneForEnrollment:
          config.REQUIRE_VERIFIED_PHONE_FOR_ENROLLMENT,
      },
    },
    null,
  );
  assert.equal(dropped, 0, "saving the value already in force changes nothing");
  await service.updateSettings(
    {
      security: {
        requireVerifiedPhoneForEnrollment:
          !config.REQUIRE_VERIFIED_PHONE_FOR_ENROLLMENT,
      },
    },
    null,
  );
  assert.equal(dropped, 1);
});

/** The settings row, and one account opened at `createdAt` (if any). */
function fakeDatabaseWithAccount(
  requireVerifiedPhoneForEnrollment: boolean,
  createdAt: Date | null,
) {
  clearAllCaches();
  const settings = { security: { requireVerifiedPhoneForEnrollment } };
  return {
    selectFrom: (table: string) => ({
      select: () => ({
        where: () => ({
          executeTakeFirst: async () =>
            table === "users"
              ? createdAt
                ? { created_at: createdAt }
                : undefined
              : { settings, updated_at: new Date("2026-10-01T00:00:00Z") },
        }),
      }),
    }),
  } as unknown as Kysely<Database>;
}

await test("only accounts opened since the phone rule began are asked for a verified number", async () => {
  const before = new Date(PHONE_VERIFICATION_NEW_ACCOUNTS_FROM.getTime() - 1);
  const since = PHONE_VERIFICATION_NEW_ACCOUNTS_FROM;

  const existing = createPlatformSettingsService({
    database: fakeDatabaseWithAccount(true, before),
  });
  assert.equal(await existing.requiresVerifiedPhoneForEnrollment("u1"), false);

  const fresh = createPlatformSettingsService({
    database: fakeDatabaseWithAccount(true, since),
  });
  assert.equal(await fresh.requiresVerifiedPhoneForEnrollment("u1"), true);

  // The academy-wide answer, with no learner, is the setting itself.
  assert.equal(await existing.requiresVerifiedPhoneForEnrollment(), true);
});

await test("with the phone rule off, no account is asked", async () => {
  const service = createPlatformSettingsService({
    database: fakeDatabaseWithAccount(
      false,
      new Date(PHONE_VERIFICATION_NEW_ACCOUNTS_FROM.getTime() + 1),
    ),
  });
  assert.equal(await service.requiresVerifiedPhoneForEnrollment("u1"), false);
});

await test("a student device limit: 3 until set, null for no limit, and a stray value falls back to 3", async () => {
  const read = async (stored: unknown) =>
    (
      await createPlatformSettingsService({
        database: fakeDatabase(stored).database,
      }).getSettings()
    ).settings.security.maxDevicesPerStudent;
  assert.equal(await read(undefined), 3);
  assert.equal(await read({ security: { maxDevicesPerStudent: 5 } }), 5);
  assert.equal(await read({ security: { maxDevicesPerStudent: null } }), null);
  assert.equal(await read({ security: { maxDevicesPerStudent: 0 } }), 3);
  assert.equal(await read({ security: { maxDevicesPerStudent: "many" } }), 3);
});

await test("a stream limit: 1 until set, null for no limit, and a stray value falls back to 1", async () => {
  const read = async (stored: unknown) =>
    (
      await createPlatformSettingsService({
        database: fakeDatabase(stored).database,
      }).getSettings()
    ).settings.security.maxSimultaneousStreams;
  assert.equal(await read(undefined), 1);
  assert.equal(await read({ security: { maxSimultaneousStreams: 3 } }), 3);
  assert.equal(
    await read({ security: { maxSimultaneousStreams: null } }),
    null,
  );
  assert.equal(await read({ security: { maxSimultaneousStreams: 0 } }), 1);
  assert.equal(await read({ security: { maxSimultaneousStreams: "many" } }), 1);
});
