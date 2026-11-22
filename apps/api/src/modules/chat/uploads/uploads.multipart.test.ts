/**
 * Staff may send files of any size in chat (19 Nov 2026). One request to
 * storage carries at most 5 GB, so a large file goes up in parts: storage
 * takes at most 10,000 of them, each at least 5 MiB.
 */
import assert from "node:assert/strict";
import { it } from "node:test";

import {
  CHAT_UPLOAD_LEARNER_MAX_BYTES,
  CHAT_UPLOAD_MULTIPART_FROM_BYTES,
  CHAT_UPLOAD_STAFF_MAX_BYTES,
  chatUploadMaxBytes,
} from "@veolms/contracts";

import { multipartPartSize } from "./uploads.service.ts";

const MIB = 1024 * 1024;
const GB = 1000 * 1000 * 1000;

void it("staff are not held to 5 GB; learners keep 200 MB", () => {
  assert.ok(chatUploadMaxBytes(true) > 1000 * GB);
  assert.equal(chatUploadMaxBytes(false), CHAT_UPLOAD_LEARNER_MAX_BYTES);
  // A learner's largest file still goes up in one request.
  assert.ok(CHAT_UPLOAD_LEARNER_MAX_BYTES <= CHAT_UPLOAD_MULTIPART_FROM_BYTES);
});

for (const size of [
  300 * MIB,
  6 * GB,
  50 * GB,
  700 * GB,
  CHAT_UPLOAD_STAFF_MAX_BYTES,
]) {
  void it(`a ${Math.round(size / GB)} GB file fits storage's part rules`, () => {
    const partSize = multipartPartSize(size);
    const parts = Math.ceil(size / partSize);
    assert.ok(parts <= 10_000, `${parts} parts`);
    assert.ok(partSize >= 5 * MIB);
    assert.ok(partSize <= 5 * 1024 * MIB, "a part over 5 GiB is refused");
    assert.equal(partSize % MIB, 0);
  });
}
