import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exceedsUploadQuota,
  isUnrecordedUpload,
  supersededUploadFileName,
} from "./attachment-upload-rules.ts";

const MB = 1024 * 1024;

await test("an upload that fits the allowance is let through", () => {
  assert.equal(exceedsUploadQuota(0, 300_000, MB), false);
  assert.equal(exceedsUploadQuota(600_000, 300_000, MB), false);
  // Exactly the allowance is still within it.
  assert.equal(exceedsUploadQuota(MB - 300_000, 300_000, MB), false);
});

await test("an upload that would pass the allowance is refused", () => {
  assert.equal(exceedsUploadQuota(900_000, 300_000, MB), true);
  // One file larger than the whole allowance, on an unused account.
  assert.equal(exceedsUploadQuota(0, MB + 1, MB), true);
});

await test("a used-up allowance refuses a file of no declared size", () => {
  assert.equal(exceedsUploadQuota(MB, 0, MB), true);
  assert.equal(exceedsUploadQuota(MB + 5, 0, MB), true);
  // Anything short of it lets the undeclared file start.
  assert.equal(exceedsUploadQuota(MB - 1, 0, MB), false);
});

await test("a quota of 0 means no limit", () => {
  assert.equal(exceedsUploadQuota(10 * MB, 50 * MB, 0), false);
});

const DIRECTORY = "protected/discussion-uploads";
const ID = "0b0f6f0e-6c0c-4f0e-9c58-2f8f6d0f4a11";

await test("a file stored under the slot's own name leaves nothing behind", () => {
  assert.equal(
    supersededUploadFileName(
      `${DIRECTORY}/${ID}.png`,
      `${DIRECTORY}/${ID}.png`,
    ),
    null,
  );
});

await test("a file stored under another name leaves the slot's first file", () => {
  assert.equal(
    supersededUploadFileName(
      `${DIRECTORY}/${ID}.png`,
      `${DIRECTORY}/${ID}.pdf`,
    ),
    `${ID}.png`,
  );
});

await test("a key that points somewhere else is never named for removal", () => {
  assert.equal(
    supersededUploadFileName(
      `avatars/${ID}/original.png`,
      `${DIRECTORY}/${ID}.pdf`,
    ),
    null,
  );
  assert.equal(
    supersededUploadFileName(
      `${DIRECTORY}/nested/${ID}.png`,
      `${DIRECTORY}/${ID}.pdf`,
    ),
    null,
  );
  assert.equal(
    supersededUploadFileName(`${DIRECTORY}/`, `${DIRECTORY}/${ID}.pdf`),
    null,
  );
  assert.equal(supersededUploadFileName("", `${DIRECTORY}/${ID}.pdf`), null);
});

await test("a file sent to a slot another request filled is one no record points at", () => {
  // The record kept the other request's file, stored under another name.
  assert.equal(
    isUnrecordedUpload(`${DIRECTORY}/${ID}.txt`, `${DIRECTORY}/${ID}.pdf`),
    true,
  );
  // The record still names the address the slot was opened with.
  assert.equal(
    isUnrecordedUpload(`${DIRECTORY}/${ID}.pdf`, `${DIRECTORY}/${ID}.png`),
    true,
  );
  // The record is gone altogether.
  assert.equal(isUnrecordedUpload(`${DIRECTORY}/${ID}.pdf`, null), true);
  assert.equal(isUnrecordedUpload(`${DIRECTORY}/${ID}.pdf`, undefined), true);
});

await test("a file stored under the name the record points at is kept", () => {
  // Both requests stored under one name: it is the accepted upload's file.
  assert.equal(
    isUnrecordedUpload(`${DIRECTORY}/${ID}.pdf`, `${DIRECTORY}/${ID}.pdf`),
    false,
  );
});
