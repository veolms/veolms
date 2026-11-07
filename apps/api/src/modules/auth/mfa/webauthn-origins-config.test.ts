import assert from "node:assert/strict";
import { test } from "node:test";

import { loadServerConfig } from "@veolms/config";

// WEBAUTHN_ORIGINS lists the origins a passkey may be used from. Android apps
// sign with `android:apk-key-hash:<hash>`, which is not a web URL: it must be
// kept exactly as written, and must never turn into the opaque origin "null".

const ANDROID_A =
  "android:apk-key-hash:A7zN0KLmdvl0rKhtIzwKhMLZTGrUBiHH1-bAd2yjnbY";
const ANDROID_B =
  "android:apk-key-hash:G27e1tS35QH6LUGwviwIYqvZq3Utty-Y7c1JtpqeJiE";

function configWith(webauthnOrigins: string, corsOrigins?: string) {
  return loadServerConfig({
    NODE_ENV: "development",
    WEB_URL: "https://procodrr.com",
    RP_ID: "procodrr.com",
    WEBAUTHN_ORIGINS: webauthnOrigins,
    ...(corsOrigins ? { CORS_ORIGINS: corsOrigins } : {}),
  });
}

await test("Android key-hash origins are kept verbatim; web origins normalised", () => {
  const config = configWith(
    ` https://www.procodrr.com/ ,${ANDROID_A}, https://procodrr.dev/path?x=1 , ${ANDROID_B} `,
  );

  assert.ok(config.WEBAUTHN_ORIGINS.includes(ANDROID_A));
  assert.ok(config.WEBAUTHN_ORIGINS.includes(ANDROID_B));
  assert.ok(config.WEBAUTHN_ORIGINS.includes("https://www.procodrr.com"));
  assert.ok(config.WEBAUTHN_ORIGINS.includes("https://procodrr.dev"));
  assert.ok(config.WEBAUTHN_ORIGINS.includes("https://procodrr.com"));
  assert.ok(!config.WEBAUTHN_ORIGINS.includes("null"));
  assert.ok(
    !config.WEBAUTHN_ORIGINS.some((origin) => origin.endsWith("/")),
    "web origins carry no trailing slash or path",
  );
});

await test("Android origins add no RP ID and stay out of CORS", () => {
  const config = configWith(`https://procodrr.com,${ANDROID_A},${ANDROID_B}`);

  assert.ok(!config.WEBAUTHN_RP_IDS.includes(""));
  assert.ok(!config.WEBAUTHN_RP_IDS.some((id) => id.startsWith("android")));
  assert.ok(config.WEBAUTHN_RP_IDS.includes("procodrr.com"));

  assert.ok(
    !config.CORS_ORIGINS.some((origin) => origin.startsWith("android:")),
  );
  assert.ok(!config.CORS_ORIGINS.includes("null"));
  assert.ok(config.CORS_ORIGINS.includes("https://procodrr.com"));
});

await test("nothing ever resolves to the opaque origin null", () => {
  const config = configWith(
    "null, file:///tmp/x, data:text/plain,hi",
    `null, ${ANDROID_A}, https://www.procodrr.dev/`,
  );

  assert.ok(!config.WEBAUTHN_ORIGINS.includes("null"));
  assert.ok(!config.CORS_ORIGINS.includes("null"));
  assert.ok(!config.CORS_ORIGINS.includes(ANDROID_A));
  assert.ok(config.CORS_ORIGINS.includes("https://www.procodrr.dev"));
});
