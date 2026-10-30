import assert from "node:assert/strict";
import { test } from "node:test";

import type { S3StorageService } from "@veolms/storage";
import {
  academyLogoKey,
  academyLogoKeyFromUrl,
  academyLogoUrl,
} from "./academy-logo.ts";

const uploadId = "3f2a9c1e-8b7d-4e6f-a5c4-1b2d3e4f5a6b";

function storageServing(baseUrl: string | null) {
  return {
    getPublicObjectUrl: (key: string) => (baseUrl ? `${baseUrl}/${key}` : null),
  } as unknown as S3StorageService;
}

await test("each upload has its own key, named for its type", () => {
  assert.equal(
    academyLogoKey(uploadId, "image/png"),
    `public/academy/logo/${uploadId}.png`,
  );
  assert.equal(
    academyLogoKey(uploadId, "image/jpeg"),
    `public/academy/logo/${uploadId}.jpg`,
  );
});

await test("an uploaded logo's address leads back to its key; any other address does not", () => {
  const key = academyLogoKey(uploadId, "image/png");
  assert.equal(academyLogoKeyFromUrl(`https://cdn.example.com/${key}`), key);
  assert.equal(
    academyLogoKeyFromUrl(`https://academy.example.com/cdn/${key}?v=2`),
    key,
  );
  assert.equal(
    academyLogoKeyFromUrl("https://www.procodrr.dev/static/email-logo.png"),
    null,
  );
  assert.equal(academyLogoKeyFromUrl(null), null);
});

await test("the logo's address is absolute, so mail apps can load it", () => {
  const key = academyLogoKey(uploadId, "image/png");
  assert.equal(
    academyLogoUrl(storageServing("/cdn"), key, "https://academy.example.com"),
    `https://academy.example.com/cdn/${key}`,
  );
  assert.equal(
    academyLogoUrl(
      storageServing("https://cdn.example.com"),
      key,
      "https://academy.example.com",
    ),
    `https://cdn.example.com/${key}`,
  );
  assert.equal(
    academyLogoUrl(storageServing(null), key, "https://academy.example.com"),
    null,
  );
});
