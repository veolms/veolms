import assert from "node:assert/strict";
import { test } from "node:test";

import { avatarPushUrl, pushPictureUrl } from "./avatar-push-url.ts";

// Android chat notifications fetch these pictures natively (no cookie, no
// redirects) and can draw only PNG, JPEG and WebP.

const cdn = "https://cdn.example.com/public/avatars/u1--a1";

await test("an uploaded photo is sent as stored (the 160 px WebP)", () => {
  assert.equal(avatarPushUrl(`${cdn}/160.webp`), `${cdn}/160.webp`);
  assert.equal(
    avatarPushUrl(`${cdn}/original.png`),
    `${cdn}/original.png`,
    "a stored original of a drawable type",
  );
});

await test("a Google photo is sent as its original, as the API shows it", () => {
  const google = "https://cdn.example.com/public/avatars/u1--google";
  assert.equal(avatarPushUrl(`${google}/160.webp`), `${google}/original.jpg`);
});

await test("a DiceBear default is sent as DiceBear's PNG of the same picture", () => {
  assert.equal(
    avatarPushUrl("https://api.dicebear.com/10.x/lorelei/svg?seed=Asha%20Rao"),
    "https://api.dicebear.com/10.x/lorelei/png?seed=Asha%20Rao&size=128",
  );
  assert.equal(
    avatarPushUrl("https://api.dicebear.com/10.x/unknown-style/svg?seed=x"),
    null,
    "only the styles the app offers",
  );
  assert.equal(
    avatarPushUrl("https://api.dicebear.com/10.x/lorelei/svg?seed=x&flip=true"),
    null,
    "only the shape the server stores",
  );
});

await test("pictures a phone cannot draw are left out", () => {
  for (const value of [
    null,
    undefined,
    "",
    "   ",
    `${cdn}/original.gif`,
    "data:image/png;base64,iVBORw0KGgo=",
    "/v1/chat/rooms/r1/icon?v=1",
    "/cdn/public/avatars/u1--a1/160.webp",
    "https://lh3.googleusercontent.com/a/abc=s96-c",
    "https://example.com/picture.svg",
  ]) {
    assert.equal(avatarPushUrl(value), null, String(value));
  }
});

await test("only complete http(s) URLs to PNG, JPEG or WebP files", () => {
  assert.equal(
    pushPictureUrl("https://cdn.example.com/a/240.webp"),
    "https://cdn.example.com/a/240.webp",
  );
  assert.equal(
    pushPictureUrl("http://127.0.0.1:9000/media/a/160.webp"),
    "http://127.0.0.1:9000/media/a/160.webp",
    "a local store is http",
  );
  assert.equal(
    pushPictureUrl("https://cdn.example.com/a/photo.JPEG"),
    "https://cdn.example.com/a/photo.JPEG",
  );
  for (const value of [
    "ftp://cdn.example.com/a.png",
    "https://user:pass@cdn.example.com/a.png",
    "https://cdn.example.com/a.gif",
    "https://cdn.example.com/a.svg",
    "https://cdn.example.com/a",
    "not a url",
    `https://cdn.example.com/${"a".repeat(600)}.png`,
  ]) {
    assert.equal(pushPictureUrl(value), null, value.slice(0, 60));
  }
});
