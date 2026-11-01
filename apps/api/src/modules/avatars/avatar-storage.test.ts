import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { S3StorageService } from "@veolms/storage";

import { storeAvatarFromUrl } from "./avatar-storage.ts";

// Every Google sign-in refreshes the account's provider photo before the
// session is made. A storage failure there must fall back to the default
// avatar: the upload's promise was returned unawaited inside the try, so its
// rejection skipped the catch and the sign-in answered 500 (issue 308).

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const PHOTO_URL = "https://lh3.googleusercontent.com/a/photo";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function serveProviderPhoto() {
  globalThis.fetch = (async () =>
    new Response(PNG_BYTES, {
      status: 200,
      headers: { "content-type": "image/png" },
    })) as typeof fetch;
}

function storageWith(
  overrides: Partial<Record<keyof S3StorageService, unknown>>,
): S3StorageService {
  return {
    putObject: async () => undefined,
    deleteObject: async () => undefined,
    deleteObjects: async () => undefined,
    getPublicObjectUrl: () => "https://cdn.example.com/avatar.png",
    ...overrides,
  } as unknown as S3StorageService;
}

await test("a failed upload of the provider photo returns null", async () => {
  serveProviderPhoto();
  const storage = storageWith({
    putObject: async () => {
      throw new Error("InvalidAccessKeyId");
    },
  });

  assert.equal(await storeAvatarFromUrl(storage, "user-1", PHOTO_URL), null);
});

await test("a missing CDN address for the photo returns null", async () => {
  serveProviderPhoto();
  const storage = storageWith({ getPublicObjectUrl: () => null });

  assert.equal(await storeAvatarFromUrl(storage, "user-1", PHOTO_URL), null);
});
