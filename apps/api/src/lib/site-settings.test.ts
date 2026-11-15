import assert from "node:assert/strict";
import { test } from "node:test";

import { setSiteSettingsProvider, siteSettings } from "@veolms/config";

const configured = {
  ACADEMY_NAME: "Configured Academy",
  WEB_URL: "https://configured.example",
  EMAIL_FROM: "noreply@configured.example",
  RP_ID: "configured.example",
  WEBAUTHN_RP_IDS: ["configured.example"],
  WEBAUTHN_ORIGINS: ["https://configured.example"],
};

await test("without a provider, the site settings are the configured values", () => {
  setSiteSettingsProvider(null);
  assert.deepEqual(siteSettings(configured), {
    name: "Configured Academy",
    webUrl: "https://configured.example",
    emailFrom: "noreply@configured.example",
    passkeys: {
      rpId: "configured.example",
      rpIds: ["configured.example"],
      origins: ["https://configured.example"],
    },
  });
});

await test("a provider's values win, and what it leaves out stays configured", () => {
  let current: string | undefined = "other";
  setSiteSettingsProvider(() =>
    current === "other"
      ? {
          name: "Other Site",
          webUrl: "https://other.example",
          passkeys: { rpId: "other.example" },
        }
      : undefined,
  );
  try {
    const site = siteSettings(configured);
    assert.equal(site.name, "Other Site");
    assert.equal(site.webUrl, "https://other.example");
    assert.equal(site.emailFrom, "noreply@configured.example");
    assert.equal(site.passkeys.rpId, "other.example");
    assert.deepEqual(site.passkeys.origins, ["https://configured.example"]);

    current = undefined;
    assert.equal(siteSettings(configured).name, "Configured Academy");
  } finally {
    setSiteSettingsProvider(null);
  }
});
